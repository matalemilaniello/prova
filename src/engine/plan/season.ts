/**
 * Fasi della stagione e obiettivi pronti (docs/FASE2.md § 2.2-2.4). Funzioni pure: la data arriva dagli argomenti.
 *
 * - `seasonOn(iso, season)`: fase e stadio di una data dalle due date delle impostazioni (`lastMatch`, `firstMatch`) e
 *   dalle settimane di precampionato (3-8, predefinito 5). **Senza date la fase è sempre «in stagione»**: chi non le
 *   inserisce vede l'app di oggi.
 *   - `pausa`: dal giorno dopo l'ultima partita all'inizio del precampionato; i primi 14 giorni sono la `transizione`
 *     (recupero attivo), poi lo `sviluppo`;
 *   - `precampionato`: le settimane prima della prima partita (mai prima del giorno dopo l'ultima): `generale` le prime
 *     2, `rifinitura` l'ultima, `specifico` quelle in mezzo;
 *   - `stagione`: tutto il resto.
 * - `isPreseason(iso, season)`: il precampionato per i limiti dell'energia (engine/energy.ts la riesporta).
 * - Obiettivi pronti (`TRAINING_PRESETS`) e compatibilità delle qualità con la fase (`qualityRole`): la tabella del
 *   § 2.3 è scritta una volta sola qui, e i test controllano che obiettivi pronti e tabella coincidano.
 * - `dayTypeForLoad`: nella pausa il tipo di giorno si ricava dal carico previsto della giornata (§ 2.4).
 */
import type {
  DayType,
  ISODate,
  SeasonCalendar,
  SeasonPhase,
  SeasonStage,
  TrainingGoal,
  TrainingQuality,
} from '../../domain/types';
import { addDays, daysBetween, isISODate } from '../dates';

/** Settimane di precampionato senza un valore nel piano. */
export const DEFAULT_PRESEASON_WEEKS = 5;
/** Settimane di precampionato ammesse. */
export const PRESEASON_WEEKS_MIN = 3;
export const PRESEASON_WEEKS_MAX = 8;
/** Giorni di transizione dopo l'ultima partita (recupero attivo, § 2.4). */
export const TRANSITION_DAYS = 14;
/** Settimane generali all'inizio del precampionato. */
export const GENERAL_PRESEASON_WEEKS = 2;
/** Ultime settimane della pausa in cui la resistenza diventa principale («Pronto per la stagione»). */
export const LATE_BREAK_WEEKS = 4;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export interface SeasonInfo {
  phase: SeasonPhase;
  stage: SeasonStage;
  /** Primo giorno del precampionato, se ci sono le date. */
  preseasonStart?: ISODate;
  /** Ultime 4 settimane della pausa, prima del precampionato. */
  lateBreak?: boolean;
}

/** Settimane di precampionato (3-8, predefinito 5). */
export function preseasonWeeksOf(season: SeasonCalendar | undefined): number {
  const raw = finite(season?.preseasonWeeks) ? Math.round(season!.preseasonWeeks!) : DEFAULT_PRESEASON_WEEKS;
  return Math.min(PRESEASON_WEEKS_MAX, Math.max(PRESEASON_WEEKS_MIN, raw));
}

/**
 * Primo giorno del precampionato: la prima partita meno le settimane di precampionato, mai prima del giorno dopo
 * l'ultima partita della stagione prima. Senza la prima partita non c'è.
 */
export function preseasonStartOf(season: SeasonCalendar | undefined): ISODate | undefined {
  const first = season?.firstMatch;
  if (!isISODate(first)) return undefined;
  const start = addDays(first, -7 * preseasonWeeksOf(season));
  const last = season?.lastMatch;
  if (isISODate(last) && last < first && start <= last) return addDays(last, 1);
  return start;
}

