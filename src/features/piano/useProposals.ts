/**
 * Hook delle proposte del piano (docs/FASE2.md § 5) per le schermate: leggono lo store con riferimenti stabili e non
 * scrivono niente (le azioni stanno in `actions.ts`).
 *
 * - `useProposal(id)`: una proposta per id;
 * - `useOpenProposal(kind, effectiveFrom?)`: l'ultima aperta di un tipo, per la card di Allenamento o della Spesa;
 * - `useOpenProposals()`: tutte le aperte, dalla più recente;
 * - `useProposalState()`: piano, profilo ed esercizi del fisioterapista, per `planBasis` e `isSuperseded`;
 * - `usePlanHistory(today)`: le righe dello Storico del piano.
 */
import { useMemo } from 'react';
import type { ISODate, PlanChangeKind, PlanProposal } from '../../domain/types';
import type { ProposalState } from '../../engine/plan/proposals';
import { useApp } from '../../state/store';
import { planHistory, type HistoryEntry } from './actions';

const EMPTY: PlanProposal[] = [];

function useProposalList(): PlanProposal[] {
  return useApp((s) => s.planner?.proposals) ?? EMPTY;
}

export function useProposal(id: string | undefined): PlanProposal | undefined {
  const list = useProposalList();
  return useMemo(() => (id ? list.find((p) => p.id === id) : undefined), [list, id]);
}

export function useOpenProposals(): PlanProposal[] {
  const list = useProposalList();
  return useMemo(
    () => list.filter((p) => p.status === 'aperta').sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)),
    [list],
  );
}

export function useOpenProposal(kind: PlanChangeKind, effectiveFrom?: ISODate): PlanProposal | undefined {
  const open = useOpenProposals();
  return useMemo(() => open.find((p) => p.kind === kind && (!effectiveFrom || p.effectiveFrom === effectiveFrom)), [open, kind, effectiveFrom]);
}

export function useProposalState(): ProposalState {
  const plan = useApp((s) => s.plan);
  const profile = useApp((s) => s.profile);
  const physio = useApp((s) => s.physio);
  return useMemo(() => ({ plan, profile, physio }), [plan, profile, physio]);
}

export function usePlanHistory(today: ISODate): HistoryEntry[] {
  const plan = useApp((s) => s.plan);
  const profile = useApp((s) => s.profile);
  const planVersions = useApp((s) => s.planVersions);
  return useMemo(() => planHistory({ plan, profile, planVersions }, today), [plan, profile, planVersions, today]);
}
