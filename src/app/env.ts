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
