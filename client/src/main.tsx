/// <reference types="vite/client" />
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './fonts';
import './index.css';
import { initBgmLifecycle } from './lib/bgm';

initBgmLifecycle();

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
