/* Production-only offline shell. Authenticated API data is never cached. */
const CACHE_PREFIX = 'blizhe-pwa-';
const CACHE_VERSION = 'v2';
const PAGE_CACHE = `${CACHE_PREFIX}${CACHE_VERSION}-pages`;
const ASSET_CACHE = `${CACHE_PREFIX}${CACHE_VERSION}-assets`;
const LIVE_CACHES = new Set([PAGE_CACHE, ASSET_CACHE]);
const MAX_PAGES = 12;
const MAX_ASSETS = 100;

async function trimCache(cache, maximum) {
  const keys = await cache.keys();
  if (keys.length > maximum) {
    await Promise.all(keys.slice(0, keys.length - maximum).map(key => cache.delete(key)));
  }
}

async function saveResponse(cacheName, request, response, maximum) {
  if (!response || !response.ok || response.type !== 'basic') return;
  // Respect server instructions for private or uncacheable resources.
  if (/\b(no-store|private)\b/i.test(response.headers.get('Cache-Control') || '')) return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  await trimCache(cache, maximum);
}

self.addEventListener('install', event => {
  // A failed warm-up must not prevent the worker from installing.
  event.waitUntil((async () => {
    try {
      const response = await fetch('/', { cache: 'reload' });
      await saveResponse(PAGE_CACHE, '/', response, MAX_PAGES);
      // The first page's assets may have loaded before this worker took control.
      // Warm their cache directly so the next visit can already work offline.
      if (response.ok) {
        const html = await response.text();
        const references = [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map(match => match[1]);
        const assets = [...new Set([...references, '/manifest.webmanifest', '/app-icon-192.png', '/app-icon-512.png'])]
          .map(path => new URL(path, self.location.origin))
          .filter(url => url.origin === self.location.origin && /\.(?:js|css|woff2?|png|jpe?g|webp|avif|svg|ico|webmanifest)$/i.test(url.pathname));
        await Promise.allSettled(assets.map(async url => {
          const asset = await fetch(url.href, { cache: 'reload' });
          await saveResponse(ASSET_CACHE, url.href, asset, MAX_ASSETS);
        }));
      }
    } catch {
      // The first successful navigation will populate this cache.
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && !LIVE_CACHES.has(name)).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || !/^https?:$/.test(url.protocol) || url.origin !== self.location.origin) return;
  if (/^\/(?:@|__vite|src\/|node_modules\/|api\/)/.test(url.pathname) || url.searchParams.has('t') || url.searchParams.has('import')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          try { await saveResponse(PAGE_CACHE, request, response, MAX_PAGES); } catch { /* Storage may be full. */ }
        }
        return response;
      } catch {
        const cache = await caches.open(PAGE_CACHE);
        return (await cache.match(request)) || (await cache.match('/')) || new Response('Подключитесь к интернету, чтобы впервые открыть «ближе».', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })());
    return;
  }

  if (!/\.(?:js|css|woff2?|png|jpe?g|webp|avif|svg|ico|webmanifest)$/i.test(url.pathname)) return;
  const refresh = fetch(request).then(async response => {
    try { await saveResponse(ASSET_CACHE, request, response, MAX_ASSETS); } catch { /* Storage may be full. */ }
    return response;
  });
  // Keep the network refresh alive when a cached asset is returned immediately.
  event.waitUntil(refresh.then(() => undefined).catch(() => undefined));
  event.respondWith((async () => {
    const cache = await caches.open(ASSET_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    try { return await refresh; } catch { return Response.error(); }
  })());
});
