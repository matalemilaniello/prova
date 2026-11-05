/**
 * Obiettivi su tre livelli nelle impostazioni (docs/FASE2.md § 2, § 11.4): logica pura delle pagine Obiettivi e Calorie e
 * macro. Corpo e allenamento sono una bozza finché l'utente non tocca «Vedi la proposta»: niente si applica da solo,
 * nasce una proposta di obiettivi (`goalsProposal`, onda 2B1). Le date della stagione sono fatti e si salvano subito.
 *
 * - `goalDeltaFor`: differenza di kcal che l'obiettivo del corpo avrebbe, dentro i limiti del § 2.1 (500 kcal e il 20%
 *   del dispendio), come la calcola la proposta;
 * - `presetRows`, `lockedLine`: obiettivi pronti della fase e quelli che si sbloccano in un'altra;
 * - `withPreset`, `withQualities`, `withRientro`: la bozza dell'allenamento dopo una scelta;
 * - `goalsDraftOf`: la bozza da passare a `goalsProposal`, solo con le parti cambiate rispetto al piano;
 * - `recalcTargets`: il ricalcolo dal profilo di Calorie e macro con il deficit in vigore e gli stessi limiti.
 */
import type { DayType, Goal, ISODate, MacroTarget, Plan, Profile, ReturnPlan, SeasonPhase, TrainingGoal, TrainingQuality, WeeklyReview } from '../../domain/types';
import { addDays } from '../../engine/dates';
import { allowedDeficitKcal, expenditureKcal, goalDeltaOf, MAX_SURPLUS_KCAL } from '../../engine/energy';
import type { GoalsDraft } from '../../engine/plan/build';
import { QUALITY_LABEL } from '../../engine/plan/diff';
import { returnStagesFor, type ReturnStage } from '../../engine/plan/returnStages';
import {
  DEFAULT_TRAINING,
  forbiddenPair,
  PRESET_BY_ID,
  lockedPresets,
  presetsFor,
  QUALITIES,
  qualityAllowed,
  seasonOn,
  type PhaseCtx,
  type TrainingPreset,
} from '../../engine/plan/season';
import { stableStringify } from '../../engine/plan/proposals';
import { ACTIVITY_FACTOR, FAT_SHARE, FIBER_G, GOAL_DELTA_KCAL, PROTEIN_G_PER_KG_BY_GOAL, ageFrom, bmrMifflin } from '../../engine/targets';
import { capitalize, fmtNumber, listIt } from '../../lib/format';

const DAY_TYPES: DayType[] = ['calcio', 'palestra', 'leggero', 'riposo'];

// ───────────────────────── Corpo ─────────────────────────

export const GOAL_ORDER: Goal[] = ['ricomposizione', 'dimagrimento', 'massa', 'mantenimento'];

export const GOAL_NAME: Record<Goal, string> = {
  ricomposizione: 'Ricomposizione',
  dimagrimento: 'Dimagrimento',
  massa: 'Massa',
  mantenimento: 'Mantenimento',
};

/**
 * Differenza dal dispendio stimato con l'obiettivo del corpo (negativa = deficit), come la propone la pagina: quella in
 * vigore per l'obiettivo di oggi, altrimenti quella dell'obiettivo (`GOAL_DELTA_KCAL`) tagliata al deficit massimo del
 * piano (500 kcal e il 20% del dispendio, il tipo di giorno più stretto).
 */
export function goalDeltaFor(goal: Goal, plan: Plan, profile: Profile, reviews: readonly WeeklyReview[]): number {
  const current = goalDeltaOf(plan, profile, reviews);
  if (goal === profile.goal) return current;
  const want = GOAL_DELTA_KCAL[goal] ?? 0;
  if (want >= 0) return want;
  const cap = Math.min(...DAY_TYPES.map((t) => allowedDeficitKcal(expenditureKcal(plan, t, current))));
  return -Math.min(-want, Math.max(0, cap));
}

