/**
 * Ciclo di vita delle proposte del piano per le schermate (docs/FASE2.md § 5): nascita, apertura, superamento e
 * ricalcolo, approvazione con «Annulla», «Tieni il piano attuale», «Un’altra proposta», ritorno a una versione, menù
 * dallo storico, interruzione della rifinitura del coach. Le funzioni pure stanno in `engine/plan` (base, id, toppe,
 * differenze), lo stato e le transazioni nello store: qui c'è solo la regia, più l'ora vera e gli avvisi.
 *
 * **Generatori registrati.** Chi costruisce un tipo di proposta lo registra una volta con `registerProposalBuilder`
 * (menù: onda 2A; blocco e obiettivi: onda 2B). Il foglio li usa per ricalcolare una proposta superata e per «Un’altra
 * proposta» (`attempt + 1`); senza generatore la riga non compare e una proposta superata dice solo che non vale più.
 * Il ritorno a una versione si ricalcola da qui (`restoreTo`).
 *
 * **Rifinitura del coach.** Chi la lancia registra il suo `AbortController` con `registerCoachRun`: approvare o scartare
 * la proposta prima della risposta la interrompe (niente costi per una risposta che non servirebbe, § 5.6).
 *
 * **Piano proiettato.** Una proposta approvata entra nel piano il suo primo giorno (§ 5.4, decorrenza): fino ad allora
 * è «in attesa». Basi, superamento, differenze e generatori lavorano sul piano proiettato (`proposalStateOf`, con le
 * approvate in attesa), così una proposta nuova parte da quello che varrà, non da quello di oggi.
 */
import type { AppData, DiffItem, ISODate, MenuWeek, PlanChangeKind, PlanProposal, PlanVersion } from '../../domain/types';
import { addDays, daysBetween, formatMonth, formatWeekRange, fromISO, weekdayOf, weekStart } from '../../engine/dates';
import { goalDeltaOf } from '../../engine/energy';
import { menuWeekInForce, repeatedMenuWeek } from '../../engine/menu';
import { diffMenus, diffPatch, fromDayLabel, restoredPatch, restoreStart, restoreTo, sortDiff, type DiffOptions } from '../../engine/plan/diff';
import {
  beforeOf,
  isPendingApproval,
  isSuperseded,
  planBasis,
  projectedState,
  proposalId,
  stableStringify,
  type ProposalState,
} from '../../engine/plan/proposals';
import { capitalize, fmtNumber, WEEKDAY_LONG } from '../../lib/format';
import { hashString } from '../../lib/id';
import { useApp, useUi } from '../../state/store';

// ───────────────────────── Generatori ─────────────────────────

/** Ingressi di un generatore di proposte: lo stato, la giornata del piano e il tentativo. */
export interface BuildContext {
  /** Lo stato con il piano e il profilo proiettati (le approvate in attesa già dentro, `projectedAppData`). */
  state: AppData;
  today: ISODate;
  /** 0 alla nascita; «Un’altra proposta» passa quello della proposta + 1; il ricalcolo tiene quello della proposta. */
  attempt: number;
  /** La proposta da cui si parte (ricalcolo o «Un’altra proposta»). */
  previous?: PlanProposal;
}

/** Costruisce una proposta aperta (con `planBasis` dello stato e `proposalId`), oppure null se non ce n'è una. */
export type ProposalBuilder = (ctx: BuildContext) => PlanProposal | null;

const builders = new Map<PlanChangeKind, ProposalBuilder>();

/** Registra il generatore di un tipo di proposta; restituisce la funzione che lo toglie. */
export function registerProposalBuilder(kind: PlanChangeKind, builder: ProposalBuilder): () => void {
  builders.set(kind, builder);
  return () => {
    if (builders.get(kind) === builder) builders.delete(kind);
  };
}

export function hasProposalBuilder(kind: PlanChangeKind): boolean {
  return builders.has(kind);
}

// ───────────────────────── Rifinitura del coach ─────────────────────────

