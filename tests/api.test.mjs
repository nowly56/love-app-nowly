import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { createApi } from '../server/api.mjs';

const password = 'a-long-test-password';
const avatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

async function fixture(t, options = {}) {
  const api = createApi({ filename: ':memory:', ...options });
  const server = createServer((req, res) => api.middleware(req, res, () => {
    res.writeHead(404).end();
  }));
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    api.close();
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;

  async function request(path, { body, cookie, headers = {}, method = body === undefined ? 'GET' : 'POST' } = {}) {
    const response = await fetch(origin + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Blizhe-Client': '1' }),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    return {
      status: response.status,
      headers: response.headers,
      cookie: response.headers.get('set-cookie')?.split(';')[0],
      data,
    };
  }

  async function register(email = 'anna@example.test', name = 'Анна') {
    const result = await request('/api/register', { body: { email, name, password } });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.ok(result.cookie, 'Registration must create a session');
    return result;
  }

  async function save(account, change) {
    const snapshot = await request('/api/session', { cookie: account.cookie });
    assert.equal(snapshot.status, 200);
    const data = structuredClone(snapshot.data.data);
    change(data);
    return request('/api/data', { cookie: account.cookie, body: { data, revision: snapshot.data.revision } });
  }

  async function pair() {
    const anna = await register();
    const sasha = await register('sasha@example.test', 'Саша');
    const invitation = await request('/api/invite', { cookie: anna.cookie, body: {} });
    assert.equal(invitation.status, 200);
    const joined = await request('/api/join', { cookie: sasha.cookie, body: { code: invitation.data.code } });
    assert.equal(joined.status, 200, JSON.stringify(joined.data));
    return { anna, sasha, joined, invitation };
  }

  return { request, register, save, pair, origin };
}

test('registration creates a private empty space and an HttpOnly session; login accepts normalized email', async t => {
  const { request, register } = await fixture(t);
  const registered = await register('  ANNA@example.test  ', '  Анна  ');
  assert.equal(registered.data.user.email, 'anna@example.test');
  assert.equal(registered.data.data.profiles[0].name, 'Анна');
  assert.equal(registered.data.data.profiles[0].id, registered.data.user.id);
  for (const key of ['memories', 'plans', 'messages']) assert.deepEqual(registered.data.data[key], []);
  assert.match(registered.data.recoveryCode, /^[a-f0-9]{64}$/);
  const cookie = registered.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\//);
  assert.equal(registered.headers.get('cache-control'), 'no-store');
  assert.equal('password' in registered.data.user, false);
  assert.equal('recovery' in registered.data.user, false);

  const restored = await request('/api/session', { cookie: registered.cookie });
  assert.equal(restored.status, 200);
  assert.equal(restored.data.user.id, registered.data.user.id);
  assert.equal('recoveryCode' in restored.data, false);
  const login = await request('/api/login', { body: { email: 'ANNA@example.test', password } });
  assert.equal(login.status, 200);
  assert.equal(login.data.spaceId, registered.data.spaceId);
  assert.notEqual(login.cookie, registered.cookie, 'Each login must receive a fresh token');
});

test('secure deployments mark session cookies Secure', async t => {
  const { register } = await fixture(t, { secure: true });
  const registered = await register();
  assert.match(registered.headers.get('set-cookie'), /; Secure(?:;|$)/);
});

test('Telegram login verifies initData and links the signed-in account', async t => {
  const token = 'test-telegram-bot-token';
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = token;
  t.after(() => { if (previousToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previousToken; });
  const { request, register } = await fixture(t);
  const account = await register();
  const values = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'query-test', user: JSON.stringify({ id: 987654321, first_name: 'Telegram' }) });
  const checkString = [...values.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  values.set('hash', createHmac('sha256', secret).update(checkString).digest('hex'));
  const linked = await request('/api/telegram/auth', { body: { initData: values.toString() }, cookie: account.cookie });
  assert.equal(linked.status, 200);
  assert.equal(linked.data.user.id, account.data.user.id);
  assert.equal(linked.data.user.telegram, true);

  const automaticLogin = await request('/api/telegram/auth', { body: { initData: values.toString() } });
  assert.equal(automaticLogin.status, 200);
  assert.equal(automaticLogin.data.user.id, account.data.user.id);

  values.set('user', JSON.stringify({ id: 123456789, first_name: 'Forged' }));
  const forged = await request('/api/telegram/auth', { body: { initData: values.toString() } });
  assert.equal(forged.status, 401);
});

