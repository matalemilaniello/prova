/** Ambiente di esecuzione. */

/** Anteprima in un unico file (Artifact): niente rete esterna, niente service worker, niente download. */
export const IS_PREVIEW = import.meta.env.MODE === 'preview';

export const IS_DEV = import.meta.env.DEV;

/** Versione dell'app da package.json. */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

/** Data della build 'YYYY-MM-DD'. */
export const BUILD_DATE: string = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : '';

/** True se l'app gira installata sulla schermata Home (standalone). */
export function isStandalone(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

/**
 * Archiviazione persistente: 'protetta' se il browser ha promesso di non cancellare i dati da solo,
 * 'normale' se può farlo quando serve spazio (allora il backup conta di più), 'sconosciuta' finché non si sa
 * o se il browser non lo dice.
 */
export type StoragePersistence = 'protetta' | 'normale' | 'sconosciuta';

let persistence: StoragePersistence = 'sconosciuta';
let pending: Promise<StoragePersistence> | null = null;

/** Esito attuale (vedi `requestPersistentStorage`). */
export function getStoragePersistence(): StoragePersistence {
  return persistence;
}

/** Chiede al browser di rendere persistenti i dati, senza bloccare. Restituisce l'esito. */
export function requestPersistentStorage(): Promise<StoragePersistence> {
  if (pending) return pending;
  pending = (async () => {
    try {
      const sm = typeof navigator !== 'undefined' ? navigator.storage : undefined;
      if (!sm) return persistence;
      if (typeof sm.persisted === 'function' && (await sm.persisted())) {
        persistence = 'protetta';
      } else if (typeof sm.persist === 'function') {
        persistence = (await sm.persist()) ? 'protetta' : 'normale';
      }
    } catch {
      /* non disponibile */
    }
    return persistence;
  })();
  return pending;
}