const coachRuns = new Map<string, AbortController>();

/** Registra la rifinitura in corso di una proposta (ne interrompe un'altra sulla stessa); restituisce chi la toglie. */
export function registerCoachRun(proposalId: string, ctrl: AbortController): () => void {
  const prev = coachRuns.get(proposalId);
  if (prev && prev !== ctrl) prev.abort();
  coachRuns.set(proposalId, ctrl);
  return () => {
    if (coachRuns.get(proposalId) === ctrl) coachRuns.delete(proposalId);
  };
}

/** Interrompe la rifinitura del coach di una proposta, se c'è. */
export function abortCoachRun(proposalId: string): void {
  const ctrl = coachRuns.get(proposalId);
  if (!ctrl) return;
  coachRuns.delete(proposalId);
  ctrl.abort();
}

export function isCoachRunning(proposalId: string): boolean {
  return coachRuns.has(proposalId);
}

// ───────────────────────── Lettura ─────────────────────────

/** Stato delle funzioni delle proposte: il piano proiettato, con le approvate in attesa (§ 5.4). */
export const proposalStateOf = (s: Pick<AppData, 'plan' | 'profile' | 'physio'> & Partial<Pick<AppData, 'planner'>>): ProposalState =>
  projectedState({ plan: s.plan, profile: s.profile, physio: s.physio }, s.planner?.proposals);

/** Lo stato con piano e profilo proiettati: quello che ricevono i generatori. Senza approvate in attesa è lo stesso. */
export function projectedAppData<S extends Pick<AppData, 'plan' | 'profile' | 'physio'> & Partial<Pick<AppData, 'planner'>>>(s: S): S {
  const p = proposalStateOf(s);
  return p.plan === s.plan && p.profile === s.profile ? s : { ...s, plan: p.plan, profile: p.profile };
}

export function findProposal(id: string, s: Pick<AppData, 'planner'> = useApp.getState()): PlanProposal | undefined {
  return s.planner?.proposals.find((p) => p.id === id);
}

/** L'ultima proposta aperta di un tipo (e di un inizio, se dato). */
export function openProposalOf(kind: PlanChangeKind, s: Pick<AppData, 'planner'> = useApp.getState(), effectiveFrom?: ISODate): PlanProposal | undefined {
  const list = (s.planner?.proposals ?? []).filter((p) => p.status === 'aperta' && p.kind === kind && (!effectiveFrom || p.effectiveFrom === effectiveFrom));
  return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))[0];
}

/**
 * Opzioni delle differenze: i nomi degli esercizi del fisioterapista, il menù in vigore e, con profilo e revisioni, il
 * deficit in vigore anche quando `Plan.goalDeltaKcal` non è ancora scritto (`goalDeltaOf`, § 2.1).
 */
export function diffOptionsOf(s: Pick<AppData, 'plan' | 'physio'> & Partial<Pick<AppData, 'profile' | 'reviews'>>): DiffOptions {
  const physio = new Map((s.physio?.exercises ?? []).map((e) => [e.id, e.name]));
  return {
    exerciseName: (id) => physio.get(id),
    menuInForce: (monday) => menuWeekInForce(monday, s.plan),
    ...(s.profile ? { deltaInForce: goalDeltaOf(s.plan, s.profile, s.reviews ?? []) } : {}),
  };
}

// ───────────────────────── Nascita e apertura ─────────────────────────

/** La proposta con l'ora vera di creazione (i motori non leggono l'orologio). */
export function stamped(p: PlanProposal, now: Date = new Date()): PlanProposal {
  return { ...p, createdAt: now.toISOString() };
}

export function openProposalSheet(id: string): void {
  useUi.getState().open({ type: 'planProposal', id });
}

/**
 * Salva una proposta nata da un motore (supera le aperte dello stesso tipo e inizio) e, con `open`, apre il foglio.
 * Una proposta già decisa con lo stesso id (stessa base e stesso tentativo) non si riapre: resta com'era. Una superata
 * con lo stesso id torna aperta: la base è tornata quella di prima.
 */