test('first Telegram visit creates an account without email or password and later visits restore it', async t => {
  const token = 'test-telegram-bot-token';
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = token;
  t.after(() => { if (previousToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previousToken; });
  const { request } = await fixture(t);
  const signed = user => {
    const values = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(user) });
    const checkString = [...values.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(token).digest();
    values.set('hash', createHmac('sha256', secret).update(checkString).digest('hex'));
    return values.toString();
  };
  const initData = signed({ id: 987654321, first_name: 'Анна', last_name: 'Тестовая' });
  const first = await request('/api/telegram/auth', { body: { initData } });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.user.email, null);
  assert.equal(first.data.user.telegram, true);
  assert.equal(first.data.data.profiles[0].name, 'Анна Тестовая');
  assert.deepEqual(first.data.data.memories, []);
  assert.ok(first.cookie);
  const repeat = await request('/api/telegram/auth', { body: { initData } });
  assert.equal(repeat.status, 200);
  assert.equal(repeat.data.user.id, first.data.user.id);
  assert.equal(repeat.data.spaceId, first.data.spaceId);
  const second = await request('/api/telegram/auth', { body: { initData: signed({ id: 123456789, first_name: 'Саша' }), cookie: first.cookie } });
  assert.equal(second.status, 200);
  assert.notEqual(second.data.spaceId, first.data.spaceId);
  const forged = new URLSearchParams(initData);
  forged.set('user', JSON.stringify({ id: 555555555, first_name: 'Чужой' }));
  assert.equal((await request('/api/telegram/auth', { body: { initData: forged.toString() } })).status, 401);
});

test('invalid credentials and duplicate registration cannot access or replace an account', async t => {
  const { request, register } = await fixture(t);
  const registered = await register();
  for (const email of ['anna@example.test', 'missing@example.test']) {
    const login = await request('/api/login', { body: { email, password: 'wrong-password' } });
    assert.equal(login.status, 401);
    assert.equal(login.cookie, undefined);
  }
  const duplicate = await request('/api/register', { body: { email: 'ANNA@example.test', name: 'Replacement', password } });
  assert.equal(duplicate.status, 409);
  const session = await request('/api/session', { cookie: registered.cookie });
  assert.equal(session.data.data.profiles[0].name, 'Анна');
  assert.equal((await request('/api/session')).status, 401);
  assert.equal((await request('/api/session', { cookie: 'blizhe_session=not-a-real-session' })).status, 401);
});

test('separate accounts cannot read or write one another’s space', async t => {
  const { request, register, save } = await fixture(t);
  const anna = await register();
  const sasha = await register('sasha@example.test', 'Саша');
  assert.notEqual(anna.data.spaceId, sasha.data.spaceId);
  const updated = await save(anna, data => {
    data.plans.push({ id: 'private-plan', title: 'Сюрприз', date: '', category: 'Вдвоём', done: false });
  });
  assert.equal(updated.status, 200);
  const outsider = await request(`/api/session?spaceId=${anna.data.spaceId}`, { cookie: sasha.cookie });
  assert.equal(outsider.data.spaceId, sasha.data.spaceId);
  assert.deepEqual(outsider.data.data.plans, []);
  const injected = await request('/api/data', {
    cookie: sasha.cookie,
    body: { spaceId: anna.data.spaceId, revision: outsider.data.revision, data: { ...outsider.data.data, mood: 'Только Саша' } },
  });
  assert.equal(injected.status, 200);
  assert.equal(injected.data.spaceId, sasha.data.spaceId);
  const original = await request('/api/session', { cookie: anna.cookie });
  assert.equal(original.data.data.mood, '');
  assert.equal(original.data.data.plans[0].id, 'private-plan');
});

