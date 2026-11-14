/**
 * Integratori dal catalogo (docs/FASE2.md § 9, versione semplice): ricerca per nome, dose già pronta e testo della
 * dose. Funzioni pure: il catalogo arriva come argomento (`SUPPLEMENT_CATALOG` in data/supplementCatalog.ts).
 */
import type { Supplement } from '../domain/types';
import type { CatalogDose, CatalogEntry, CatalogStance } from '../data/supplementCatalog';

export interface CatalogHit {
  entry: CatalogEntry;
  /** Più alto = più vicino a quello che si è scritto. */
  score: number;
}

/** Minuscole senza accenti né segni: «Vitamina D3» e «vitamina d 3» si trovano uguali. */
export function normalizeQuery(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function scoreOf(q: string, text: string, base: number): number {
  const t = normalizeQuery(text);
  if (!t) return 0;
  if (t === q) return base + 30;
  if (t.startsWith(q)) return base + 20;
  if (t.split(' ').some((w) => w.startsWith(q))) return base + 10;
  return t.includes(q) ? base : 0;
}

/** Voci del catalogo che corrispondono al testo, le migliori prima. Sotto i due caratteri non cerca. */
export function searchCatalog(query: string, catalog: readonly CatalogEntry[], limit = 5): CatalogHit[] {
  const q = normalizeQuery(query);
  if (q.length < 2) return [];
  const hits: CatalogHit[] = [];
  catalog.forEach((entry, i) => {
    // Il nome vale più di un altro nome; a parità vince l'ordine del catalogo.
    const score = Math.max(scoreOf(q, entry.name, 100), ...entry.aliases.map((a) => scoreOf(q, a, 50)));
    if (score > 0) hits.push({ entry, score: score - i / 1000 });
  });
  return hits.sort((a, b) => b.score - a.score).slice(0, Math.max(0, limit));
}

const PLURAL: Partial<Record<CatalogDose['unit'], string>> = { compressa: 'compresse', bustina: 'bustine', dose: 'dosi' };

function num(n: number): string {
  const [int, dec] = String(Math.round(n * 100) / 100).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dec ? `${grouped},${dec}` : grouped;
}

/** «15 µg», «3 g», «1 compressa», «10 miliardi UFC», «200 mg/kg». */
export function formatDose(d: CatalogDose): string {
  if (d.unit === 'UFC') {
    return d.amount >= 1e9 ? `${num(d.amount / 1e9)} ${d.amount === 1e9 ? 'miliardo' : 'miliardi'} UFC` : `${num(d.amount / 1e6)} milioni UFC`;
  }
  const unit = d.amount !== 1 && PLURAL[d.unit] ? PLURAL[d.unit] : d.unit;
  return `${num(d.amount)} ${unit}`;
}

export const STANCE_TEXT: Record<CatalogStance, string> = {
  utile: 'Utile per chi fa sport',
  situazionale: 'Utile solo in alcune situazioni',
  'su-indicazione': 'Solo su indicazione del medico',
  'non-serve': 'Con una dieta varia di solito non serve',
  sconsigliato: 'Sconsigliato',
};

/** Giudizi che meritano un avviso prima di aggiungerlo. */
export function stanceWarns(stance: CatalogStance): boolean {
  return stance === 'sconsigliato' || stance === 'su-indicazione';
}

/** La dose scelta supera il tetto al giorno della voce (stessa unità). */
export function overMax(entry: CatalogEntry, dose: CatalogDose): boolean {
  return Boolean(entry.max && entry.max.unit === dose.unit && dose.amount > entry.max.amount);
}

/** Le dosi tra cui scegliere: le opzioni della voce, o la sola predefinita. */
export function doseChoices(entry: CatalogEntry): readonly CatalogDose[] {
  return entry.options?.length ? entry.options : [entry.dose];
}

/** I campi di un integratore scelto dal catalogo: nome, dose scritta, pasto e legame con la voce. */
export function fromCatalog(entry: CatalogEntry, dose: CatalogDose = entry.dose): Pick<Supplement, 'name' | 'dose' | 'timing' | 'catalogId' | 'amount'> {
  return { name: entry.name, dose: formatDose(dose), timing: entry.timing, catalogId: entry.id, amount: { amount: dose.amount, unit: dose.unit } };
}

/** Voci proposte prima di scrivere: le più comuni per chi fa sport, nell'ordine dato. */
export const COMMON_IDS: readonly string[] = ['creatina', 'vitamina-d', 'magnesio', 'omega-3', 'proteine-siero', 'caffeina'];

export function commonEntries(catalog: readonly CatalogEntry[]): CatalogEntry[] {
  return COMMON_IDS.map((id) => catalog.find((e) => e.id === id)).filter((e): e is CatalogEntry => Boolean(e));
}
