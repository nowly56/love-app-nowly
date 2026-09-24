import { createHash, timingSafeEqual } from 'node:crypto';

export function webAppUrl(env = process.env) {
  const raw = env.WEB_APP_URL || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : '');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.origin + (url.pathname === '/' ? '' : url.pathname.replace(/\/$/, ''));
  } catch { return ''; }
}

export function createTelegramBot({ token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN, appUrl = webAppUrl(), request = fetch } = {}) {
  const enabled = Boolean(token && appUrl);
  const secret = token ? createHash('sha256').update(`blizhe-webhook:${token}`).digest('hex') : '';
  const webhookUrl = appUrl ? new URL('/bot/webhook', appUrl).toString() : '';
  const delivered = new Set();
  let retryTimer;
  let retryDelay = 2000;
  let stopped = false;

  async function call(method, data) {
    const response = await request(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(`${method}: ${result.description || 'Telegram API вернул ошибку'}`);
    return result.result;
  }

  async function register() {
    if (!enabled || stopped) return;
    try {
      await call('setWebhook', { url: webhookUrl, secret_token: secret, allowed_updates: ['message'] });
      await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Открыть Ближе', web_app: { url: appUrl } } });
      retryDelay = 2000;
      console.log(`Telegram-бот подключён: ${webhookUrl}`);
    } catch (error) {
      console.error(`Telegram-бот: не удалось подключить webhook (${error.message}). Повторим попытку.`);
      retryTimer = setTimeout(() => { void register(); }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 60000);
    }
  }

  async function handle(req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (!enabled) { res.writeHead(503).end(JSON.stringify({ ok: false })); return; }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(JSON.stringify({ ok: false })); return; }
    const supplied = req.headers['x-telegram-bot-api-secret-token'];
    const actual = Buffer.from(typeof supplied === 'string' ? supplied : '');
    const expected = Buffer.from(secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      res.writeHead(403).end(JSON.stringify({ ok: false })); return;
    }
    if (!req.headers['content-type']?.startsWith('application/json')) {
      res.writeHead(415).end(JSON.stringify({ ok: false })); return;
    }

    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1_000_000) { res.writeHead(413).end(JSON.stringify({ ok: false })); return; }
        chunks.push(chunk);
      }
      const update = JSON.parse(Buffer.concat(chunks).toString());
      const message = update?.message;
      if (Number.isSafeInteger(update?.update_id) && delivered.has(update.update_id)) {
        res.writeHead(200).end(JSON.stringify({ ok: true })); return;
      }
      if (message?.chat?.type === 'private' && Number.isSafeInteger(message.chat.id) && typeof message.text === 'string') {
        await call('sendMessage', {
          chat_id: message.chat.id,
          text: 'Привет! Это Ближе — ваше пространство для двоих. Нажми кнопку, чтобы открыть приложение 🤍',
          reply_markup: { inline_keyboard: [[{ text: 'Открыть Ближе 🤍', web_app: { url: appUrl } }]] },
        });
      }
      if (Number.isSafeInteger(update?.update_id)) {
        delivered.add(update.update_id);
        if (delivered.size > 512) delivered.delete(delivered.values().next().value);
      }
      res.writeHead(200).end(JSON.stringify({ ok: true }));
    } catch (error) {
      console.error(`Telegram-бот: ошибка обработки сообщения (${error.message})`);
      res.writeHead(error instanceof SyntaxError ? 400 : 502).end(JSON.stringify({ ok: false }));
    }
  }

  return {
    enabled,
    secret,
    start() {
      if (!token) console.warn('Telegram-бот отключён: задайте TELEGRAM_BOT_TOKEN в Railway Variables.');
      else if (!appUrl) console.warn('Telegram-бот отключён: добавьте публичный домен Railway или WEB_APP_URL.');
      else return register();
    },
    stop() { stopped = true; clearTimeout(retryTimer); },
    handle,
  };
}
