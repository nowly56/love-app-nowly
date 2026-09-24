import { defineConfig, loadEnv } from 'vite';
import type { PreviewServer, ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createApi } from './server/api.mjs';
import { createTelegramBot } from './server/bot.mjs';

function attachServerFeatures(server: ViteDevServer | PreviewServer) {
  const api = createApi();
  const bot = createTelegramBot();
  server.middlewares.use((req, res, next) => {
    if (req.url?.split('?')[0] === '/bot/webhook') { void bot.handle(req, res); return; }
    next();
  });
  server.middlewares.use(api.middleware);
  server.httpServer?.once('listening', () => { void bot.start(); });
  server.httpServer?.once('close', () => { bot.stop(); api.close(); });
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.TELEGRAM_BOT_TOKEN) process.env.TELEGRAM_BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
  if (env.COOKIE_SECURE) process.env.COOKIE_SECURE = env.COOKIE_SECURE;
  if (env.WEB_APP_URL) process.env.WEB_APP_URL = env.WEB_APP_URL;
  return { server: { host: true, allowedHosts: ['.trycloudflare.com'], fs: { deny: ['.env', '.env.*', '**/.git/**', '**/storage/**', '**/server/**', '**/.tools/**', '**/*.sqlite*', '**/*.log'] } }, preview: { host: true, allowedHosts: ['.trycloudflare.com'] }, plugins: [react(), {
  name: 'blizhe-api',
  configureServer: attachServerFeatures,
  configurePreviewServer: attachServerFeatures,
}] };
});