export function submitProposal(p: PlanProposal, opts: { open?: boolean } = {}): string {
  useApp.getState().saveProposal(p.createdAt.includes('T') ? p : stamped(p));
  if (opts.open) openProposalSheet(p.id);
  return p.id;
}

/** Segna superata una proposta aperta (azione del foglio, con `useApp.setState` come chiede SPEC § 6). */
function markSuperseded(id: string): void {
  const at = new Date().toISOString();
  useApp.setState((s) => {
    const list = s.planner?.proposals ?? [];
    if (!list.some((p) => p.id === id && p.status === 'aperta')) return {};
    return { planner: { ...(s.planner ?? { proposals: [] }), proposals: list.map((p) => (p.id === id ? { ...p, status: 'superata', decidedAt: at } : p)) } };
  });
}

/** Versione da cui è nata una proposta di ritorno: quella con la stessa toppa (un blocco spostato al suo lunedì). */
function versionOfReturn(p: PlanProposal, versions: readonly PlanVersion[] | undefined): PlanVersion | undefined {
  const key = stableStringify(p.patch);
  return [...(versions ?? [])].reverse().find((v) => stableStringify(restoredPatch(v.after, p.effectiveFrom)) === key);
}

function rebuild(p: PlanProposal, today: ISODate, attempt: number): PlanProposal | null {
  // Un menù dallo storico non ha un generatore: il motore darebbe un altro menù sotto il titolo «Come la settimana …».
  if (isReuseProposal(p)) return null;
  const s = projectedAppData(useApp.getState());
  if (p.kind === 'ritorno') {
    const v = versionOfReturn(p, s.planVersions);
    return v ? restoreTo(v, proposalStateOf(s), today, diffOptionsOf(s)) : null;
  }
  const builder = builders.get(p.kind);
  if (!builder) return null;
  try {
    return builder({ state: s, today, attempt, previous: p });
  } catch {
    return null;
  }
}

export interface RefreshResult {
  /** La proposta da mostrare: la stessa, oppure quella ricalcolata. */
  id: string;
  /** Ricalcolata adesso o sostituita da una più nuova: il foglio dice «Aggiornata con le ultime modifiche». */
  refreshed: boolean;
}

/**
 * All'apertura del foglio (§ 5.2): se la base del suo tipo è cambiata o il giorno per approvarla è passato, la proposta
 * diventa superata e se ne calcola una nuova con il generatore del suo tipo (stesso tentativo). Se nel frattempo è nata
 * un'altra proposta aperta dello stesso tipo, si mostra quella. Null se la proposta non c'è.
 */
export function refreshProposal(id: string, today: ISODate): RefreshResult | null {
  const s = useApp.getState();
  const p = findProposal(id, s);
  if (!p) return null;
  if (p.status === 'approvata' || p.status === 'scartata') return { id, refreshed: false };
  if (p.status === 'aperta' && !isSuperseded(p, proposalStateOf(s), today)) return { id, refreshed: false };
  if (p.status === 'aperta') markSuperseded(id);
  const newer = openProposalOf(p.kind, useApp.getState());
  if (newer && newer.id !== id && !isSuperseded(newer, proposalStateOf(useApp.getState()), today)) return { id: newer.id, refreshed: true };
  const next = rebuild(p, today, p.attempt ?? 0);
  if (!next || next.id === id || next.status !== 'aperta') return { id, refreshed: false };
  // Una superata con lo stesso id torna aperta (base tornata quella di prima); una decisa dall'utente no.
  const known = findProposal(next.id);
  if (known && known.status !== 'aperta' && known.status !== 'superata') return { id, refreshed: false };
  submitProposal(next);
  return { id: next.id, refreshed: true };
}

// ───────────────────────── Decisioni ─────────────────────────

