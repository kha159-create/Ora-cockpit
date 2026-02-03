// Register Service Worker for PWA / Add to Home Screen
// هدفه: تفعيل A2HS بدون تخزين JSON بشكل قديم
(function () {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register('./sw.js')
      .catch(function (err) {
        // Silent fail - PWA is optional
        console.warn('SW registration failed', err);
      });
  });
})();

