/**
 * Aggiornamenti dell'app installata (solo build per GitHub Pages, mai nell'anteprima).
 *
 * Il service worker nuovo resta in attesa finché l'utente non tocca "Aggiorna": così una pagina già aperta
 * non si ritrova con i file vecchi cancellati a metà sessione (le parti caricate a richiesta andrebbero
 * in errore). All'apertura successiva, se non c'è nessuna pagina aperta, il nuovo service worker si
 * attiva da solo.
 */
import { useUi } from '../state/store';

export async function setupPwaUpdates(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const { registerSW } = await import('virtual:pwa-register');
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        useUi.getState().toast('Nuova versione pronta', 'neutral', {
          actionLabel: 'Aggiorna',
          onAction: () => void updateSW(true),
          durationMs: 15_000,
        });
      },
      onRegisteredSW(_url, reg) {
        // Controlla gli aggiornamenti quando l'app torna in primo piano (le PWA su iPhone restano aperte a lungo).
        if (!reg) return;
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
        });
      },
    });
  } catch {
    /* service worker non disponibile: l'app funziona lo stesso */
  }
}
