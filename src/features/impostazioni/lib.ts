/**
 * Logica condivisa da Impostazioni e Benvenuto: etichette, riassunti e validazioni del profilo e del piano.
 * Funzioni pure (testate in lib.test.ts).
 */
import type { DayType, Goal, HHMM, ISODate, MealSlot, MealTimes, Plan, Profile, ScheduleDay, Supplement, Weekday } from '../../domain/types';
import { SESSIONS } from '../../data/sessions';
import { addDays, hhmmToMin, nightMinutes, weekdayOf } from '../../engine/dates';
import { droppedByOverride, sessionFor } from '../../engine/plan/program';
import { MATCH_CARB_G_PER_KG } from '../../engine/targets';
import { IMPACT_PAIN_THRESHOLD, impactThresholdFor, isElbowSite, isLowerLegSite } from '../../engine/training';
import { DAY_TYPES, FOOTBALL_LABEL, WEEKDAY_LONG, WEEKDAY_SHORT, capitalize, listIt, plural } from '../../lib/format';

// ───────────────────────── Obiettivo ─────────────────────────

export const GOAL_OPTIONS: { value: Goal; label: string; text: string }[] = [
  { value: 'ricomposizione', label: 'Ricomposizione', text: 'Meno grasso e un po’ di muscolo, peso quasi fermo' },
  { value: 'dimagrimento', label: 'Dimagrimento', text: 'Deficit moderato, circa 350 kcal al giorno' },
  { value: 'massa', label: 'Massa', text: 'Surplus leggero, circa 250 kcal al giorno' },
  { value: 'mantenimento', label: 'Mantenimento', text: 'Stesso peso, più energia e regolarità' },
];

export const GOAL_LABEL: Record<Goal, string> = {
  ricomposizione: 'Ricomposizione',
  dimagrimento: 'Dimagrimento',
  massa: 'Massa',
  mantenimento: 'Mantenimento',
};

// ───────────────────────── Profilo ─────────────────────────

export const LIMITS = {
  birthYearMin: 1930,
  minAge: 14,
  heightMin: 130,
  heightMax: 220,
  weightMin: 35,
  weightMax: 200,
} as const;

export type ProfileErrors = Partial<Record<'birthYear' | 'heightCm' | 'startWeightKg', string>>;

/** Errori gentili sui dati del corpo (vuoti o fuori misura). */
export function validateBody(p: Pick<Profile, 'birthYear' | 'heightCm' | 'startWeightKg'>, currentYear: number): ProfileErrors {
  const e: ProfileErrors = {};
  const maxYear = currentYear - LIMITS.minAge;
  if (!p.birthYear) e.birthYear = 'Serve per il metabolismo basale.';
  else if (p.birthYear < LIMITS.birthYearMin || p.birthYear > maxYear) e.birthYear = `Scrivi un anno tra ${LIMITS.birthYearMin} e ${maxYear}.`;
  if (!p.heightCm) e.heightCm = 'Serve per il metabolismo basale.';
  else if (p.heightCm < LIMITS.heightMin || p.heightCm > LIMITS.heightMax) e.heightCm = `Scrivi l’altezza in centimetri, tra ${LIMITS.heightMin} e ${LIMITS.heightMax}.`;
  if (!p.startWeightKg) e.startWeightKg = 'Serve per calorie e proteine.';
  else if (p.startWeightKg < LIMITS.weightMin || p.startWeightKg > LIMITS.weightMax) e.startWeightKg = `Scrivi il peso in chili, tra ${LIMITS.weightMin} e ${LIMITS.weightMax}.`;
  return e;
}

export const hasErrors = (e: object) => Object.keys(e).length > 0;

export function ageOf(birthYear: number, currentYear: number): number | undefined {
  return birthYear > 1900 ? currentYear - birthYear : undefined;
}

