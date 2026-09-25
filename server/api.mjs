import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash, createHmac } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const derive = promisify(scrypt);
const hash = value => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('hex');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const text = (value, max = 120, required = false) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, 'Проверьте заполненные поля');
  return value.trim();
};
const date = (value, optional = false) => {
  if (optional && value === '') return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail(400, 'Некорректная дата');
  return value;
};
const photo = value => {
  if (value === '') return '';
  if (typeof value !== 'string' || value.length > 3_000_000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) fail(400, 'Выберите фотографию JPEG, PNG или WebP до 2 МБ после обработки');
  return value;
};
async function passwordHash(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) fail(400, 'Пароль должен содержать от 10 до 128 символов');
  const salt = secret();
  return salt + ':' + (await derive(password, salt, 64)).toString('hex');
}
async function matches(password, stored) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [salt, digest] = stored.split(':');
  return timingSafeEqual(await derive(password, salt, 64), Buffer.from(digest, 'hex'));
}

export function createApi({ filename = process.env.DATABASE_PATH || resolve(process.env.RAILWAY_VOLUME_MOUNT_PATH || 'storage', 'blizhe.sqlite'), secure = process.env.COOKIE_SECURE === 'true', telegramRequest = fetch } = {}) {
  if (filename !== ':memory:') mkdirSync(resolve(filename, '..'), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,profile TEXT NOT NULL,space TEXT,recovery TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS spaces(id TEXT PRIMARY KEY,data TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS invites(code TEXT PRIMARY KEY,space TEXT NOT NULL,expires INTEGER NOT NULL);
  `);
  if (!db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'telegram_id')) {
    db.exec('ALTER TABLE users ADD COLUMN telegram_id TEXT');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_id ON users(telegram_id) WHERE telegram_id IS NOT NULL');
  const rates = new Map();
  function limit(key, maximum = 20) {
    const now = Date.now();
    if (rates.size > 10000) for (const [k, v] of rates) if (v.until < now) rates.delete(k);
    const entry = rates.get(key);
    if (!entry || entry.until < now) rates.set(key, { count: 1, until: now + 15 * 60_000 });
    else if (++entry.count > maximum) fail(429, 'Слишком много попыток. Попробуйте через 15 минут');
  }
  const userById = id => db.prepare('SELECT * FROM users WHERE id=?').get(id);
  function snapshot(user) {
    const space = db.prepare('SELECT * FROM spaces WHERE id=?').get(user.space);
    const data = JSON.parse(space.data);
    data.profiles = db.prepare('SELECT profile FROM users WHERE space=? ORDER BY rowid').all(user.space).map(row => JSON.parse(row.profile));
    return { user: { id: user.id, email: user.email.endsWith('@telegram.blizhe.invalid') ? null : user.email, telegram: Boolean(user.telegram_id) }, data, revision: space.revision, spaceId: space.id };
  }
  function telegramIdentity(initData) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
    if (!botToken) fail(503, 'Вход через Telegram пока не настроен');
    if (typeof initData !== 'string' || initData.length > 10_000) fail(401, 'Откройте приложение из Telegram');
    let entries;
    try { entries = [...new URLSearchParams(initData).entries()]; } catch { fail(401, 'Данные Telegram некорректны'); }
    const values = new Map(entries);
    const supplied = values.get('hash');
    const authDate = Number(values.get('auth_date'));
    const now = Math.floor(Date.now() / 1000);
    if (!supplied || !/^[a-f0-9]{64}$/i.test(supplied) || !Number.isInteger(authDate) || now - authDate > 86400 || authDate - now > 30) fail(401, 'Сеанс Telegram устарел. Перезапустите приложение из бота.');
    const checkString = entries.filter(([key]) => key !== 'hash').sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expected = createHmac('sha256', secretKey).update(checkString).digest();
    const actual = Buffer.from(supplied, 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) fail(401, 'Не удалось проверить ваш Telegram-сеанс');
    let telegramUser;
    try { telegramUser = JSON.parse(values.get('user') || 'null'); } catch { fail(401, 'Профиль Telegram некорректен'); }
    if (!telegramUser || !Number.isSafeInteger(telegramUser.id) || telegramUser.id <= 0) fail(401, 'Профиль Telegram не найден');
    return telegramUser;
  }
  async function telegramAvatar(userId) {
    const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
    if (!token) return '';
    const signal = AbortSignal.timeout(6000);
    try {
      const photosResponse = await telegramRequest(`https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${userId}&limit=1`, { signal });
      if (!photosResponse.ok) return '';
      const photos = (await photosResponse.json()).result?.photos?.[0];
      if (!Array.isArray(photos)) return '';
      const candidate = [...photos].reverse().find(item => item.file_id && (!item.file_size || item.file_size <= 1_000_000));
      if (!candidate) return '';
      const fileResponse = await telegramRequest(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(candidate.file_id)}`, { signal });
      if (!fileResponse.ok) return '';
      const filePath = (await fileResponse.json()).result?.file_path;
      if (typeof filePath !== 'string' || !/^[\w./-]+$/.test(filePath) || filePath.includes('..')) return '';
      const imageResponse = await telegramRequest(`https://api.telegram.org/file/bot${token}/${filePath}`, { signal });
      if (!imageResponse.ok || Number(imageResponse.headers.get('content-length') || 0) > 1_000_000) return '';
      const image = Buffer.from(await imageResponse.arrayBuffer());
      if (image.length < 4 || image.length > 1_000_000 || image[0] !== 0xff || image[1] !== 0xd8) return '';
      return `data:image/jpeg;base64,${image.toString('base64')}`;
    } catch { return ''; }
  }
  async function syncTelegramAvatar(user, telegramUser) {
    const profile = JSON.parse(user.profile);
    if (profile.avatar || profile.avatarSource === 'none') return user;
    const avatar = await telegramAvatar(telegramUser.id);
    if (!avatar) return user;
    db.prepare('UPDATE users SET profile=? WHERE id=?').run(JSON.stringify({ ...profile, avatar, avatarSource: 'telegram' }), user.id);
    return userById(user.id);
  }
  function session(res, user) {
    const token = secret();
    db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token), user.id, Date.now() + 30 * 86400000);
    res.setHeader('Set-Cookie', `blizhe_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secure ? '; Secure' : ''}`);
  }
  function profileDates(spaceId) {
    const row = db.prepare('SELECT data FROM spaces WHERE id=?').get(spaceId);
    const data = JSON.parse(row.data);
    data.dates = data.dates.filter(item => item.id !== 'date-anniversary' && !item.id.startsWith('birthday:'));
    data.dates.push({ id: 'date-anniversary', title: 'Наша годовщина', date: data.startDate, emoji: '🤍', annual: true });
    for (const row of db.prepare('SELECT profile FROM users WHERE space=?').all(spaceId)) {
      const p = JSON.parse(row.profile);
      if (p.birthday) data.dates.push({ id: `birthday:${p.id}`, title: `День рождения · ${p.name}`, date: p.birthday, emoji: '🎂', annual: true });
    }
    db.prepare('UPDATE spaces SET data=?,revision=revision+1 WHERE id=?').run(JSON.stringify(data), spaceId);
  }
  async function middleware(req, res, next) {
    if (!req.url?.startsWith('/api/')) return next();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = data => res.end(JSON.stringify(data));
    try {
      const path = req.url.split('?')[0];
      const mutating = req.method !== 'GET';
      if (path === '/api/health' && req.method === 'GET') return send({ ok: true });
      if (mutating && (req.headers['x-blizhe-client'] !== '1' || !req.headers['content-type']?.startsWith('application/json'))) fail(403, 'Недопустимый запрос');
      if (req.headers.origin) {
        const origin = new URL(req.headers.origin);
        const forwardedHost = req.headers['x-forwarded-host'];
        const telegramTunnel = typeof forwardedHost === 'string' && forwardedHost.endsWith('.trycloudflare.com') && req.headers['cf-ray'];
        const sourceHost = telegramTunnel ? forwardedHost : req.headers.host;
        if (origin.host !== sourceHost || (telegramTunnel && origin.protocol !== 'https:')) fail(403, 'Недопустимый источник запроса');
      }
      let body = {};
      if (mutating) {
        let size = 0; const chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > 25_000_000) fail(413, 'Слишком много фотографий в одном запросе'); chunks.push(chunk); }
        try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { fail(400, 'Некорректный запрос'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Некорректный запрос');
      }
      if (path === '/api/telegram/auth' && req.method === 'POST') {
        limit(`telegram:${req.socket.remoteAddress}`, 30);
        const telegramUser = telegramIdentity(body.initData);
        let linked = db.prepare('SELECT * FROM users WHERE telegram_id=?').get(String(telegramUser.id));
        if (!linked) {
          const token = req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('blizhe_session='))?.slice(15) || '';
          const stored = db.prepare('SELECT user FROM sessions WHERE token=? AND expires>?').get(hash(token),Date.now());
          const current = stored && userById(stored.user);
          if (current && !current.telegram_id) {
            db.prepare('UPDATE users SET telegram_id=? WHERE id=?').run(String(telegramUser.id), current.id);
            linked = userById(current.id);
          } else {
            const id = randomUUID(), space = randomUUID();
            const name = [telegramUser.first_name, telegramUser.last_name].filter(part => typeof part === 'string').join(' ').trim().slice(0, 25) || 'Любимый человек';
            const profile = { id, name, birthday: '', bio: '', avatar: '' };
            const data = { startDate: new Date().toISOString().slice(0, 10), memories: [], dates: [], plans: [], messages: [], mood: '' };
            // Keep the existing database layout for old accounts. These private values are never used for sign-in.
            const internalEmail = `telegram-${telegramUser.id}@telegram.blizhe.invalid`;
            db.exec('BEGIN');
            try {
              db.prepare('INSERT INTO spaces(id,data) VALUES(?,?)').run(space, JSON.stringify(data));
              db.prepare('INSERT INTO users(id,email,password,profile,space,recovery,telegram_id) VALUES(?,?,?,?,?,?,?)')
                .run(id, internalEmail, `${secret()}:${secret()}${secret()}`, JSON.stringify(profile), space, hash(secret()), String(telegramUser.id));
              db.exec('COMMIT');
            } catch (error) { db.exec('ROLLBACK'); throw error; }
            linked = userById(id);
          }
        }
        linked = await syncTelegramAvatar(linked, telegramUser);
        session(res, linked);
        return send(snapshot(linked));
      }
      if (['/api/register','/api/login','/api/recover'].includes(path) && req.method === 'POST') {
        limit(`auth:${req.socket.remoteAddress}`);
        const email = text(body.email, 254, true).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Укажите корректный email');
        if (path === '/api/register') {
          const name = text(body.name, 25, true), password = await passwordHash(body.password);
          if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) fail(409, 'Регистрация недоступна. Попробуйте войти или восстановить доступ');
          const id = randomUUID(), space = randomUUID(), recoveryCode = secret();
          const profile = { id, name, birthday: '', bio: '', avatar: '' };
          const data = { startDate: new Date().toISOString().slice(0,10), memories: [], dates: [], plans: [], messages: [], mood: '' };
          db.exec('BEGIN');
          try {
            db.prepare('INSERT INTO spaces(id,data) VALUES(?,?)').run(space, JSON.stringify(data));
            db.prepare('INSERT INTO users(id,email,password,profile,space,recovery) VALUES(?,?,?,?,?,?)').run(id,email,password,JSON.stringify(profile),space,hash(recoveryCode));
            db.exec('COMMIT');
          } catch(e) { db.exec('ROLLBACK'); throw e; }
          const user = userById(id); session(res,user); return send({ ...snapshot(user), recoveryCode });
        }
        const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
        if (path === '/api/recover') {
          if (!user || typeof body.code !== 'string' || hash(body.code.trim()) !== user.recovery) fail(401,'Email или код восстановления неверны');
          const password = await passwordHash(body.password), recoveryCode = secret();
          const changed = db.prepare('UPDATE users SET password=?,recovery=? WHERE id=? AND recovery=?').run(password,hash(recoveryCode),user.id,user.recovery);
          if (!changed.changes) fail(401,'Код восстановления уже использован');
          db.prepare('DELETE FROM sessions WHERE user=?').run(user.id);
          session(res,user); return send({...snapshot(user), recoveryCode});
        }
        const valid = await matches(body.password, user?.password || `${'0'.repeat(64)}:${'0'.repeat(128)}`);
        if (!user || !valid) fail(401,'Email или пароль неверны');
        session(res,user); return send(snapshot(user));
      }
      const token = req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('blizhe_session='))?.slice(15) || '';
      const stored = db.prepare('SELECT user FROM sessions WHERE token=? AND expires>?').get(hash(token),Date.now());
      const user = stored && userById(stored.user);
      if (!user) fail(401,'Войдите в аккаунт');
      if (path === '/api/session' && req.method === 'GET') return send(snapshot(user));
      if (path === '/api/logout' && req.method === 'POST') {
        db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token));
        res.setHeader('Set-Cookie','blizhe_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return send({ok:true});
      }
      if (path === '/api/password' && req.method === 'POST') {
        limit(`password:${user.id}`,10);
        if (!await matches(body.currentPassword,user.password)) fail(401,'Текущий пароль неверен');
        const password = await passwordHash(body.password);
        db.prepare('UPDATE users SET password=? WHERE id=?').run(password,user.id);
        db.prepare('DELETE FROM sessions WHERE user=?').run(user.id); session(res,user); return send({ok:true});
      }
      if (path === '/api/profile' && req.method === 'POST') {
        const previous = JSON.parse(user.profile);
        const avatar = photo(body.avatar);
        const profile = {id:user.id,name:text(body.name,25,true),birthday:date(body.birthday,true),bio:text(body.bio),avatar,
          avatarSource: avatar === previous.avatar ? previous.avatarSource : avatar ? 'custom' : 'none'};
        if (profile.birthday > new Date().toISOString().slice(0,10)) fail(400,'День рождения не может быть в будущем');
        db.prepare('UPDATE users SET profile=? WHERE id=?').run(JSON.stringify(profile),user.id);
        profileDates(user.space); return send(snapshot(userById(user.id)));
      }
      if (path === '/api/invite' && req.method === 'POST') {
        if (db.prepare('SELECT COUNT(*) AS n FROM users WHERE space=?').get(user.space).n >= 2) fail(409,'В вашей паре уже два человека');
        db.prepare('DELETE FROM invites WHERE space=? OR expires<?').run(user.space,Date.now());
        const code = randomBytes(8).toString('hex').toUpperCase();
        db.prepare('INSERT INTO invites VALUES(?,?,?)').run(hash(code),user.space,Date.now()+86400000);
        return send({code});
      }
      if (path === '/api/join' && req.method === 'POST') {
        limit(`join:${user.id}`,20);
        const invite = db.prepare('SELECT * FROM invites WHERE code=? AND expires>?').get(hash(text(body.code,32,true).toUpperCase()),Date.now());
        if (!invite || invite.space === user.space) fail(400,'Код приглашения недействителен или истёк');
        const current = snapshot(user);
        if (current.data.profiles.length > 1 || current.data.memories.length || current.data.plans.length || current.data.messages.length || current.data.dates.some(x=>x.id!=='date-anniversary'&&!x.id.startsWith('birthday:'))) fail(409,'Присоединиться можно из пустого личного пространства. Сначала сохраните резервную копию и удалите свои записи');
        if (db.prepare('SELECT COUNT(*) AS n FROM users WHERE space=?').get(invite.space).n >= 2) fail(409,'В этой паре уже два человека');
        db.exec('BEGIN');
        try {
          db.prepare('UPDATE users SET space=? WHERE id=?').run(invite.space,user.id);
          db.prepare('DELETE FROM invites WHERE space IN (?,?)').run(invite.space,user.space);
          db.prepare('DELETE FROM spaces WHERE id=?').run(user.space);
          profileDates(invite.space); db.exec('COMMIT');
        } catch(e) { db.exec('ROLLBACK'); throw e; }
        return send(snapshot(userById(user.id)));
      }
      if (path === '/api/data' && req.method === 'POST') {
        const current = snapshot(user);
        if (body.revision !== current.revision) fail(409,'Партнёр уже обновил историю. Повторите действие с актуальными данными');
        const input = body.data;
        if (!input || typeof input !== 'object') fail(400,'Некорректные данные');
        const data = {startDate:date(input.startDate),mood:text(input.mood,50)};
        if (data.startDate > new Date().toISOString().slice(0,10)) fail(400,'Дата начала отношений не может быть в будущем');
        const readList = (key, parse, max=2000) => {
          if (!Array.isArray(input[key]) || input[key].length>max) fail(400,'Слишком много записей');
          const ids = new Set();
          return input[key].map(item=>{if(!item || typeof item!=='object') fail(400,'Некорректная запись'); const id=text(item.id,100,true); if(ids.has(id)) fail(400,'Повторяющаяся запись'); ids.add(id); return {id,...parse(item)};});
        };
        data.memories=readList('memories',m=>({title:text(m.title,80,true),date:date(m.date),location:text(m.location,80),image:photo(m.image),note:text(m.note,1500),favorite:m.favorite===true}),300);
        data.plans=readList('plans',p=>({title:text(p.title,100,true),date:date(p.date,true),category:text(p.category,50,true),done:p.done===true}));
        data.dates=readList('dates',d=>({title:text(d.title,100,true),date:date(d.date),emoji:text(d.emoji,20),annual:d.annual===true}));
        // Existing messages are immutable; new messages always belong to the authenticated user.
        const prior = new Map(current.data.messages.map(m=>[m.id,m]));
        data.messages=readList('messages',m=>{if(prior.has(m.id)) return prior.get(m.id); return {text:text(m.text,4000,true),senderId:user.id,createdAt:new Date().toISOString()};},10000);
        if(current.data.messages.some(m=>!data.messages.some(n=>n.id===m.id))) fail(400,'Удаление переписки не поддерживается');
        db.prepare('UPDATE spaces SET data=?,revision=revision+1 WHERE id=?').run(JSON.stringify(data),user.space);
        profileDates(user.space); return send(snapshot(user));
      }
      fail(404,'Не найдено');
    } catch(error) { res.statusCode=error.status || 500; send({error:error.status ? error.message : 'Ошибка сервера. Попробуйте ещё раз'}); if(!error.status) console.error(error); }
  }
  return { middleware, close:()=>db.close() };
}
