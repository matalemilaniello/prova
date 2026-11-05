/**
 * Differenze di una proposta rispetto al piano di oggi (docs/FASE2.md § 5.1, § 11.3): funzioni pure, senza orologio.
 *
 * Ogni differenza è un `DiffItem` con l'area (per l'icona), un peso (più alto = più importante: il foglio ne mostra le
 * prime cinque, `topDiff`), un'etichetta («Mercoledì, cena», «Seduta B · Nordic») e i due valori a parole, «prima» e
 * «dopo». Quando c'è solo uno dei due, l'altro è già nel testo («nuovo · 2 × 4-6», «tolto»).
 *
 * - `diffMenus`, `diffPrograms`, `diffWeeks`, `diffTargets`: una parte del piano alla volta;
 * - `diffPatch(plan, profile, patch)`: tutte le parti che una toppa tocca, confrontate con i valori di oggi;
 * - `restoreTo(version, state, today)`: la proposta `ritorno` di «Torna a questa versione» (§ 5.5), con la toppa
 *   della versione (`after`) e le differenze rispetto al piano di oggi; un blocco riparte da un lunedì
 *   (`restoredPatch`).
 *
 * Senza blocco le sedute sono quelle fisse (`SESSIONS`); il menù di partenza è quello in vigore (`menuWeekInForce`), a
 * meno che chi chiama non ne passi un altro in `DiffOptions.menuInForce`.
 */
import type {
  DayType,
  DiffItem,
  Goal,
  ISODate,
  MealSlot,
  MenuEdit,
  MenuWeek,
  Plan,
  PlanEdit,
  PlanPatch,
  PlanProposal,
  PlanVersion,
  Profile,
  Program,
  ScheduleDay,
  SessionExercise,
  TrainingGoal,
  TrainingQuality,
  Weekday,
  WorkoutSession,
} from '../../domain/types';
import { EXERCISES } from '../../data/exercises';
import { RECIPES } from '../../data/recipes';
import { SESSIONS } from '../../data/sessions';
import { DAY_TYPES, FOOTBALL_LABEL, MEAL_SLOT_LABEL, WEEKDAY_LONG, capitalize, fmtNumber, listIt, plural } from '../../lib/format';
import { addDays, dayOfMonthLabel, daysBetween, formatMonth, formatWeekRange, fromISO, weekStart, weekdayOf } from '../dates';
import { MEAL_SLOTS, menuWeekInForce } from '../menu';
import { slotLabel } from './program';
import { planBasis, proposalId, stableStringify, type ProposalState } from './proposals';

// ───────────────────────── Etichette ─────────────────────────

export const QUALITY_LABEL: Record<TrainingQuality, string> = {
  forza: 'forza',
  potenza: 'potenza',
  rapidita: 'rapidità',
  velocita: 'velocità',
  resistenza: 'resistenza',
  ipertrofia: 'ipertrofia',
  prevenzione: 'prevenzione',
  rientro: 'rientro',
};

const GOAL_NAME: Record<Goal, string> = {
  ricomposizione: 'Ricomposizione',
  dimagrimento: 'Dimagrimento',
  massa: 'Massa',
  mantenimento: 'Mantenimento',
};

const DAY_TARGET_LABEL: Record<DayType, string> = {
  calcio: 'Giorno di calcio',
  palestra: 'Giorno di palestra',
  leggero: 'Giorno leggero',
  riposo: 'Giorno di riposo',
};

const SPACE_LABEL: Record<string, string> = { corsia: 'corsia', campo: 'campo', casa: 'casa' };

const SLOT_ORDER = ['A', 'B', 'C', 'K', 'R'];

/** Peso di un pasto cambiato: pranzi e cene contano più di colazioni e spuntini. */
const MEAL_WEIGHT: Record<MealSlot, number> = { colazione: 2, spuntino: 1, pranzo: 3, merenda: 1, cena: 3 };

const same = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);

/** "9 novembre", "1º dicembre". */
export function dayMonthLabel(iso: ISODate): string {
  return `${dayOfMonthLabel(fromISO(iso).getDate())} ${formatMonth(iso)}`;
}