/** Iniziali per l'avatar: "Luca Rossi" → "LR". */
export function initials(name: string | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// ───────────────────────── Settimana ─────────────────────────

export interface DayActivity {
  key: 'calcio' | 'palestra' | 'fisio';
  label: string;
  tone: DayType | 'leggero';
}

/** Attività del giorno in forma breve: "Partita 21:00", "Seduta A 17:00", "Fisio". */
export function dayActivities(day: ScheduleDay): DayActivity[] {
  const out: DayActivity[] = [];
  if (day.football) out.push({ key: 'calcio', label: `${FOOTBALL_LABEL[day.football.kind]} ${day.football.time}`, tone: 'calcio' });
  if (day.gymSessionId) {
    const name = SESSIONS[day.gymSessionId]?.name ?? `Seduta ${day.gymSessionId}`;
    out.push({ key: 'palestra', label: `${name}${day.gymTime ? ` ${day.gymTime}` : ''}${day.gymOptional ? ', facoltativa' : ''}`, tone: 'palestra' });
  }
  if (day.physio) out.push({ key: 'fisio', label: 'Fisioterapista', tone: 'leggero' });
  return out;
}

/** Quanti giorni per tipo, nell'ordine dei tipi. */
export function dayTypeCounts(week: ScheduleDay[]): { type: DayType; count: number }[] {
  return DAY_TYPES.map((type) => ({ type, count: week.filter((d) => d.dayType === type).length })).filter((x) => x.count > 0);
}

/** Vigilie della partita che non sono già giorni di calcio (stessa regola di `effectiveDayType`). */
function matchEves(week: ScheduleDay[]): ScheduleDay[] {
  return week.filter((d) => d.dayType !== 'calcio' && week.find((n) => n.weekday === (d.weekday + 1) % 7)?.football?.kind === 'partita');
}

/**
 * Giorni della settimana che usano l'obiettivo di ogni tipo: la vigilia della partita mangia come un giorno di
 * calcio, quindi conta tra quelli e non nel suo tipo previsto. Con la settimana predefinita: calcio 4, riposo 0.
 */
export function targetDayCounts(week: ScheduleDay[]): Record<DayType, number> {
  const eves = new Set(matchEves(week).map((d) => d.weekday));
  const out = Object.fromEntries(DAY_TYPES.map((t) => [t, 0])) as Record<DayType, number>;
  for (const d of week) out[eves.has(d.weekday) ? 'calcio' : d.dayType]++;
  return out;
}

/** Numero di vigilie della partita che mangiano come un giorno di calcio. */
export function matchEveCount(week: ScheduleDay[]): number {
  return matchEves(week).length;
}

/**
 * I giorni che usano l'obiettivo di un tipo di giorno, per le etichette: "3 giorni e la vigilia" (il calcio con la
 * vigilia della partita), "2 giorni", "nessun giorno".
 */
export function targetDaysLabel(type: DayType, week: ScheduleDay[]): string {
  const n = targetDayCounts(week)[type];
  if (!n) return 'nessun giorno';
  const eves = type === 'calcio' ? matchEveCount(week) : 0;
  if (!eves) return plural(n, 'giorno', 'giorni');
  const eveText = eves === 1 ? 'la vigilia' : `${eves} vigilie`;
  const own = n - eves;
  return own > 0 ? `${plural(own, 'giorno', 'giorni')} e ${eveText}` : eveText;
}

/**
 * Vigilie della partita che non sono già giorni di calcio: mangiano come un giorno di calcio (porzioni e
 * obiettivo, vedi `effectiveDayType`). Frase pronta per le note, o null se non ce ne sono.
 * "La domenica, vigilia della partita, mangia come un giorno di calcio"
 */
export function matchEveNote(week: ScheduleDay[]): string | null {
  const eves = matchEves(week).map((d) => WEEKDAY_LONG[d.weekday]);
  if (!eves.length) return null;
  if (eves.length === 1) return `${eves[0] === 'domenica' ? 'La' : 'Il'} ${eves[0]}, vigilia della partita, mangia come un giorno di calcio`;
  return `Le vigilie della partita (${listIt(eves)}) mangiano come un giorno di calcio`;
}

/**
 * Nota sui carboidrati di partita e vigilia sotto le calorie per tipo di giorno, o null senza partite in settimana.
 * Il giorno della partita e la vigilia hanno un minimo di 6 g/kg (`matchCarbs` in `engine/nutrition.ts`, UEFA 2021):
 * se l'obiettivo del calcio resta sotto, la nota dice a quanti grammi si sale, così il numero della card (l'obiettivo
 * del tipo di giorno) non sembra il carico della vigilia. `weightKg` è il peso di riferimento.
 * "Partita e vigilia salgono a 420 g di carboidrati, 6 g per kg, per arrivare in campo con buone scorte di glicogeno."
 */
export function matchCarbNote(week: ScheduleDay[], calcioCarbG: number, weightKg: number | null | undefined): string | null {
  if (!week.some((d) => d.football?.kind === 'partita')) return null;
  const floorG = weightKg && weightKg > 0 ? Math.round((MATCH_CARB_G_PER_KG * weightKg) / 5) * 5 : 0;
  if (floorG > calcioCarbG) {
    return `Partita e vigilia salgono a ${floorG}\u00a0g di carboidrati, ${MATCH_CARB_G_PER_KG}\u00a0g per kg, per arrivare in campo con buone scorte di glicogeno.`;
  }
  return matchEveCount(week) ? 'La vigilia della partita mangia come il calcio, per arrivare in campo con buone scorte di glicogeno.' : null;
}

const daysOf = (week: ScheduleDay[], pred: (d: ScheduleDay) => boolean) =>
  week.filter(pred).map((d) => WEEKDAY_SHORT[d.weekday]);

/** "Calcio lun, mer e gio · palestra mar, ven e sab" */
export function weekSummary(week: ScheduleDay[]): string {
  const parts: string[] = [];
  const football = daysOf(week, (d) => Boolean(d.football));
  const gym = daysOf(week, (d) => Boolean(d.gymSessionId));
  if (football.length) parts.push(`calcio ${listIt(football)}`);
  if (gym.length) parts.push(`palestra ${listIt(gym)}`);
  if (!parts.length) return 'Nessuna attività in programma';
  const s = parts.join(' · ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Tipo di giorno suggerito dalle attività (usato quando si accende o si spegne un'attività). */
export function suggestDayType(day: ScheduleDay): DayType {
  if (day.football) return 'calcio';
  if (day.gymSessionId) return day.gymOptional ? 'leggero' : 'palestra';
  return day.physio ? 'leggero' : 'riposo';
}

export interface NextSession {
  date: ISODate;
  weekday: Weekday;
  sessionId: string;
  name: string;
  time: HHMM;
  optional: boolean;
  /** Giorni da oggi (0 = oggi). */
  inDays: number;
}

/**
 * Prima seduta di palestra da oggi (compreso se l'orario non è passato). Il nome è quello della seduta del giorno
 * (`sessionFor`); nella settimana «leggera» della revisione la seduta facoltativa non c'è.
 */
export function nextGymSession(
  plan: Pick<Plan, 'week'> & Partial<Pick<Plan, 'program' | 'weekOverrides'>>,
  today: ISODate,
  nowHHMM?: HHMM,
): NextSession | null {
  for (let i = 0; i < 8; i++) {
    const date = addDays(today, i);
    const wd = weekdayOf(date);
    const d = plan.week.find((w) => w.weekday === wd);
    if (!d?.gymSessionId || droppedByOverride(date, d, plan)) continue;
    const time = d.gymTime ?? '17:00';
    if (i === 0 && nowHHMM && hhmmToMin(nowHHMM) > hhmmToMin(time)) continue;
    return {
      date,
      weekday: wd,
      sessionId: d.gymSessionId,
      name: sessionFor(d.gymSessionId, date, plan)?.name ?? `Seduta ${d.gymSessionId}`,
      time,
      optional: Boolean(d.gymOptional),
      inDays: i,
    };
  }
  return null;
}

/** "oggi", "domani", "martedì" */
export function relativeWeekday(inDays: number, weekdayLong: string): string {
  return inDays === 0 ? 'oggi' : inDays === 1 ? 'domani' : weekdayLong;
}

// ───────────────────────── Pasti e sonno ─────────────────────────

export const MEAL_ORDER: MealSlot[] = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena'];

/** Pasti fuori ordine (es. pranzo prima dello spuntino): l'elenco degli slot che non seguono il precedente. */
export function mealOrderIssues(t: MealTimes): MealSlot[] {
  const out: MealSlot[] = [];
  for (let i = 1; i < MEAL_ORDER.length; i++) {
    if (hhmmToMin(t[MEAL_ORDER[i]]) <= hhmmToMin(t[MEAL_ORDER[i - 1]])) out.push(MEAL_ORDER[i]);
  }
  return out;
}

export interface SleepStep {
  week: number;
  bed: HHMM;
}

/** Le tappe dell'orario a letto, da quello attuale all'obiettivo, una a settimana. */
export function sleepSteps(sleep: Plan['sleep'], maxSteps = 16): SleepStep[] {
  const steps: SleepStep[] = [{ week: 0, bed: sleep.current }];
  const target = nightMinutes(sleep.target);
  let cur = nightMinutes(sleep.current);
  const step = Math.max(5, sleep.stepMin);
  while (cur > target && steps.length <= maxSteps) {
    cur = Math.max(target, cur - step);
    const m = ((cur % 1440) + 1440) % 1440;
    steps.push({ week: steps.length, bed: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` });
  }
  return steps;
}

/** Tempo a letto che serve per circa 7 ore di sonno, con un'efficienza dell'85-90%. */
export const MIN_TIME_IN_BED_H = 8;

/** Orario a letto per avere `MIN_TIME_IN_BED_H` ore prima della sveglia: 07:15 → 23:15. */
export function suggestedBedtime(wake: HHMM): HHMM {
  const m = (((hhmmToMin(wake) - MIN_TIME_IN_BED_H * 60) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * L'orario a letto di arrivo (l'obiettivo, o quello attuale se è già prima) lascia meno di 8 ore prima della
 * sveglia: con 7 h 30 a letto si dormono circa 6 h 30.
 */
export function shortTimeInBed(sleep: Pick<Plan['sleep'], 'current' | 'target' | 'wake' | 'stepMin'>): boolean {
  const atTarget = nightMinutes(sleep.current) <= nightMinutes(sleep.target);
  const bed = atTarget ? sleep.current : sleep.target;
  const inBed = (((hhmmToMin(sleep.wake) - hhmmToMin(bed)) % 1440) + 1440) % 1440;
  return inBed < MIN_TIME_IN_BED_H * 60;
}

// ───────────────────────── Integratori ─────────────────────────

export const TIMING_OPTIONS: { value: Supplement['timing']; label: string }[] = [
  { value: 'colazione', label: 'Colazione' },
  { value: 'pranzo', label: 'Pranzo' },
  { value: 'cena', label: 'Cena' },
  { value: 'sera', label: 'Sera' },
];

export const TIMING_TEXT: Record<Supplement['timing'], string> = {
  colazione: 'a colazione',
  pranzo: 'a pranzo',
  cena: 'a cena',
  sera: 'la sera',
};

const TIMING_RANK: Record<Supplement['timing'], number> = { colazione: 0, pranzo: 1, cena: 2, sera: 3 };

export function sortSupplements(list: Supplement[]): Supplement[] {
  return list
    .map((s, i) => ({ s, i }))
    .sort((a, b) => TIMING_RANK[a.s.timing] - TIMING_RANK[b.s.timing] || a.i - b.i)
    .map((x) => x.s);
}

// ───────────────────────── Zone di dolore ─────────────────────────

/** Normalizza il nome di una zona scritta a mano: spazi, maiuscola iniziale, lunghezza. */
export function normalizeSite(raw: string): string {
  const s = raw.replace(/\s+/g, ' ').trim().slice(0, 28);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/*
 * Zone che cambiano la regola del dolore, riconosciute dal nome scelto nel profilo con le stesse regole del
 * motore dell'allenamento: sotto il ginocchio gli impatti hanno una soglia più bassa, al gomito si propongono
 * varianti a presa neutra.
 */

/** Le zone scelte sotto il ginocchio (tibia, caviglia, polpaccio, tendine d'Achille, piede). */
export const lowerLegSites = (sites: readonly string[]): string[] => sites.filter(isLowerLegSite);
/** Le zone scelte al gomito. */
export const elbowSites = (sites: readonly string[]): string[] => sites.filter(isElbowSite);

/** "tibia e caviglia": i nomi delle zone dentro una frase (solo la prima lettera minuscola, "tendine d’Achille" resta). */
export const sitesInText = (sites: string[]) => listIt(sites.map((s) => s.charAt(0).toLowerCase() + s.slice(1)));

/**
 * "Tibia e caviglia: balzi, salti e partita si fermano già sopra 2 su 10." La zona apre la frase, così non serve
 * l'articolo (la tibia, il tendine, le caviglie), che dipende dal nome scritto dall'utente.
 */
export const impactRuleSentence = (sites: string[], impact: number) =>
  `${capitalize(sitesInText(sites))}: balzi, salti e partita si fermano già sopra ${impact}\u00a0su\u00a010`;

/**
 * Soglia per gli impatti come la vive l'utente: `value` è quella che vale davvero (scelta con il fisioterapista,
 * altrimenti min(soglia, 2); mai sopra la soglia generale, che oltre quel punto frena già tutto), `fallback` quella
 * predefinita, `own` dice se l'ha scelta lui. `max` è il limite dello stepper: la soglia generale.
 */
export function impactThresholdView(plan: Pick<Plan, 'painThreshold' | 'impactThreshold'>): { value: number; fallback: number; own: boolean; max: number } {
  const max = Math.max(0, plan.painThreshold ?? 3);
  const fallback = Math.min(max, IMPACT_PAIN_THRESHOLD);
  const own = typeof plan.impactThreshold === 'number' && Number.isFinite(plan.impactThreshold);
  return { value: Math.min(max, impactThresholdFor(plan)), fallback, own, max };
}

/**
 * Il valore da salvare per la soglia degli impatti scelta con lo stepper: 2 coincide sempre con il predefinito
 * (min(soglia, 2) = min(2, soglia) con qualunque soglia), quindi toglie il campo e la soglia torna a seguire il piano.
 */
export function impactThresholdPatch(v: number): number | undefined {
  return v === IMPACT_PAIN_THRESHOLD ? undefined : v;
}

/**
 * La regola degli impatti per le zone scelte sotto il ginocchio, in una frase, o null se non serve (nessuna zona
 * sotto il ginocchio, oppure soglia già uguale o più bassa di quella degli impatti). `impactThreshold` è quella
 * scelta con il fisioterapista, se c'è.
 * "Tibia: balzi, salti e partita si fermano già sopra 2 su 10."
 */
export function impactRuleNote(sites: readonly string[], threshold: number, impactThreshold?: number): string | null {
  const lower = lowerLegSites(sites);
  const impact = impactThresholdView({ painThreshold: threshold, impactThreshold }).value;
  if (!lower.length || impact >= threshold) return null;
  return `${impactRuleSentence(lower, impact)}.`;
}

/**
 * Riassunto della riga "Zone di dolore e soglia": zone, soglia e, solo se scelta con il fisioterapista e con una zona
 * sotto il ginocchio, la soglia per gli impatti. "Tibia, Gomito · soglia 3, impatti 3"
 */
export function painSummary(sites: readonly string[], plan: Pick<Plan, 'painThreshold' | 'impactThreshold'>): string {
  const impact = impactThresholdView(plan);
  const extra = impact.own && lowerLegSites(sites).length ? `, impatti ${impact.value}` : '';
  return `${sites.length ? sites.join(', ') : 'Nessuna zona'} · soglia ${plan.painThreshold}${extra}`;
}

export function painLabel(v: number): string {
  if (v <= 0) return 'nessun dolore';
  if (v <= 3) return 'lieve';
  if (v <= 6) return 'moderato';
  return 'forte';
}

// ───────────────────────── Macro ─────────────────────────

/** kcal che risultano dalle macro (4/4/9). */
export function kcalFromMacros(t: { proteinG: number; carbG: number; fatG: number }): number {
  return t.proteinG * 4 + t.carbG * 4 + t.fatG * 9;
}

/** Carboidrati che chiudono il conto con le kcal indicate, arrotondati a 5 g. */
export function carbsToMatch(t: { kcal: number; proteinG: number; fatG: number }): number {
  return Math.max(0, Math.round((t.kcal - t.proteinG * 4 - t.fatG * 9) / 4 / 5) * 5);
}
