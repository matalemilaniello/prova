/**
 * Router a hash minimale (compatibile con gli Artifact, che accettano solo '#nome').
 * Le sotto-pagine (ricetta, seduta, controllo…) sono pannelli dello stato, non rotte.
 */
import { useSyncExternalStore } from 'react';

export type Route = 'oggi' | 'settimana' | 'allenamento' | 'coach' | 'progressi' | 'impostazioni' | 'kit';

export const ROUTES: Route[] = ['oggi', 'settimana', 'allenamento', 'coach', 'progressi', 'impostazioni', 'kit'];
/** Schede della barra in basso, in ordine. */
export const TAB_ROUTES: Route[] = ['oggi', 'settimana', 'allenamento', 'coach', 'progressi'];
export const DEFAULT_ROUTE: Route = 'oggi';

export function parseRoute(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split(/[/?&]/)[0]?.toLowerCase() ?? '';
  return (ROUTES as string[]).includes(name) ? (name as Route) : DEFAULT_ROUTE;
}

const currentHash = () => (typeof location === 'undefined' ? '' : location.hash);

let lastTab: Route = TAB_ROUTES.includes(parseRoute(currentHash())) ? parseRoute(currentHash()) : DEFAULT_ROUTE;

function subscribe(cb: () => void) {
  const onChange = () => {
    const r = parseRoute(currentHash());
    if (TAB_ROUTES.includes(r)) lastTab = r;
    cb();
  };
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/** Rotta attuale; si aggiorna con l'hash. */
export function useRoute(): Route {
  return useSyncExternalStore(
    subscribe,
    () => parseRoute(currentHash()),
    () => DEFAULT_ROUTE,
  );
}

export function getRoute(): Route {
  return parseRoute(currentHash());
}

/** Vai a una rotta (aggiunge una voce alla cronologia, così il gesto indietro funziona). */
export function navigate(route: Route): void {
  if (parseRoute(currentHash()) === route && currentHash()) return;
  if (TAB_ROUTES.includes(getRoute())) lastTab = getRoute();
  location.hash = route;
}

/** Torna alla scheda da cui si è arrivati (es. chiudendo Impostazioni). */
export function goBack(): void {
  navigate(lastTab);
}
