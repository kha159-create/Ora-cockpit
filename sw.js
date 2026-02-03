/* Service Worker - Orange Dashboard
 * هدفه: دعم Add to Home Screen + أداء أفضل للموبايل
 * ملاحظة حرجة: لا نقوم بتخزين ملفات JSON لتجنب عرض بيانات قديمة/تضخم الكاش بسبب ?t=
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `orange-static-${CACHE_VERSION}`;

// صفحات أساسية + ملفات ثابتة محلية فقط
const STATIC_ASSETS = [
  './',
  './index.html',
  './reports.html',
  './employees.html',
  './product_analysis.html',
  './branch_details.html',
  './stagnant_products.html',
  './offers_analysis.html',
  './yesterday_report.html',
  './data_audit.html',
  './chatbot.html',
  './target_setting.html',
  './login.html',
  './widget.html',
  './admin_targets.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './assets/sidebar.css',
  './assets/sidebar.js',
  './assets/amiri_font.js',
  './assets/pwa.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('orange-static-') && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  // لا نخزن JSON إطلاقاً (لأنها بيانات تتغير دائماً + cache-busting query)
  if (isSameOrigin && url.pathname.endsWith('.json')) {
    const cleanUrl = url.origin + url.pathname; // بدون query
    event.respondWith(
      fetch(cleanUrl, { cache: 'no-store' })
        .catch(() => caches.match(url.pathname))
        .catch(() => fetch(req))
    );
    return;
  }

  // Cache-first للملفات الثابتة المحلية
  if (isSameOrigin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        });
      })
    );
    return;
  }

  // للـ CDN (مثل bootstrap/js): network-first (حتى لا نكسر)
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});

