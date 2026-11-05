/**
 * Oggi: il cuore di Ritmo. Il tabellone della giornata, cosa fare adesso, la timeline da segnare con un tocco,
 * acqua, dolci, valori del giorno e un consiglio. Tutto deciso dal piano: l'utente esegue e segna.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BriefcaseBusiness, Check, Clock, Feather, Settings, Timer } from 'lucide-react';
import type { FootballKind, HHMM, ISODate, ItemStatus, MealSlot } from '../../domain/types';
import { navigate } from '../../app/router';
import { addDays, daysBetween, formatWeekday, weekIndexSince, weekStart, weekdayOf } from '../../engine/dates';
import { dayTypeFor, isMatchEve } from '../../engine/menu';
import { fiberRampWeek } from '../../engine/nutrition';
import { STEP_ITEM_ID, reviewWeekFor, weeklyStepStatus } from '../../engine/review';
import { bedtimeFor, checkInSleepHours, curfewFor } from '../../engine/sleep';
import {
  canMarkNow,
  dayMinutes,
  gymTotalMin,
  mealSchedule,
  isSuccessful,
  markableFrom,
  minutesToCurfew,
  physioMinutes,
  shoppingTarget,
  statusSource,
  type AdherenceSummary,
  type DayItem,
} from '../../engine/timeline';
import { impactThresholdFor, painGate } from '../../engine/training';
import { formatWork } from '../../engine/work';
import { fmtDayTitle, fmtKcal, plural } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useDayLog, useNowHHMM, usePlanDay } from '../../state/hooks';
import { useApp, useUi } from '../../state/store';
import { Button, Callout, Card, DayTypeBadge, IconButton, Pill, Screen, SectionTitle, fade } from '../../ui';
import { PhysioEditorSheet } from '../allenamento/PhysioEditor';
import { InstallCard } from '../impostazioni/components/InstallCard';
import { installReminderDue, markInstallReminded } from '../impostazioni/install';
import { ReviewSheet } from '../progressi/ReviewSheet';
import { RecoverLink, RecoverSheet, yesterdayText } from './components/CatchUp';
import { DayHero } from './components/DayHero';
import { DayValues } from './components/DayValues';
import { EveningRitual } from './components/EveningRitual';
import { ItemActionsSheet } from './components/ItemActionsSheet';
import { NowCard } from './components/NowCard';
import { sessionName, sessionWithArticle } from '../allenamento/sessionNames';
import { PhysioSheet } from './components/PhysioSheet';
import { QuickWorkoutSheet } from './components/QuickWorkoutSheet';
import { CheckInPrompt, CurfewCard, SetupRow, TipCard } from './components/SmallCards';
import { CALENDAR_TASK_HASH } from '../impostazioni/reminders';
import { Timeline } from './components/Timeline';
import { TomorrowSheet } from './components/TomorrowSheet';
import { TrackersCard } from './components/Trackers';
import { opensDetail } from './kinds';
import { FOOTBALL_NOUN, footballPainAdvice } from './painAdvice';
import { customPainTests } from './painTests';
import { dayRingValue } from './components/DayHero';
import { setItemStatusSynced } from './shoppingSync';
import { useOggi } from './useOggi';

/** La card del coprifuoco compare dalle 20:00: prima la timeline basta. */
const CURFEW_CARD_FROM_MIN = 20 * 60;
/** Il rito della sera si apre da 15 minuti prima del coprifuoco. */
const RITUAL_LEAD_MIN = 15;
/** Acqua in più nei giorni di calcio: con 60-90 minuti di gioco si perde oltre un litro di sudore. */
const FOOTBALL_EXTRA_WATER_L = 0.75;
/**
 * Il conto alla rovescia del calcio prende la scena solo nelle ultime 5 ore (dal pomeriggio): la mattina basta la
 * pillola dell'intestazione, e il posto resta al controllo del mattino e alla colazione.
 */
const KICKOFF_HERO_LEAD_MIN = 5 * 60;

/** Pillola dell'intestazione a calcio finito: com'è andata, o l'invito a segnarlo. */
const FOOTBALL_DONE: Record<FootballKind, { done: string; skipped: string; replaced: string; mark: string; at: string }> = {
  partita: { done: 'Partita giocata', skipped: 'Partita saltata', replaced: 'Partita sostituita', mark: 'Segna la partita', at: 'Partita' },
  calcetto: { done: 'Calcetto giocato', skipped: 'Calcetto saltato', replaced: 'Calcetto sostituito', mark: 'Segna il calcetto', at: 'Calcetto' },
  allenamento: { done: 'Allenamento fatto', skipped: 'Allenamento saltato', replaced: 'Allenamento sostituito', mark: 'Segna l’allenamento', at: 'Allenamento' },
};