test('invitation joins two accounts into one shared space and is single-use', async t => {
  const { request, register, pair } = await fixture(t);
  const { anna, sasha, joined, invitation } = await pair();
  assert.equal(joined.data.spaceId, anna.data.spaceId);
  assert.deepEqual(new Set(joined.data.data.profiles.map(p => p.id)), new Set([anna.data.user.id, sasha.data.user.id]));
  const refreshed = await request('/api/session', { cookie: anna.cookie });
  assert.equal(refreshed.data.data.profiles.length, 2);
  assert.equal((await request('/api/invite', { cookie: anna.cookie, body: {} })).status, 409);
  const third = await register('third@example.test', 'Третий');
  assert.equal((await request('/api/join', { cookie: third.cookie, body: { code: invitation.data.code } })).status, 400);
  const unchanged = await request('/api/session', { cookie: third.cookie });
  assert.equal(unchanged.data.spaceId, third.data.spaceId);
});

test('new invitation revokes the previous code; joining cannot discard existing personal records', async t => {
  const { request, register, save } = await fixture(t);
  const anna = await register();
  const sasha = await register('sasha@example.test', 'Саша');
  const oldInvite = await request('/api/invite', { cookie: anna.cookie, body: {} });
  const invite = await request('/api/invite', { cookie: anna.cookie, body: {} });
  assert.notEqual(invite.data.code, oldInvite.data.code);
  assert.equal((await request('/api/join', { cookie: sasha.cookie, body: { code: oldInvite.data.code } })).status, 400);
  assert.equal((await request('/api/join', { cookie: anna.cookie, body: { code: invite.data.code } })).status, 400);
  assert.equal((await save(sasha, data => data.plans.push({ id: 'keep', title: 'Сохранить', date: '', category: 'Вдвоём', done: false }))).status, 200);
  const join = await request('/api/join', { cookie: sasha.cookie, body: { code: invite.data.code } });
  assert.equal(join.status, 409);
  const unchanged = await request('/api/session', { cookie: sasha.cookie });
  assert.equal(unchanged.data.spaceId, sasha.data.spaceId);
  assert.equal(unchanged.data.data.plans[0].id, 'keep');
});

test('profile updates preserve the authenticated owner, store avatar, and synchronize birthday', async t => {
  const { request, pair } = await fixture(t);
  const { anna, sasha } = await pair();
  const updated = await request('/api/profile', {
    cookie: anna.cookie,
    body: { id: sasha.data.user.id, name: 'Анна Мария', birthday: '2000-02-29', bio: 'Люблю путешествия', avatar },
  });
  assert.equal(updated.status, 200);
  const own = updated.data.data.profiles.find(p => p.id === anna.data.user.id);
  assert.equal(own.name, 'Анна Мария');
  assert.equal(own.avatar, avatar);
  assert.equal(updated.data.data.profiles.find(p => p.id === sasha.data.user.id).name, 'Саша');
  const birthday = updated.data.data.dates.find(d => d.id === `birthday:${anna.data.user.id}`);
  assert.equal(birthday.date, '2000-02-29');
  assert.equal(birthday.annual, true);
  const partnerView = await request('/api/session', { cookie: sasha.cookie });
  assert.equal(partnerView.data.data.profiles.find(p => p.id === anna.data.user.id).avatar, avatar);
  const removed = await request('/api/profile', { cookie: anna.cookie, body: { ...own, birthday: '', avatar: '' } });
  assert.equal(removed.status, 200);
  assert.equal(removed.data.data.dates.some(d => d.id === `birthday:${anna.data.user.id}`), false);
  assert.equal(removed.data.data.profiles.find(p => p.id === anna.data.user.id).avatar, '');
});

