/**
 * Blocchi nelle schermate (docs/FASE2.md § 3.1, § 3.9, § 5.3, § 11.5): generatori registrati, nascita della proposta di
 * blocco senza insistere, riepilogo del blocco che finisce, pillola della settimana, sedute del blocco, seduta del giorno
 * nella variante scelta e campi del registro. Dati inventati e generici, nessuna rete.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppData, CheckIn, Plan, PlanProposal, Program, TrainingGoal } from '../../domain/types';
import { defaultAppData, defaultPlan } from '../../data/defaults';
import { addDays } from '../../engine/dates';
import { buildBlock } from '../../engine/plan/build';
import { daySession, sessionFor } from '../../engine/plan/program';
import { itemLevel } from '../../engine/plan/limits';
import { useApp, useUi } from '../../state/store';
import { hasProposalBuilder } from '../piano/actions';
import {
  BLOCK_REJECT_PAUSE_DAYS,
  blockProposalDue,
  blockSessions,
  blockStamp,
  blockWeekLabel,
  dayVariantSession,
  endingBlockSummary,
  ensureBlockProposal,
  fullDaySession,
  openBlockProposal,
  pendingBlock,
  pendingBlockTitle,
  sessionName,
  sessionWithArticle,
} from './blocks';

const START = '2026-11-02';
/** Lunedì di inizio del blocco di prova e la domenica prima. */
const MON = '2026-11-09';
const SUN = '2026-11-08';
const FORTE: TrainingGoal = { presetId: 'forte', primary: 'forza', secondary: 'prevenzione' };
const SITES = ['Caviglia', 'Spalla'];
const NO_PHYSIO = { exercises: [], prescriptions: [] };

const sets = (s: { blocks: { items: { sets: number }[] }[] }) => s.blocks.reduce((t, b) => t + b.items.reduce((u, it) => u + it.sets, 0), 0);

/** Blocco vero del generatore dal lunedì `MON`, con la settimana tipo che propone. */
function withBlock(training: TrainingGoal = FORTE): { plan: Plan; program: Program } {
  const plan: Plan = { ...defaultPlan(START), training };
  const res = buildBlock({ monday: MON, plan, workoutLogs: [], footballLogs: [], checkIns: {}, physio: NO_PHYSIO, painSites: SITES, attempt: 0 });
  if (!res.program) throw new Error('blocco atteso');
  return { plan: { ...plan, program: res.program, ...(res.week ? { week: res.week } : {}) }, program: res.program };
}

function state(plan: Plan, over: Partial<AppData> = {}): AppData {
  return { ...defaultAppData(START), onboarded: true, plan, profile: { ...defaultAppData(START).profile, painSites: SITES }, ...over };
}

const proposal = (over: Partial<PlanProposal>): PlanProposal => ({
  id: 'p1',
  kind: 'blocco',
  status: 'aperta',
  createdAt: `${SUN}T10:00:00.000Z`,
  effectiveFrom: MON,
  basis: 'x',
  title: 'Nuovo blocco dal 9 novembre',
  patch: {},
  diff: [],
  reasons: [],
  source: 'motore',
  ...over,
});

beforeEach(() => {
  useApp.getState().resetAll();
  useUi.setState({ overlay: null, toasts: [] });
});

describe('generatori registrati', () => {
  it('blocco e obiettivi hanno il loro generatore appena il modulo è caricato', () => {
    expect(hasProposalBuilder('blocco')).toBe(true);
    expect(hasProposalBuilder('obiettivi')).toBe(true);
  });
});