/** "dal 9 novembre", "dall’8 novembre", "dall’11 novembre". */
export function fromDayLabel(iso: ISODate): string {
  const d = fromISO(iso).getDate();
  return `${d === 8 || d === 11 ? 'dall’' : 'dal '}${dayMonthLabel(iso)}`;
}

/** "forza, poi prevenzione"; senza obiettivo di allenamento "sedute fisse". */
export function describeTraining(t: Pick<TrainingGoal, 'primary' | 'secondary'> | undefined | null): string {
  if (!t) return 'sedute fisse';
  return t.secondary && t.secondary !== t.primary ? `${QUALITY_LABEL[t.primary]}, poi ${QUALITY_LABEL[t.secondary]}` : QUALITY_LABEL[t.primary];
}

/** "4 settimane · forza, poi potenza". */
export function describeBlock(p: Program): string {
  return `${plural(p.weeks.length, 'settimana', 'settimane')} · ${describeTraining(p)}`;
}

/** "3 × 6-10 · RIR 2", "2 × 6-10 per lato", "4 × 30 s", "6 × 1 da 20 m". */
export function describeDose(item: SessionExercise): string {
  const reps = item.repMin === item.repMax ? fmtNumber(item.repMin) : `${fmtNumber(item.repMin)}-${fmtNumber(item.repMax)}`;
  let out = `${fmtNumber(item.sets)} × ${reps}${item.unit === 'secondi' ? ' s' : ''}`;
  if (item.distanceM) out += ` da ${fmtNumber(item.distanceM)} m`;
  if (item.perSide) out += ' per lato';
  if (item.workSec) out += ` · ${fmtNumber(item.workSec)} s di lavoro`;
  if (item.effort) out += ` · ${item.effort}`;
  if (item.rir !== undefined) out += ` · RIR ${fmtNumber(item.rir)}`;
  return out;
}

/** "Calcio · Partita alle 21:00 · fisioterapista", "Palestra · Seduta B alle 17:00", "Riposo". */
export function describeDay(d: ScheduleDay | undefined): string {
  if (!d) return 'nessun dato';
  const parts = [capitalize(dayTypeName(d.dayType))];
  if (d.football) parts.push(`${FOOTBALL_LABEL[d.football.kind]} alle ${d.football.time}`);
  if (d.gymSessionId) parts.push(`${slotLabel(d.gymSessionId)}${d.gymOptional ? ' facoltativa' : ''}${d.gymTime ? ` alle ${d.gymTime}` : ''}`);
  if (d.physio) parts.push('fisioterapista');
  return parts.join(' · ');
}

const dayTypeName = (t: DayType) => ({ calcio: 'calcio', palestra: 'palestra', leggero: 'leggero', riposo: 'riposo' })[t];

/** "−350 kcal al giorno", "+250 kcal al giorno", "nessuna"; senza valore salvato "come da obiettivo". */
function describeDelta(v: number | null | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 'come da obiettivo';
  if (v === 0) return 'nessuna';
  return `${v < 0 ? '−' : '+'}${fmtNumber(Math.abs(v))} kcal al giorno`;
}

const recipeName = (id: string | undefined) => (id ? (RECIPES[id]?.name ?? id) : undefined);

// ───────────────────────── Menù ─────────────────────────

export interface MenuDiffOptions {
  /** Prodotti della spesa prima e dopo (dalla `shoppingList` di chi chiama). */
  products?: { before?: number; after: number };
  /** Davanti alle etichette, per distinguere più settimane («16-22 novembre · »). */
  prefix?: string;
}

/**
 * Pasti cambiati giorno per giorno (pranzi e cene pesano di più), poi la preparazione della domenica e la spesa.
 * Senza `before` (nessun menù noto) ogni pasto di `after` è nuovo.
 */
