import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createTelegramBot, webAppUrl } from '../server/bot.mjs';

test('Railway public domain becomes a secure Mini App URL', () => {
  assert.equal(webAppUrl({ RAILWAY_PUBLIC_DOMAIN: 'blizhe.up.railway.app' }), 'https://blizhe.up.railway.app');
  assert.equal(webAppUrl({ WEB_APP_URL: 'http://example.com' }), '');
});

test('bot registers a protected webhook and responds to private messages once', async t => {
  const calls = [];
  const bot = createTelegramBot({
    token: '123456:test-bot-token',
    appUrl: 'https://blizhe.up.railway.app',
    request: async (url, options) => {
      calls.push({ method: url.split('/').at(-1), body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ ok: true, result: true }) };
    },
  });
  await bot.start();
  assert.equal(calls[0].method, 'setWebhook');
  assert.equal(calls[0].body.url, 'https://blizhe.up.railway.app/bot/webhook');
  assert.equal(calls[0].body.secret_token, bot.secret);
  assert.equal(calls[1].method, 'setChatMenuButton');
  assert.equal(calls[1].body.menu_button.web_app.url, 'https://blizhe.up.railway.app');

  const server = createServer((req, res) => { void bot.handle(req, res); });
  t.after(async () => { bot.stop(); await new Promise(resolve => server.close(resolve)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}/bot/webhook`;
  const update = { update_id: 42, message: { chat: { id: 987654321, type: 'private' }, text: '/start' } };
  const unauthorized = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) });
  assert.equal(unauthorized.status, 403);
  assert.equal(calls.length, 2);

  const headers = { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': bot.secret };
  const accepted = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(update) });
  assert.equal(accepted.status, 200);
  assert.equal(calls[2].method, 'sendMessage');
  assert.equal(calls[2].body.chat_id, 987654321);
  assert.equal(calls[2].body.reply_markup.inline_keyboard[0][0].web_app.url, 'https://blizhe.up.railway.app');

  const repeated = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(update) });
  assert.equal(repeated.status, 200);
  assert.equal(calls.length, 3);
});