/** "da domani", "da lunedì", "dal 16 novembre". */
export function startLabel(effectiveFrom: ISODate, today: ISODate): string {
  const days = daysBetween(today, effectiveFrom);
  if (days === 1) return 'da domani';
  if (days > 1 && days < 7) return `da ${WEEKDAY_LONG[weekdayOf(effectiveFrom)]}`;
  return fromDayLabel(effectiveFrom);
}

/** Testo dell'avviso dopo l'approvazione: «Nuovo blocco da lunedì», «Nuovi obiettivi da domani». */
export function approvedText(p: Pick<PlanProposal, 'kind' | 'effectiveFrom'>, today: ISODate): string {
  const from = startLabel(p.effectiveFrom, today);
  switch (p.kind) {
    case 'blocco':
      return `Nuovo blocco ${from}`;
    case 'menu':
      return `Menù nuovo ${from}`;
    case 'obiettivi':
      return `Nuovi obiettivi ${from}`;
    case 'ritorno':
      return `Versione di prima ${from}`;
  }
}

export type ApproveOutcome =
  | { status: 'approvata'; versionId?: string }
  /** Non si poteva più approvare: `id` è la proposta da mostrare al suo posto (ricalcolata se c'era un generatore). */
  | { status: 'superata'; id: string; refreshed: boolean }
  | { status: 'assente' };

/**
 * «Approva» (§ 5.4): interrompe la rifinitura del coach, approva in una sola transazione e mostra l'avviso con «Annulla»
 * per 5 secondi. Una proposta superata non si approva: si ricalcola e il foglio mostra quella nuova.
 */
export function approveProposal(id: string, today: ISODate): ApproveOutcome {
  const p = findProposal(id);
  if (!p) return { status: 'assente' };
  abortCoachRun(id);
  const res = useApp.getState().approveProposal(id, today);
  if (res) {
    useUi.getState().toast(approvedText(p, today), 'good', { actionLabel: 'Annulla', onAction: () => undoApproval(id) });
    return { status: 'approvata', versionId: res.versionId };
  }
  const r = refreshProposal(id, today);
  return { status: 'superata', id: r?.id ?? id, refreshed: r?.refreshed ?? false };
}

/** «Annulla» dell'avviso: rimette i valori di prima (se la toppa era già entrata) e toglie la versione; la proposta torna aperta. */
export function undoApproval(id: string): void {
  useApp.getState().undoApproval(id);
  useUi.getState().toast('Torna il piano di prima', 'neutral');
}

/** «Tieni il piano attuale». */
export function keepCurrentPlan(id: string): void {
  abortCoachRun(id);
  useApp.getState().rejectProposal(id);
}

/** Proposte di menù nate dallo storico («Usalo la prossima settimana»): tentativi da qui in su, mai dal generatore. */
export const REUSE_ATTEMPT = 1000;

export const isReuseProposal = (p: Pick<PlanProposal, 'kind' | 'attempt'>) => p.kind === 'menu' && (p.attempt ?? 0) >= REUSE_ATTEMPT;

/** «Un’altra proposta» c'è solo per blocchi e menù aperti, con un generatore registrato (§ 11.3). */
export function canAskAnother(p: Pick<PlanProposal, 'kind' | 'status' | 'attempt'>): boolean {
  return (p.kind === 'blocco' || p.kind === 'menu') && p.status === 'aperta' && builders.has(p.kind) && !isReuseProposal(p);
}

/** «Un’altra proposta»: stesso calcolo con `attempt + 1`; la nuova supera la vecchia. Restituisce il suo id, o null. */
export function anotherProposal(id: string, today: ISODate): string | null {
  const p = findProposal(id);
  if (!p || !canAskAnother(p)) return null;
  const next = rebuild(p, today, (p.attempt ?? 0) + 1);
  if (!next || next.id === id) return null;
  abortCoachRun(id);
  submitProposal(next);
  if (next.effectiveFrom !== p.effectiveFrom) markSuperseded(id);
  return next.id;
}

// ───────────────────────── Storico ─────────────────────────

/**
 * «Torna a questa versione»: nasce una proposta di ritorno da domani (con un blocco, dal primo lunedì) e si apre il
 * foglio. Se il piano proiettato ha già i valori di quella versione, o le differenze sono nessuna, non nasce niente.
 */
