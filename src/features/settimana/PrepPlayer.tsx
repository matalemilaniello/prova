/**
 * Lettore della preparazione della domenica, a schermo intero come il lettore della seduta: un'attività alla
 * volta con i passaggi, i timer delle cotture (uno per pentola, anche insieme) e l'avanzamento. Mentre una
 * cottura va, propone l'attività successiva. I timer vivono in `prepTimers`: chiudendo il lettore continuano
 * e a fine cottura avvisano comunque. Lo schermo resta acceso dove il browser lo consente.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Flame, Play, Timer, X } from 'lucide-react';
import type { ISODate, PrepTask } from '../../domain/types';
import { PREP_GUIDE, type PrepTimer } from '../../data/menu';
import { RECIPES } from '../../data/recipes';
import { addDays, formatDayLong } from '../../engine/dates';
import { capitalize, fmtMinutes, plural } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { Button, Card, FullScreenModal, IconButton, ProgressRing, toneRing } from '../../ui';
import { cn } from '../../ui/cn';
import { DishArt } from './art/DishArt';
import { clockLabel, prepTimers, type PotTimer } from './prepTimers';

export interface PrepPlayerProps {
  open: boolean;
  weekStart: ISODate;
  /** Attività nell'ordine consigliato. */
  tasks: PrepTask[];
  /** Id delle attività già fatte. */
  done: readonly string[];
  onToggle: (task: PrepTask) => void;
  onClose: () => void;
}

/** Orario attuale in millisecondi, aggiornato solo mentre serve. */
function useNowMs(on: boolean, ms = 500): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), ms);
    const onVis = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [on, ms]);
  return now;
}

/** Tiene acceso lo schermo mentre si cucina, dove il browser lo consente. */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on) return;
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } };
    if (!nav.wakeLock) return;
    let sentinel: Sentinel | null = null;
    let alive = true;
    const req = () => {
      nav.wakeLock
        ?.request('screen')
        .then((s) => {
          if (alive) sentinel = s;
          else void s.release();
        })
        .catch(() => undefined);
    };
    req();
    const onVis = () => {
      if (document.visibilityState === 'visible') req();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVis);
      void sentinel?.release().catch(() => undefined);
    };
  }, [on]);
}

