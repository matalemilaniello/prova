/**
 * Oggi: il cuore di Ritmo. Il tabellone della giornata, cosa fare adesso, la timeline da segnare con un tocco,
 * acqua, dolci, valori del giorno e un consiglio. Tutto deciso dal piano: l'utente esegue e segna.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Clock, Feather, Settings } from 'lucide-react';
import type { FootballKind, HHMM, ISODate, ItemStatus, MealSlot } from '../../domain/types';
import { navigate } from '../../app/router';
import { addDays, daysBetween, formatWeekday, weekIndexSince, weekdayOf } from '../../engine/dates';
import { dayTypeFor } from '../../engine/menu';
import { fiberRampWeek } from '../../engine/nutrition';
import { STEP_ITEM_ID, reviewWeekFor, weeklyStepStatus } from '../../engine/review';
import { bedtimeFor, checkInSleepHours, curfewFor } from '../../engine/sleep';
import {
  canMarkNow,
  dayMinutes,
  firstUseOf,
  isSuccessful,
  markableFrom,
  minutesToCurfew,
  physioMinutes,
  STARTER_SHOPPING_ID,
  statusSource,
  type AdherenceSummary,
  type DayItem,
} from '../../engine/timeline';
import { IMPACT_PAIN_THRESHOLD, painGate } from '../../engine/training';
import { DAY_TYPE_LABEL, FOOTBALL_LABEL, fmtDayTitle, fmtKcal, plural } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useDayLog, useNowHHMM, usePlanDay } from '../../state/hooks';
import { useApp, useUi } from '../../state/store';
import { Button, Callout, Card, DayTypeBadge, IconButton, Pill, Screen, SectionTitle, fade } from '../../ui';
import { PhysioEditorSheet } from '../allenamento/PhysioEditor';
import { InstallCard } from '../impostazioni/components/InstallCard';
import { installReminderDue, markInstallReminded } from '../impostazioni/install';
import { ReviewSheet } from '../progressi/ReviewSheet';
import { RecoverSheet, YesterdayCard } from './components/CatchUp';
import { DayHero } from './components/DayHero';
import { DayValues } from './components/DayValues';
import { EveningRitual } from './components/EveningRitual';
import { ItemActionsSheet } from './components/ItemActionsSheet';
import { NowCard } from './components/NowCard';
import { PhysioSheet } from './components/PhysioSheet';
import { QuickWorkoutSheet } from './components/QuickWorkoutSheet';
import { CheckInPrompt, CurfewCard, TipCard } from './components/SmallCards';
import { StepCard } from './components/StepCard';
import { Timeline } from './components/Timeline';
import { TrackersCard } from './components/Trackers';
import { opensDetail } from './kinds';
import { useOggi } from './useOggi';

/** La card del coprifuoco compare dalle 20:00: prima la timeline basta. */
const CURFEW_CARD_FROM_MIN = 20 * 60;
/** Il rito della sera si apre da 15 minuti prima del coprifuoco. */
const RITUAL_LEAD_MIN = 15;
/** Acqua in più nei giorni di calcio: con 60-90 minuti di gioco si perde oltre un litro di sudore. */
const FOOTBALL_EXTRA_WATER_L = 0.75;

const FOOTBALL_NOUN: Record<FootballKind, { the: string; it: string }> = {
  partita: { the: 'la partita', it: 'saltala' },
  calcetto: { the: 'il calcetto', it: 'saltalo' },
  allenamento: { the: 'l’allenamento', it: 'saltalo' },
};

interface RecoverState {
  date: ISODate;
  items: DayItem[];
  title: string;
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

  const setStatus = useCallback(
    (item: DayItem, st: ItemStatus | null, note?: string) => useApp.getState().setItemStatus(today, item.id, st, note),
    [today],
  );

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