export function restoreVersion(versionId: string, today: ISODate): { id: string } | 'uguale' | null {
  const s = projectedAppData(useApp.getState());
  const v = s.planVersions?.find((x) => x.id === versionId);
  if (!v) return null;
  const p = restoreTo(v, proposalStateOf(s), today, diffOptionsOf(s));
  if (!p.diff.length || stableStringify(beforeOf(s.plan, s.profile, v.after)) === stableStringify(v.after)) {
    useUi.getState().toast('Il piano è già così', 'neutral');
    return 'uguale';
  }
  submitProposal(stamped(p), { open: true });
  return { id: p.id };
}

/** Lunedì della settimana dopo la giornata del piano. */
export const nextMonday = (today: ISODate): ISODate => addDays(weekStart(today), 7);

/**
 * Proposta di menù per il lunedì dopo con un menù approvato in passato (§ 5.5, «Usalo la prossima settimana»). Pura:
 * la base è quella del piano di oggi, il tentativo è fuori dalla serie del generatore, così l'id non si scontra.
 */
export function reuseMenuProposal(
  s: Pick<AppData, 'plan' | 'profile' | 'physio'> & Partial<Pick<AppData, 'planner'>>,
  sourceMonday: ISODate,
  today: ISODate,
): PlanProposal | null {
  const week = s.plan.menus?.[sourceMonday];
  if (!week) return null;
  const monday = nextMonday(today);
  const basis = planBasis('menu', proposalStateOf(s));
  const attempt = REUSE_ATTEMPT + (hashString(sourceMonday) % 1000);
  const current = diffOptionsOf(s).menuInForce?.(monday);
  const diff = sortDiff(diffMenus(current, week));
  const meals = diff.filter((d) => d.area === 'pasto' && !d.label.endsWith('Preparazione della domenica')).length;
  const changes = meals ? (meals === 1 ? 'cambia un pasto' : `cambiano ${fmtNumber(meals)} pasti`) : 'stessi pasti';
  return {
    id: proposalId('menu', monday, basis, attempt),
    kind: 'menu',
    status: 'aperta',
    createdAt: today,
    effectiveFrom: monday,
    basis,
    attempt,
    title: `Menù ${formatWeekRange(monday)}`,
    subtitle: `Come la settimana ${formatWeekRange(sourceMonday)} · ${changes}`,
    patch: { menus: { [monday]: JSON.parse(JSON.stringify(week)) as MenuWeek } },
    diff,
    reasons: [`È il menù che avevi approvato per la settimana ${formatWeekRange(sourceMonday)}.`],
    source: 'motore',
  };
}

/** «Usalo la prossima settimana»: salva la proposta e apre il foglio; 'uguale' se il menù in vigore è già quello. */
export function reuseMenu(sourceMonday: ISODate, today: ISODate): { id: string } | 'uguale' | null {
  const p = reuseMenuProposal(projectedAppData(useApp.getState()), sourceMonday, today);
  if (!p) return null;
  if (!p.diff.length) {
    useUi.getState().toast('La prossima settimana ha già questo menù', 'neutral');
    return 'uguale';
  }
  submitProposal(stamped(p), { open: true });
  return { id: p.id };
}

export type HistoryStatus = 'in-vigore' | 'in-arrivo' | 'passata';

/** Una riga dello storico del piano: una versione (blocco, obiettivi, ritorno) o un menù approvato. */
export interface HistoryEntry {
  key: string;
  kind: 'versione' | 'menu';
  effectiveFrom: ISODate;
  /** Per raggruppare per mese: «Novembre 2026». */
  month: string;
  title: string;
  subtitle: string;
  status: HistoryStatus;
  version?: PlanVersion;
  monday?: ISODate;
}

const KIND_LABEL: Record<PlanVersion['kind'], string> = { blocco: 'Blocco', obiettivi: 'Obiettivi', ritorno: 'Ritorno a una versione' };