/** Fase e stadio della stagione in una data (§ 2.4). Senza date: sempre «in stagione». */
export function seasonOn(iso: ISODate, season: SeasonCalendar | undefined): SeasonInfo {
  const inSeason: SeasonInfo = { phase: 'stagione', stage: 'stagione' };
  if (!isISODate(iso) || !season) return inSeason;
  const first = isISODate(season.firstMatch) ? season.firstMatch : undefined;
  const last = isISODate(season.lastMatch) ? season.lastMatch : undefined;
  const pStart = preseasonStartOf(season);
  if (first && pStart && iso < first && iso >= pStart && !(last && iso <= last)) {
    const stage: SeasonStage =
      iso >= addDays(first, -7) ? 'rifinitura' : iso < addDays(pStart, 7 * GENERAL_PRESEASON_WEEKS) ? 'generale' : 'specifico';
    return { phase: 'precampionato', stage, preseasonStart: pStart };
  }
  if (last && iso > last && !(first && first > last && iso >= first)) {
    const stage: SeasonStage = daysBetween(last, iso) <= TRANSITION_DAYS ? 'transizione' : 'sviluppo';
    const upcoming = first && first > last ? pStart : undefined;
    const lateBreak = Boolean(upcoming && iso >= addDays(upcoming, -7 * LATE_BREAK_WEEKS));
    return { phase: 'pausa', stage, ...(upcoming ? { preseasonStart: upcoming } : {}), ...(lateBreak ? { lateBreak } : {}) };
  }
  return pStart ? { ...inSeason, preseasonStart: pStart } : inSeason;
}

/** Precampionato nella data (le regole delle date del § 2.4): per i limiti dell'energia. */
export function isPreseason(iso: ISODate, season: SeasonCalendar | undefined): boolean {
  return seasonOn(iso, season).phase === 'precampionato';
}

/**
 * Primo giorno, da `iso` escluso, in cui cambia la fase della stagione (lo stadio dentro la pausa e il precampionato
 * non conta). Cerca fino a `horizonDays`; undefined se non cambia.
 */
export function nextPhaseChange(iso: ISODate, season: SeasonCalendar | undefined, horizonDays = 70): ISODate | undefined {
  if (!season || !isISODate(iso)) return undefined;
  const phase = seasonOn(iso, season).phase;
  for (let i = 1; i <= horizonDays; i++) {
    const d = addDays(iso, i);
    if (seasonOn(d, season).phase !== phase) return d;
  }
  return undefined;
}

/** Due date nella stessa fase (la transizione e lo sviluppo sono la stessa pausa). */
export function samePhase(a: ISODate, b: ISODate, season: SeasonCalendar | undefined): boolean {
  return seasonOn(a, season).phase === seasonOn(b, season).phase;
}

// ───────────────────────── Tipo di giorno nella pausa ─────────────────────────

/**
 * Tipo di giorno dal carico previsto della giornata (session-RPE, § 2.4): almeno 500 UA calcio, 250-499 palestra,
 * 1-249 leggero, 0 riposo [ipotesi]. Così nella pausa i carboidrati seguono il lavoro senza un tipo di giorno nuovo.
 */
export function dayTypeForLoad(load: number): DayType {
  if (!(load > 0)) return 'riposo';
  if (load >= 500) return 'calcio';
  if (load >= 250) return 'palestra';
  return 'leggero';
}

// ───────────────────────── Qualità e obiettivi pronti ─────────────────────────

export const QUALITIES: readonly TrainingQuality[] = ['forza', 'potenza', 'rapidita', 'velocita', 'resistenza', 'ipertrofia', 'prevenzione', 'rientro'];

/** Qualità con impatti: vietate con il rientro di una zona sotto il ginocchio o dei flessori (§ 2.3). */
export const IMPACT_QUALITIES: ReadonlySet<TrainingQuality> = new Set(['potenza', 'rapidita', 'velocita']);

const LOWER_LEG_RE = /tibi|stinc|cavigl|polpacc|achill|piede|metatars/i;
const HAMSTRING_RE = /flessor|femoral|ischio/i;
/** Zona del rientro che esclude potenza, rapidità e velocità: sotto il ginocchio o i flessori. */
export const isFragileReturnSite = (site: string | undefined): boolean => Boolean(site && (LOWER_LEG_RE.test(site) || HAMSTRING_RE.test(site)));

export type QualityRole = 'principale' | 'secondaria';

/** Contesto di compatibilità: la fase, le ultime settimane della pausa, una settimana senza calcio in stagione. */
export interface PhaseCtx {
  phase: SeasonPhase;
  lateBreak?: boolean;
  noFootballWeek?: boolean;
}

