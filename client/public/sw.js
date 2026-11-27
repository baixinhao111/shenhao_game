// Lightweight PWA Service Worker for 《天枢神豪》
// Network-first for HTML, stale-while-revalidate for static images/fonts/bundles, API never cached.
// Bump CACHE_NAME when the caching rules change; old caches are dropped on activate.
const CACHE_NAME = 'tianshu-shell-v5'; // v5: cyan 天枢积分 icon
const MAX_ENTRIES = 400; // hashed bundles pile up release after release; keep the cache bounded

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['/', '/manifest.json', '/icons/icon-192.png']).catch(() => {})),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Drop the oldest entries (insertion order) once the cache grows past MAX_ENTRIES. */
async function trim(cache) {
  const keys = await cache.keys();
  const extra = keys.length - MAX_ENTRIES;
  for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // always live, server-authoritative

  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(webp|png|jpg|jpeg|woff2?|css|js)$/i.test(url.pathname)
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        const net = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              cache.put(req, res.clone()).then(() => trim(cache));
            }
            return res;
          })
          .catch(() => cached || new Response('', { status: 504, statusText: 'offline' }));
        if (cached) {
          event.waitUntil(net.catch(() => {}));
          return cached;
        }
        return net;
      }),
    );
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => (await caches.match('/')) || new Response('离线中，请联网后重试', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })),
    );
  }
});