/** «Novembre 2026». */
export function monthLabel(iso: ISODate): string {
  return `${capitalize(formatMonth(iso))} ${fromISO(iso).getFullYear()}`;
}

/**
 * Storico del piano (§ 5.5): versioni e menù approvati, dal più recente. Una versione è «in vigore» quando i campi che
 * aveva toccato valgono come li aveva messi (`after`) nel piano proiettato e la sua toppa è già entrata; «in arrivo»
 * quando è approvata in attesa (o vale da un giorno dopo oggi); «passata» quando una versione dopo l'ha cambiata. Un menù
 * è in vigore quando è quello della settimana di oggi, approvato per quel lunedì o ripetuto (`repeatedMenuWeek`).
 */
export function planHistory(s: Pick<AppData, 'plan' | 'profile' | 'planVersions'> & Partial<Pick<AppData, 'planner'>>, today: ISODate): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  const projected = projectedState({ plan: s.plan, profile: s.profile }, s.planner?.proposals);
  const pending = new Set((s.planner?.proposals ?? []).filter(isPendingApproval).map((p) => p.id));
  for (const v of s.planVersions ?? []) {
    const current = stableStringify(beforeOf(projected.plan, projected.profile, v.after)) === stableStringify(v.after);
    const waiting = Boolean(v.proposalId && pending.has(v.proposalId));
    out.push({
      key: `v:${v.id}`,
      kind: 'versione',
      effectiveFrom: v.effectiveFrom,
      month: monthLabel(v.effectiveFrom),
      title: v.title,
      subtitle: `${KIND_LABEL[v.kind]} · ${fromDayLabel(v.effectiveFrom)}`,
      status: current ? (waiting || v.effectiveFrom > today ? 'in-arrivo' : 'in-vigore') : 'passata',
      version: v,
    });
  }
  const thisMonday = weekStart(today);
  // Senza un menù approvato per questa settimana vale l'ultimo approvato delle 4 prima, se è di stagione (§ 4.10).
  const repeated = s.plan.menus?.[thisMonday] ? null : repeatedMenuWeek(thisMonday, s.plan);
  for (const monday of Object.keys(s.plan.menus ?? {})) {
    const again = repeated !== null && s.plan.menus?.[monday] === repeated && monday < thisMonday;
    out.push({
      key: `m:${monday}`,
      kind: 'menu',
      effectiveFrom: monday,
      month: monthLabel(monday),
      title: `Menù ${formatWeekRange(monday)}`,
      subtitle: again ? 'Menù approvato · si ripete questa settimana' : 'Menù approvato',
      status: monday === thisMonday || again ? 'in-vigore' : monday > thisMonday ? 'in-arrivo' : 'passata',
      monday,
    });
  }
  const at = (e: HistoryEntry) => e.version?.at ?? '';
  return out.sort((a, b) => (a.effectiveFrom !== b.effectiveFrom ? (a.effectiveFrom < b.effectiveFrom ? 1 : -1) : at(a) < at(b) ? 1 : at(a) > at(b) ? -1 : 0));
}

/**
 * Differenze di una riga dello storico rispetto al piano proiettato (un menù: rispetto alla settimana dopo); un blocco
 * come ripartirebbe con «Torna a questa versione».
 */
export function historyDiff(
  entry: HistoryEntry,
  state: Pick<AppData, 'plan' | 'profile' | 'physio'> & Partial<Pick<AppData, 'reviews' | 'planner'>>,
  today: ISODate,
): DiffItem[] {
  const s = projectedAppData(state);
  const opts = diffOptionsOf(s);
  if (entry.version) {
    const after = entry.version.after;
    return sortDiff(diffPatch(s.plan, s.profile, restoredPatch(after, restoreStart(after, today)), opts));
  }
  const week = entry.monday ? s.plan.menus?.[entry.monday] : undefined;
  if (!week) return [];
  return sortDiff(diffMenus(opts.menuInForce?.(nextMonday(today)), week));
}
