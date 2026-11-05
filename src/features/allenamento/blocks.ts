/**
 * Blocchi di allenamento nelle schermate (docs/FASE2.md § 3, § 5.3, § 11.5). Qui c'è la regia, i motori stanno in
 * `engine/plan` (onda 2B1):
 *
 * - registrazione dei generatori delle proposte di blocco e di obiettivi (`registerProposalBuilder`), al caricamento del
 *   modulo: il foglio della proposta li usa per ricalcolare una proposta superata e per «Un’altra proposta»;
 * - nascita della proposta di blocco (`blockProposalDue`, `ensureBlockProposal`): domenica dell'ultima settimana del
 *   blocco, cambio di fase, obiettivo di allenamento cambiato, primo blocco. Dopo «Tieni il piano attuale» non insiste:
 *   la proposta dopo nasce 4 settimane più tardi, tranne quando cambia l'obiettivo. Niente si applica da solo: nasce
 *   una proposta da approvare;
 * - riepilogo del blocco che finisce (`endingBlockSummary`), salvato quando nasce la proposta del blocco dopo: R10 ha
 *   bisogno del carico previsto più alto dei blocchi chiusi;
 * - righe di Allenamento: proposta aperta, blocco approvato in attesa, settimana del blocco, sedute del blocco;
 * - seduta del giorno nella variante (`dayVariantSession`): quella del controllo del mattino, oppure la piena con «Fai la
 *   piena» o la variante con cui la seduta in corso è partita.
 *
 * Funzioni pure, tranne `ensureBlockProposal` (legge e scrive lo store).
 */
import type { AppData, BlockSummary, ISODate, Plan, PlanProposal, Program, Weekday, WorkoutSession } from '../../domain/types';
import { addDays, daysBetween, weekStart, weekdayOf } from '../../engine/dates';
import { blockReview, blockSummaryOf } from '../../engine/plan/blockReview';
import { blockSessionsText, blockTrigger, blockWeekInfo, buildBlockProposal, buildGoalsProposal, plannedLoad, type BlockTrigger } from '../../engine/plan/build';
import { describeTraining, fromDayLabel, mondayOnOrAfter } from '../../engine/plan/diff';
import { daySession, programInForce, sessionFor, type DaySession } from '../../engine/plan/program';
import { isPendingApproval } from '../../engine/plan/proposals';
import { dayReadiness, floorsDoneThisWeek, readinessText, sessionForVariant, type Variant } from '../../engine/plan/readiness';
import { sessionFocus, type TrainingState } from '../../engine/training';
import { capitalize, plural } from '../../lib/format';
import { useApp } from '../../state/store';
import { findProposal, projectedAppData, registerProposalBuilder, submitProposal } from '../piano/actions';

export { sessionName, sessionWithArticle } from './sessionNames';

// ───────────────────────── Generatori ─────────────────────────

let registered = false;

/** Registra i generatori di blocco e di obiettivi (una volta sola; il modulo lo fa da sé al caricamento). */
export function registerTrainingBuilders(): void {
  if (registered) return;
  registered = true;
  registerProposalBuilder('blocco', buildBlockProposal);
  registerProposalBuilder('obiettivi', buildGoalsProposal);
}

registerTrainingBuilders();

// ───────────────────────── Nascita della proposta di blocco ─────────────────────────

/** Dopo «Tieni il piano attuale» la proposta di blocco dopo nasce alla fine del ciclo ripetuto, non ogni settimana. */
export const BLOCK_REJECT_PAUSE_DAYS = 28;

/** Domenica (0 = lunedì). */
const SUNDAY = 6;

/** Giorno di calendario di un istante salvato ('2026-11-08T…' → '2026-11-08'). */
const dayOf = (at: string | undefined): ISODate | undefined => (at && /^\d{4}-\d{2}-\d{2}/.test(at) ? at.slice(0, 10) : undefined);

export interface BlockDue {
  trigger: BlockTrigger;
  /** Lunedì da cui varrebbe il blocco nuovo. */
  monday: ISODate;
}

/**
 * Serve una proposta di blocco nella giornata (§ 5.3)? Sullo stato già proiettato (le approvate in attesa dentro):
 * - `fine-blocco` solo la domenica dell'ultima settimana del blocco (o del ciclo ripetuto);
 * - `fase`, `obiettivo`, `primo` in qualunque giorno;
 * - mai con un blocco già approvato in attesa, né con una proposta di blocco aperta per lo stesso lunedì;
 * - dopo «Tieni il piano attuale» si aspetta `BLOCK_REJECT_PAUSE_DAYS`, tranne quando cambia l'obiettivo.
 */
