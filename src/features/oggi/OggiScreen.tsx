/**
 * Oggi: il cuore di Ritmo. Cosa fare adesso, la timeline da segnare con un tocco, acqua, dolci,
 * valori del giorno e un consiglio. Tutto deciso dal piano: l'utente esegue e segna.
 */
import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Clock, Feather, Settings } from 'lucide-react';
import type { FootballKind, ItemStatus, MealSlot, TimelineItem } from '../../domain/types';
import { navigate } from '../../app/router';
import { addDays, formatMonth, hhmmToMin, weekIndexSince, weekdayOf } from '../../engine/dates';
import { dayCutoffMin, dayMinutes, isSuccessful, minutesToCurfew, physioMinutes, statusSource } from '../../engine/timeline';
import { bedtimeFor, checkInSleepHours, curfewFor } from '../../engine/sleep';
import { FOOTBALL_LABEL, fmtDayTitle, fmtKcal, listIt } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useDayLog, useNowHHMM, useToday } from '../../state/hooks';
import { useApp, useUi } from '../../state/store';
import { Button, Callout, Card, DayTypeBadge, IconButton, ListGroup, ListRow, Pill, Screen, SectionTitle, Toggle, fade } from '../../ui';
import { DayHero } from './components/DayHero';
import { DayValues } from './components/DayValues';
import { ItemActionsSheet } from './components/ItemActionsSheet';
import { NowCard } from './components/NowCard';
import { PhysioSheet } from './components/PhysioSheet';
import { CheckInPrompt, CurfewCard, TipCard } from './components/SmallCards';
import { Timeline } from './components/Timeline';
import { SweetsCard, WaterCard } from './components/Trackers';
import { opensDetail } from './kinds';
import { useOggi } from './useOggi';

const EVENING_FROM_MIN = 18 * 60;