/**
 * Compatibilità per fase (tabella del § 2.3): `true` se la qualità è ammessa in quel ruolo. Nella transizione le qualità
 * non contano (il blocco è di recupero): chi chiama non la controlla.
 */
export function qualityAllowed(q: TrainingQuality, role: QualityRole, ctx: PhaseCtx): boolean {
  const p = role === 'principale';
  switch (q) {
    case 'forza':
      return ctx.phase === 'precampionato' ? !p : true;
    case 'potenza':
    case 'rapidita':
    case 'prevenzione':
    case 'rientro':
      return true;
    case 'velocita':
      return ctx.phase === 'precampionato' ? true : !p;
    case 'resistenza':
      if (ctx.phase === 'stagione') return Boolean(ctx.noFootballWeek);
      if (ctx.phase === 'pausa') return p ? Boolean(ctx.lateBreak) : true;
      return p;
    case 'ipertrofia':
      if (ctx.phase === 'precampionato') return false;
      return ctx.phase === 'stagione' ? !p : true;
  }
}

/** Coppia vietata (§ 2.3): impatti con il rientro di una zona fragile, ipertrofia con resistenza nel precampionato. */
export function forbiddenPair(t: Pick<TrainingGoal, 'primary' | 'secondary' | 'rientro'>, phase: SeasonPhase): boolean {
  const pair = [t.primary, t.secondary];
  if (pair.includes('rientro') && isFragileReturnSite(t.rientro?.site) && pair.some((q) => q && IMPACT_QUALITIES.has(q))) return true;
  return phase === 'precampionato' && pair.includes('ipertrofia') && pair.includes('resistenza');
}

export interface TrainingPreset {
  id: string;
  label: string;
  primary: TrainingQuality;
  secondary: TrainingQuality;
  /** Fasi della colonna «Fasi» del § 2.3. */
  phases: readonly SeasonPhase[];
  /** Ammesso anche nelle ultime 4 settimane della pausa. */
  lateBreak?: boolean;
}

/** Obiettivi pronti del § 2.3, nell'ordine della tabella (lo stesso della pagina Obiettivi). */
export const TRAINING_PRESETS: readonly TrainingPreset[] = [
  { id: 'calcio', label: 'Prestazione nel calcio', primary: 'potenza', secondary: 'forza', phases: ['stagione', 'precampionato'] },
  { id: 'pliometria', label: 'Salti e pliometria', primary: 'potenza', secondary: 'prevenzione', phases: ['stagione', 'pausa', 'precampionato'] },
  { id: 'rapido', label: 'Più rapido', primary: 'rapidita', secondary: 'potenza', phases: ['stagione', 'pausa', 'precampionato'] },
  { id: 'forte', label: 'Più forte', primary: 'forza', secondary: 'prevenzione', phases: ['stagione', 'pausa'] },
  { id: 'muscolo', label: 'Più muscolo', primary: 'ipertrofia', secondary: 'forza', phases: ['pausa'] },
  { id: 'pronto', label: 'Pronto per la stagione', primary: 'resistenza', secondary: 'velocita', phases: ['precampionato'], lateBreak: true },
  { id: 'sicuro', label: 'Senza infortuni', primary: 'prevenzione', secondary: 'forza', phases: ['stagione', 'pausa', 'precampionato'] },
  { id: 'rientro', label: 'Rientro da un dolore', primary: 'rientro', secondary: 'prevenzione', phases: ['stagione', 'pausa', 'precampionato'] },
];

export const PRESET_BY_ID: Readonly<Record<string, TrainingPreset>> = Object.fromEntries(TRAINING_PRESETS.map((p) => [p.id, p]));

/** Obiettivo di partenza (§ 2.3: «Senza infortuni», già scelto quando la pagina si apre la prima volta). */
export const DEFAULT_TRAINING: TrainingGoal = { presetId: 'sicuro', primary: 'prevenzione', secondary: 'forza' };

