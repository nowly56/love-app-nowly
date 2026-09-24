import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { createApi } from './api.mjs';
import { createTelegramBot } from './bot.mjs';

if (existsSync('.env')) process.loadEnvFile('.env');

const root = resolve('dist');
const index = resolve(root, 'index.html');
const port = Number(process.env.PORT) || 4173;
const api = createApi();
const bot = createTelegramBot();
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const server = createServer(async (req, res) => {
  if (req.url?.split('?')[0] === '/bot/webhook') {
    await bot.handle(req, res);
    return;
  }
  if (req.url?.startsWith('/api/')) {
    await api.middleware(req, res, () => { res.writeHead(404).end(); });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname); }
  catch { res.writeHead(400).end(); return; }
  const requested = resolve(root, `.${pathname}`);
  let filename = requested.startsWith(root + sep) || requested === root ? requested : index;
  try {
    if (!statSync(filename).isFile()) filename = index;
  } catch {
    filename = extname(pathname) ? '' : index;
  }
  if (!filename || !existsSync(filename)) { res.writeHead(404).end(); return; }

  const isHtml = filename === index;
  res.writeHead(200, {
    'Content-Type': contentTypes[extname(filename).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': isHtml ? 'no-cache' : filename.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(filename).pipe(res);
});

server.listen(port, '0.0.0.0', () => { console.log(`Ближе запущен на порту ${port}`); void bot.start(); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { bot.stop(); server.close(() => { api.close(); process.exit(0); }); });