describe('quando nasce la proposta di blocco (§ 5.3)', () => {
  it('senza obiettivo, date o blocco non serve mai: l’app di prima', () => {
    expect(blockProposalDue({ plan: defaultPlan(START) }, SUN)).toBeNull();
  });

  it('con un obiettivo di allenamento e nessun blocco: il primo, dal lunedì dopo', () => {
    expect(blockProposalDue({ plan: { ...defaultPlan(START), training: FORTE } }, '2026-11-04')).toEqual({ trigger: 'primo', monday: MON });
  });

  it('a fine blocco solo la domenica dell’ultima settimana', () => {
    const { plan } = withBlock();
    const lastSunday = addDays(MON, 4 * 7 - 1);
    expect(blockProposalDue({ plan }, lastSunday)?.trigger).toBe('fine-blocco');
    expect(blockProposalDue({ plan }, addDays(lastSunday, -1))).toBeNull();
    expect(blockProposalDue({ plan }, addDays(MON, 13))).toBeNull();
  });

  it('a fine blocco senza decisione ogni domenica dopo: la proposta scaduta il lunedì si rigenera (§ 3.1)', () => {
    const { plan } = withBlock();
    const lastSunday = addDays(MON, 4 * 7 - 1);
    const nextSunday = addDays(lastSunday, 7);
    // L'app non si è aperta la domenica di fine blocco: la domenica dopo la proposta nasce lo stesso.
    expect(blockProposalDue({ plan }, nextSunday)).toEqual({ trigger: 'fine-blocco', monday: addDays(nextSunday, 1) });
    expect(blockProposalDue({ plan }, addDays(nextSunday, 7))?.trigger).toBe('fine-blocco');
    // Solo di domenica.
    expect(blockProposalDue({ plan }, addDays(nextSunday, -3))).toBeNull();
    // La proposta di fine blocco non decisa è scaduta il lunedì: la domenica dopo ne nasce un'altra, per il lunedì dopo.
    const expired = proposal({ status: 'superata', effectiveFrom: addDays(lastSunday, 1), createdAt: `${lastSunday}T10:00:00.000Z` });
    expect(blockProposalDue({ plan, planner: { proposals: [expired] } }, nextSunday)).toEqual({ trigger: 'fine-blocco', monday: addDays(nextSunday, 1) });
    // Con «Tieni il piano attuale» invece aspetta la fine del ciclo ripetuto.
    const kept = proposal({ status: 'scartata', effectiveFrom: addDays(lastSunday, 1), decidedAt: `${lastSunday}T10:00:00.000Z` });
    expect(blockProposalDue({ plan, planner: { proposals: [kept] } }, nextSunday)).toBeNull();
    expect(blockProposalDue({ plan, planner: { proposals: [kept] } }, addDays(lastSunday, BLOCK_REJECT_PAUSE_DAYS + 7))?.trigger).toBe('fine-blocco');
  });

  it('ensureBlockProposal a fine blocco: scaduta la prima senza decisione, la domenica dopo nasce la seconda', () => {
    const { plan } = withBlock();
    const lastSunday = addDays(MON, 4 * 7 - 1);
    useApp.setState({ onboarded: true, plan, profile: { ...useApp.getState().profile, painSites: SITES } });
    const first = ensureBlockProposal(lastSunday);
    if (first?.status !== 'nata') throw new Error('proposta attesa');
    // Il lunedì passa senza decisione: la proposta diventa superata.
    useApp.setState((st) => ({ planner: { ...st.planner!, proposals: st.planner!.proposals.map((p) => (p.id === first.id ? { ...p, status: 'superata' as const } : p)) } }));
    const second = ensureBlockProposal(addDays(lastSunday, 7));
    expect(second?.status).toBe('nata');
    const open = (useApp.getState().planner?.proposals ?? []).filter((p) => p.kind === 'blocco' && p.status === 'aperta');
    expect(open).toHaveLength(1);
    expect(open[0].effectiveFrom).toBe(addDays(lastSunday, 8));
  });

  it('dopo «Tieni il piano attuale» aspetta, tranne quando cambia l’obiettivo', () => {
    const plan: Plan = { ...defaultPlan(START), training: FORTE };
    const rejected = proposal({ status: 'scartata', decidedAt: `${addDays(SUN, -3)}T10:00:00.000Z`, effectiveFrom: addDays(MON, -7) });
    expect(blockProposalDue({ plan, planner: { proposals: [rejected] } }, SUN)).toBeNull();
    const later = addDays(SUN, BLOCK_REJECT_PAUSE_DAYS);
    expect(blockProposalDue({ plan, planner: { proposals: [rejected] } }, later)?.trigger).toBe('primo');
    // Obiettivo diverso dal blocco in vigore: la proposta nasce lo stesso.
    const { plan: inBlock } = withBlock();
    const changed: Plan = { ...inBlock, training: { presetId: 'rapido', primary: 'rapidita', secondary: 'potenza' } };
    expect(blockProposalDue({ plan: changed, planner: { proposals: [rejected] } }, addDays(MON, 3))?.trigger).toBe('obiettivo');
  });

  it('non nasce con un blocco già approvato in attesa né con una proposta aperta per lo stesso lunedì', () => {
    const plan: Plan = { ...defaultPlan(START), training: FORTE };
    const pending = proposal({ status: 'approvata', decidedAt: `${SUN}T09:00:00.000Z` });
    expect(blockProposalDue({ plan, planner: { proposals: [pending] } }, SUN)).toBeNull();
    expect(blockProposalDue({ plan, planner: { proposals: [proposal({})] } }, SUN)).toBeNull();
  });

  it('ensureBlockProposal salva una sola proposta aperta e non la duplica', () => {
    useApp.setState({ onboarded: true, plan: { ...defaultPlan(START), training: FORTE }, profile: { ...useApp.getState().profile, painSites: SITES } });
    const a = ensureBlockProposal(SUN);
    expect(a?.status).toBe('nata');
    // C'è già, aperta, per lo stesso lunedì: non serve un'altra.
    expect(ensureBlockProposal(SUN)).toBeNull();
    const open = (useApp.getState().planner?.proposals ?? []).filter((p) => p.kind === 'blocco' && p.status === 'aperta');
    expect(open).toHaveLength(1);
    expect(open[0].effectiveFrom).toBe(MON);
    expect(open[0].patch.program?.start).toBe(MON);
    // Niente si applica da solo: il piano non ha ancora un blocco.
    expect(useApp.getState().plan.program).toBeUndefined();
  });

  it('una proposta già decisa con lo stesso id non si riapre', () => {
    useApp.setState({ onboarded: true, plan: { ...defaultPlan(START), training: FORTE } });
    const a = ensureBlockProposal(SUN);
    if (a?.status !== 'nata') throw new Error('proposta attesa');
    useApp.getState().rejectProposal(a.id);
    expect(ensureBlockProposal(SUN)).toBeNull();
    expect(useApp.getState().planner?.proposals.find((p) => p.id === a.id)?.status).toBe('scartata');
  });

  it('a fine blocco salva il riepilogo del blocco che finisce, con il carico previsto più alto', () => {
    const { plan, program } = withBlock();
    const lastSunday = addDays(MON, 4 * 7 - 1);
    useApp.setState({ onboarded: true, plan, profile: { ...useApp.getState().profile, painSites: SITES } });
    ensureBlockProposal(lastSunday);
    const blocks = useApp.getState().planner?.blocks ?? [];
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ blockId: program.blockId, from: MON, to: lastSunday, primary: 'forza' });
    expect(blocks[0].peakLoad).toBeGreaterThan(0);
  });
});

