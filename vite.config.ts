import { defineConfig } from 'vite';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createApi } from './server/api.mjs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.TELEGRAM_BOT_TOKEN) process.env.TELEGRAM_BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
  if (env.COOKIE_SECURE) process.env.COOKIE_SECURE = env.COOKIE_SECURE;
  return { server: { host: true, allowedHosts: ['.trycloudflare.com'], fs: { deny: ['.env', '.env.*', '**/.git/**', '**/storage/**', '**/server/**', '**/.tools/**', '**/*.sqlite*', '**/*.log'] } }, preview: { host: true, allowedHosts: ['.trycloudflare.com'] }, plugins: [react(), {
  name: 'blizhe-api',
  configureServer(server) { const api = createApi(); server.middlewares.use(api.middleware); server.httpServer?.once('close', api.close); },
  configurePreviewServer(server) { const api = createApi(); server.middlewares.use(api.middleware); server.httpServer?.once('close', api.close); },
}] };
});