test('messages always use the authenticated sender and existing messages cannot be rewritten or removed', async t => {
  const { request, pair, save } = await fixture(t);
  const { anna, sasha } = await pair();
  const posted = await save(anna, data => {
    data.messages.push({ id: 'hello', text: 'Привет 🤍', senderId: sasha.data.user.id, createdAt: '1990-01-01T00:00:00.000Z' });
  });
  assert.equal(posted.status, 200);
  const message = posted.data.data.messages[0];
  assert.equal(message.senderId, anna.data.user.id);
  assert.equal(message.text, 'Привет 🤍');
  assert.ok(Math.abs(Date.now() - Date.parse(message.createdAt)) < 5000);
  const attemptedEdit = await save(sasha, data => {
    data.messages[0] = { ...message, text: 'Изменено', senderId: sasha.data.user.id };
    data.messages.push({ id: 'reply', text: 'Привет!', senderId: anna.data.user.id });
  });
  assert.equal(attemptedEdit.status, 200);
  assert.deepEqual(attemptedEdit.data.data.messages[0], message);
  assert.equal(attemptedEdit.data.data.messages[1].senderId, sasha.data.user.id);
  const attemptedRemoval = await save(anna, data => { data.messages = []; });
  assert.equal(attemptedRemoval.status, 400);
  const after = await request('/api/session', { cookie: anna.cookie });
  assert.equal(after.data.data.messages.length, 2);
});

test('stale revisions cannot silently overwrite another partner’s changes', async t => {
  const { request, pair, save } = await fixture(t);
  const { anna, sasha } = await pair();
  const stale = await request('/api/session', { cookie: sasha.cookie });
  const fresh = await save(anna, data => { data.mood = 'Счастливы'; });
  assert.equal(fresh.status, 200);
  assert.ok(fresh.data.revision > stale.data.revision);
  const conflict = await request('/api/data', {
    cookie: sasha.cookie,
    body: { revision: stale.data.revision, data: { ...stale.data.data, mood: 'Устаревшее значение' } },
  });
  assert.equal(conflict.status, 409);
  const current = await request('/api/session', { cookie: sasha.cookie });
  assert.equal(current.data.data.mood, 'Счастливы');
  assert.equal(current.data.revision, fresh.data.revision);
});

test('logout invalidates the session on the server', async t => {
  const { request, register } = await fixture(t);
  const registered = await register();
  const logout = await request('/api/logout', { cookie: registered.cookie, body: {} });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await request('/api/session', { cookie: registered.cookie })).status, 401);
  assert.equal((await request('/api/profile', { cookie: registered.cookie, body: { name: 'Запрещено', birthday: '', bio: '', avatar: '' } })).status, 401);
});

test('password changes require the current password and invalidate other sessions', async t => {
  const { request, register } = await fixture(t);
  const registered = await register();
  const second = await request('/api/login', { body: { email: 'anna@example.test', password } });
  const rejected = await request('/api/password', { cookie: registered.cookie, body: { currentPassword: 'wrong', password: 'another-long-password' } });
  assert.equal(rejected.status, 401);
  const changed = await request('/api/password', { cookie: registered.cookie, body: { currentPassword: password, password: 'another-long-password' } });
  assert.equal(changed.status, 200);
  assert.ok(changed.cookie);
  assert.equal((await request('/api/session', { cookie: registered.cookie })).status, 401);
  assert.equal((await request('/api/session', { cookie: second.cookie })).status, 401);
  assert.equal((await request('/api/session', { cookie: changed.cookie })).status, 200);
  assert.equal((await request('/api/login', { body: { email: 'anna@example.test', password } })).status, 401);
  assert.equal((await request('/api/login', { body: { email: 'anna@example.test', password: 'another-long-password' } })).status, 200);
});

test('recovery codes rotate, reject replay and invalidate pre-recovery sessions', async t => {
  const { request, register } = await fixture(t);
  const registered = await register();
  const body = { email: 'anna@example.test', code: registered.data.recoveryCode, password: 'recovered-long-password' };
  const invalid = await request('/api/recover', { body: { ...body, code: 'invalid-code' } });
  assert.equal(invalid.status, 401);
  const recovered = await request('/api/recover', { body });
  assert.equal(recovered.status, 200);
  assert.notEqual(recovered.data.recoveryCode, registered.data.recoveryCode);
  assert.equal((await request('/api/session', { cookie: registered.cookie })).status, 401);
  assert.equal((await request('/api/session', { cookie: recovered.cookie })).status, 200);
  assert.equal((await request('/api/recover', { body })).status, 401);
  assert.equal((await request('/api/login', { body: { email: body.email, password } })).status, 401);
  assert.equal((await request('/api/login', { body: { email: body.email, password: body.password } })).status, 200);
});