export function diffMenus(before: MenuWeek | undefined, after: MenuWeek | undefined, opts: MenuDiffOptions = {}): DiffItem[] {
  const out: DiffItem[] = [];
  const prefix = opts.prefix ?? '';
  for (let d = 0; d < 7; d++) {
    for (const slot of MEAL_SLOTS) {
      const a = before?.days?.[d]?.meals?.[slot];
      const b = after?.days?.[d]?.meals?.[slot];
      if (a === b) continue;
      out.push({
        area: 'pasto',
        weight: MEAL_WEIGHT[slot],
        label: `${prefix}${capitalize(WEEKDAY_LONG[d as Weekday])}, ${MEAL_SLOT_LABEL[slot].toLowerCase()}`,
        before: recipeName(a) ?? 'niente',
        after: recipeName(b) ?? 'niente',
      });
    }
  }
  const prepIds = (w: MenuWeek | undefined) => (w?.prep ?? []).map((t) => t.id).sort();
  if (!same(prepIds(before), prepIds(after))) {
    const describe = (w: MenuWeek | undefined) => {
      const tasks = w?.prep ?? [];
      if (!tasks.length) return 'niente da preparare';
      const min = tasks.reduce((s, t) => s + (Number.isFinite(t.minutes) ? t.minutes : 0), 0);
      return `${plural(tasks.length, 'compito', 'compiti')} · ${fmtNumber(min)} min`;
    };
    out.push({ area: 'pasto', weight: 1.5, label: `${prefix}Preparazione della domenica`, before: describe(before), after: describe(after) });
  }
  const p = opts.products;
  if (p && p.before !== p.after) {
    out.push({
      area: 'spesa',
      weight: 2.5,
      label: `${prefix}Spesa`,
      ...(p.before !== undefined ? { before: plural(p.before, 'prodotto', 'prodotti') } : {}),
      after: plural(p.after, 'prodotto', 'prodotti'),
    });
  }
  return out;
}

/** Pasti cambiati (per il sottotitolo «Cambiano 4 pasti»): le differenze di area `pasto` tranne la preparazione. */
export function changedMeals(items: readonly DiffItem[]): number {
  return items.filter((d) => d.area === 'pasto' && !d.label.endsWith('Preparazione della domenica')).length;
}

// ───────────────────────── Programmi ─────────────────────────

export interface ProgramDiffOptions {
  /** Nome di un esercizio (catalogo ed esercizi del fisioterapista); predefinito: il catalogo. */
  exerciseName?: (id: string) => string | undefined;
}

interface FlatItem {
  block: string;
  item: SessionExercise;
  key: string;
}

/** Esercizi di una seduta in ordine, con una chiave che distingue lo stesso esercizio ripetuto. */
function flatten(s: WorkoutSession | undefined): FlatItem[] {
  const seen = new Map<string, number>();
  const out: FlatItem[] = [];
  for (const b of s?.blocks ?? []) {
    for (const item of b.items ?? []) {
      const n = seen.get(item.exerciseId) ?? 0;
      seen.set(item.exerciseId, n + 1);
      out.push({ block: b.title, item, key: n ? `${item.exerciseId}#${n}` : item.exerciseId });
    }
  }
  return out;
}

const doseOf = (it: SessionExercise) => describeDose(it);

function slotOrder(slots: Iterable<string>): string[] {
  return [...new Set(slots)].sort((a, b) => {
    const ia = SLOT_ORDER.indexOf(a);
    const ib = SLOT_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || (a < b ? -1 : a > b ? 1 : 0);
  });
}

/** Sedute della settimana 1 di un blocco, oppure quelle fisse per gli slot nominati. */
function sessionsOf(p: Program | undefined, slots: readonly string[]): Record<string, WorkoutSession | undefined> {
  if (p) return p.sessions ?? {};
  const out: Record<string, WorkoutSession | undefined> = {};
  for (const s of slots) out[s] = SESSIONS[s];
  return out;
}

/**
 * Differenze tra due blocchi (o tra le sedute fisse e un blocco): il blocco nel suo insieme, le sedute aggiunte o
 * tolte, gli esercizi sostituiti, nuovi o tolti e le dosi cambiate, seduta per seduta.
 */
