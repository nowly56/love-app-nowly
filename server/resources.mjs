import { randomUUID } from 'node:crypto';

// Resource routes only receive the authenticated user's space, never a client-supplied space ID.
export function resourceRoute({ req, res, body, user, db, snapshot, text, date, photo, fail, send }) {
  const url = new URL(req.url, 'http://localhost');
  const match = /^\/api\/(books|memories|dates|plans)(?:\/([^/]+))?$/.exec(url.pathname);
  if (!match) return false;
  const [, kind, encodedId] = match;
  let id;
  try { id = encodedId ? decodeURIComponent(encodedId) : undefined; } catch { fail(400, 'Некорректный идентификатор'); }
  const current = snapshot(user);
  const records = current.data[kind];
  if (req.method === 'GET') {
    if (id) {
      const item = records.find(item => item.id === id);
      if (!item) fail(404, 'Запись не найдена');
      send({ item, revision: current.revision }); return true;
    }
    const number = (key, fallback, max) => {
      const raw = url.searchParams.get(key);
      if (raw === null) return fallback;
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > max || (key === 'limit' && Number(raw) < 1)) fail(400, 'Некорректные параметры страницы');
      return Number(raw);
    };
    const limit = number('limit', 20, 100), offset = number('offset', 0, 10000);
    let list = [...records];
    if (kind === 'memories') {
      const bookId = url.searchParams.get('bookId');
      if (bookId) list = list.filter(item => item.bookId === bookId);
      list.sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    }
    send({ items: list.slice(offset, offset + limit), total: list.length, nextOffset: offset + limit < list.length ? offset + limit : null, revision: current.revision });
    return true;
  }
  if (!['POST','PATCH','DELETE'].includes(req.method) || (req.method === 'POST' ? !!id : !id)) fail(405, 'Метод не поддерживается');
  if (!Number.isSafeInteger(body.revision) || body.revision < 0) fail(400, 'Укажите версию данных');
  if (body.revision !== current.revision) fail(409, 'Партнёр уже обновил данные. Обновите страницу и повторите действие');
  const previous = id ? records.find(item => item.id === id) : undefined;
  if (id && !previous) fail(404, 'Запись не найдена');
  if (kind === 'dates' && id && (id === 'date-anniversary' || id.startsWith('birthday:'))) fail(400, 'Эта дата изменяется в настройках профиля');
  let item;
  if (req.method === 'DELETE') {
    if (kind === 'books' && (records.length === 1 || current.data.memories.some(m => m.bookId === id))) fail(409, 'Можно удалить только пустую книгу, если есть другая книга');
    current.data[kind] = records.filter(item => item.id !== id);
  } else {
    if (!body.item || typeof body.item !== 'object' || Array.isArray(body.item)) fail(400, 'Некорректная запись');
    const input = { ...previous, ...body.item };
    const itemId = id || (input.id === undefined ? randomUUID() : text(input.id,100,true));
    if (!id && records.some(item => item.id === itemId)) fail(409, 'Запись уже существует');
    if (!id && records.length >= (kind === 'books' ? 100 : kind === 'memories' ? 300 : 2000)) fail(400, 'Слишком много записей');
    if (kind === 'books') {
      if (!['rose','sage','sand','lavender'].includes(input.color)) fail(400, 'Некорректный цвет книги');
      item = { id:itemId, title:text(input.title,80,true), color:input.color };
    } else if (kind === 'memories') {
      const bookId = text(input.bookId,100,true);
      if (!current.data.books.some(book => book.id === bookId)) fail(400, 'Книга не найдена');
      item = { id:itemId, bookId, title:text(input.title,80,true), date:date(input.date), location:text(input.location ?? '',80), image:photo(input.image ?? ''), note:text(input.note ?? '',1500), favorite:input.favorite === true };
    } else if (kind === 'dates') {
      if (itemId === 'date-anniversary' || itemId.startsWith('birthday:')) fail(400, 'Этот идентификатор зарезервирован');
      item = { id:itemId, title:text(input.title,100,true), date:date(input.date), emoji:text(input.emoji ?? '',20), annual:input.annual === true };
    } else {
      item = { id:itemId, title:text(input.title,100,true), date:date(input.date ?? '',true), category:text(input.category,50,true), done:input.done === true };
    }
    current.data[kind] = id ? records.map(record => record.id === id ? item : record) : [...records,item];
  }
  // Atomic compare-and-swap also protects against another server connection writing this space.
  const { profiles, ...storedData } = current.data;
  const result = db.prepare('UPDATE spaces SET data=?,revision=revision+1 WHERE id=? AND revision=?').run(JSON.stringify(storedData),user.space,body.revision);
  if (result.changes !== 1) fail(409, 'Данные уже обновились. Повторите действие');
  res.statusCode = req.method === 'POST' ? 201 : 200;
  send({ revision: current.revision + 1, ...(item ? { item } : { deletedId:id }) });
  return true;
}
