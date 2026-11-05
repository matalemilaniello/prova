/**
 * Obiettivi giornalieri: Mifflin-St Jeor × fattore di attività per tipo di giorno.
 * Proteine 1,9 g/kg; grassi ≈ 28% delle kcal del giorno di palestra (costanti nella settimana);
 * carboidrati il resto (periodizzati sul tipo di giorno); fibre 35 g.
 */
import type { DayType, Goal, MacroTarget, Profile } from '../domain/types';

/** Fattori di attività tarati sulla settimana tipo (lavoro in parte in piedi + sport serale). */
export const ACTIVITY_FACTOR: Record<DayType, number> = {
  calcio: 1.68,
  palestra: 1.56,
  leggero: 1.47,
  riposo: 1.38,
};

/** Correzione calorica per obiettivo. */
export const GOAL_DELTA_KCAL: Record<Goal, number> = {
  ricomposizione: 0,
  mantenimento: 0,
  dimagrimento: -350,
  massa: 250,
};

export const PROTEIN_G_PER_KG = 1.9;
/**
 * Carboidrati minimi il giorno della partita e la vigilia, in g per kg di peso: UEFA expert group statement on
 * nutrition in elite football (Collins et al., BJSM 2021) indica 6-8 g/kg nel giorno prima e nel giorno della gara
 * da 90 minuti. Il piano tiene il minimo dell'intervallo; calcetto e allenamento restano al giorno di calcio.
 * Si applica per data (`matchCarbs` in `engine/nutrition.ts`), non al tipo di giorno.
 */
export const MATCH_CARB_G_PER_KG = 6;
export const FAT_SHARE = 0.28;
/** Fibre: circa 14 g ogni 1.000 kcal (LARN 2014: 12,6-16,7 g/1.000 kcal, almeno 25 g al giorno). */
export const FIBER_G = 35;

/** Valori di riserva quando il profilo non è compilato. */
const FALLBACK = { age: 32, heightCm: 178, weightKg: 72 };

export interface BodyInput {
  sex: 'M' | 'F';
  weightKg: number;
  heightCm: number;
  age: number;
}

/** Metabolismo basale (kcal/giorno), Mifflin-St Jeor. */
export function bmrMifflin({ sex, weightKg, heightCm, age }: BodyInput): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'M' ? 5 : -161);
}

/** Dispendio totale del tipo di giorno. */
export function tdee(bmr: number, dayType: DayType): number {
  return bmr * (ACTIVITY_FACTOR[dayType] ?? 1.5);
}

/** Età nell'anno corrente (o di riserva se l'anno di nascita manca). */
export function ageFrom(birthYear: number, now: Date = new Date()): number {
  if (!(birthYear > 1900)) return FALLBACK.age;
  return Math.max(14, now.getFullYear() - birthYear);
}

const round = (x: number, step: number) => Math.round(x / step) * step;

/**
 * Obiettivi per tutti i tipi di giorno dal profilo e dal peso attuale.
 * kcal arrotondate a 50, macro a 5 g.
 */
export function computeTargets(profile: Profile, weightKg?: number, now: Date = new Date()): Record<DayType, MacroTarget> {
  const w = weightKg && weightKg > 0 ? weightKg : profile.startWeightKg > 0 ? profile.startWeightKg : FALLBACK.weightKg;
  const body: BodyInput = {
    sex: profile.sex,
    weightKg: w,
    heightCm: profile.heightCm > 0 ? profile.heightCm : FALLBACK.heightCm,
    age: ageFrom(profile.birthYear, now),
  };
  const bmr = bmrMifflin(body);
  const delta = GOAL_DELTA_KCAL[profile.goal] ?? 0;
  const kcalOf = (t: DayType) => round(tdee(bmr, t) + delta, 50);
  // Proteine per obiettivo (§ 2.1): 2,2 g/kg in dimagrimento, 1,9 negli altri, come le proposte di obiettivi.
  const proteinG = round((PROTEIN_G_PER_KG_BY_GOAL[profile.goal] ?? PROTEIN_G_PER_KG) * w, 5);
  const fatG = round((kcalOf('palestra') * FAT_SHARE) / 9, 5);
  const make = (t: DayType): MacroTarget => {
    const kcal = kcalOf(t);
    const carbG = Math.max(0, round((kcal - proteinG * 4 - fatG * 9) / 4, 5));
    return { kcal, proteinG, fatG, carbG, fiberG: FIBER_G };
  };
  return { calcio: make('calcio'), palestra: make('palestra'), leggero: make('leggero'), riposo: make('riposo') };
}

