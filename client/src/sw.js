import { STATIC_CACHE_PREFIX, MAX_STATIC_VERSIONS, isApiPath, isPublicStaticUrl, isVersionedAsset } from './pwa/cachePolicy.js';
import { setupWorkerPush } from './notifications/workerPush.js';

setupWorkerPush(self);

// Vite PWA injects content revisions here. There is no cached application shell
// or runtime data cache: this list is restricted again before anything is stored.
const assets = self.__WB_MANIFEST.filter(({ url }) => isPublicStaticUrl(new URL(url, self.location.origin), self.location.origin));
const urls = new Set(assets.map(({ url }) => new URL(url, self.location.origin).href));
const cacheName = crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(assets)))
  .then((hash) => STATIC_CACHE_PREFIX + [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 20));

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(await cacheName);
    await cache.addAll([...urls].map((url) => new Request(url, { cache: 'reload', credentials: 'omit' })));
  })());
  // A replacement worker waits until the user explicitly accepts the update.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const current = await cacheName;
    const previous = (await caches.keys()).filter((name) => name.startsWith(STATIC_CACHE_PREFIX) && name !== current);
    // Keep a bounded static history for still-open tabs using an older JS bundle.
    await Promise.all(previous.slice(0, Math.max(0, previous.length - (MAX_STATIC_VERSIONS - 1))).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isApiPath(url.pathname)) {
    // Covers GET/HEAD and every mutation. Never fall back to cached JSON/HTML.
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(async (error) => {
      const client = event.clientId ? await self.clients.get(event.clientId) : null;
      if (error.name !== 'AbortError' && !request.signal.aborted) client?.postMessage({ type: 'API_NETWORK_FAILURE' });
      return new Response(JSON.stringify({ success: false, error: { code: 'OFFLINE', message: 'لا يوجد اتصال بالإنترنت' } }), {
        status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }));
    return;
  }
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(async () => {
      const cache = await caches.open(await cacheName);
      return (await cache.match(new URL('/offline.html', self.location.origin).href)) || Response.error();
    }));
    return;
  }
  if (urls.has(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(await cacheName);
      return (await cache.match(request)) || fetch(request, { cache: 'no-store' });
    })());
  } else if (!url.search && isVersionedAsset(url.pathname)) {
    event.respondWith((async () => {
      // Only immutable build assets may be read from retained older versions.
      for (const name of (await caches.keys()).filter((name) => name.startsWith(STATIC_CACHE_PREFIX)).reverse()) {
        const response = await (await caches.open(name)).match(request);
        if (response) return response;
      }
      return fetch(request, { cache: 'no-store' });
    })());
  }
});