describe('riepilogo del blocco che finisce', () => {
  it('null senza blocco o prima che inizi', () => {
    expect(endingBlockSummary(state(defaultPlan(START)), MON)).toBeNull();
    expect(endingBlockSummary(state(withBlock().plan), MON)).toBeNull();
  });

  it('copre il blocco fino al giorno prima del lunedì nuovo', () => {
    const { plan, program } = withBlock();
    const next = addDays(MON, 28);
    const s = endingBlockSummary(state(plan), next)!;
    expect(s).toMatchObject({ blockId: program.blockId, from: MON, to: addDays(next, -1) });
    expect(s.adherence).toBe(0);
  });
});

describe('righe di Allenamento (§ 11.5)', () => {
  it('pillola della settimana del blocco: «Settimana 2 di 4 · carico», poi lo scarico', () => {
    const { plan } = withBlock();
    expect(blockWeekLabel(plan, addDays(MON, 8))).toBe('Settimana 2 di 4 · carico');
    expect(blockWeekLabel(plan, addDays(MON, 22))).toBe('Settimana 4 di 4 · scarico');
    expect(blockWeekLabel(plan, addDays(MON, -1))).toBeNull();
    expect(blockWeekLabel(defaultPlan(START), MON)).toBeNull();
  });

  it('a un cambio di fase senza approvazione la pillola sparisce: valgono le sedute fisse', () => {
    const { plan } = withBlock();
    const season = { lastMatch: addDays(MON, 10) };
    expect(blockWeekLabel({ ...plan, season }, addDays(MON, 14))).toBeNull();
  });

  it('sedute del blocco nell’ordine degli slot, con la dose della settimana', () => {
    const { plan, program } = withBlock();
    const rows = blockSessions(plan, addDays(MON, 8))!;
    expect(rows.map((r) => r.slot)).toEqual(['A', 'B', 'C', 'K', 'R'].filter((s) => program.sessions[s]));
    for (const r of rows) expect(r.session).toBe(sessionFor(r.slot, r.date, plan));
    expect(blockSessions(defaultPlan(START), MON)).toBeNull();
  });

  it('proposta aperta e blocco approvato in attesa, con il titolo «Dal …: …»', () => {
    const { program } = withBlock();
    const open = proposal({ id: 'aperta' });
    const pending = proposal({ id: 'attesa', status: 'approvata', decidedAt: `${SUN}T09:00:00.000Z`, patch: { program } });
    expect(openBlockProposal([pending, open])?.id).toBe('aperta');
    expect(pendingBlock([open, pending])?.id).toBe('attesa');
    expect(pendingBlock([open])).toBeUndefined();
    expect(pendingBlockTitle(pending)).toBe('Dal 9 novembre: forza, poi prevenzione');
  });

  it('nomi delle sedute: mai «Seduta K», con l’articolo giusto', () => {
    const plan = defaultPlan(START);
    expect(sessionName('B', MON, plan)).toBe('Seduta B');
    expect(sessionName('K', MON, plan)).toBe('Corsa');
    expect(sessionName('R', MON, plan)).toBe('Uscita facile');
    expect(sessionWithArticle('Seduta B')).toBe('la seduta B');
    expect(sessionWithArticle('Uscita facile')).toBe('l’uscita facile');
    expect(sessionWithArticle('Corsa intermittente')).toBe('la corsa intermittente');
  });
});