test('a recovery code is accepted only once even for simultaneous requests', async t => {
  const { request, register } = await fixture(t);
  const registered = await register();
  const body = { email: 'anna@example.test', code: registered.data.recoveryCode, password: 'recovered-long-password' };
  const results = await Promise.all([
    request('/api/recover', { body }),
    request('/api/recover', { body: { ...body, password: 'different-long-password' } }),
  ]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 401]);
});

test('mutations reject missing client headers, non-JSON content and foreign origins', async t => {
  const { request, register, origin } = await fixture(t);
  const registered = await register();
  const body = { name: 'Нельзя изменить', birthday: '', bio: '', avatar: '' };
  for (const headers of [
    { 'X-Blizhe-Client': '' },
    { 'Content-Type': 'text/plain' },
    { Origin: 'https://untrusted.example' },
  ]) {
    assert.equal((await request('/api/profile', { cookie: registered.cookie, body, headers })).status, 403);
  }
  const session = await request('/api/session', { cookie: registered.cookie });
  assert.equal(session.data.data.profiles[0].name, 'Анна');
  assert.equal((await request('/api/profile', { cookie: registered.cookie, body, headers: { Origin: origin } })).status, 200);
});

test('invalid registration and profile data are rejected without altering saved profiles', async t => {
  const { request, register } = await fixture(t);
  for (const body of [
    { name: 'Анна', email: 'not-email', password },
    { name: 'Анна', email: 'anna@example.test', password: 'short' },
    { name: ' ', email: 'anna@example.test', password },
    { name: 'Анна', email: 'anna@example.test', password: 'x'.repeat(129) },
  ]) assert.equal((await request('/api/register', { body })).status, 400);
  const registered = await register();
  const valid = { name: 'Анна', birthday: '', bio: '', avatar: '' };
  for (const changes of [
    { name: ' ' },
    { name: 'x'.repeat(26) },
    { birthday: '2001-02-29' },
    { birthday: '9999-01-01' },
    { avatar: 'https://example.test/avatar.jpg' },
    { avatar: 'data:image/svg+xml;base64,PHN2Zz4=' },
    { bio: 'x'.repeat(121) },
  ]) assert.equal((await request('/api/profile', { cookie: registered.cookie, body: { ...valid, ...changes } })).status, 400);
  const after = await request('/api/session', { cookie: registered.cookie });
  assert.deepEqual(after.data.data.profiles, registered.data.data.profiles);
});

test('invalid shared records and duplicate IDs cannot partially overwrite valid data', async t => {
  const { request, register, save } = await fixture(t);
  const registered = await register();
  const plan = { id: 'plan-one', title: 'Прогулка', date: '', category: 'Вдвоём', done: false };
  const updated = await save(registered, data => { data.plans = [plan]; });
  assert.equal(updated.status, 200);
  const invalidChanges = [
    data => { data.startDate = '9999-01-01'; },
    data => { data.plans = [plan, plan]; },
    data => { data.plans = [{ ...plan, date: '2025-02-30' }]; },
    data => { data.plans = [{ ...plan, title: '' }]; },
    data => { data.memories = [{ id: 'memory', title: 'Тест', date: '2025-01-01', location: '', note: '', image: 'javascript:alert(1)', favorite: false }]; },
    data => { data.dates = [{ id: 'date', title: 'Событие', date: 'yesterday', emoji: '🤍', annual: false }]; },
    data => { data.messages = [{ id: 'empty', text: ' ' }]; },
    data => { data.plans = null; },
  ];
  for (const change of invalidChanges) {
    const invalid = await save(registered, data => { data.mood = 'Не должно сохраниться'; change(data); });
    assert.equal(invalid.status, 400, JSON.stringify(invalid.data));
    const after = await request('/api/session', { cookie: registered.cookie });
    assert.equal(after.data.revision, updated.data.revision);
    assert.deepEqual(after.data.data, updated.data.data);
  }
});
