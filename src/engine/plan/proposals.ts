/**
 * Ciclo di vita delle proposte del piano (docs/FASE2.md § 5): funzioni pure, senza orologio né caso.
 *
 * - `planBasis(kind, state)`: impronta delle sole parti del piano che quel tipo di proposta legge (§ 5.2). Pesate,
 *   diari, controlli del mattino, sedute registrate e spunte non ci sono: non cambiano né l'id né lo stato di una
 *   proposta aperta.
 * - `proposalId(kind, effectiveFrom, basis, attempt)`: stessa base e stesso tentativo → stesso id (rigenerare non
 *   duplica); «Un’altra proposta» rifà il calcolo con `attempt + 1`.
 * - `applyPatch` e `beforeOf`: la toppa sostituisce solo i campi che nomina; `beforeOf` dà i valori di prima degli
 *   stessi campi, così `applyPatch(applyPatch(p, x), beforeOf(p, x))` torna a `p` (test a proprietà).
 * - `isSuperseded(p, state, today)`: una proposta aperta è superata quando la base del suo tipo è cambiata o quando è
 *   passato l'ultimo giorno in cui si poteva approvare (`approvableUntil`, assente = il giorno prima dell'inizio).
 *
 * Il lunedì e il mese di un menù non entrano nella base: stanno già nell'id, attraverso `effectiveFrom`.
 * Per una proposta di `ritorno` la base comprende la toppa della versione di partenza e i valori attuali dei campi
 * che tocca: chi la crea passa la toppa in `state.patch` (è la stessa che finisce in `PlanProposal.patch`).
 */
import type {
  AppData,
  ISODate,
  MenuWeek,
  Plan,
  PlanChangeKind,
  PlanPatch,
  PlanProposal,
  Profile,
} from '../../domain/types';
import { addDays } from '../dates';
import { hashString } from '../../lib/id';

/** Stato letto dalle funzioni delle proposte: piano, profilo ed esercizi del fisioterapista. */
export interface ProposalState extends Pick<AppData, 'plan' | 'profile' | 'physio'> {
  /** Solo per `ritorno`: la toppa della versione di partenza (i campi che la base legge). */
  patch?: PlanPatch;
}

/** Campi di una toppa, nell'ordine in cui si applicano. */
export const PATCH_KEYS = ['week', 'seasonWeek', 'program', 'menus', 'training', 'targets', 'goal', 'goalDeltaKcal'] as const;
export type PatchKey = (typeof PATCH_KEYS)[number];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * JSON con le chiavi in ordine alfabetico e senza i valori `undefined`: due oggetti uguali danno lo stesso testo anche
 * se le chiavi sono state scritte in ordine diverso (normalizzazione, copie, backup).
 */
export function stableStringify(v: unknown): string {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'number' && !Number.isFinite(v)) return 'null';
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : stableStringify(x))).join(',')}]`;
  const keys = Object.keys(v as Record<string, unknown>)
    .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(',')}}`;
}

const fingerprint = (v: unknown): string => hashString(stableStringify(v)).toString(36);

/** Valori attuali dei campi che una toppa tocca (le chiavi dei menù solo quelle nominate). */
function touchedValues(plan: Plan, profile: Profile, patch: PlanPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of PATCH_KEYS) {
    if (!(k in patch) || patch[k] === undefined) continue;
    if (k === 'goal') out.goal = profile.goal;
    else if (k === 'menus') {
      const menus: Record<string, unknown> = {};
      for (const day of Object.keys(patch.menus ?? {})) menus[day] = plan.menus?.[day] ?? null;
      out.menus = menus;
    } else out[k] = plan[k] ?? null;
  }
  return out;
}

/** Impronta delle parti del piano che il tipo di proposta legge (§ 5.2). */
export function planBasis(kind: PlanChangeKind, state: ProposalState): string {
  const { plan, profile } = state;
  switch (kind) {
    case 'blocco':
      return fingerprint({
        kind,
        week: plan.week,
        training: plan.training,
        season: plan.season,
        program: plan.program,
        weekOverrides: plan.weekOverrides,
        impactHold: plan.impactHold,
        painSites: profile.painSites,
        physio: state.physio,
      });
    case 'menu':
      // Tipi di giorno della settimana (settimana tipo, blocco, settimane alleggerite), obiettivi ed esclusioni.
      return fingerprint({
        kind,
        week: plan.week,
        program: plan.program,
        weekOverrides: plan.weekOverrides,
        targets: plan.targets,
        goalDeltaKcal: plan.goalDeltaKcal,
        exclusions: plan.exclusions,
      });
    case 'obiettivi':
      return fingerprint({ kind, goal: profile.goal, targets: plan.targets, goalDeltaKcal: plan.goalDeltaKcal, training: plan.training });
    case 'ritorno': {
      const patch = state.patch ?? {};
      return fingerprint({ kind, from: patch, current: touchedValues(plan, profile, patch) });
    }
  }
}