/** Riga sull'effetto sotto l'obiettivo scelto: «−350 kcal al giorno, mai a partita e vigilia». */
export function goalEffect(delta: number): string {
  if (delta < 0) return `−${fmtNumber(-delta)} kcal al giorno, mai a partita e vigilia`;
  if (delta > 0) return `+${fmtNumber(delta)} kcal al giorno`;
  return 'Calorie del dispendio stimato';
}

// ───────────────────────── Allenamento ─────────────────────────

/** Contesto della fase da domani (la proposta di obiettivi vale da domani). */
export function phaseCtxFor(plan: Pick<Plan, 'season'>, today: ISODate): PhaseCtx & { stage: ReturnType<typeof seasonOn>['stage'] } {
  const info = seasonOn(addDays(today, 1), plan.season);
  return { phase: info.phase, stage: info.stage, ...(info.lateBreak ? { lateBreak: true } : {}) };
}

export const PHASE_NAME: Record<SeasonPhase, string> = { stagione: 'in stagione', pausa: 'nella pausa estiva', precampionato: 'nel precampionato' };

/** «Potenza, poi forza». */
export function qualitiesText(t: Pick<TrainingGoal, 'primary' | 'secondary'>): string {
  return capitalize(t.secondary && t.secondary !== t.primary ? `${QUALITY_LABEL[t.primary]}, poi ${QUALITY_LABEL[t.secondary]}` : QUALITY_LABEL[t.primary]);
}

/** Riga dell'elenco delle impostazioni: «Senza infortuni», «Forza, poi potenza», senza obiettivo «sedute fisse». */
export function trainingSummary(t: TrainingGoal | undefined): string {
  if (!t) return 'sedute fisse';
  const preset = t.presetId ? PRESET_BY_ID[t.presetId] : undefined;
  return preset && preset.primary === t.primary ? preset.label : qualitiesText(t);
}

/** Con potenza o rapidità: con R8 attiva la pagina dice che restano solo varianti senza impatto (§ 2.3). */
export const touchesImpacts = (t: Pick<TrainingGoal, 'primary' | 'secondary'>): boolean =>
  t.primary === 'potenza' || t.primary === 'rapidita' || t.secondary === 'potenza' || t.secondary === 'rapidita';

export interface PresetRow {
  preset: TrainingPreset;
  text: string;
  /** Con R8 attiva e potenza o rapidità: la riga del § 2.3. */
  r8: boolean;
}

/** Obiettivi pronti ammessi nella fase, nell'ordine della tabella, con principale e secondaria a parole. */
export function presetRows(ctx: PhaseCtx, r8: boolean): PresetRow[] {
  return presetsFor(ctx).map((preset) => ({ preset, text: qualitiesText(preset), r8: r8 && touchesImpacts(preset) }));
}

/** Fasi in cui un obiettivo pronto vale, a parole («nella pausa estiva», «nel precampionato e nelle ultime 4 settimane della pausa»). */
function phasesText(p: TrainingPreset, current: SeasonPhase): string {
  const out = p.phases.filter((x) => x !== current).map((x) => PHASE_NAME[x]);
  if (p.lateBreak && current !== 'pausa') out.push('nelle ultime 4 settimane della pausa');
  return listIt(out);
}

/** Riga sotto l'elenco: quali obiettivi pronti si sbloccano in un'altra fase (niente opzioni grigie, § 2.3). */
export function lockedLine(ctx: PhaseCtx): string | null {
  const locked = lockedPresets(ctx);
  if (!locked.length) return null;
  return `In un’altra fase: ${locked.map((p) => `${p.label.toLowerCase()} ${phasesText(p, ctx.phase)}`).join('; ')}.`;
}

/** Parti dell'obiettivo di allenamento che restano cambiando qualità: tempo, spazi e il rientro, se serve ancora. */
function keepSettings(t: TrainingGoal | undefined): Partial<TrainingGoal> {
  return {
    ...(t?.sessionMin !== undefined ? { sessionMin: t.sessionMin } : {}),
    ...(t?.gymPerWeek !== undefined ? { gymPerWeek: t.gymPerWeek } : {}),
    ...(t?.spaces ? { spaces: t.spaces } : {}),
  };
}