export default function OggiScreen() {
  const calendarDay = useToday();
  const now = useNowHHMM();
  const sleep = useApp((s) => s.plan.sleep);
  // Dopo mezzanotte e prima della sveglia la giornata è ancora quella di ieri (a letto alle 00:45).
  const today = hhmmToMin(now) < dayCutoffMin({ sleep }) ? addDays(calendarDay, -1) : calendarDay;
  const data = useOggi(today, now);
  const { state, items, status, summary } = data;
  const plan = state.plan;
  const dayLog = useDayLog(today);
  const profile = useApp((s) => s.profile);
  const checkIn = useApp((s) => s.checkIns[today]);
  const open = useUi((s) => s.open);
  const toast = useUi((s) => s.toast);

  const [optionsId, setOptionsId] = useState<string | null>(null);
  // Ogni apertura del foglio delle opzioni è una nuova istanza: riaprirlo mentre si chiude non si accavalla.
  const [optionsSession, setOptionsSession] = useState(0);
  const [physioOpen, setPhysioOpen] = useState(false);
  const optionsItem = optionsId ? (items.find((i) => i.id === optionsId) ?? null) : null;

  const curfew = curfewFor(today, plan);
  const bed = bedtimeFor(today, plan);
  const curfewIn = minutesToCurfew(today, now, plan);
  const nowM = dayMinutes(now, plan);
  const successful = isSuccessful(summary);
  const overdueIds = useMemo(() => new Set(data.overdue.map((i) => i.id)), [data.overdue]);

  // ── Azioni ──

  const setStatus = useCallback(
    (item: TimelineItem, st: ItemStatus | null, note?: string) => useApp.getState().setItemStatus(today, item.id, st, note),
    [today],
  );

  /** Segna fatto e festeggia con sobrietà quando la giornata diventa riuscita. */
  const markDone = useCallback(
    (item: TimelineItem, opts: { toast?: boolean } = {}) => {
      const prev = status[item.id];
      const counts = item.kind !== 'letto';
      let after = summary;
      if (counts && prev !== 'fatto') {
        const done = summary.done + 1;
        const replaced = summary.replaced - (prev === 'sostituito' ? 1 : 0);
        const skipped = summary.skipped - (prev === 'saltato' ? 1 : 0);
        after = {
          ...summary,
          done,
          replaced,
          skipped,
          pending: summary.total - done - replaced - skipped,
          score: summary.total ? (done + replaced * 0.5) / summary.total : 0,
        };
      }
      setStatus(item, 'fatto');
      const becameSuccessful = !isSuccessful(summary) && isSuccessful(after);
      haptic('success');
      if (becameSuccessful) {
        toast(`Giornata riuscita. Serie a ${data.streak.days + (data.streak.includesToday ? 0 : 1)} giorni`, 'good');
      } else if (opts.toast) {
        toast(`Segnato: ${item.title}`, 'good', { actionLabel: 'Annulla', onAction: () => setStatus(item, prev ?? null) });
      }
    },
    [status, summary, setStatus, toast, data.streak],
  );

  const openDetail = useCallback(
    (item: TimelineItem) => {
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
        default:
          break;
      }
    },
    [open, today],
  );

  const onOptions = useCallback((item: TimelineItem) => {
    setOptionsSession((n) => n + 1);
    setOptionsId(item.id);
  }, []);

  /** Tocco sul cerchio: da fare → fatto; fatto → da fare. Il calcio chiede minuti e RPE. */
  const toggle = useCallback(
    (item: TimelineItem) => {
      const st = status[item.id];
      if (!st) {
        if (item.kind === 'calcio') return openDetail(item);
        if (item.kind === 'controllo' && !checkIn) return openDetail(item);
        return markDone(item);
      }
      if (statusSource(today, state, item) === 'registro') {
        haptic('selection');
        return onOptions(item);
      }
      haptic('selection');
      setStatus(item, null);
    },
    [status, openDetail, markDone, today, state, setStatus, checkIn, onOptions],
  );

  const onBody = useCallback((item: TimelineItem) => (opensDetail(item) ? openDetail(item) : toggle(item)), [openDetail, toggle]);
  const openPlanB = useCallback((slot?: MealSlot) => open({ type: 'barPlanB', slot }), [open]);

  const showOverdue = () => {
    const first = data.overdue[0];
    if (!first) return;
    document.getElementById(`voce-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const setMinimal = (on: boolean) => {
    useApp.getState().setMinimal(today, on);
    toast(on ? 'Giornata minima attiva' : 'Piano completo', 'neutral');
  };

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

  const day = plan.week.find((d) => d.weekday === weekdayOf(today));
  const event = day?.football
    ? `${FOOTBALL_LABEL[day.football.kind]} alle ${day.football.time}`
    : day?.gymSessionId
      ? `Seduta ${day.gymSessionId}${day.gymOptional ? ' facoltativa' : ''} alle ${day.gymTime ?? '17:00'}`
      : null;
  const week = weekIndexSince(plan.startDate, today) + 1;
  const eyebrow = week > 0 ? `${formatMonth(today)} · settimana ${week}` : formatMonth(today);

  // ── Avvisi ──

  const threshold = plan.painThreshold;
  const painHigh = Object.entries(checkIn?.pain ?? {}).filter(([site, v]) => v > threshold && profile.painSites.includes(site));
  const lowDay =
    !data.minimal &&
    checkIn &&
    ((typeof checkIn.energy === 'number' && checkIn.energy <= 3) || (checkInSleepHours(checkIn) ?? 8) < 5.5);

  const curfewItem = items.find((i) => i.kind === 'coprifuoco' || i.id === 'minima:telefono');
  const showCurfew =
    Boolean(curfewItem) &&
    !status[curfewItem!.id] &&
    nowM >= EVENING_FROM_MIN &&
    curfewIn > -60 &&
    data.now?.item.id !== curfewItem!.id;

  const optionsSource = optionsItem ? statusSource(today, state, optionsItem) : null;
  // Il suggerimento sui gesti serve nei primi giorni, poi diventa rumore.
  const newUser = Object.keys(state.dayLogs).length < 4;

  return (
    <Screen
      title={fmtDayTitle(today)}
      eyebrow={eyebrow}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <DayTypeBadge dayType={data.dayType} />
          <span className="t-mono text-ink-2">{fmtKcal(data.target.kcal)}</span>
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
      {!data.checkInDone && (
        <CheckInPrompt morning={nowM < 12 * 60} onOpen={() => open({ type: 'checkin', date: today })} />
      )}

      {painHigh.length > 0 && (
        <Callout tone="warn" title={`${listIt(painHigh.map(([s], i) => (i === 0 ? s : s.toLowerCase())))} sopra soglia: ${listIt(painHigh.map(([, v]) => String(v)))} su 10`}>
          Oggi mantieni o riduci il carico: niente balzi né sprint al massimo.
          {painHigh.some(([s]) => s.toLowerCase() === 'gomito') ? ' Spinte solo con manubri a presa neutra.' : ''} Se domani non scende,
          senti il fisioterapista.
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

      <NowCard
        pick={data.now}
        dayType={data.dayType}
        summary={summary}
        curfew={curfew}
        bed={bed}
        curfewIn={curfewIn}
        onMark={(item) => markDone(item, { toast: true })}
        onOpen={openDetail}
        onOptions={onOptions}
      />

      <DayHero summary={summary} streak={data.streak} successful={successful} overdueCount={data.overdue.length} onShowOverdue={showOverdue} />

      {showCurfew && curfewItem && <CurfewCard minutes={curfewIn} curfew={curfew} bed={bed} onDone={() => markDone(curfewItem, { toast: true })} />}

      <section className="flex flex-col gap-3" aria-labelledby="oggi-giornata">
        <SectionTitle
          id="oggi-giornata"
          subtitle={newUser ? 'Tocca il cerchio per segnare una voce, tienila premuta per le altre opzioni.' : undefined}
          action={<span className="t-mono whitespace-nowrap text-ink-3">{`${summary.done + summary.replaced} su ${summary.total}`}</span>}
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
                status={status}
                notes={dayLog.notes}
                sourceOf={(item) => statusSource(today, state, item)}
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
        <ListGroup>
          <ListRow
            icon={Feather}
            iconTone="leggero"
            title="Giornata minima"
            subtitle="Per i giorni no: quattro cose essenziali"
            trailing={<Toggle checked={data.minimal} onChange={setMinimal} label="Giornata minima" />}
          />
        </ListGroup>
      </section>

      <section className="flex flex-col gap-3" aria-label="Acqua e dolci">
        <SectionTitle>Acqua e dolci</SectionTitle>
        <WaterCard glasses={dayLog.waterGlasses} targetL={profile.waterTargetL || 2.5} onAdd={addWater} />
        <SweetsCard week={data.weekSweets} today={dayLog.sweets} planned={plan.sweetsPerWeek} onAdd={addSweet} />
      </section>

      <section className="flex flex-col gap-3" aria-label="Valori e consiglio">
        <SectionTitle>Nutrizione</SectionTitle>
        <DayValues planned={data.planned} eaten={data.eaten} target={data.target} minimal={data.minimal} />
        <TipCard date={today} dayType={data.dayType} />
      </section>

      <ItemActionsSheet
        key={optionsSession}
        item={optionsItem}
        status={optionsItem ? status[optionsItem.id] : undefined}
        source={optionsSource}
        note={optionsItem ? dayLog.notes[optionsItem.id] : undefined}
        onClose={() => setOptionsId(null)}
        onSet={(item, st, note) => {
          if (st === 'fatto') markDone(item);
          else setStatus(item, st, note);
          if (st === 'sostituito') toast('Segnato come sostituito', 'neutral');
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
        onSettings={() => navigate('impostazioni')}
      />
    </Screen>
  );
}
