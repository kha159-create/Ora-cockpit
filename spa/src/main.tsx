import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// A deployment may replace Vite's hashed lazy chunks while an older app tab is open.
// Retry once with a fresh app shell instead of leaving every route on an error screen.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  try {
    const key = 'ora-spa-last-chunk-retry';
    const last = Number(sessionStorage.getItem(key) || '0');
    if (Date.now() - last > 30000) {
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    }
  } catch {
    window.location.reload();
  }
});

// Optional: register service worker (we provide sw.js via Vite publicDir)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find root element');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);