export function diffPrograms(before: Program | undefined | null, after: Program | undefined | null, opts: ProgramDiffOptions = {}): DiffItem[] {
  const b = before ?? undefined;
  const a = after ?? undefined;
  if (!b && !a) return [];
  const name = (id: string) => opts.exerciseName?.(id) ?? EXERCISES[id]?.name ?? id;
  const out: DiffItem[] = [];

  if (!b || !a || b.blockId !== a.blockId || !same(b.weeks, a.weeks) || b.primary !== a.primary || b.secondary !== a.secondary) {
    const bd = b ? describeBlock(b) : 'sedute fisse';
    const ad = a ? describeBlock(a) : 'sedute fisse';
    if (bd !== ad || !b || !a) out.push({ area: 'settimana', weight: 6, label: 'Blocco', before: bd, after: ad });
  }

  const slotsB = b ? Object.keys(b.sessions ?? {}) : [];
  const slotsA = a ? Object.keys(a.sessions ?? {}) : [];
  const slots = slotOrder([...slotsB, ...slotsA]);
  const sb = sessionsOf(b, slots);
  const sa = sessionsOf(a, slots);
  for (const slot of slots) {
    const s1 = sb[slot];
    const s2 = sa[slot];
    const label = (s2 ?? s1)?.name ?? slotLabel(slot);
    if (!s1 && !s2) continue;
    if (!s1 || !s2) {
      out.push({ area: 'seduta', weight: 4, label, before: s1 ? s1.subtitle || s1.name : 'nessuna', after: s2 ? s2.subtitle || s2.name : 'tolta' });
      continue;
    }
    const f1 = flatten(s1);
    const f2 = flatten(s2);
    const k1 = new Map(f1.map((x) => [x.key, x]));
    const k2 = new Map(f2.map((x) => [x.key, x]));
    const removed = f1.filter((x) => !k2.has(x.key));
    const added = f2.filter((x) => !k1.has(x.key));
    // Un esercizio tolto e uno nuovo nello stesso gruppo della seduta sono una sostituzione.
    const pairedAdded = new Set<string>();
    for (const r of removed) {
      const match = added.find((x) => x.block === r.block && !pairedAdded.has(x.key));
      if (match) {
        pairedAdded.add(match.key);
        out.push({ area: 'esercizio', weight: 3, label: `${label} · ${r.block}`, before: name(r.item.exerciseId), after: name(match.item.exerciseId) });
      } else {
        out.push({ area: 'esercizio', weight: 2.5, label: `${label} · ${name(r.item.exerciseId)}`, before: doseOf(r.item), after: 'tolto' });
      }
    }
    for (const x of added) {
      if (pairedAdded.has(x.key)) continue;
      out.push({ area: 'esercizio', weight: 2.5, label: `${label} · ${name(x.item.exerciseId)}`, after: `nuovo · ${doseOf(x.item)}` });
    }
    for (const x of f2) {
      const old = k1.get(x.key);
      if (!old) continue;
      const d1 = doseOf(old.item);
      const d2 = doseOf(x.item);
      if (d1 !== d2) out.push({ area: 'carico', weight: 2, label: `${label} · ${name(x.item.exerciseId)}`, before: d1, after: d2 });
    }
    if (Math.abs((s1.estMin ?? 0) - (s2.estMin ?? 0)) >= 5) {
      out.push({ area: 'seduta', weight: 1, label: `${label} · durata`, before: `${fmtNumber(s1.estMin)} min`, after: `${fmtNumber(s2.estMin)} min` });
    }
  }
  return out;
}

// ───────────────────────── Settimana tipo ─────────────────────────

/** Giorno per giorno: calcio, palestra, fisioterapista e tipo di giorno, senza ripetere le parti uguali. Il calcio pesa di più. */
export function diffWeeks(before: readonly ScheduleDay[] | undefined, after: readonly ScheduleDay[] | undefined, opts: { prefix?: string } = {}): DiffItem[] {
  const out: DiffItem[] = [];
  const at = (w: readonly ScheduleDay[] | undefined, wd: number) => w?.find((d) => d.weekday === wd) ?? w?.[wd];
  for (let wd = 0; wd < 7; wd++) {
    const d1 = at(before, wd);
    const d2 = at(after, wd);
    const t1 = describeDay(d1);
    const t2 = describeDay(d2);
    if (t1 === t2) continue;
    let weight = 1;
    if (!same(d1?.football, d2?.football)) weight = 4;
    else if (d1?.gymSessionId !== d2?.gymSessionId || d1?.gymTime !== d2?.gymTime || d1?.gymOptional !== d2?.gymOptional) weight = 3;
    else if (d1?.dayType !== d2?.dayType) weight = 2;
    // Le parti uguali in testa non si ripetono: «Seduta B alle 17:00 → Seduta B alle 18:00», non «Palestra · …».
    const p1 = t1.split(' · ');
    const p2 = t2.split(' · ');
    let k = 0;
    while (k < p1.length - 1 && k < p2.length - 1 && p1[k] === p2[k]) k++;
    out.push({ area: 'settimana', weight, label: `${opts.prefix ?? ''}${capitalize(WEEKDAY_LONG[wd as Weekday])}`, before: p1.slice(k).join(' · '), after: p2.slice(k).join(' · ') });
  }
  return out;
}

