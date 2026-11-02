/**
 * Limiti di sicurezza dell'energia (docs/FASE2.md § 2.1). Funzioni pure: la data arriva dagli argomenti.
 *
 * Il deficit in vigore (`goalDeltaOf`) è `Plan.goalDeltaKcal` quando c'è; altrimenti si ricava come fa oggi il piano:
 * la differenza dell'obiettivo del corpo (`GOAL_DELTA_KCAL[profile.goal]`, già dentro `Plan.targets`) più le correzioni
 * di kcal accettate nelle revisioni salvate (`WeeklyReview.acceptedProposals` sulle `proposals` registrate). Le
 * modifiche fatte a mano in Calorie e macro non entrano (limite dichiarato), e nemmeno le revisioni salvate senza
 * l'elenco delle proposte.
 *
 * Il dispendio stimato di un tipo di giorno è quello che gli obiettivi del piano sottintendono: kcal dell'obiettivo
 * meno il deficit in vigore (con gli obiettivi calcolati da `computeTargets` è Mifflin-St Jeor × fattore del tipo di
 * giorno). Così non dipende dall'età di oggi né dall'orologio.
 *
 * Regole (consenso IOC sulla REDs, Mountjoy 2023):
 * - deficit massimo 500 kcal e mai oltre il 20% del dispendio del tipo di giorno;
 * - nessun deficit il giorno della partita e la vigilia;
 * - deficit massimo 250 kcal quando una zona sotto il ginocchio ha superato la soglia degli impatti almeno una volta
 *   negli ultimi 14 giorni, quando è in rientro o ferma per i segnali d'allarme (`Plan.impactHold`), e nel
 *   precampionato.
 *
 * `dayEnergyDelta` dice quante kcal rimettere nell'obiettivo della data (dai carboidrati, come il minimo di partita e
 * vigilia: `dayTargetFor` e `dayCarbScale` in engine/nutrition.ts); `clampKcalCorrection` taglia la correzione della
 * revisione perché il deficit in vigore resti dentro i limiti. Senza deficit (ricomposizione e mantenimento senza
 * correzioni, massa) niente cambia.
 */
import type { CheckIn, DayType, ISODate, Plan, Profile, SeasonCalendar, WeeklyReview } from '../domain/types';
import { addDays, isISODate } from './dates';
import { effectiveDayType, isMatchDay, isMatchEve } from './menu';
import { GOAL_DELTA_KCAL } from './targets';
import { impactThresholdFor, isLowerLegSite } from './training';

/** Stato per le regole per data: piano; profilo e revisioni per ricavare il deficit; controlli per il dolore. */
export interface EnergyState {
  plan: Plan;
  profile?: Profile;
  reviews?: readonly WeeklyReview[];
  checkIns?: Readonly<Record<ISODate, CheckIn>>;
}

/** Deficit massimo in assoluto (kcal al giorno). */
export const MAX_DEFICIT_KCAL = 500;
/** Deficit massimo come quota del dispendio stimato del tipo di giorno. */
export const MAX_DEFICIT_SHARE = 0.2;
/** Deficit massimo con una zona sotto il ginocchio sopra soglia, in rientro o ferma, e nel precampionato. */
export const PROTECTED_DEFICIT_KCAL = 250;
/** Giorni in cui un dolore sopra la soglia degli impatti tiene il deficit basso. */
export const LOWER_LEG_WINDOW_DAYS = 14;
/** Surplus massimo salvato in `Plan.goalDeltaKcal` (lo stesso tetto della normalizzazione). */
export const MAX_SURPLUS_KCAL = 500;
/** Settimane di precampionato senza un valore nel piano. */
export const DEFAULT_PRESEASON_WEEKS = 5;

const DAY_TYPES: DayType[] = ['calcio', 'palestra', 'leggero', 'riposo'];

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Deficit (negativo) o surplus in vigore: Plan.goalDeltaKcal, altrimenti ricavato (§ 2.1). */
export function goalDeltaOf(plan: Plan, profile: Profile, reviews: readonly WeeklyReview[]): number {
  if (finite(plan.goalDeltaKcal)) return plan.goalDeltaKcal;
  let delta = GOAL_DELTA_KCAL[profile.goal] ?? 0;
  for (const r of reviews ?? []) {
    if (!r || !Array.isArray(r.proposals) || !Array.isArray(r.acceptedProposals)) continue;
    const accepted = new Set(r.acceptedProposals);
    for (const p of r.proposals) {
      if (p && accepted.has(p.id) && p.apply?.type === 'kcalDelta' && finite(p.apply.value)) delta += p.apply.value;
    }
  }
  return delta;
}

/** Deficit in vigore per le regole per data: senza profilo vale solo `Plan.goalDeltaKcal` (o niente). */
function deltaOfState(state: EnergyState): number {
  if (state.profile) return goalDeltaOf(state.plan, state.profile, state.reviews ?? []);
  return finite(state.plan.goalDeltaKcal) ? state.plan.goalDeltaKcal : 0;
}

/** Dispendio stimato del tipo di giorno: kcal dell'obiettivo meno il deficit in vigore. */
export function expenditureKcal(plan: Plan, dayType: DayType, deltaKcal: number): number {
  const kcal = Number(plan.targets?.[dayType]?.kcal);
  return Number.isFinite(kcal) ? kcal - deltaKcal : 0;
}

