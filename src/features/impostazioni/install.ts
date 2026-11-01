/**
 * Installazione sulla schermata Home di iPhone.
 *
 * In Safari, senza installazione, Ritmo non è a tutto schermo e Safari può cancellare i dati di un sito dopo
 * alcuni giorni senza visite. Aperta dall'icona della schermata Home ha il suo spazio e i dati restano.
 * Su iPhone l'app installata non vede i dati scritti in Safari: conviene installarla prima di iniziare.
 *
 * Anteprime: ?installa=1 mostra sempre l'invito (anche fuori da iPhone).
 */
import type { ISODate } from '../../domain/types';
import { IS_PREVIEW, isStandalone } from '../../app/env';
import { getUrlParam } from '../../app/urlParams';
import { addDays, isISODate } from '../../engine/dates';
import { safeStorage } from '../../state/store';

/** iPhone, iPod o iPad (anche l'iPad che si presenta come Mac). */
export function isIOS(): boolean {
  try {
    const ua = navigator.userAgent;
    return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  } catch {
    return false;
  }
}

/** True se ha senso proporre l'installazione: iPhone, non ancora installata, fuori dall'anteprima. */
export function canSuggestInstall(): boolean {
  if (getUrlParam('installa') === '1') return true;
  if (IS_PREVIEW) return false;
  return isIOS() && !isStandalone();
}

const REMINDED_KEY = 'ritmo:installa-ricordato';

/** Per ricordarlo in Oggi una volta a settimana finché non è installata. */
export function installReminderDue(today: ISODate): boolean {
  if (!canSuggestInstall()) return false;
  const last = safeStorage.getItem(REMINDED_KEY);
  return !isISODate(last) || addDays(last, 7) <= today;
}

/** Segna che l'invito è stato mostrato (o chiuso) oggi. */
export function markInstallReminded(today: ISODate): void {
  safeStorage.setItem(REMINDED_KEY, today);
}