const usesRientro = (t: Pick<TrainingGoal, 'primary' | 'secondary'>) => t.primary === 'rientro' || t.secondary === 'rientro';

/** Rientro nuovo per la prima zona del profilo, dallo stadio 0 da domani; null senza zone. */
export function newRientro(painSites: readonly string[], today: ISODate, site?: string): ReturnPlan | null {
  const s = site && painSites.includes(site) ? site : painSites[0];
  return s ? { site: s, stage: 0, since: addDays(today, 1) } : null;
}

/** Bozza dopo la scelta di un obiettivo pronto. */
export function withPreset(t: TrainingGoal | undefined, preset: TrainingPreset, painSites: readonly string[], today: ISODate): TrainingGoal {
  const next: TrainingGoal = { ...keepSettings(t), presetId: preset.id, primary: preset.primary, secondary: preset.secondary };
  if (usesRientro(next)) {
    const r = t?.rientro && painSites.includes(t.rientro.site) ? t.rientro : newRientro(painSites, today);
    if (r) next.rientro = r;
  }
  return next;
}

/** Bozza dopo «Scegli tu»: principale e secondaria libere (la secondaria uguale alla principale si toglie). */
export function withQualities(
  t: TrainingGoal | undefined,
  primary: TrainingQuality,
  secondary: TrainingQuality | undefined,
  painSites: readonly string[],
  today: ISODate,
): TrainingGoal {
  const next: TrainingGoal = { ...keepSettings(t), primary, ...(secondary && secondary !== primary ? { secondary } : {}) };
  if (usesRientro(next)) {
    const r = t?.rientro && painSites.includes(t.rientro.site) ? t.rientro : newRientro(painSites, today);
    if (r) next.rientro = r;
  }
  return next;
}

/** Qualità ammesse come principale nella fase. */
export function primaryOptions(ctx: PhaseCtx): TrainingQuality[] {
  return QUALITIES.filter((q) => qualityAllowed(q, 'principale', ctx));
}

/** Qualità ammesse come secondaria con quella principale (niente coppie vietate). */
export function secondaryOptions(ctx: PhaseCtx, primary: TrainingQuality, rientro?: ReturnPlan): TrainingQuality[] {
  return QUALITIES.filter((q) => q !== primary && qualityAllowed(q, 'secondaria', ctx) && !forbiddenPair({ primary, secondary: q, rientro }, ctx.phase));
}

/** Rientro di una zona senza stadi propri (né gamba, né flessori, né gomito, né adduttori). */
export const RIENTRO_OTHER_NOTE = 'Per questa zona il rientro segue la regola del dolore di sempre: carico guidato dalla soglia.';

/**
 * Stadi del rientro che si possono scegliere all'inizio: senza il via libera del fisioterapista solo quelli senza impatti
 * né corsa (§ 3.8: senza `physioOk` mai uno stadio con impatti o corsa).
 */
export function stageChoices(site: string, physioOk: boolean): ReturnStage[] {
  return returnStagesFor(site).filter((s) => physioOk || !s.needsPhysio);
}

/** La zona ha stadi con impatti o corsa: la pagina mostra «Il fisioterapista ha dato il via libera». */
export const needsPhysioToggle = (site: string): boolean => returnStagesFor(site).some((s) => s.needsPhysio);

/**
 * Bozza da passare alla proposta di obiettivi: solo le parti cambiate rispetto al piano (e al profilo). `goal` e
 * `training` sono le scelte toccate dall'utente (assenti = come il piano). Null se non cambia niente.
 */
export function goalsDraftOf(
  form: { goal?: Goal; training?: TrainingGoal },
  plan: Pick<Plan, 'training'>,
  profile: Pick<Profile, 'goal'>,
): GoalsDraft | null {
  const draft: GoalsDraft = {};
  if (form.goal && form.goal !== profile.goal) draft.goal = form.goal;
  if (form.training && stableStringify(form.training) !== stableStringify(plan.training ?? null)) draft.training = form.training;
  return draft.goal || draft.training ? draft : null;
}