export function blockProposalDue(s: Pick<AppData, 'plan'> & Partial<Pick<AppData, 'planner'>>, today: ISODate): BlockDue | null {
  const trigger = blockTrigger(s.plan, today);
  if (!trigger) return null;
  if (trigger === 'fine-blocco' && weekdayOf(today) !== SUNDAY) return null;
  const monday = mondayOnOrAfter(addDays(today, 1));
  const blocks = (s.planner?.proposals ?? []).filter((p) => p.kind === 'blocco');
  if (blocks.some((p) => isPendingApproval(p) && p.effectiveFrom >= weekStart(today))) return null;
  if (blocks.some((p) => p.status === 'aperta' && p.effectiveFrom === monday)) return null;
  if (trigger !== 'obiettivo') {
    const from = addDays(today, -BLOCK_REJECT_PAUSE_DAYS);
    const rejected = blocks.some((p) => p.status === 'scartata' && (dayOf(p.decidedAt) ?? p.effectiveFrom) > from);
    if (rejected) return null;
  }
  return { trigger, monday };
}

/**
 * Riepilogo del blocco in vigore che finisce prima di `monday` (§ 3.11), con il carico previsto più alto delle sue
 * settimane (R10, `peakLoad`), o null senza blocco iniziato. Con `today` prima della fine, la costanza conta fino a
 * ieri. Si salva con `recordBlockSummary` (uno per blocco: un blocco ripetuto senza approvazione aggiorna lo stesso
 * riepilogo).
 */
export function endingBlockSummary(s: AppData, monday: ISODate, today?: ISODate): BlockSummary | null {
  const program = s.plan.program;
  if (!program || !(program.start < monday)) return null;
  // Un blocco interrotto a metà (fase, obiettivo) conta le sedute fino a ieri: le altre non sono ancora mancate.
  const end = today && today < addDays(monday, -1) ? addDays(today, -1) : addDays(monday, -1);
  if (end < program.start) return null;
  const review = blockReview(
    program,
    {
      plan: s.plan,
      workoutLogs: s.workoutLogs ?? [],
      footballLogs: s.footballLogs ?? [],
      checkIns: s.checkIns ?? {},
      painSites: s.profile?.painSites ?? [],
      reviews: s.reviews ?? [],
      physio: s.physio,
    },
    end,
  );
  let peak = 0;
  for (let w = program.start; w < monday; w = addDays(w, 7)) {
    const l = plannedLoad(w, s.plan);
    peak = Math.max(peak, l.football + l.controllable);
  }
  return blockSummaryOf(review, program, peak);
}

export type EnsureResult =
  /** È nata una proposta (o c'era già, aperta, con lo stesso id). */
  | { status: 'nata'; id: string }
  /** Serviva, ma la settimana non lascia nessun giorno per la palestra: restano le sedute di prima (§ 3.12). */
  | { status: 'nessun-giorno' };

/**
 * La proposta di blocco della giornata, se serve (`blockProposalDue`): la costruisce sul piano proiettato, salva il
 * riepilogo del blocco che finisce e la mette tra le proposte aperte. Una proposta già decisa con lo stesso id non si
 * riapre; una superata sì. Sicura da chiamare a ogni apertura: senza obiettivo di allenamento, date della stagione o blocco non fa niente
 * (l'app di prima) e restituisce null.
 */
export function ensureBlockProposal(today: ISODate): EnsureResult | null {
  const s = projectedAppData(useApp.getState());
  const due = blockProposalDue(s, today);
  if (!due) return null;
  let p: PlanProposal | null = null;
  try {
    p = buildBlockProposal({ state: s, today, attempt: 0 });
  } catch {
    return null;
  }
  if (!p) return { status: 'nessun-giorno' };
  // Aperta: c'è già. Approvata o scartata: decisa dall'utente, non si riapre. Superata: la base è tornata quella di prima
  // (un obiettivo cambiato e poi annullato) e la stessa proposta torna aperta.
  const known = findProposal(p.id);
  if (known && known.status !== 'superata') return known.status === 'aperta' ? { status: 'nata', id: known.id } : null;
  const summary = endingBlockSummary(s, p.effectiveFrom, today);
  if (summary) useApp.getState().recordBlockSummary(summary);
  return { status: 'nata', id: submitProposal(p) };
}

// ───────────────────────── Righe di Allenamento ─────────────────────────

/** L'ultima proposta di blocco aperta, se c'è. */
export function openBlockProposal(proposals: readonly PlanProposal[] | undefined): PlanProposal | undefined {
  return (proposals ?? [])
    .filter((p) => p.kind === 'blocco' && p.status === 'aperta')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))[0];
}

/** Il blocco approvato che entra più avanti (§ 5.4, approvate in attesa), se c'è. */
export function pendingBlock(proposals: readonly PlanProposal[] | undefined): PlanProposal | undefined {
  return (proposals ?? []).filter((p) => p.kind === 'blocco' && isPendingApproval(p) && p.patch.program).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))[0];
}

/** «Dal 9 novembre: forza, poi potenza» per la riga del blocco approvato in attesa. */
export function pendingBlockTitle(p: Pick<PlanProposal, 'effectiveFrom' | 'patch'>): string {
  const program = p.patch.program;
  return `${capitalize(fromDayLabel(p.effectiveFrom))}: ${describeTraining(program ?? null)}`;
}

/** Dettaglio del blocco in attesa: «4 settimane · 3 sedute e 1 uscita». */
export function pendingBlockDetail(program: Program): string {
  return `${plural(program.weeks.length, 'settimana', 'settimane')} · ${blockSessionsText(program)}`;
}

