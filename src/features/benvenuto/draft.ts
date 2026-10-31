/**
 * Bozza del benvenuto: se l'app si chiude a metà, si riparte dal passo dove eri.
 * Resta solo su questo dispositivo (localStorage) e si cancella a fine benvenuto o con "Azzera tutto".
 */
import type { Plan, Profile } from '../../domain/types';

const KEY = 'ritmo:benvenuto';

export interface OnboardingDraft {
  v: 1;
  step: number;
  profile: Profile;
  plan: Plan;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function loadDraft(): OnboardingDraft | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as unknown;
    if (!isObj(d) || d.v !== 1 || !isObj(d.profile) || !isObj(d.plan) || typeof d.step !== 'number') return null;
    const plan = d.plan as unknown as Plan;
    if (!Array.isArray(plan.week) || plan.week.length !== 7 || !isObj(plan.sleep) || !Array.isArray(plan.supplements)) return null;
    return d as unknown as OnboardingDraft;
  } catch {
    return null;
  }
}

export function saveDraft(d: OnboardingDraft): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage non disponibile: si continua senza bozza */
  }
}

export function clearDraft(): void {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    /* niente da fare */
  }
}
