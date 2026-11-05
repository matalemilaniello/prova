/** Rete del dispositivo, aggiornata con gli eventi `online` e `offline` del browser. */
import { useSyncExternalStore } from 'react';

function subscribe(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

const snapshot = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