// ───────────────────────── Obiettivi ─────────────────────────

/** Calorie e macro per tipo di giorno: una riga per tipo, con le kcal e le macro che cambiano. */
export function diffTargets(before: Plan['targets'] | undefined, after: Plan['targets'] | undefined): DiffItem[] {
  const out: DiffItem[] = [];
  if (!before || !after) return out;
  const macros = [
    ['proteinG', 'P'],
    ['carbG', 'C'],
    ['fatG', 'G'],
    ['fiberG', 'fibre'],
  ] as const;
  for (const t of DAY_TYPES) {
    const x = before[t];
    const y = after[t];
    if (!x || !y) continue;
    const changed = macros.filter(([k]) => Math.round(x[k]) !== Math.round(y[k]));
    const kcalChanged = Math.round(x.kcal) !== Math.round(y.kcal);
    if (!kcalChanged && !changed.length) continue;
    const text = (m: typeof x) => [`${fmtNumber(Math.round(m.kcal))} kcal`, ...changed.map(([k, l]) => `${l} ${fmtNumber(Math.round(m[k]))} g`)].join(' · ');
    out.push({ area: 'calorie', weight: kcalChanged ? (Math.abs(x.kcal - y.kcal) >= 100 ? 3 : 2) : 1.5, label: DAY_TARGET_LABEL[t], before: text(x), after: text(y) });
  }
  return out;
}

/** Obiettivo di allenamento: qualità, rientro, tempo e spazi. */
export function diffTraining(before: TrainingGoal | undefined | null, after: TrainingGoal | undefined | null): DiffItem[] {
  const b = before ?? undefined;
  const a = after ?? undefined;
  const out: DiffItem[] = [];
  if (describeTraining(b) !== describeTraining(a)) {
    out.push({ area: 'obiettivo', weight: 5, label: 'Allenamento', before: capitalize(describeTraining(b)), after: capitalize(describeTraining(a)) });
  }
  const rientro = (t?: TrainingGoal) => (t?.rientro ? `${t.rientro.site}, stadio ${t.rientro.stage}` : 'nessuno');
  if (rientro(b) !== rientro(a)) out.push({ area: 'obiettivo', weight: 4, label: 'Rientro', before: rientro(b), after: rientro(a) });
  const min = (t?: TrainingGoal) => `${fmtNumber(t?.sessionMin ?? 60)} min`;
  if (min(b) !== min(a)) out.push({ area: 'seduta', weight: 2, label: 'Minuti per seduta', before: min(b), after: min(a) });
  const gym = (t?: TrainingGoal) => plural(t?.gymPerWeek ?? 2, 'seduta', 'sedute');
  if (gym(b) !== gym(a)) out.push({ area: 'seduta', weight: 2, label: 'Palestra in stagione', before: gym(b), after: gym(a) });
  const spaces = (t?: TrainingGoal) => {
    const list = (t?.spaces ?? []).map((s) => SPACE_LABEL[s] ?? s);
    return list.length ? capitalize(listIt(['palestra', ...list])) : 'Solo palestra';
  };
  if (spaces(b) !== spaces(a)) out.push({ area: 'seduta', weight: 1, label: 'Spazi', before: spaces(b), after: spaces(a) });
  return out;
}

// ───────────────────────── Toppa intera ─────────────────────────

export interface DiffOptions extends ProgramDiffOptions {
  /** Menù in vigore in un lunedì senza la toppa (predefinito: `menuWeekInForce`). */
  menuInForce?: (monday: ISODate) => MenuWeek | undefined;
  /** Menù che varrebbe togliendo quello approvato (predefinito: `menuWeekInForce` senza quel lunedì). */
  menuWithout?: (monday: ISODate) => MenuWeek | undefined;
  /** Deficit in vigore quando `Plan.goalDeltaKcal` manca (`goalDeltaOf`): senza, «come da obiettivo». */
  deltaInForce?: number;
}

