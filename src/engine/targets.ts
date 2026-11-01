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
  const proteinG = round(PROTEIN_G_PER_KG * w, 5);
  const fatG = round((kcalOf('palestra') * FAT_SHARE) / 9, 5);
  const make = (t: DayType): MacroTarget => {
    const kcal = kcalOf(t);
    const carbG = Math.max(0, round((kcal - proteinG * 4 - fatG * 9) / 4, 5));
    return { kcal, proteinG, fatG, carbG, fiberG: FIBER_G };
  };
  return { calcio: make('calcio'), palestra: make('palestra'), leggero: make('leggero'), riposo: make('riposo') };
}