/** Obiettivo di allenamento da mostrare: la bozza, altrimenti il piano, altrimenti «Senza infortuni» (§ 2.3). */
export const shownTraining = (form: TrainingGoal | undefined, plan: Pick<Plan, 'training'>): TrainingGoal => form ?? plan.training ?? DEFAULT_TRAINING;

/** Manca la zona del rientro: «Vedi la proposta» porta alla pagina Dolore. */
export const rientroMissingSite = (t: TrainingGoal): boolean => usesRientro(t) && !t.rientro?.site;

// ───────────────────────── Ricalcolo dal profilo (Calorie e macro) ─────────────────────────

const round = (x: number, step: number) => Math.round(x / step) * step;

/** Valori di riserva quando il profilo non è compilato (gli stessi di `computeTargets`). */
const FALLBACK = { heightCm: 178, weightKg: 72 };

export interface RecalcResult {
  targets: Record<DayType, MacroTarget>;
  /** Differenza dal dispendio applicata, dentro i limiti (negativa = deficit). */
  goalDeltaKcal: number;
  /** Il deficit in vigore è stato tagliato ai limiti di sicurezza. */
  capped: boolean;
  proteinPerKg: number;
}

/**
 * Ricalcolo dal profilo (Mifflin-St Jeor × fattore del tipo di giorno) con il deficit in vigore (`goalDeltaOf`: il campo
 * del piano o quello ricavato) dentro gli stessi limiti del resto dell'app (§ 2.1): deficit mai oltre 500 kcal né oltre il
 * 20% del dispendio del tipo di giorno più stretto, surplus mai oltre 500. Proteine con i g/kg dell'obiettivo (2,2 in
 * dimagrimento), grassi il 28% del giorno di palestra, fibre 35 g, carboidrati il resto. Kcal a 50, macro a 5 g.
 */
export function recalcTargets(profile: Profile, weightKg: number | undefined, plan: Plan, reviews: readonly WeeklyReview[], now: Date): RecalcResult {
  const w = weightKg && weightKg > 0 ? weightKg : profile.startWeightKg > 0 ? profile.startWeightKg : FALLBACK.weightKg;
  const bmr = bmrMifflin({ sex: profile.sex, weightKg: w, heightCm: profile.heightCm > 0 ? profile.heightCm : FALLBACK.heightCm, age: ageFrom(profile.birthYear, now) });
  const expenditure = (t: DayType) => bmr * (ACTIVITY_FACTOR[t] ?? 1.5);
  const want = goalDeltaOf(plan, profile, reviews);
  let delta = want;
  if (want < 0) {
    const cap = Math.min(...DAY_TYPES.map((t) => allowedDeficitKcal(expenditure(t))));
    delta = -Math.min(-want, Math.max(0, cap));
  } else if (want > MAX_SURPLUS_KCAL) delta = MAX_SURPLUS_KCAL;
  const proteinPerKg = PROTEIN_G_PER_KG_BY_GOAL[profile.goal] ?? PROTEIN_G_PER_KG_BY_GOAL.ricomposizione;
  const proteinG = round(proteinPerKg * w, 5);
  const kcalOf = (t: DayType) => round(expenditure(t) + delta, 50);
  const fatG = round((kcalOf('palestra') * FAT_SHARE) / 9, 5);
  const make = (t: DayType): MacroTarget => {
    const kcal = kcalOf(t);
    return { kcal, proteinG, fatG, carbG: Math.max(0, round((kcal - proteinG * 4 - fatG * 9) / 4, 5)), fiberG: FIBER_G };
  };
  return {
    targets: { calcio: make('calcio'), palestra: make('palestra'), leggero: make('leggero'), riposo: make('riposo') },
    goalDeltaKcal: delta,
    capped: delta !== want,
    proteinPerKg,
  };
}