/** L'obiettivo pronto è ammesso nella fase (colonna «Fasi», più le ultime 4 settimane della pausa dove previsto). */
export function presetAllowed(preset: TrainingPreset, ctx: PhaseCtx): boolean {
  return preset.phases.includes(ctx.phase) || Boolean(preset.lateBreak && ctx.phase === 'pausa' && ctx.lateBreak);
}

/** Obiettivi pronti compatibili con la fase, nell'ordine della tabella. */
export function presetsFor(ctx: PhaseCtx): TrainingPreset[] {
  return TRAINING_PRESETS.filter((p) => presetAllowed(p, ctx));
}

/** Obiettivi pronti che la fase non ammette: «si sbloccano in un'altra fase» (§ 2.3, riga sotto l'elenco). */
export function lockedPresets(ctx: PhaseCtx): TrainingPreset[] {
  return TRAINING_PRESETS.filter((p) => !presetAllowed(p, ctx));
}

/** L'obiettivo di allenamento rispetta la fase: principale e secondaria ammesse e nessuna coppia vietata. */
export function trainingAllowed(t: TrainingGoal, ctx: PhaseCtx): boolean {
  if (t.presetId && PRESET_BY_ID[t.presetId]) {
    const preset = PRESET_BY_ID[t.presetId];
    if (preset.primary === t.primary && (preset.secondary === t.secondary || !t.secondary)) {
      return presetAllowed(preset, ctx) && !forbiddenPair(t, ctx.phase);
    }
  }
  if (!qualityAllowed(t.primary, 'principale', ctx)) return false;
  if (t.secondary && !qualityAllowed(t.secondary, 'secondaria', ctx)) return false;
  return !forbiddenPair(t, ctx.phase);
}

export interface TrainingForPhase {
  training: TrainingGoal;
  /** Obiettivo sostituito al cambio di fase (§ 2.3): l'etichetta di prima e di dopo, per le differenze. */
  replaced?: { from: string; to: string };
}

const presetLabel = (t: TrainingGoal) => (t.presetId && PRESET_BY_ID[t.presetId]?.label) || 'Scelta libera';

/**
 * Obiettivo di allenamento valido nella fase (§ 2.3). Un obiettivo pronto non ammesso lascia il posto al primo
 * compatibile della tabella con la stessa principale o, se non c'è, a «Prestazione nel calcio» (precampionato e
 * stagione) o a «Senza infortuni». Una scelta libera tiene ciò che la fase ammette: una secondaria non ammessa si toglie,
 * una principale non ammessa porta al ripiego. Il rientro e le impostazioni (minuti, sedute, spazi) restano.
 */
export function trainingForPhase(t: TrainingGoal | undefined, ctx: PhaseCtx): TrainingForPhase {
  const base = t ?? DEFAULT_TRAINING;
  if (trainingAllowed(base, ctx)) return { training: base };
  const keep: Partial<TrainingGoal> = {
    ...(base.rientro ? { rientro: base.rientro } : {}),
    ...(base.sessionMin !== undefined ? { sessionMin: base.sessionMin } : {}),
    ...(base.gymPerWeek !== undefined ? { gymPerWeek: base.gymPerWeek } : {}),
    ...(base.spaces ? { spaces: base.spaces } : {}),
  };
  if (!base.presetId && qualityAllowed(base.primary, 'principale', ctx)) {
    const { secondary: _drop, ...rest } = base;
    const next: TrainingGoal = { ...rest };
    if (!forbiddenPair(next, ctx.phase)) return { training: next, replaced: { from: presetLabel(base), to: presetLabel(next) } };
  }
  const same = TRAINING_PRESETS.find(
    (p) => p.primary === base.primary && presetAllowed(p, ctx) && !forbiddenPair({ ...p, rientro: base.rientro }, ctx.phase),
  );
  const fallback =
    same ??
    (ctx.phase !== 'pausa' && presetAllowed(PRESET_BY_ID.calcio, ctx) && !forbiddenPair({ ...PRESET_BY_ID.calcio, rientro: base.rientro }, ctx.phase)
      ? PRESET_BY_ID.calcio
      : PRESET_BY_ID.sicuro);
  const next: TrainingGoal = { ...keep, presetId: fallback.id, primary: fallback.primary, secondary: fallback.secondary };
  return { training: next, replaced: { from: presetLabel(base), to: fallback.label } };
}
