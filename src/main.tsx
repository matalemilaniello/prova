import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './App';
import { boot } from './app/boot';
import { IS_PREVIEW } from './app/env';

/**
 * Un file caricato a richiesta non si trova più (l'app è stata aggiornata mentre era aperta): si ricarica
 * una volta sola, così si prendono i file nuovi. Se succede di nuovo, ci pensa l'ErrorBoundary.
 */
const RELOAD_KEY = 'ritmo:ricaricata';
window.addEventListener('vite:preloadError', (e) => {
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return;
    sessionStorage.setItem(RELOAD_KEY, '1');
  } catch {
    return;
  }
  e.preventDefault();
  location.reload();
});
window.setTimeout(() => {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* ignora */
  }
}, 10_000);

boot();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

if (!IS_PREVIEW && import.meta.env.PROD) {
  void import('./app/pwa').then((m) => m.setupPwaUpdates());
}