/**
 * Differenze di tutte le parti che la toppa tocca, rispetto ai valori di oggi: settimana, blocco, menù, obiettivi di
 * allenamento e del corpo, calorie. Le parti che la toppa non nomina non compaiono (restano come sono).
 */
export function diffPatch(plan: Plan, profile: Pick<Profile, 'goal'>, patch: PlanPatch, opts: DiffOptions = {}): DiffItem[] {
  const out: DiffItem[] = [];
  if (patch.week !== undefined) out.push(...diffWeeks(plan.week, patch.week));
  if (patch.seasonWeek !== undefined && !same(plan.seasonWeek ?? null, patch.seasonWeek)) {
    out.push({
      area: 'settimana',
      weight: 1,
      label: 'Settimana in stagione',
      before: plan.seasonWeek ? 'salvata' : 'nessuna',
      after: patch.seasonWeek ? (plan.seasonWeek ? 'aggiornata' : 'salvata') : 'tolta',
    });
  }
  if (patch.program !== undefined) out.push(...diffPrograms(plan.program, patch.program, opts));
  if (patch.menus) {
    const mondays = Object.keys(patch.menus).sort();
    for (const m of mondays) {
      const current = opts.menuInForce?.(m) ?? menuWeekInForce(m, plan);
      const without = { startDate: plan.startDate, menus: Object.fromEntries(Object.entries(plan.menus ?? {}).filter(([k]) => k !== m)) };
      const next = patch.menus[m] ?? opts.menuWithout?.(m) ?? menuWeekInForce(m, without);
      out.push(...diffMenus(current, next, { prefix: mondays.length > 1 ? `${formatWeekRange(m)} · ` : '' }));
    }
  }
  if (patch.training !== undefined) out.push(...diffTraining(plan.training, patch.training));
  if (patch.goal !== undefined && patch.goal !== profile.goal) {
    out.push({ area: 'obiettivo', weight: 5, label: 'Obiettivo del corpo', before: GOAL_NAME[profile.goal] ?? profile.goal, after: GOAL_NAME[patch.goal] ?? patch.goal });
  }
  if (patch.targets !== undefined) out.push(...diffTargets(plan.targets, patch.targets));
  if (patch.goalDeltaKcal !== undefined) {
    const b = describeDelta(plan.goalDeltaKcal ?? opts.deltaInForce);
    const a = describeDelta(patch.goalDeltaKcal);
    if (a !== b) out.push({ area: 'calorie', weight: 4, label: 'Calorie rispetto al dispendio', before: b, after: a });
  }
  return out;
}

/** Le differenze più importanti per prime (a parità di peso resta l'ordine di partenza); le prime `n`. */
export function topDiff(items: readonly DiffItem[], n = 5): DiffItem[] {
  return items
    .map((d, i) => ({ d, i }))
    .sort((x, y) => y.d.weight - x.d.weight || x.i - y.i)
    .slice(0, Math.max(0, n))
    .map((x) => x.d);
}

/** Tutte le differenze, ordinate come `topDiff`. */
export function sortDiff(items: readonly DiffItem[]): DiffItem[] {
  return topDiff(items, items.length);
}

// ───────────────────────── Ritocchi del coach ─────────────────────────

/** Riga di un ritocco del coach per il foglio della proposta: «Seduta B: Trap bar → Stacco rumeno». */
export function editLabel(edit: PlanEdit | MenuEdit, opts: ProgramDiffOptions = {}): string {
  const name = (id: string) => opts.exerciseName?.(id) ?? EXERCISES[id]?.name ?? id;
  if ('op' in edit) {
    switch (edit.op) {
      case 'sostituisci':
        return `${slotLabel(edit.slot)}: ${name(edit.exerciseId)} → ${name(edit.with)}${edit.week ? `, settimana ${edit.week}` : ''}`;
      case 'serie':
        return `${slotLabel(edit.slot)}: ${name(edit.exerciseId)}, ${plural(edit.sets, 'serie', 'serie')}${edit.week ? ` nella settimana ${edit.week}` : ''}`;
      case 'ordine':
        return `${slotLabel(edit.slot)}: ordine degli esercizi`;
      case 'nota':
        return `${slotLabel(edit.slot)}, ${name(edit.exerciseId)}: ${edit.note}`;
    }
  }
  return `${capitalize(WEEKDAY_LONG[edit.day])}, ${MEAL_SLOT_LABEL[edit.slot].toLowerCase()}: ${recipeName(edit.recipeId)}`;
}

