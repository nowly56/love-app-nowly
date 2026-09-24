import React from 'react';
import ReactDOM from 'react-dom/client';
import SessionApp from './SessionApp';
import ErrorBoundary from './ErrorBoundary';
import './redesign.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ErrorBoundary><SessionApp /></ErrorBoundary></React.StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* Browser support is optional. */ });
  });
}