/** Id di una proposta: tipo e inizio leggibili, poi l'impronta di tipo, inizio, base e tentativo. */
export function proposalId(kind: PlanChangeKind, effectiveFrom: ISODate, basis: string, attempt: number): string {
  const n = Number.isFinite(attempt) ? Math.max(0, Math.trunc(attempt)) : 0;
  return `${kind}-${effectiveFrom}-${hashString(`${kind}|${effectiveFrom}|${basis}|${n}`).toString(36)}`;
}

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/**
 * Applica una toppa: ogni campo nominato sostituisce quello del piano (o del profilo per `goal`); `null` lo toglie.
 * I menù si fondono per lunedì (`null` toglie quella settimana). Non cambia gli argomenti.
 */
export function applyPatch(plan: Plan, profile: Profile, patch: PlanPatch): { plan: Plan; profile: Profile } {
  const next: Plan = { ...plan };
  let nextProfile = profile;
  if (patch.week !== undefined) next.week = clone(patch.week);
  if (patch.seasonWeek !== undefined) {
    if (patch.seasonWeek === null) delete next.seasonWeek;
    else next.seasonWeek = clone(patch.seasonWeek);
  }
  if (patch.program !== undefined) {
    if (patch.program === null) delete next.program;
    else next.program = clone(patch.program);
  }
  if (patch.menus !== undefined && isObj(patch.menus)) {
    const menus: Record<ISODate, MenuWeek> = { ...(plan.menus ?? {}) };
    for (const [day, week] of Object.entries(patch.menus)) {
      if (week === null || week === undefined) delete menus[day];
      else menus[day] = clone(week);
    }
    if (Object.keys(menus).length) next.menus = menus;
    else delete next.menus;
  }
  if (patch.training !== undefined) {
    if (patch.training === null) delete next.training;
    else next.training = clone(patch.training);
  }
  if (patch.targets !== undefined) next.targets = clone(patch.targets);
  if (patch.goal !== undefined) nextProfile = { ...profile, goal: patch.goal };
  if (patch.goalDeltaKcal !== undefined) {
    if (patch.goalDeltaKcal === null || !Number.isFinite(patch.goalDeltaKcal)) delete next.goalDeltaKcal;
    else next.goalDeltaKcal = patch.goalDeltaKcal;
  }
  return { plan: next, profile: nextProfile };
}

/** Valori di prima dei soli campi che la toppa tocca: riapplicati con `applyPatch` rimettono il piano com'era. */
export function beforeOf(plan: Plan, profile: Profile, patch: PlanPatch): PlanPatch {
  const out: PlanPatch = {};
  if (patch.week !== undefined) out.week = clone(plan.week);
  if (patch.seasonWeek !== undefined) out.seasonWeek = plan.seasonWeek ? clone(plan.seasonWeek) : null;
  if (patch.program !== undefined) out.program = plan.program ? clone(plan.program) : null;
  if (patch.menus !== undefined && isObj(patch.menus)) {
    const menus: Record<ISODate, MenuWeek | null> = {};
    for (const day of Object.keys(patch.menus)) {
      const cur = plan.menus?.[day];
      menus[day] = cur ? clone(cur) : null;
    }
    out.menus = menus;
  }
  if (patch.training !== undefined) out.training = plan.training ? clone(plan.training) : null;
  if (patch.targets !== undefined) out.targets = clone(plan.targets);
  if (patch.goal !== undefined) out.goal = profile.goal;
  if (patch.goalDeltaKcal !== undefined) {
    out.goalDeltaKcal = typeof plan.goalDeltaKcal === 'number' && Number.isFinite(plan.goalDeltaKcal) ? plan.goalDeltaKcal : null;
  }
  return out;
}

/** Ultimo giorno in cui la proposta si può approvare: `approvableUntil`, altrimenti il giorno prima dell'inizio. */
export function lastApprovableDay(p: Pick<PlanProposal, 'approvableUntil' | 'effectiveFrom'>): ISODate {
  return p.approvableUntil ?? addDays(p.effectiveFrom, -1);
}

/**
 * Proposta superata: segnata così, oppure aperta con la base del suo tipo cambiata o oltre l'ultimo giorno
 * approvabile. Le proposte approvate o scartate non sono superate.
 */
export function isSuperseded(p: PlanProposal, state: ProposalState, today: ISODate): boolean {
  if (p.status === 'superata') return true;
  if (p.status !== 'aperta') return false;
  if (today > lastApprovableDay(p)) return true;
  const basis = planBasis(p.kind, p.kind === 'ritorno' ? { ...state, patch: p.patch } : state);
  return basis !== p.basis;
}