describe('seduta del giorno nella variante (§ 3.9)', () => {
  const badNight: CheckIn = { date: addDays(MON, 8), sleepHours: 5, sleepQuality: 1, energy: 2, pain: {} };

  it('senza blocco è sempre la piena, come prima', () => {
    const plan = defaultPlan(START);
    const s = { plan, workoutLogs: [], footballLogs: [], checkIns: { [badNight.date]: badNight } };
    const d = dayVariantSession('A', badNight.date, s)!;
    expect(d.variant).toBe('piena');
    expect(d.text).toBeNull();
  });

  it('con un blocco e una notte corta il giorno si adatta e lo dice; «Fai la piena» la ignora', () => {
    const { plan } = withBlock();
    const iso = badNight.date;
    const slot = plan.week.find((d) => d.weekday === 1 && d.gymSessionId)?.gymSessionId ?? 'A';
    const s = { plan, workoutLogs: [], footballLogs: [], checkIns: { [iso]: badNight } };
    const d = dayVariantSession(slot, iso, s)!;
    expect(d.variant).not.toBe('piena');
    expect(d.text).toMatch(/^Oggi (ridotta|minima): /);
    const full = dayVariantSession(slot, iso, s, 'piena')!;
    expect(full.variant).toBe('piena');
    expect(full.suggested).toBe(d.variant);
    expect(full.session).toBe(fullDaySession(slot, iso, s));
    expect(sets(full.session)).toBeGreaterThan(sets(d.session));
    // Senza il controllo cattivo la piena coincide con la seduta del giorno.
    expect(fullDaySession(slot, iso, { ...s, checkIns: {} })).toBe(daySession(slot, iso, { ...s, checkIns: {} })!.session);
  });

  it('«Fai la piena» tiene il freno degli impatti: zona sotto il ginocchio a soglia + 2, nessun esercizio d’impatto', () => {
    const { plan } = withBlock({ presetId: 'calcio', primary: 'potenza', secondary: 'forza', spaces: ['corsia', 'campo'] });
    // La seduta con i salti in testa (la B del venerdì nella settimana predefinita).
    const day = plan.week.find((d) => d.gymSessionId && (() => {
      const ses = sessionFor(d.gymSessionId!, addDays(MON, 7 + d.weekday), plan);
      return ses?.blocks.some((b) => b.items.some((it) => itemLevel(it.exerciseId) > 0));
    })());
    expect(day).toBeDefined();
    const iso = addDays(MON, 7 + day!.weekday);
    const slot = day!.gymSessionId!;
    const thr = plan.impactThreshold ?? 2;
    const morning: CheckIn = { date: iso, sleepHours: 8, sleepQuality: 4, energy: 7, pain: { Caviglia: thr + 2 } };
    const s = { plan, workoutLogs: [], footballLogs: [], checkIns: { [iso]: morning }, profile: { ...defaultAppData(START).profile, painSites: SITES } };
    const levels = (w: { blocks: { items: { exerciseId: string }[] }[] }) => w.blocks.flatMap((b) => b.items).map((it) => itemLevel(it.exerciseId));
    // Il controllo del mattino dà la minima senza impatti.
    const d = dayVariantSession(slot, iso, s)!;
    expect(d.variant).toBe('minima');
    expect(Math.max(0, ...levels(d.session))).toBe(0);
    // «Fai la piena»: la variante non c'è più, gli impatti restano fermi.
    const full = fullDaySession(slot, iso, s)!;
    expect(Math.max(0, ...levels(full))).toBe(0);
    const chosen = dayVariantSession(slot, iso, s, 'piena')!;
    expect(chosen.variant).toBe('piena');
    expect(Math.max(0, ...levels(chosen.session))).toBe(0);
    expect(sets(chosen.session)).toBeGreaterThan(sets(d.session));
  });

  it('una seduta partita ridotta resta ridotta anche se il controllo cambia dopo', () => {
    const { plan } = withBlock();
    const iso = badNight.date;
    const slot = plan.week.find((d) => d.weekday === 1 && d.gymSessionId)?.gymSessionId ?? 'A';
    const s = { plan, workoutLogs: [], footballLogs: [], checkIns: {} };
    const d = dayVariantSession(slot, iso, s, 'ridotta')!;
    expect(d.variant).toBe('ridotta');
    expect(sets(d.session)).toBeLessThan(sets(fullDaySession(slot, iso, s)!));
  });

  it('il registro dice blocco e settimana solo con un blocco in vigore', () => {
    const { plan, program } = withBlock();
    expect(blockStamp(plan, addDays(MON, 8), 'A')).toEqual({ blockId: program.blockId, weekIndex: 2 });
    expect(blockStamp(defaultPlan(START), MON, 'A')).toBeNull();
    expect(blockStamp(plan, addDays(MON, -1), 'A')).toBeNull();
  });
});
