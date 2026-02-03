/* Root Service Worker (legacy → SPA)
 * We intentionally unregister this root SW to avoid stale HTML caching.
 * The SPA registers its own SW scoped to /site/.
 */

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        // ignore
      }
      try {
        await self.registration.unregister();
      } catch {
        // ignore
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', () => {
  // no-op (let network handle it)
});