/** Deficit ammesso in un giorno normale con quel dispendio: 500 kcal e mai oltre il 20%. */
export function allowedDeficitKcal(expenditure: number): number {
  if (!(expenditure > 0)) return 0;
  return Math.min(MAX_DEFICIT_KCAL, Math.floor(expenditure * MAX_DEFICIT_SHARE));
}

/** Deficit massimo valido per tutti i tipi di giorno del piano (il più stretto): il tetto delle correzioni. */
export function maxDeficitKcal(plan: Plan, deltaKcal: number): number {
  return Math.min(...DAY_TYPES.map((t) => allowedDeficitKcal(expenditureKcal(plan, t, deltaKcal))));
}

/**
 * Precampionato: le settimane prima della prima partita della nuova stagione (`SeasonCalendar.preseasonWeeks`, 3-8,
 * predefinito 5), dopo l'ultima partita della stagione se c'è. Senza date non c'è mai. È la regola delle date del
 * § 2.4 ridotta a quello che serve qui; la fase completa la calcola engine/plan/season.ts.
 */
export function isPreseason(iso: ISODate, season: SeasonCalendar | undefined): boolean {
  const first = season?.firstMatch;
  if (!isISODate(iso) || !isISODate(first) || iso >= first) return false;
  const raw = finite(season?.preseasonWeeks) ? Math.round(season.preseasonWeeks) : DEFAULT_PRESEASON_WEEKS;
  const weeks = Math.min(8, Math.max(3, raw));
  if (iso < addDays(first, -7 * weeks)) return false;
  const last = season?.lastMatch;
  return !(isISODate(last) && iso <= last);
}

/**
 * Una zona sotto il ginocchio frena il deficit nella data: dolore del mattino sopra la soglia degli impatti almeno una
 * volta negli ultimi 14 giorni (data compresa), rientro in corso per quella zona o fermo per i segnali d'allarme.
 */
export function lowerLegGuard(iso: ISODate, state: Pick<EnergyState, 'plan' | 'checkIns'>): boolean {
  const { plan } = state;
  const hold = plan.impactHold;
  if (hold && typeof hold.site === 'string' && isLowerLegSite(hold.site)) return true;
  const t = plan.training;
  if (t?.rientro && (t.primary === 'rientro' || t.secondary === 'rientro') && isLowerLegSite(t.rientro.site)) return true;
  const checkIns = state.checkIns;
  if (!checkIns || !isISODate(iso)) return false;
  const threshold = impactThresholdFor(plan);
  const from = addDays(iso, -(LOWER_LEG_WINDOW_DAYS - 1));
  for (const [date, c] of Object.entries(checkIns)) {
    if (date < from || date > iso || !c?.pain) continue;
    for (const [site, v] of Object.entries(c.pain)) {
      if (finite(v) && v > threshold && isLowerLegSite(site)) return true;
    }
  }
  return false;
}

/** Deficit ammesso nella data dopo le regole per data del § 2.1. */
export function dayAllowedDeficitKcal(iso: ISODate, state: EnergyState, deltaKcal = deltaOfState(state)): number {
  const { plan } = state;
  if (isMatchDay(iso, plan) || isMatchEve(iso, plan)) return 0;
  let allowed = allowedDeficitKcal(expenditureKcal(plan, effectiveDayType(iso, plan), deltaKcal));
  if (allowed > PROTECTED_DEFICIT_KCAL && (lowerLegGuard(iso, state) || isPreseason(iso, plan.season))) {
    allowed = PROTECTED_DEFICIT_KCAL;
  }
  return allowed;
}

/**
 * Differenza di kcal dell'obiettivo della data rispetto a Plan.targets dopo le regole per data del § 2.1 (≥ 0: si
 * rimette). Arrotondata a 10 kcal per eccesso, così il deficit che resta non supera mai quello ammesso.
 */
export function dayEnergyDelta(iso: ISODate, state: EnergyState): number {
  if (!state?.plan || !isISODate(iso)) return 0;
  const delta = deltaOfState(state);
  if (!(delta < 0)) return 0;
  const back = -delta - dayAllowedDeficitKcal(iso, state, delta);
  return back > 0 ? Math.ceil(back / 10) * 10 : 0;
}

/**
 * Correzione della revisione tagliata ai limiti: deficit mai oltre 500 kcal né oltre il 20% del dispendio del tipo di
 * giorno (il più stretto, perché la correzione vale per tutti), surplus mai oltre +500. Un deficit già oltre i limiti
 * (piani di oggi con più correzioni) torna al tetto alla prima correzione.
 */
export function clampKcalCorrection(value: number, plan: Plan, profile: Profile, reviews: readonly WeeklyReview[]): number {
  if (!finite(value)) return 0;
  const delta = goalDeltaOf(plan, profile, reviews);
  const lower = -maxDeficitKcal(plan, delta);
  const next = Math.min(MAX_SURPLUS_KCAL, Math.max(lower, delta + value));
  return next - delta;
}

/** True se il deficit in vigore è già al tetto: la revisione non propone un altro taglio. */
export function deficitAtCap(plan: Plan, profile: Profile, reviews: readonly WeeklyReview[]): boolean {
  const delta = goalDeltaOf(plan, profile, reviews);
  return delta < 0 && -delta >= maxDeficitKcal(plan, delta);
}