/** «Settimana 2 di 4 · carico» (§ 11.5), solo con un blocco in vigore nella data. */
export function blockWeekLabel(plan: Pick<Plan, 'program'> & Partial<Pick<Plan, 'season'>>, iso: ISODate): string | null {
  if (!programInForce(iso, plan)) return null;
  const w = blockWeekInfo(plan, iso);
  return w ? `Settimana ${w.week} di ${w.of} · ${w.kind}` : null;
}

/** Slot nell'ordine delle sedute (A, B, C, poi corsa e richiamo). */
const SLOT_ORDER = ['A', 'B', 'C', 'K', 'R'];

export interface BlockSessionRow {
  slot: string;
  /** La seduta della settimana del blocco (nella data del suo giorno di questa settimana). */
  session: WorkoutSession;
  date: ISODate;
  /** Giorni della settimana tipo con questa seduta (0 = lunedì). */
  weekdays: Weekday[];
  optional: boolean;
}

/**
 * Sedute del blocco in vigore nella settimana di `today`, nell'ordine degli slot, ciascuna con la dose della sua
 * settimana; null senza blocco in vigore (valgono le sedute fisse A, B, C).
 */
export function blockSessions(plan: Plan, today: ISODate): BlockSessionRow[] | null {
  const program = programInForce(today, plan);
  if (!program) return null;
  const monday = weekStart(today);
  const slots = Object.keys(program.sessions).sort((a, b) => (SLOT_ORDER.indexOf(a) + 1 || 99) - (SLOT_ORDER.indexOf(b) + 1 || 99));
  const rows: BlockSessionRow[] = [];
  for (const slot of slots) {
    const days = plan.week.filter((d) => d.gymSessionId === slot);
    const weekdays = days.map((d) => d.weekday);
    const date = weekdays.length ? addDays(monday, weekdays[0]) : today;
    const session = sessionFor(slot, date < program.start ? program.start : date, plan);
    if (!session) continue;
    rows.push({ slot, session, date, weekdays, optional: days.some((d) => Boolean(d.gymOptional)) });
  }
  return rows;
}

// ───────────────────────── Seduta del giorno nella variante ─────────────────────────

export const VARIANT_LABEL: Record<Variant, string> = { piena: 'Piena', ridotta: 'Ridotta', minima: 'Minima' };

/**
 * Seduta del giorno senza la variante del controllo del mattino, con i freni di sicurezza che restano (fermo degli
 * impatti, prova del saltello già fatta, richiamo dopo una partita breve): quella di «Fai la piena». La regola del dolore
 * resta esercizio per esercizio nel lettore. Si ottiene da `daySession` senza il controllo del mattino della data e con
 * le soglie del dolore al massimo, così la variante non scatta.
 */
export function fullDaySession(slot: string, iso: ISODate, state: TrainingState): WorkoutSession | null {
  const checkIns = { ...(state.checkIns ?? {}) };
  delete checkIns[iso];
  const plan: Plan = { ...state.plan, painThreshold: 10, impactThreshold: 10 };
  return daySession(slot, iso, { ...state, plan, checkIns })?.session ?? null;
}

export interface DayVariantSession extends DaySession {
  /** Variante del controllo del mattino (prima della scelta), con il testo «Oggi ridotta: …». */
  suggested: Variant;
  text: string | null;
}

/**
 * Seduta di uno slot nella data con la variante scelta: senza scelta quella del controllo del mattino (`daySession`);
 * `piena` la ignora (`fullDaySession`); `ridotta` o `minima` la ricostruiscono dalla piena, come quando la seduta in
 * corso è partita (il controllo può essere cambiato dopo). Null se lo slot non ha una seduta.
 */
export function dayVariantSession(slot: string, iso: ISODate, state: TrainingState, chosen?: Variant): DayVariantSession | null {
  const ds = daySession(slot, iso, state);
  if (!ds) return null;
  const text = readinessText(ds);
  const base = { suggested: ds.variant, text };
  if (!chosen || chosen === ds.variant) return { ...ds, ...base };
  const full = fullDaySession(slot, iso, state) ?? ds.session;
  if (chosen === 'piena') return { session: full, variant: 'piena', reasons: [], ...base };
  const r = dayReadiness(iso, state, { legs: sessionFocus(full) === 'basso', slot });
  const session = sessionForVariant(full, chosen, floorsDoneThisWeek(iso, state), { noImpact: r.noImpact });
  return { session, variant: chosen, reasons: ds.reasons, ...base };
}

/** Giorni dall'inizio del blocco in vigore e settimana (1 = la prima), per `WorkoutLog.blockId` e `weekIndex`. */
export function blockStamp(plan: Pick<Plan, 'program'> & Partial<Pick<Plan, 'season'>>, iso: ISODate, slot: string): { blockId: string; weekIndex: number } | null {
  const program = programInForce(iso, plan);
  if (!program || !program.sessions[slot]) return null;
  return { blockId: program.blockId, weekIndex: Math.floor(daysBetween(program.start, iso) / 7) + 1 };
}