// ───────────────────────── Obiettivi delle proposte (fase 2, § 2.1) ─────────────────────────

/**
 * Proteine per obiettivo del corpo (docs/FASE2.md § 2.1): 2,2 g/kg in dimagrimento, perché in deficit servono più
 * proteine per tenere il muscolo (Helms 2014; ISSN, Jäger 2017); 1,9 g/kg negli altri. Le usano la proposta di obiettivi
 * e `computeTargets` (benvenuto e ricalcolo dal profilo): chi sceglie il dimagrimento nel benvenuto parte già da 2,2.
 */
export const PROTEIN_G_PER_KG_BY_GOAL: Record<Goal, number> = {
  ricomposizione: PROTEIN_G_PER_KG,
  mantenimento: PROTEIN_G_PER_KG,
  massa: PROTEIN_G_PER_KG,
  dimagrimento: 2.2,
};

export interface GoalTargets {
  targets: Record<DayType, MacroTarget>;
  /** Differenza dal dispendio in vigore con il nuovo obiettivo (negativa = deficit), dentro i limiti. */
  goalDeltaKcal: number;
  /** Il deficit dell'obiettivo è stato tagliato ai limiti di sicurezza. */
  capped: boolean;
}

/**
 * Obiettivi per tipo di giorno di una proposta di obiettivi (§ 2.1): dal dispendio che gli obiettivi di oggi
 * sottintendono (kcal meno la differenza in vigore, così restano le modifiche fatte a mano), più la differenza del nuovo
 * obiettivo (`GOAL_DELTA_KCAL`), mai oltre il deficit massimo dato (500 kcal e il 20% del dispendio, il più stretto tra i
 * tipi di giorno: lo calcola engine/energy.ts). Kcal arrotondate a 50, proteine dal peso con i g/kg dell'obiettivo
 * (senza peso restano quelle di oggi), grassi e fibre come oggi, carboidrati il resto.
 */
export function targetsForGoal(
  targets: Record<DayType, MacroTarget>,
  currentDeltaKcal: number,
  goal: Goal,
  opts: { weightKg?: number; maxDeficitKcal?: number } = {},
): GoalTargets {
  const want = GOAL_DELTA_KCAL[goal] ?? 0;
  const cap = typeof opts.maxDeficitKcal === 'number' && Number.isFinite(opts.maxDeficitKcal) ? Math.max(0, opts.maxDeficitKcal) : Infinity;
  const delta = want < 0 ? -Math.min(-want, cap) : want;
  const w = opts.weightKg && opts.weightKg > 0 ? opts.weightKg : undefined;
  const make = (t: DayType): MacroTarget => {
    const cur = targets[t];
    const kcal = round(cur.kcal - currentDeltaKcal + delta, 50);
    const proteinG = w ? round(PROTEIN_G_PER_KG_BY_GOAL[goal] * w, 5) : cur.proteinG;
    const carbG = Math.max(0, round((kcal - proteinG * 4 - cur.fatG * 9) / 4, 5));
    return { kcal, proteinG, fatG: cur.fatG, carbG, fiberG: cur.fiberG };
  };
  return {
    targets: { calcio: make('calcio'), palestra: make('palestra'), leggero: make('leggero'), riposo: make('riposo') },
    goalDeltaKcal: delta,
    capped: delta !== want,
  };
}
