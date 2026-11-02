/**
 * Orario di lavoro della settimana tipo (`ScheduleDay.work`): forma salvata, lettura del testo scritto nelle
 * impostazioni e blocchi in minuti per i motori. Funzioni pure: niente orologio, niente Math.random.
 *
 * Forma salvata: da 1 a 4 blocchi `{ from, to }` in 'HH:MM', ciascuno con l'inizio prima della fine, in ordine e
 * senza sovrapposizioni (due blocchi che si sovrappongono o si toccano diventano uno). Un giorno senza blocchi non ha
 * il campo: senza lavoro l'app è quella di sempre. Il lavoro finisce entro la mezzanotte (niente turni a cavallo).
 */
import type { Plan, TimeRange } from '../domain/types';
import { hhmmToMin, isHHMM, minToHHMM } from './dates';
import { dayCutoffMin } from './sleep';

/** Blocchi di lavoro al massimo in un giorno. */
export const MAX_WORK_BLOCKS = 4;

const DAY_MIN = 1440;

/** Blocco in minuti: [inizio, fine), fine esclusa. */
export type WorkSpan = [number, number];
type Span = WorkSpan;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Intervalli in ordine, con quelli che si sovrappongono o si toccano uniti; con `joinUnderMin` si uniscono anche
 * quelli separati da una pausa più corta.
 */
function mergeSpans(spans: Span[], joinUnderMin = 0): Span[] {
  const sorted = spans.filter(([a, b]) => a < b).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const out: Span[] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && (a <= last[1] || a - last[1] < joinUnderMin)) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

const toRange = ([a, b]: Span): TimeRange => ({ from: minToHHMM(a), to: minToHHMM(b) });

/**
 * Orario di lavoro da un valore qualunque (stato salvato, backup, campo scritto a mano): tiene i blocchi con orari
 * validi e l'inizio prima della fine, li ordina, unisce quelli sovrapposti o contigui e ne tiene al massimo 4.
 * Undefined se non resta niente (il campo si toglie).
 */
export function normalizeWork(raw: unknown): TimeRange[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const spans = raw
    .filter((b): b is TimeRange => isObj(b) && isHHMM(b.from) && isHHMM(b.to))
    .map((b): Span => [hhmmToMin(b.from), hhmmToMin(b.to)]);
  const merged = mergeSpans(spans).slice(0, MAX_WORK_BLOCKS);
  return merged.length ? merged.map(toRange) : undefined;
}

/** "08:30-10:00, 10:30-13:00"; vuoto senza blocchi. */
export function formatWork(blocks: readonly TimeRange[] | undefined): string {
  return (blocks ?? []).map((b) => `${b.from}-${b.to}`).join(', ');
}

// ───────────────────────── Lettura del testo ─────────────────────────

export type WorkParse = { ok: true; blocks: TimeRange[] } | { ok: false; error: string };

/** Un blocco già senza spazi: "9-13.30", "8:30-10:00", "14.30-18". */
const RANGE = /^(\d{1,2})(?:[:.](\d{2}))?-(\d{1,2})(?:[:.](\d{2}))?$/;

/** Ore e minuti in minuti dalla mezzanotte, null se non è un orario (25:00, 8:75). */
function clock(h: string, m: string | undefined): number | null {
  const hh = Number(h);
  const mm = m === undefined ? 0 : Number(m);
  return hh <= 23 && mm <= 59 ? hh * 60 + mm : null;
}

/**
 * Legge l'orario di lavoro di un giorno scritto a mano. Accetta uno o più blocchi separati da virgola, punto e
 * virgola, "e" o spazi; ogni blocco è inizio-fine con le ore da sole o con i minuti dopo i due punti o il punto
 * ("9-13.30", "8:30-10:00, 10:30-13:00", "dalle 14 alle 18"). Vuoto = giorno libero. I blocchi sovrapposti si
 * uniscono; ne restano al massimo 4. "Libero" vale come vuoto. L'errore dice quale pezzo non va e come scriverlo.
 */
export function parseWork(text: string): WorkParse {
  const clean = text
    .trim()
    .replace(/\s*[-–—]\s*/g, '-')
    .replace(/\bdalle\s+/gi, '')
    .replace(/\s+alle\s+/gi, '-');
  // Vuoto, oppure scritto a parole: giorno libero.
  if (!clean || /^(libero|riposo|nessuno|niente|no)$/i.test(clean)) return { ok: true, blocks: [] };
  const tokens = clean.split(/\s*[,;\n]\s*|\s+e\s+|\s+/i).filter(Boolean);
  const spans: Span[] = [];
  for (const token of tokens) {
    const m = RANGE.exec(token);
    if (!m) return { ok: false, error: `Non leggo «${token}»: scrivi gli orari come 9:00-13:30.` };
    const from = clock(m[1], m[2]);
    const to = clock(m[3], m[4]);
    if (from === null || to === null) return { ok: false, error: `In «${token}» c’è un orario che non esiste.` };
    if (to <= from) return { ok: false, error: `In «${token}» la fine deve venire dopo l’inizio.` };
    spans.push([from, to]);
  }
  const merged = mergeSpans(spans);
  if (merged.length > MAX_WORK_BLOCKS) return { ok: false, error: `Al massimo ${MAX_WORK_BLOCKS} blocchi al giorno.` };
  return { ok: true, blocks: merged.map(toRange) };
}

// ───────────────────────── Blocchi in minuti ─────────────────────────

/**
 * Blocchi di lavoro in minuti della giornata del piano, in ordine. Con `joinUnderMin` due blocchi separati da una
 * pausa più corta diventano uno (una pausa di 15 minuti non basta per mangiare). Un blocco che finisce prima
 * dell'inizio della giornata (sveglia meno 90 minuti) appartiene alla notte e conta dopo la mezzanotte, come gli
 * orari della sera (`dayMinutes`); uno che comincia prima e finisce dopo resta un turno del mattino presto.
 */
export function workSpans(work: readonly TimeRange[] | undefined, plan: { sleep: Pick<Plan['sleep'], 'wake'> }, joinUnderMin = 0): Span[] {
  const blocks = normalizeWork(work);
  if (!blocks) return [];
  const cutoff = dayCutoffMin(plan);
  const spans = blocks.map((b): Span => {
    const a = hhmmToMin(b.from);
    const z = hhmmToMin(b.to);
    return z <= cutoff ? [a + DAY_MIN, z + DAY_MIN] : [a, z];
  });
  return mergeSpans(spans, joinUnderMin);
}

/** Il blocco che contiene il minuto (inizio compreso, fine esclusa), se c'è. */
export function spanAt(min: number, spans: readonly Span[]): Span | undefined {
  return spans.find(([a, b]) => min >= a && min < b);
}

/** L'intervallo [from, to) si sovrappone al lavoro? */
export function overlapsWork(from: number, to: number, spans: readonly Span[]): boolean {
  return spans.some(([a, b]) => from < b && to > a);
}

/**
 * Primo orario da `at` in cui un'attività di `durationMin` non si sovrappone al lavoro: se si sovrappone, a fine
 * lavoro più `afterMin` (arrotondato ai 5 minuti per eccesso), finché serve. Senza lavoro resta `at`.
 */
export function afterWork(at: number, durationMin: number, spans: readonly Span[], afterMin: number): number {
  let t = at;
  for (const [a, b] of spans) {
    if (t < b && t + durationMin > a) t = Math.ceil((b + afterMin) / 5) * 5;
  }
  return t;
}