export function PrepPlayer({ open, weekStart, tasks, done, onToggle, onClose }: PrepPlayerProps) {
  const doneSet = useMemo(() => new Set(done), [done]);
  const [index, setIndex] = useState(() => Math.max(0, tasks.findIndex((t) => !doneSet.has(t.id))));
  const timers = useSyncExternalStore(prepTimers.subscribe, () => prepTimers.get(weekStart), () => prepTimers.get(weekStart));
  const now = useNowMs(timers.length > 0);
  const reduce = useReducedMotion();
  useWakeLock(open);

  const total = tasks.reduce((a, t) => a + t.minutes, 0);
  const doneCount = tasks.filter((t) => doneSet.has(t.id)).length;
  const allDone = tasks.length > 0 && doneCount === tasks.length;
  const i = Math.min(index, Math.max(0, tasks.length - 1));
  const task = tasks[i];
  const prepDay = addDays(weekStart, -1);

  const nextOpen = (from: number, also?: string) =>
    tasks.findIndex((t, k) => k !== from && !doneSet.has(t.id) && t.id !== also && k > from) >= 0
      ? tasks.findIndex((t, k) => k !== from && !doneSet.has(t.id) && t.id !== also && k > from)
      : tasks.findIndex((t, k) => k !== from && !doneSet.has(t.id) && t.id !== also);

  const markDone = () => {
    if (!task) return;
    if (doneSet.has(task.id)) {
      const n = nextOpen(i);
      setIndex(n >= 0 ? n : Math.min(i + 1, tasks.length - 1));
      return;
    }
    haptic('success');
    prepTimers.clearTask(weekStart, task.id);
    onToggle(task);
    const n = nextOpen(i, task.id);
    if (n >= 0) setIndex(n);
  };

  const go = (d: number) => {
    const n = Math.max(0, Math.min(tasks.length - 1, i + d));
    if (n !== i) {
      haptic('selection');
      setIndex(n);
    }
  };

  const running = timers.filter((t) => t.endsAt > now);
  const subtitle = `${capitalize(formatDayLong(prepDay))} · ${fmtMinutes(total)}`;

  return (
    <FullScreenModal
      open={open}
      onClose={onClose}
      title="Preparazione"
      subtitle={subtitle}
      closeIcon="down"
      closeLabel={running.length ? 'Chiudi: i timer continuano' : 'Chiudi la preparazione'}
      footer={
        allDone ? (
          <Button fullWidth size="lg" icon={Check} onClick={onClose}>
            Chiudi
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <IconButton icon={ChevronLeft} label="Attività precedente" variant="tinted" size="lg" onClick={() => go(-1)} disabled={i === 0} />
            <Button fullWidth size="lg" icon={doneSet.has(task?.id ?? '') ? ArrowRight : Check} onClick={markDone}>
              {doneSet.has(task?.id ?? '') ? 'Avanti' : 'Fatto'}
            </Button>
            <IconButton icon={ChevronRight} label="Attività successiva" variant="tinted" size="lg" onClick={() => go(1)} disabled={i >= tasks.length - 1} />
          </div>
        )
      }
    >
      <div className="flex flex-col gap-6 pb-4 pt-2">
        <Progress tasks={tasks} doneSet={doneSet} current={allDone ? -1 : i} onPick={(k) => setIndex(k)} />

        {timers.length > 0 && <OnTheFire week={weekStart} timers={timers} tasks={tasks} now={now} />}

        <AnimatePresence mode="wait" initial={false}>
          {allDone ? (
            <motion.div key="fine" initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <Finale tasks={tasks} total={total} />
            </motion.div>
          ) : task ? (
            <motion.div
              key={task.id}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <TaskStep
                week={weekStart}
                task={task}
                position={i + 1}
                count={tasks.length}
                isDone={doneSet.has(task.id)}
                timers={timers}
                now={now}
                next={(() => {
                  const n = nextOpen(i, task.id);
                  return n >= 0 ? { task: tasks[n], index: n } : undefined;
                })()}
                onGo={(k) => setIndex(k)}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </FullScreenModal>
  );
}

// ───────────────────────── Parti ─────────────────────────

function Progress({ tasks, doneSet, current, onPick }: { tasks: PrepTask[]; doneSet: Set<string>; current: number; onPick: (i: number) => void }) {
  const doneCount = tasks.filter((t) => doneSet.has(t.id)).length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="t-label text-ink-3">{current >= 0 ? `Attività ${current + 1} di ${tasks.length}` : 'Completata'}</span>
        <span className="t-footnote text-ink-2">
          <span className="font-semibold text-ink tabular">{doneCount}</span> su {tasks.length} fatte
        </span>
      </div>
      <div className="flex gap-1.5" role="group" aria-label="Attività">
        {tasks.map((t, k) => {
          const isDone = doneSet.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onPick(k)}
              aria-label={`${k + 1}. ${t.title}${isDone ? ', fatta' : ''}`}
              aria-current={k === current ? 'step' : undefined}
              className="hit-44 relative h-1.5 flex-1 rounded-full"
              style={{
                background: isDone ? 'var(--good)' : k === current ? 'var(--accent)' : 'var(--ink-soft)',
                boxShadow: k === current && !isDone ? '0 0 8px var(--accent)' : undefined,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function OnTheFire({ week, timers, tasks, now }: { week: ISODate; timers: PotTimer[]; tasks: PrepTask[]; now: number }) {
  return (
    <section className="flex flex-col gap-2" aria-labelledby="prep-fuoco">
      <h3 id="prep-fuoco" className="t-label flex items-center gap-1.5 px-1 text-ink-3">
        <Flame aria-hidden size={14} strokeWidth={2.4} />
        Sul fuoco
      </h3>
      <Card padding="none">
        <ul>
          {timers.map((t, k) => {
            const totalMs = Math.max(1, t.endsAt - t.startedAt);
            const left = Math.max(0, t.endsAt - now);
            const finished = left <= 0;
            const owner = tasks.find((x) => x.id === t.taskId);
            return (
              <li
                key={t.id}
                className={cn(
                  'flex min-h-[64px] items-center gap-3 px-4 py-2.5',
                  k > 0 && 'relative before:absolute before:left-[68px] before:right-0 before:top-0 before:h-px before:bg-line',
                )}
              >
                <ProgressRing
                  value={1 - left / totalMs}
                  size={40}
                  stroke={4}
                  tone={finished ? 'good' : 'accent'}
                  celebrate={false}
                  gradient={false}
                  label={`${t.label}: ${finished ? 'pronto' : `mancano ${clockLabel(left / 1000)}`}`}
                >
                  {finished ? <Check aria-hidden size={16} strokeWidth={3} className="text-good-ink" /> : <Timer aria-hidden size={15} strokeWidth={2.4} className="text-ink-2" />}
                </ProgressRing>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="t-callout font-semibold text-ink">{t.label}</span>
                  {owner && <span className="t-caption truncate text-ink-3">{owner.title}</span>}
                </span>
                {finished ? (
                  <>
                    <span className="t-headline text-good-ink">Pronto</span>
                    <IconButton icon={X} label={`Togli il timer: ${t.label}`} size="sm" onClick={() => prepTimers.remove(week, t.id)} />
                  </>
                ) : (
                  <>
                    <span className="t-num text-[1.75rem] leading-none text-ink tabular" aria-hidden>
                      {clockLabel(left / 1000)}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => prepTimers.adjust(week, t.id, 1)} aria-label={`Un minuto in più: ${t.label}`} className="-mr-2 px-2.5">
                      +1
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

function TaskStep({
  week,
  task,
  position,
  count,
  isDone,
  timers,
  now,
  next,
  onGo,
}: {
  week: ISODate;
  task: PrepTask;
  position: number;
  count: number;
  isDone: boolean;
  timers: PotTimer[];
  now: number;
  next?: { task: PrepTask; index: number };
  onGo: (index: number) => void;
}) {
  const guide = PREP_GUIDE[task.id];
  const steps = guide?.steps?.length ? guide.steps : [task.yields];
  const pots = guide?.timers ?? [];
  const recipes = (task.recipeIds ?? []).map((id) => RECIPES[id]).filter(Boolean);
  const mine = timers.filter((t) => t.taskId === task.id);
  const cooking = mine.some((t) => t.endsAt > now);

  return (
    <article className="flex flex-col gap-5" aria-label={`Attività ${position} di ${count}: ${task.title}`}>
      <header className="flex flex-col gap-2">
        <p className="t-label inline-flex items-center gap-1.5 text-ink-3">
          {isDone ? (
            <>
              <Check aria-hidden size={14} strokeWidth={3} className="text-good-ink" />
              <span className="text-good-ink">Fatta</span>
            </>
          ) : (
            <>
              <Timer aria-hidden size={14} strokeWidth={2.4} />
              {task.minutes} min
            </>
          )}
        </p>
        <h2 className={cn('t-title', isDone ? 'text-ink-2' : 'text-ink')}>{task.title}</h2>
        <p className="t-callout text-ink-2">{task.yields}</p>
      </header>

      {pots.length > 0 && !isDone && (
        <div className="flex flex-col gap-2">
          {pots.map((p) => (
            <PotButton key={p.label} week={week} taskId={task.id} pot={p} timer={mine.find((t) => t.label === p.label)} now={now} />
          ))}
        </div>
      )}

      {cooking && next && !isDone && (
        <button
          type="button"
          onClick={() => {
            haptic('selection');
            onGo(next.index);
          }}
          className="flex items-center gap-3 rounded-card p-4 text-left"
          style={{ background: 'var(--card)', boxShadow: toneRing('accent', 45) }}
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="t-label text-accent-ink">Mentre cuoce</span>
            <span className="t-callout mt-0.5 font-semibold text-ink">{next.task.title}</span>
          </span>
          <ChevronRight aria-hidden size={20} strokeWidth={2.4} className="shrink-0 text-accent-ink" />
        </button>
      )}

      <Card padding="lg">
        <ol className="flex flex-col gap-4">
          {steps.map((s, k) => (
            <li key={k} className="flex gap-3.5">
              <span aria-hidden className="t-num grid size-7 shrink-0 place-items-center rounded-full text-[0.9375rem] leading-none text-accent-ink" style={{ boxShadow: toneRing('accent', 50) }}>
                {k + 1}
              </span>
              <p className="t-body pt-0.5 text-ink">
                <span className="sr-only">Passaggio {k + 1}: </span>
                {s}
              </p>
            </li>
          ))}
        </ol>
      </Card>

      {recipes.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Serve per">
          <p className="t-label px-1 text-ink-3">Serve per</p>
          <ul className="flex flex-col gap-1.5">
            {recipes.map((r) => (
              <li key={r.id} className="flex items-center gap-2.5 px-1">
                <DishArt recipe={r} dayType="palestra" variant="thumb" className="size-8 shrink-0" />
                <span className="t-footnote min-w-0 flex-1 text-ink-2">{r.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function PotButton({ week, taskId, pot, timer, now }: { week: ISODate; taskId: string; pot: PrepTimer; timer?: PotTimer; now: number }) {
  const left = timer ? Math.max(0, timer.endsAt - now) : 0;
  const running = Boolean(timer && left > 0);
  const finished = Boolean(timer && left <= 0);
  if (running || finished) {
    return (
      <div
        className="flex min-h-[52px] items-center gap-3 rounded-control px-4"
        style={{ background: 'var(--card)', boxShadow: toneRing(finished ? 'good' : 'accent', finished ? 70 : 45) }}
        role="status"
      >
        <Flame aria-hidden size={18} strokeWidth={2.4} className={finished ? 'text-good-ink' : 'text-accent-ink'} />
        <span className="t-callout min-w-0 flex-1 font-semibold text-ink">{pot.label}</span>
        <span className={cn('t-num text-[1.5rem] leading-none tabular', finished ? 'text-good-ink' : 'text-ink')}>
          {finished ? 'Pronto' : clockLabel(left / 1000)}
        </span>
      </div>
    );
  }
  return (
    <Button
      variant="secondary"
      size="lg"
      fullWidth
      icon={Play}
      onClick={() => {
        haptic('medium');
        prepTimers.start(week, taskId, pot.label, pot.minutes);
      }}
      className="justify-between"
    >
      <span className="flex w-full items-center justify-between gap-3">
        <span>Avvia: {pot.label.toLowerCase()}</span>
        <span className="t-footnote font-medium tabular text-ink-2">{pot.minutes}&nbsp;min</span>
      </span>
    </Button>
  );
}

function Finale({ tasks, total }: { tasks: PrepTask[]; total: number }) {
  return (
    <div className="flex flex-col items-center gap-5 pt-4 text-center">
      <ProgressRing value={1} size={148} stroke={10} tone="good" label="Preparazione completata">
        <Check aria-hidden size={52} strokeWidth={2.6} className="text-good-ink" />
      </ProgressRing>
      <div className="flex flex-col gap-2">
        <h2 className="t-title text-ink">La settimana è pronta</h2>
        <p className="t-body text-ink-2">
          {plural(tasks.length, 'attività', 'attività')} in circa {fmtMinutes(total)}. Da lunedì basta scaldare e montare.
        </p>
      </div>
      <Card padding="none" className="w-full text-left">
        <ul>
          {tasks.map((t, k) => (
            <li
              key={t.id}
              className={cn('flex items-start gap-3 px-4 py-3', k > 0 && 'relative before:absolute before:left-11 before:right-0 before:top-0 before:h-px before:bg-line')}
            >
              <Check aria-hidden size={16} strokeWidth={3} className="mt-0.5 shrink-0 text-good-ink" />
              <span className="t-footnote text-ink-2">{t.yields}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