interface RecoverState {
  date: ISODate;
  items: DayItem[];
  title: string;
  subtitle?: string;
  session: number;
}

export default function OggiScreen() {
  // Dopo mezzanotte e prima della sveglia la giornata è ancora quella di ieri (a letto alle 00:45).
  const today = usePlanDay();
  const now = useNowHHMM() as HHMM;
  const data = useOggi(today, now);
  const { state, items, status, summary } = data;
  const plan = state.plan;
  const dayLog = useDayLog(today);
  const profile = useApp((s) => s.profile);
  const checkIns = useApp((s) => s.checkIns);
  const workoutLogs = useApp((s) => s.workoutLogs);
  const footballLogs = useApp((s) => s.footballLogs);
  const checkIn = checkIns[today];
  const open = useUi((s) => s.open);
  const toast = useUi((s) => s.toast);

  const [optionsId, setOptionsId] = useState<string | null>(null);
  // Ogni apertura del foglio delle opzioni è una nuova istanza: riaprirlo mentre si chiude non si accavalla.
  const [optionsSession, setOptionsSession] = useState(0);
  const [physioOpen, setPhysioOpen] = useState(false);
  const [physioEditorOpen, setPhysioEditorOpen] = useState(false);
  const [recover, setRecover] = useState<RecoverState | null>(null);
  const [quickGym, setQuickGym] = useState<{ item: DayItem; date: ISODate; session: number } | null>(null);
  const [ritualOpen, setRitualOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [tomorrowOpen, setTomorrowOpen] = useState(false);
  const optionsItem = optionsId ? (items.find((i) => i.id === optionsId) ?? null) : null;

  const curfew = curfewFor(today, plan);
  const bed = bedtimeFor(today, plan);
  const curfewIn = minutesToCurfew(today, now, plan);
  const nowM = dayMinutes(now, plan);
  const successful = isSuccessful(summary);
  const overdueIds = useMemo(() => new Set(data.overdue.map((i) => i.id)), [data.overdue]);
  const day = plan.week.find((d) => d.weekday === weekdayOf(today));

  // Su iPhone, finché Ritmo non è installata, una volta a settimana: in Safari i dati possono sparire.
  const [installShown, setInstallShown] = useState(() => installReminderDue(today));
  useEffect(() => {
    if (installShown) markInstallReminded(today);
  }, [installShown, today]);

  // Giornata appena chiusa in questa sessione: bagliore dei riflettori e serie che scorre.
  const [justCompleted, setJustCompleted] = useState(false);
  const [flare, setFlare] = useState(0);
  const wasComplete = useRef(data.complete);
  const lastDay = useRef(today);
  useEffect(() => {
    if (lastDay.current !== today) {
      lastDay.current = today;
      wasComplete.current = data.complete;
      setJustCompleted(false);
      return;
    }
    if (!wasComplete.current && data.complete) {
      setJustCompleted(true);
      setFlare((n) => n + 1);
    }
    if (!data.complete) setJustCompleted(false);
    wasComplete.current = data.complete;
  }, [data.complete, today]);

  // ── Azioni ──

  // La spesa segnata qui spunta anche la lista di Settimana (e l'Annulla la rimette com'era).
  const setStatus = useCallback((item: DayItem, st: ItemStatus | null, note?: string) => setItemStatusSynced(today, item, st, note), [today]);

  const lockedUntil = useCallback(
    (item: DayItem): HHMM | null => (canMarkNow(today, item, now, plan) ? null : markableFrom(today, item, plan)),
    [today, now, plan],
  );

  /** Riepilogo dopo un cambio di stato, per capire se la giornata diventa riuscita. */
  const summaryAfter = useCallback(
    (item: DayItem, next: ItemStatus): AdherenceSummary => {
      if (!data.counts(item)) return summary;
      const prev = status[item.id];
      const add = (s: ItemStatus | undefined, k: ItemStatus) => (s === k ? 1 : 0);
      const done = summary.done - add(prev, 'fatto') + add(next, 'fatto');
      const replaced = summary.replaced - add(prev, 'sostituito') + add(next, 'sostituito');
      const skipped = summary.skipped - add(prev, 'saltato') + add(next, 'saltato');
      return {
        ...summary,
        done,
        replaced,
        skipped,
        pending: summary.total - done - replaced - skipped,
        score: summary.total ? (done + replaced * 0.5) / summary.total : 0,
      };
    },
    [data, summary, status],
  );

  /** Festa sobria solo quando la giornata è riuscita e anche il telefono è fuori. */
  const celebrateIfNeeded = useCallback(
    (item: DayItem, next: ItemStatus) => {
      const before = isSuccessful(summary) && data.phoneDone;
      const phoneAfter = data.phoneDone || item.id === data.phoneItem?.id;
      const after = isSuccessful(summaryAfter(item, next)) && phoneAfter;
      if (!before && after) {
        const n = data.streak.days + (data.streak.includesToday ? 0 : 1);
        toast(`Giornata riuscita. Serie a ${plural(n, 'giorno', 'giorni')}`, 'good');
        return true;
      }
      return false;
    },
    [summary, data, summaryAfter, toast],
  );

  const refuseLocked = useCallback(
    (item: DayItem) => {
      const from = lockedUntil(item);
      if (!from) return false;
      haptic('warning');
      toast(`Si segna dalle ${from}, quando posi davvero il telefono`, 'warn');
      return true;
    },
    [lockedUntil, toast],
  );

  const openQuickGym = useCallback(
    (item: DayItem, date: ISODate = today) => setQuickGym((q) => ({ item, date, session: (q?.session ?? 0) + 1 })),
    [today],
  );

  /** Pannello di una voce con dati (controllo, calcio, palestra) per un giorno qualunque, anche ieri. */
  const openDataFor = useCallback(
    (date: ISODate, item: DayItem) => {
      if (item.kind === 'calcio') open({ type: 'football', date, kind: (item.ref ?? 'partita') as FootballKind, itemId: item.id });
      else if (item.kind === 'palestra') openQuickGym(item, date);
      else if (item.kind === 'controllo') open({ type: 'checkin', date });
    },
    [open, openQuickGym],
  );

  /** Segna fatto e festeggia con sobrietà quando la giornata diventa riuscita. */
  const markDone = useCallback(
    (item: DayItem, opts: { toast?: boolean; note?: string } = {}): boolean => {
      if (refuseLocked(item)) return false;
      // Una seduta segnata senza registrazione non entrerebbe nel carico: durata e RPE prima.
      if (item.kind === 'palestra' && !status[item.id]) {
        openQuickGym(item);
        return false;
      }
      const prev = status[item.id];
      setStatus(item, 'fatto', opts.note);
      haptic('success');
      const celebrated = celebrateIfNeeded(item, 'fatto');
      if (!celebrated && opts.toast) {
        toast(`Segnato: ${item.title}`, 'good', { actionLabel: 'Annulla', onAction: () => setStatus(item, prev ?? null) });
      }
      return celebrated;
    },
    [refuseLocked, status, openQuickGym, setStatus, celebrateIfNeeded, toast],
  );

  // La scheda e la settimana viaggiano nell'hash: Settimana li legge anche se è già aperta.
  // La preparazione apre subito il lettore a schermo intero.
  const goPrep = useCallback(() => {
    window.location.hash = 'settimana?tab=preparazione&settimana=prossima&guida=1';
  }, []);
  /** Lista della spesa di una voce, nella settimana delle sue spunte (la spesa di avvio di lunedì, vista domenica, è la prossima). */
  const openShopping = useCallback(
    (item: DayItem, date: ISODate = today) => {
      const week = shoppingTarget(date, state, item)?.weekStart ?? addDays(weekStart(date), 7);
      window.location.hash = `settimana?tab=spesa&settimana=${week === weekStart(today) ? 'corrente' : 'prossima'}`;
    },
    [today, state],
  );

  const openDetail = useCallback(
    (item: DayItem) => {
      switch (item.kind) {
        case 'pasto':
          if (item.ref) open({ type: 'recipe', recipeId: item.ref, date: today, slot: item.slot });
          break;
        case 'palestra':
          if (item.ref) open({ type: 'session', sessionId: item.ref, date: today });
          break;
        case 'calcio':
          open({ type: 'football', date: today, kind: (item.ref ?? 'partita') as FootballKind, itemId: item.id });
          break;
        case 'controllo':
          open({ type: 'checkin', date: today });
          break;
        case 'fisio':
          setPhysioOpen(true);
          break;
        case 'spesa':
          openShopping(item);
          break;
        case 'preparazione':
          goPrep();
          break;
        case 'revisione':
          setReviewOpen(true);
          break;
        default:
          break;
      }
    },
    [open, today, openShopping, goPrep],
  );

  const onOptions = useCallback((item: DayItem) => {
    setOptionsSession((n) => n + 1);
    setOptionsId(item.id);
  }, []);

  /** Tocco sul cerchio: da fare → fatto; fatto → da fare. Calcio e palestra chiedono minuti e RPE. */
  const toggle = useCallback(
    (item: DayItem) => {
      if (data.beforeStart(item)) return;
      const st = status[item.id];
      if (!st) {
        if (item.kind === 'calcio') return openDetail(item);
        if (item.kind === 'palestra') return openQuickGym(item);
        if (item.kind === 'revisione') return openDetail(item);
        if (item.kind === 'controllo' && !checkIn) return openDetail(item);
        markDone(item);
        return;
      }
      if (statusSource(today, state, item) === 'registro') {
        haptic('selection');
        return onOptions(item);
      }
      haptic('selection');
      setStatus(item, null);
    },
    [data, status, openDetail, openQuickGym, markDone, today, state, setStatus, checkIn, onOptions],
  );

  const onBody = useCallback((item: DayItem) => (opensDetail(item) ? openDetail(item) : toggle(item)), [openDetail, toggle]);
  const openPlanB = useCallback((slot?: MealSlot) => open({ type: 'barPlanB', slot }), [open]);

  const openRecover = (date: ISODate, list: DayItem[], title: string, subtitle?: string) =>
    setRecover((r) => ({ date, items: list, title, subtitle, session: (r?.session ?? 0) + 1 }));

  const setMinimal = (on: boolean) => {
    useApp.getState().setMinimal(today, on);
    toast(on ? 'Giornata minima attiva' : 'Piano completo', 'neutral');
  };

  const footballExtra = day?.football ? FOOTBALL_EXTRA_WATER_L : 0;
  const addWater = (delta: number) => useApp.getState().addWater(today, delta);
  const addSweet = (delta: number) => {
    useApp.getState().addSweet(today, delta);
    if (delta > 0) {
      const after = data.weekSweets + delta;
      if (after > plan.sweetsPerWeek) {
        haptic('warning');
        // Domani: merenda con proteine al suo orario; se è la merenda pre-calcio (carboidrati), il dolce dopo cena.
        const next = mealSchedule(plan.week.find((d) => d.weekday === weekdayOf(addDays(today, 1))), plan).merenda;
        const advice = next.title.startsWith('Merenda pre-') ? 'domani il dolce solo dopo cena' : `domani merenda con proteine alle ${next.time}`;
        toast(`Oltre i previsti: ${advice}`, 'warn', { actionLabel: 'Annulla', onAction: () => useApp.getState().addSweet(today, -delta) });
      } else {
        toast(after === plan.sweetsPerWeek ? 'Segnato: era l’ultimo previsto' : 'Segnato, goditelo', 'neutral', {
          actionLabel: 'Annulla',
          onAction: () => useApp.getState().addSweet(today, -delta),
        });
      }
    }
  };

  // ── Intestazione ──

  const heroKickoff = data.kickoff && data.kickoff.inMin <= KICKOFF_HERO_LEAD_MIN ? data.kickoff : null;
  const preMatchItem = items.find((i) => i.kind === 'pasto' && i.slot === 'merenda' && i.title.startsWith('Merenda pre-'));
  const preMatchTime = preMatchItem && !status[preMatchItem.id] ? preMatchItem.time : undefined;

  // Pillola dell'intestazione: prima l'orario, a cose fatte l'esito, finito il tempo l'invito a segnare.
  const event = ((): { text: string; tone: 'neutral' | 'good'; icon: typeof Clock; onPress?: () => void } | null => {
    const f = day?.football;
    if (f) {
      if (heroKickoff) return null;
      // Fino al pomeriggio: l'orario del calcio e della merenda pre-calcio, come la seduta nei giorni di palestra.
      if (data.kickoff) {
        const words = FOOTBALL_DONE[f.kind];
        return { text: preMatchTime ? `${words.at} ${f.time} · merenda ${preMatchTime}` : `${words.at} alle ${f.time}`, tone: 'neutral', icon: Clock };
      }
      const it = items.find((i) => i.kind === 'calcio');
      const words = FOOTBALL_DONE[f.kind];
      const st = it ? status[it.id] : undefined;
      if (st === 'fatto') return { text: words.done, tone: 'good', icon: Check };
      if (st === 'saltato') return { text: words.skipped, tone: 'neutral', icon: Clock };
      if (st === 'sostituito') return { text: words.replaced, tone: 'neutral', icon: Clock };
      if (it) return { text: words.mark, tone: 'neutral', icon: Timer, onPress: () => openDetail(it) };
      return { text: `${words.at} alle ${f.time}`, tone: 'neutral', icon: Clock };
    }
    const gym = items.find((i) => i.kind === 'palestra');
    if (gym && day?.gymSessionId) {
      const st = status[gym.id];
      // Il nome della seduta della data: con un blocco anche «Corsa intermittente» o «Uscita facile», mai «Seduta K».
      const name = sessionName(day.gymSessionId, today, plan);
      if (st === 'fatto') return { text: `${name} fatta`, tone: 'good', icon: Check };
      if (st === 'saltato') return { text: `${name} saltata`, tone: 'neutral', icon: Clock };
      if (st === 'sostituito') return { text: `${name} sostituita`, tone: 'neutral', icon: Clock };
      const end = dayMinutes(gym.time, plan) + gymTotalMin(day.gymSessionId, { ...state, profile }, today);
      if (nowM >= end) return { text: `Segna ${sessionWithArticle(name)}`, tone: 'neutral', icon: Timer, onPress: () => openQuickGym(gym) };
      return { text: `${name}${day.gymOptional ? ' facoltativa' : ''} alle ${gym.time}`, tone: 'neutral', icon: Clock };
    }
    return null;
  })();
  // La settimana del piano, detta per intero: "settimana 4" accanto al mese si leggeva "quarta di novembre".
  const week = weekIndexSince(plan.startDate, today) + 1;
  const startsIn = daysBetween(today, plan.startDate);
  const eyebrow =
    startsIn > 0 && startsIn <= 7 ? `Il piano parte ${startsIn === 1 ? 'domani' : formatWeekday(plan.startDate)}` : week > 0 ? `Settimana ${week} del piano` : undefined;

  // ── Avvisi ──

  const gate = useMemo(
    () => painGate({ plan, checkIns, profile, workoutLogs, footballLogs }, today),
    [plan, checkIns, profile, workoutLogs, footballLogs, today],
  );
  const football = data.kickoff ? FOOTBALL_NOUN[data.kickoff.kind] : null;
  // Il calcio è il carico d'impatto più alto della settimana: con una zona sotto il ginocchio oltre la soglia
  // degli impatti l'avviso parla della partita con la stessa regola dei balzi in palestra (`painAdvice.ts`).
  // Soglia degli impatti scelta con il fisioterapista (`Plan.impactThreshold`), altrimenti min(soglia, 2).
  const impactT = impactThresholdFor(plan);
  // Senza palestra oggi i consigli sui carichi non servono: l'avviso parla solo del calcio.
  const gymToday = items.some((i) => i.kind === 'palestra');
  const advice = footballPainAdvice(gate, data.kickoff?.kind ?? null, checkIn?.pain, impactT, customPainTests(profile), gymToday);
  const impactFootball = advice.footballText && football ? football : null;
  const painText = advice.painText;
  const footballText = advice.footballText;
  // A sedute e calcio di oggi già segnati l'avviso ha fatto il suo lavoro: resta solo se chiede di ridurre.
  const loadItems = items.filter((i) => i.kind === 'palestra' || i.kind === 'calcio');
  const loadDone = loadItems.length > 0 && loadItems.every((i) => status[i.id]);
  const showPain = (gate.level !== 'ok' || Boolean(impactFootball)) && (!loadDone || gate.level === 'riduci');
  const footballItem = data.kickoff ? items.find((i) => i.id === data.kickoff!.itemId) : undefined;

  const lowDay =
    !data.minimal &&
    checkIn &&
    ((typeof checkIn.energy === 'number' && checkIn.energy <= 3) || (checkInSleepHours(checkIn) ?? 8) < 5.5);

  const phone = data.phoneItem;
  const phonePending = phone && !data.phoneDone ? phone : undefined;
  const ritualWindow = Boolean(phonePending) && curfewIn <= RITUAL_LEAD_MIN;
  const showCurfew =
    Boolean(phonePending) && nowM >= CURFEW_CARD_FROM_MIN && curfewIn > -60 && data.now?.item.id !== phonePending!.id;

  // Scalino scelto nella revisione della settimana scorsa: non entra nell'aderenza della giornata.
  const reviews = useApp((s) => s.reviews);
  const step = useMemo(
    () => weeklyStepStatus(today, { plan, dayLogs: state.dayLogs, checkIns, workoutLogs, footballLogs, profile, reviews }),
    [today, plan, state.dayLogs, checkIns, workoutLogs, footballLogs, profile, reviews],
  );
  const toggleStep = () => {
    if (!step) return;
    const was = step.todayState === 'fatto';
    useApp.getState().setItemStatus(today, STEP_ITEM_ID, was ? null : 'fatto');
    haptic(was ? 'selection' : 'success');
    if (!was && step.done + 1 === step.target) toast(`Scalino riuscito: ${step.target} giorni su 7`, 'good');
  };

  // Configurazione da completare (esercizi del fisioterapista, dose di un integratore): sotto la timeline, non conta.
  const openSetup = () => {
    if (data.setup?.kind === 'calendario') window.location.hash = CALENDAR_TASK_HASH;
    else if (data.setup?.kind === 'fisio') setPhysioEditorOpen(true);
    else window.location.hash = 'impostazioni?sezione=integratori';
  };

  const controllo = items.find((i) => i.kind === 'controllo');
  const showCheckIn = !data.checkInDone && !status.controllo && !(controllo && data.beforeStart(controllo));

  const optionsSource = optionsItem ? statusSource(today, state, optionsItem) : null;
  // Il suggerimento sui gesti serve finché non si segna la prima voce, poi diventa rumore.
  const newUser = !Object.values(state.dayLogs).some((l) => Object.keys(l?.status ?? {}).length > 0);
  // L'orario della merenda pre-calcio accanto al conto alla rovescia, finché non lo dice già la card Adesso o è segnata.
  const preMatch = preMatchTime && data.now?.item.id !== preMatchItem?.id ? preMatchTime : undefined;
  const yesterday = addDays(today, -1);

  // I riflettori seguono lo stesso numero dell'anello: il punteggio della giornata (a giornata riuscita e chiusa, piena luce).
  // Il primo giorno i riflettori si accendono con un bagliore: il piano è pronto.
  const intensity = data.welcome ? 0.7 : heroKickoff ? 1 : summary.total ? Math.max(0.12, dayRingValue(summary, successful, data.complete)) : 0.3;
  const lightFlare = flare ? flare + 1 : data.welcome ? 1 : undefined;
  // Con la voce che non si segna ancora, la card Adesso guarda avanti: la spesa da fare o la giornata di domani.
  const pendingShop = data.pendingShopping;
  const lockedAction = pendingShop
    ? { kind: 'spesa' as const, onPress: () => openShopping(pendingShop.item, pendingShop.date) }
    : data.tomorrowItems.length
      ? { kind: 'domani' as const, onPress: () => setTomorrowOpen(true) }
      : null;
  const tomorrow = addDays(today, 1);

  return (
    <Screen
      title={fmtDayTitle(today)}
      eyebrow={eyebrow}
      light={{ intensity, tone: data.dayType, flare: lightFlare, curfew: curfewIn <= 0 && !data.complete }}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <DayTypeBadge
            dayType={data.dayType}
            label={data.matchEve ? 'Vigilia della partita' : undefined}
          />
          {/* Prima che il piano parta l'obiettivo del giorno non vale ancora. */}
          {startsIn <= 0 && <span className="t-callout font-semibold tabular text-ink-2">{fmtKcal(data.target.kcal)}</span>}
          {event &&
            (event.onPress ? (
              <button
                type="button"
                onClick={event.onPress}
                aria-haspopup="dialog"
                className="hit-44 t-footnote inline-flex h-7 items-center gap-1.5 rounded-full px-3 font-semibold text-accent-ink shadow-[inset_0_0_0_1px_var(--accent)] transition-transform duration-150 active:scale-95"
              >
                <event.icon size={14} strokeWidth={2.4} aria-hidden />
                {event.text}
              </button>
            ) : (
              <Pill tone={event.tone} icon={event.icon}>
                {event.text}
              </Pill>
            ))}
          {/* Il lavoro di oggi: solo informazione, non si segna e non conta. */}
          {data.work.length > 0 && (
            <Pill tone="neutral" icon={BriefcaseBusiness}>
              {`Lavoro ${formatWork(data.work)}`}
            </Pill>
          )}
        </span>
      }
      actions={<IconButton icon={Settings} label="Impostazioni" onClick={() => navigate('impostazioni')} />}
    >
      <DayHero
        summary={summary}
        streak={data.streak}
        nights={data.nights}
        successful={successful}
        complete={data.complete}
        phonePending={successful && phonePending ? { time: phonePending.time } : null}
        overdueCount={data.overdue.length}
        onRecover={() => openRecover(today, data.overdue, 'Recupera')}
        kickoff={heroKickoff}
        preMatch={preMatch}
        planDay={data.planDay}
        flare={justCompleted}
        weekAdherence={data.weekAdherence}
        welcome={data.welcome}
        onWelcomeSpot={(spot) => {
          const it = items.find((i) => i.id === spot.id) ?? data.tomorrowItems.find((i) => i.id === spot.id);
          if (it?.kind === 'spesa') openShopping(it, spot.tomorrow ? tomorrow : today);
        }}
      />

      {showPain && (
        <Callout
          tone={gate.level === 'riduci' ? 'bad' : 'warn'}
          title={gate.title}
          action={
            impactFootball && footballItem && !status[footballItem.id] ? (
              <Button
                size="sm"
                variant={advice.skip ? 'primary' : 'ghost'}
                onClick={() => {
                  setStatus(footballItem, 'saltato', 'per il dolore');
                  toast(`Saltato: ${footballItem.title}`, 'neutral', { actionLabel: 'Annulla', onAction: () => setStatus(footballItem, null) });
                }}
              >
                {`Salto ${impactFootball.the}`}
              </Button>
            ) : undefined
          }
        >
          {[painText, footballText].filter(Boolean).join(' ')}
        </Callout>
      )}

      {lowDay && (
        <Callout
          tone="accent"
          title="Giornata in salita?"
          action={
            <Button size="sm" variant="ghost" icon={Feather} onClick={() => setMinimal(true)}>
              Passa alla giornata minima
            </Button>
          }
        >
          Hai dormito poco o hai poca energia. Con la giornata minima bastano quattro cose e la giornata conta lo stesso.
        </Callout>
      )}

      {showCheckIn && <CheckInPrompt morning={nowM < 12 * 60} onOpen={() => open({ type: 'checkin', date: today })} />}

      <div className="flex flex-col gap-1.5">
        <NowCard
          pick={data.now}
          date={today}
          dayType={data.dayType}
          summary={summary}
          successful={successful}
          streak={data.streak}
          curfew={curfew}
          bed={bed}
          curfewIn={curfewIn}
          lockedUntil={data.now ? lockedUntil(data.now.item) : null}
          lockedAction={lockedAction}
          ritual={Boolean(data.now && phonePending && data.now.item.id === phonePending.id && ritualWindow)}
          mealValues={data.planned.bySlot}
          bedItem={data.bedItem}
          bedLocked={data.bedItem ? lockedUntil(data.bedItem) : null}
          justCompleted={justCompleted}
          shopping={data.shopping}
          onPlanB={openPlanB}
          onMark={(item) => markDone(item, { toast: item.kind !== 'letto' })}
          onOpen={openDetail}
          onOptions={onOptions}
          onRitual={() => setRitualOpen(true)}
        />
        {/* Le voci di ieri ancora aperte: una riga sotto Adesso, il mattino resta della colazione. */}
        {data.yesterdayOpen.length > 0 && (
          <RecoverLink
            text={yesterdayText(data.yesterdayOpen.length)}
            action="Sistema"
            onPress={() =>
              openRecover(yesterday, data.yesterdayOpen, 'Sistema ieri', 'Una dimenticanza non spezza la serie. Annulli tutto con una sola notifica.')
            }
          />
        )}
      </div>

      {showCurfew && <CurfewCard minutes={curfewIn} curfew={curfew} bed={bed} ritual={ritualWindow} onRitual={() => setRitualOpen(true)} />}

      <section className="flex flex-col gap-3" aria-labelledby="oggi-giornata">
        <SectionTitle
          id="oggi-giornata"
          subtitle={newUser ? 'Tocca il cerchio per segnare una voce, tienila premuta per le altre opzioni.' : undefined}
          action={
            <button
              type="button"
              onClick={() => setMinimal(!data.minimal)}
              aria-pressed={data.minimal}
              aria-label={data.minimal ? 'Giornata minima attiva: torna al piano completo' : 'Passa alla giornata minima: quattro cose essenziali'}
              className="hit-44 t-footnote inline-flex items-center gap-1.5 font-semibold text-accent-ink"
            >
              <Feather size={14} strokeWidth={2.4} aria-hidden />
              {data.minimal ? 'Piano completo' : 'Giornata minima'}
            </button>
          }
        >
          {data.minimal ? 'Giornata minima' : 'La giornata'}
        </SectionTitle>
        {data.minimal && (
          <Callout
            tone="good"
            icon={Feather}
            title="Quattro cose bastano"
            action={
              <Button size="sm" variant="ghost" onClick={() => setMinimal(false)}>
                Torna al piano completo
              </Button>
            }
          >
            Proteine, un frutto, integratori e telefono fuori dalla camera. Con tutte e quattro la giornata è riuscita.
          </Callout>
        )}
        <Card padding="none">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={data.minimal ? 'minima' : 'piano'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
              <Timeline
                items={items}
                dayType={data.dayType}
                status={status}
                notes={dayLog.notes}
                sourceOf={(item) => statusSource(today, state, item)}
                isBeforeStart={data.beforeStart}
                counts={data.counts}
                now={now}
                plan={plan}
                currentId={data.now?.item.id}
                overdueIds={overdueIds}
                onToggle={toggle}
                onBody={onBody}
                onOptions={onOptions}
                onPlanB={openPlanB}
              />
            </motion.div>
          </AnimatePresence>
        </Card>
        {data.setup && <SetupRow task={data.setup} onPress={openSetup} />}
      </section>

      {installShown && (
        <InstallCard
          compact
          note="L’app installata parte vuota. Per portarci i dati, in Impostazioni apri Backup ed esportazione e tocca Copia, poi nell’app scegli Hai già un backup? Ripristinalo."
          onDismiss={() => setInstallShown(false)}
        />
      )}

      <TrackersCard
        water={{
          glasses: dayLog.waterGlasses,
          targetL: profile.waterTargetL || 2.5,
          extraL: footballExtra,
          extraReason: footballExtra ? 'calcio +750 ml' : undefined,
          onAdd: addWater,
        }}
        sweets={{ week: data.weekSweets, today: dayLog.sweets, planned: plan.sweetsPerWeek, onAdd: addSweet }}
        step={step ? { status: step, onToggle: toggleStep } : null}
      />

      {/* Il primo giorno, con dei pasti già passati prima dell'avvio, i valori del menù intero non dicono niente. */}
      {data.fullMenu && (
        <DayValues planned={data.planned} eaten={data.eaten} target={data.valuesTarget} minimal={data.minimal} note={data.valuesNote} />
      )}
      <TipCard
        date={today}
        dayType={data.dayType}
        firstId={fiberRampWeek(today, plan) !== null ? 'fibre-gradualita' : undefined}
        context={{
          painThreshold: plan.painThreshold,
          impactThreshold: impactT,
          fiberG: data.target.fiberG,
          gymSessionId: day?.gymSessionId,
          afterMatch: plan.week.find((d) => d.weekday === weekdayOf(yesterday))?.football?.kind === 'partita',
        }}
      />

      <ItemActionsSheet
        key={optionsSession}
        item={optionsItem}
        dayType={data.dayType}
        status={optionsItem ? status[optionsItem.id] : undefined}
        lockedUntil={optionsItem ? lockedUntil(optionsItem) : null}
        source={optionsSource}
        note={optionsItem ? dayLog.notes[optionsItem.id] : undefined}
        onClose={() => setOptionsId(null)}
        onSet={(item, st, note) => {
          if (st === 'fatto') {
            if (item.kind === 'palestra' && !status[item.id]) return openQuickGym(item);
            markDone(item);
            return;
          }
          if (st === 'sostituito' && refuseLocked(item)) return;
          // Una nota scritta a mano al posto dell'ordine del piano B: l'ordine al bar non vale più.
          const slot = item.kind === 'pasto' ? item.slot : undefined;
          if (st === 'sostituito' && slot && dayLog.barMeals?.[slot] && (note ?? '') !== (dayLog.notes[item.id] ?? '')) {
            useApp.getState().setBarMeal(today, slot, null);
          }
          setStatus(item, st, note);
          if (st === 'sostituito' && !celebrateIfNeeded(item, 'sostituito')) toast('Segnato come sostituito', 'neutral');
          if (st === 'saltato') toast(`Saltato: ${item.title}`, 'neutral', { actionLabel: 'Annulla', onAction: () => setStatus(item, null) });
        }}
        onOpenDetail={openDetail}
        onPlanB={openPlanB}
      />

      <PhysioSheet
        open={physioOpen}
        physio={state.physio ?? { exercises: [], prescriptions: [] }}
        minutes={physioMinutes(state.physio)}
        done={status.fisio === 'fatto'}
        onClose={() => setPhysioOpen(false)}
        onDone={() => {
          const it = items.find((i) => i.kind === 'fisio');
          if (it && status[it.id] !== 'fatto') markDone(it, { toast: true });
        }}
        onSettings={() => setPhysioEditorOpen(true)}
      />
      <PhysioEditorSheet open={physioEditorOpen} onClose={() => setPhysioEditorOpen(false)} />

      {recover && (
        <RecoverSheet
          key={recover.session}
          open
          date={recover.date}
          items={recover.items}
          dayType={dayTypeFor(recover.date, plan)}
          title={recover.title}
          subtitle={recover.subtitle}
          onClose={() => setRecover(null)}
          onOpen={(item) => openDataFor(recover.date, item)}
        />
      )}

      {quickGym && quickGym.item.ref && (
        <QuickWorkoutSheet
          key={quickGym.session}
          open
          date={quickGym.date}
          sessionId={quickGym.item.ref}
          itemId={quickGym.item.id}
          onClose={() => setQuickGym(null)}
          onOpenPlayer={() => {
            const { ref } = quickGym.item;
            const date = quickGym.date;
            setQuickGym(null);
            if (ref) open({ type: 'session', sessionId: ref, date });
          }}
        />
      )}

      <EveningRitual
        open={ritualOpen}
        today={today}
        state={state}
        now={now}
        curfew={curfew}
        bed={bed}
        curfewIn={curfewIn}
        done={Boolean(phone && status[phone.id])}
        onClose={() => setRitualOpen(false)}
        onPhoneOut={(time) => {
          if (!phone) return;
          if (!markDone(phone, { note: `Telefono fuori alle ${time}` })) toast(`Buonanotte. Telefono fuori alle ${time}`, 'good');
        }}
      />

      <TomorrowSheet
        open={tomorrowOpen}
        date={tomorrow}
        items={data.tomorrowItems}
        dayType={dayTypeFor(tomorrow, plan)}
        matchEve={isMatchEve(tomorrow, plan)}
        onClose={() => setTomorrowOpen(false)}
        onShopping={() => {
          const it = data.tomorrowItems.find((i) => i.kind === 'spesa');
          setTomorrowOpen(false);
          if (it) openShopping(it, tomorrow);
        }}
      />

      {reviewOpen && <ReviewSheet weekStart={reviewWeekFor(today)} today={today} onClose={() => setReviewOpen(false)} />}
    </Screen>
  );
}