  const goSettimana = useCallback((tab: 'spesa' | 'preparazione' | 'spesa-avvio') => {
    // La scheda e la settimana viaggiano nell'hash: Settimana li legge anche se è già aperta.
    // La preparazione apre subito il lettore a schermo intero; la spesa di avvio è quella di questa settimana.
    window.location.hash =
      tab === 'preparazione'
        ? 'settimana?tab=preparazione&settimana=prossima&guida=1'
        : tab === 'spesa-avvio'
          ? 'settimana?tab=spesa&settimana=corrente'
          : 'settimana?tab=spesa&settimana=prossima';
  }, []);

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
          goSettimana(item.id === STARTER_SHOPPING_ID ? 'spesa-avvio' : 'spesa');
          break;
        case 'preparazione':
          goSettimana('preparazione');
          break;
        case 'revisione':
          setReviewOpen(true);
          break;
        default:
          break;
      }
    },
    [open, today, goSettimana],
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

  const openRecover = (date: ISODate, list: DayItem[], title: string) =>
    setRecover((r) => ({ date, items: list, title, session: (r?.session ?? 0) + 1 }));

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
        toast('Oltre i previsti: domani merenda proteica alle 16:30', 'warn', { actionLabel: 'Annulla', onAction: () => useApp.getState().addSweet(today, -delta) });
      } else {
        toast(after === plan.sweetsPerWeek ? 'Segnato: era l’ultimo previsto' : 'Segnato, goditelo', 'neutral', {
          actionLabel: 'Annulla',
          onAction: () => useApp.getState().addSweet(today, -delta),
        });
      }
    }
  };

  // ── Intestazione ──

  const event =
    !data.kickoff && day?.football
      ? `${FOOTBALL_LABEL[day.football.kind]} alle ${day.football.time}`
      : day?.gymSessionId
        ? `Seduta ${day.gymSessionId}${day.gymOptional ? ' facoltativa' : ''} alle ${day.gymTime ?? '17:00'}`
        : null;
  // La settimana del piano, detta per intero: "settimana 4" accanto al mese si leggeva "quarta di novembre".
  const week = weekIndexSince(plan.startDate, today) + 1;
  const startsIn = daysBetween(today, plan.startDate);
  const eyebrow =
    startsIn > 0 && startsIn <= 7 ? `Il piano parte ${startsIn === 1 ? 'domani' : formatWeekday(plan.startDate)}` : week > 0 ? `Settimana ${week} del piano` : undefined;
  const firstUse = firstUseOf(plan);

  // ── Avvisi ──

  const gate = useMemo(
    () => painGate({ plan, checkIns, profile, workoutLogs, footballLogs }, today),
    [plan, checkIns, profile, workoutLogs, footballLogs, today],
  );
  const football = data.kickoff ? FOOTBALL_NOUN[data.kickoff.kind] : null;
  // Il calcio è un carico d'impatto: con una zona sotto il ginocchio oltre la soglia degli impatti
  // l'avviso parla della partita anche quando il resto della giornata va come previsto.
  const impactFootball = gate.impact && football ? football : null;
  const impactT = Math.min(plan.painThreshold, IMPACT_PAIN_THRESHOLD);
  let painText = gate.message;
  let footballText: string | null = null;
  if (impactFootball) {
    painText = gate.level === 'ok' ? `Negli impatti la soglia è più bassa, ${impactT} su 10.` : painText.replace(/\s*Scrivi al fisioterapista oggi\./, '');
    footballText =
      gate.level === 'riduci'
        ? `Stasera salta ${impactFootball.the}: con questo dolore gli impatti peggiorano le cose. Scrivi al fisioterapista oggi.`
        : gate.level === 'mantieni'
          ? `Senti il fisioterapista prima di giocare. Se giochi, nel riscaldamento il dolore non deve superare ${impactT}: altrimenti fermati.`
          : `Stasera ${impactFootball.the} solo se saltellando su una gamba il dolore resta entro ${impactT}. Altrimenti ${impactFootball.it} e scrivi al fisioterapista oggi.`;
  }
  const showPain = gate.level !== 'ok' || Boolean(impactFootball);
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

  const controllo = items.find((i) => i.kind === 'controllo');
  const showCheckIn = !data.checkInDone && !status.controllo && !(controllo && data.beforeStart(controllo));

  const optionsSource = optionsItem ? statusSource(today, state, optionsItem) : null;
  // Il suggerimento sui gesti serve nei primi giorni, poi diventa rumore.
  const newUser = Object.keys(state.dayLogs).length < 4;
  const preMatch = items.find((i) => i.kind === 'pasto' && i.slot === 'merenda' && i.title.startsWith('Merenda pre-'))?.time;
  const yesterday = addDays(today, -1);

  const intensity = data.complete || data.kickoff ? 1 : summary.total ? Math.max(0.12, (summary.done + summary.replaced) / summary.total) : 0.3;

  return (
    <Screen
      title={fmtDayTitle(today)}
      eyebrow={eyebrow}
      light={{ intensity, tone: data.dayType, flare: flare || undefined, curfew: curfewIn <= 0 && !data.complete }}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <DayTypeBadge
            dayType={data.dayType}
            label={data.matchEve ? `${DAY_TYPE_LABEL[data.dayType]}, vigilia della partita` : undefined}
          />
          <span className="t-callout font-semibold tabular text-ink-2">{fmtKcal(data.target.kcal)}</span>
          {event && (
            <Pill tone="neutral" icon={Clock}>
              {event}
            </Pill>
          )}
        </span>
      }
      actions={<IconButton icon={Settings} label="Impostazioni" onClick={() => navigate('impostazioni')} />}
      contentClassName="gap-5"
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
        kickoff={data.kickoff}
        preMatch={preMatch}
        flare={justCompleted}
        weekAdherence={data.weekAdherence}
        firstDay={data.firstDay && firstUse ? { time: firstUse.time } : null}
      />

      {showPain && (
        <Callout
          tone={gate.level === 'riduci' ? 'bad' : 'warn'}
          title={gate.title}
          action={
            impactFootball && footballItem && !status[footballItem.id] ? (
              <Button
                size="sm"
                variant="ghost"
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
          {painText}
          {footballText ? ` ${footballText}` : ''}
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

      {data.yesterdayOpen.length > 0 && (
        <YesterdayCard
          key={yesterday}
          date={yesterday}
          items={data.yesterdayOpen}
          dayType={dayTypeFor(yesterday, plan)}
          onMore={() => openRecover(yesterday, data.yesterdayOpen, 'Sistema ieri')}
          onOpen={(item) => openDataFor(yesterday, item)}
        />
      )}

      {showCheckIn && <CheckInPrompt morning={nowM < 12 * 60} onOpen={() => open({ type: 'checkin', date: today })} />}

      <NowCard
        pick={data.now}
        dayType={data.dayType}
        summary={summary}
        successful={successful}
        streak={data.streak}
        curfew={curfew}
        bed={bed}
        curfewIn={curfewIn}
        lockedUntil={data.now ? lockedUntil(data.now.item) : null}
        ritual={Boolean(data.now && phonePending && data.now.item.id === phonePending.id && ritualWindow)}
        mealValues={data.planned.bySlot}
        bedItem={data.bedItem}
        bedLocked={data.bedItem ? lockedUntil(data.bedItem) : null}
        justCompleted={justCompleted}
        onMark={(item) => markDone(item, { toast: item.kind !== 'letto' })}
        onOpen={openDetail}
        onOptions={onOptions}
        onRitual={() => setRitualOpen(true)}
      />

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
                setupRow={
                  data.physioSetup && !data.minimal
                    ? {
                        time: data.physioSetup,
                        title: 'Aggiungi gli esercizi del fisioterapista',
                        detail: 'Inseriscili una volta, poi li ritrovi qui',
                        onPress: () => setPhysioEditorOpen(true),
                      }
                    : null
                }
                onToggle={toggle}
                onBody={onBody}
                onOptions={onOptions}
                onPlanB={openPlanB}
              />
            </motion.div>
          </AnimatePresence>
        </Card>
      </section>

      {installShown && (
        <InstallCard
          compact
          note="L’app installata parte vuota. Per portarci i dati, in Impostazioni apri Backup ed esportazione e tocca Copia, poi nell’app scegli Hai già un backup? Ripristinalo."
          onDismiss={() => setInstallShown(false)}
        />
      )}

      {step && <StepCard status={step} onToggle={toggleStep} />}

      <TrackersCard
        water={{
          glasses: dayLog.waterGlasses,
          targetL: profile.waterTargetL || 2.5,
          extraL: footballExtra,
          extraReason: footballExtra ? 'calcio +750 ml' : undefined,
          onAdd: addWater,
        }}
        sweets={{ week: data.weekSweets, today: dayLog.sweets, planned: plan.sweetsPerWeek, onAdd: addSweet }}
      />

      <DayValues planned={data.planned} eaten={data.eaten} target={data.target} minimal={data.minimal} />
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

      {reviewOpen && <ReviewSheet weekStart={reviewWeekFor(today)} today={today} onClose={() => setReviewOpen(false)} />}
    </Screen>
  );
}
