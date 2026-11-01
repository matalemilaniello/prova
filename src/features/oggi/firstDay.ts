/**
 * Il primo giorno, al posto dell'anello a zero: il piano già deciso in due o tre orari ("Il piano è pronto").
 * Senza interfaccia, per i test.
 */
import type { HHMM, ItemStatus } from '../../domain/types';
import { STARTER_SHOPPING_ID, type DayItem, type DayItemKind } from '../../engine/timeline';
import { hhmmToMin } from '../../engine/dates';

/** Un orario del tabellone del primo giorno. */
export interface WelcomeSpot {
  id: string;
  kind: DayItemKind;
  time: HHMM;
  /** Nome breve: "Spesa di avvio", "Calcetto", "Seduta A", "Telefono fuori". */
  name: string;
  /** Domani: la sera del primo giorno non resta che il telefono, il resto parte domani. */
  tomorrow: boolean;
  /** Etichetta del gruppo, sulla prima colonna di ogni giorno ("Oggi", "Stasera", "Domani"). */
  group?: string;
  status?: ItemStatus;
}

/** Al massimo tre orari: quelli che reggono la giornata. I pasti e il resto li dice la timeline. */
export const WELCOME_MAX = 3;
/** Da quest'ora un orario è "stasera". */
const EVENING_FROM_MIN = 20 * 60;

/** Le voci che contano davvero il primo giorno, in ordine di importanza. */
const PRIORITY: Partial<Record<DayItemKind, number>> = {
  spesa: 0,
  calcio: 1,
  palestra: 2,
  revisione: 3,
  preparazione: 4,
  fisio: 5,
  coprifuoco: 6,
  minima: 6,
};

function rank(item: DayItem): number | undefined {
  if (item.kind === 'minima') return item.id === 'minima:telefono' ? PRIORITY.minima : undefined;
  return PRIORITY[item.kind];
}

function spotName(item: DayItem): string {
  switch (item.kind) {
    case 'spesa':
      return item.id === STARTER_SHOPPING_ID ? 'Spesa di avvio' : 'Spesa';
    case 'palestra':
      return item.ref ? `Seduta ${item.ref}` : item.title;
    case 'calcio':
      return item.title.split(',')[0];
    case 'coprifuoco':
    case 'minima':
      return 'Telefono fuori';
    case 'revisione':
      return 'Revisione';
    case 'preparazione':
      return 'Preparazione';
    case 'fisio':
      return 'Fisioterapista';
    default:
      return item.title;
  }
}

/** Sera: dalle 20 o dopo mezzanotte (il letto alle 00:15 è ancora stasera). */
const isEvening = (t: HHMM) => {
  const m = hhmmToMin(t);
  return m >= EVENING_FROM_MIN || m < 5 * 60;
};

/** Minuti per ordinare: gli orari dopo mezzanotte restano in fondo alla giornata. */
const sortMin = (t: HHMM) => {
  const m = hhmmToMin(t);
  return m < 5 * 60 ? m + 24 * 60 : m;
};

function pick(items: DayItem[], max: number): DayItem[] {
  return items
    .filter((i) => rank(i) !== undefined)
    .sort((a, b) => rank(a)! - rank(b)! || sortMin(a.time) - sortMin(b.time))
    .slice(0, max)
    .sort((a, b) => sortMin(a.time) - sortMin(b.time));
}

/**
 * Tabellone del primo giorno: le voci di oggi dopo il primo avvio che reggono la giornata (spesa, calcio, palestra,
 * riti, telefono fuori), al massimo tre. Se di oggi resta solo la sera, completano gli orari di domani. Vuoto se non
 * c'è niente da dire: la schermata torna all'anello.
 */
export function welcomeBoard(
  today: DayItem[],
  tomorrow: DayItem[],
  opts: { beforeStart: (item: DayItem) => boolean; status?: Record<string, ItemStatus> },
): WelcomeSpot[] {
  const own = pick(
    today.filter((i) => !opts.beforeStart(i)),
    WELCOME_MAX,
  );
  const evening = own.length > 0 && own.every((i) => isEvening(i.time));
  const next = own.length < WELCOME_MAX && (evening || own.length === 0) ? pick(tomorrow, WELCOME_MAX - own.length) : [];
  const spots: WelcomeSpot[] = own.map((i, n) => ({
    id: i.id,
    kind: i.kind,
    time: i.time,
    name: spotName(i),
    tomorrow: false,
    ...(n === 0 ? { group: evening ? 'Stasera' : 'Oggi' } : {}),
    ...(opts.status?.[i.id] ? { status: opts.status[i.id] } : {}),
  }));
  next.forEach((i, n) => spots.push({ id: i.id, kind: i.kind, time: i.time, name: spotName(i), tomorrow: true, ...(n === 0 ? { group: 'Domani' } : {}) }));
  return spots;
}
