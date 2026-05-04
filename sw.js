/* Service Worker - Orange Cockpit SPA
 * - cache-first for static assets (JS/CSS/fonts/icons)
 * - network-first for HTML (to get latest app shell)
 * - NEVER cache JSON (data must stay fresh)
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `ora-spa-static-${CACHE_VERSION}`;

// Minimal pre-cache (Vite will add hashed assets at runtime)
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ora-spa-static-') && k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const pathname = url.pathname;

  // Never cache JSON (keep data fresh; avoid cache-busting explosion)
  if (isSameOrigin && pathname.endsWith('.json')) {
    event.respondWith(fetch(url.origin + pathname, { cache: 'no-store' }).catch(() => fetch(req)));
    return;
  }

  // Network-first for HTML navigations
  const acceptsHtml = req.headers.get('accept')?.includes('text/html');
  if (isSameOrigin && acceptsHtml) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
    );
    return;
  }

  // Cache-first for other same-origin assets
  if (isSameOrigin) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        });
      }),
    );
    return;
  }

  // CDN: network-first
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});