// ───────────────────────── Ritorno a una versione ─────────────────────────

/** Primo lunedì da `iso` compreso. */
export function mondayOnOrAfter(iso: ISODate): ISODate {
  const monday = weekStart(iso);
  return monday === iso ? iso : addDays(monday, 7);
}

/**
 * Giorno da cui vale un ritorno: domani; con un blocco nella toppa (anche `null`, le sedute fisse) il primo lunedì da
 * domani, perché i blocchi cambiano di lunedì e quello in vigore resta fino a quel giorno (§ 3.1, § 5.4).
 */
export function restoreStart(after: PlanPatch, today: ISODate): ISODate {
  const tomorrow = addDays(today, 1);
  return after.program !== undefined ? mondayOnOrAfter(tomorrow) : tomorrow;
}

/**
 * Toppa di un ritorno: quella della versione (`after`), copiata; un blocco riparte da `effectiveFrom` (il suo lunedì)
 * con un id nuovo (`<id di partenza>@<lunedì>`), così le sedute registrate e il riepilogo del blocco di allora restano
 * suoi. Con un inizio rimasto nel passato il blocco tornerebbe subito, a metà, e cambierebbe le sedute di oggi.
 */
export function restoredPatch(after: PlanPatch, effectiveFrom: ISODate): PlanPatch {
  const patch = JSON.parse(JSON.stringify(after ?? {})) as PlanPatch;
  if (patch.program) {
    const base = patch.program.blockId.split('@')[0] || patch.program.blockId;
    patch.program = { ...patch.program, start: effectiveFrom, blockId: `${base}@${effectiveFrom}` };
  }
  return patch;
}

/** "da domani", "da lunedì", "dal 16 novembre". */
function startWords(effectiveFrom: ISODate, today: ISODate): string {
  const days = daysBetween(today, effectiveFrom);
  if (days === 1) return 'da domani';
  if (days > 1 && days < 7) return `da ${WEEKDAY_LONG[weekdayOf(effectiveFrom)]}`;
  return fromDayLabel(effectiveFrom);
}

/**
 * «Torna a questa versione» (§ 5.5): una proposta `ritorno` da domani (con un blocco, dal primo lunedì: `restoreStart`)
 * con la toppa della versione (`restoredPatch`), da approvare come le altre. Le differenze sono calcolate sul piano di
 * oggi: tornano solo i campi che quella versione aveva toccato, il resto resta com'è. La base comprende la toppa
 * (`planBasis('ritorno', { ...state, patch })`), così la proposta non risulta superata appena nata. `createdAt` è la
 * data di oggi: chi la salva può mettere l'ora vera.
 */
export function restoreTo(version: PlanVersion, state: ProposalState, today: ISODate, opts: DiffOptions = {}): PlanProposal {
  const effectiveFrom = restoreStart(version.after ?? {}, today);
  const patch = restoredPatch(version.after ?? {}, effectiveFrom);
  const basis = planBasis('ritorno', { ...state, patch });
  const diff = sortDiff(diffPatch(state.plan, state.profile, patch, opts));
  const from = startWords(effectiveFrom, today);
  const changes = diff.length ? `${from} ${diff.length === 1 ? 'cambia una voce' : `cambiano ${fmtNumber(diff.length)} voci`}` : 'nessuna differenza con il piano di oggi';
  return {
    id: proposalId('ritorno', effectiveFrom, basis, 0),
    kind: 'ritorno',
    status: 'aperta',
    createdAt: today,
    effectiveFrom,
    basis,
    attempt: 0,
    title: `Ritorno alla versione del ${dayMonthLabel(version.effectiveFrom)}`,
    subtitle: `${version.title} · ${changes}`,
    patch,
    diff,
    reasons: ['Tornano solo le parti che quella versione aveva cambiato: il resto del piano resta com’è.'],
    source: 'motore',
  };
}
