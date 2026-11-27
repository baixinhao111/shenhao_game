/// <reference types="vite/client" />
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './fonts';
import './index.css';
import { initBgmLifecycle } from './lib/bgm';

initBgmLifecycle();

// Auto-recover once if a rebuild replaced hashed lazy chunks while an older tab stayed open.
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    try {
      const key = 'tianshu_chunk_reload_at';
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last > 15000) {
        sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  });
}

if (typeof window !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD && import.meta.env.MODE !== 'demo') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
