/**
 * Scheda Preparazione: le attività della domenica che servono ai pasti della settimana, in ordine
 * consigliato (prima ciò che cuoce più a lungo), con minuti, resa, spunte salvate, tempo totale e
 * stima con due fuochi accesi insieme. Ogni attività porta alle ricette che prepara.
 */
import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Check, ChefHat, ChevronRight, Flame, Play, Sparkles, Timer } from 'lucide-react';
import type { AppData, ISODate, MealSlot, Plan, PrepTask } from '../../domain/types';
import { RECIPES } from '../../data/recipes';
import { addDays, daysBetween, formatDayLong, weekDates, weekdayOf } from '../../engine/dates';
import { isStarterDay, mealsForDate, menuWeekFor, starterEnd } from '../../engine/menu';
import { capitalize, fmtMinutes, plural } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useApp, useUi } from '../../state/store';
import { Button, Callout, Card, EmptyState, ProgressBar, ProgressRing, SectionTitle, staggerItem } from '../../ui';
import { cn } from '../../ui/cn';
import { toneInk, toneRing, toneSoft } from '../../ui/tones';
import { DishArt } from './art/DishArt';
import { firstUseDate, parallelMinutes, prepSkipped } from './helpers';
import { PrepPlayer } from './PrepPlayer';

const EMPTY: string[] = [];

export interface PrepTabProps {
  weekStart: ISODate;
  plan: Plan;
  dayLogs: AppData['dayLogs'];
  offset: number;
  today: ISODate;
  /** Apre subito il lettore della preparazione (dalla voce della domenica in Oggi). */
  autoPlay?: boolean;
  onOpenWeek: (offset: number) => void;
}

/** Ordine consigliato: prima le cotture lunghe (si avviano e intanto si fa il resto), poi i lavori brevi. */
export function orderPrep(tasks: PrepTask[]): PrepTask[] {
  return tasks
    .map((t, i) => ({ t, i }))
    .sort((a, b) => b.t.minutes - a.t.minutes || a.i - b.i)
    .map((x) => x.t);
}

export function PrepTab({ weekStart, plan, dayLogs, offset, today, autoPlay, onOpenWeek }: PrepTabProps) {
  const [playing, setPlaying] = useState(Boolean(autoPlay));
  const tasks = useMemo(() => orderPrep(menuWeekFor(weekStart, plan.startDate)?.prep ?? []), [weekStart, plan.startDate]);
  const done = useApp((s) => s.prepDone[weekStart] ?? EMPTY);
  const togglePrep = useApp((s) => s.togglePrep);
  const doneSet = new Set(done);
  const prepDay = addDays(weekStart, -1);
  const wd = weekdayOf(today);

  // Primo pasto della settimana in cui compare ogni ricetta (per aprirla con la data giusta).
  const firstUse = useMemo(() => {
    const map = new Map<string, { date: ISODate; slot: MealSlot }>();
    for (const d of weekDates(weekStart)) {
      for (const m of mealsForDate(d, { plan, dayLogs }).meals) {
        if (!map.has(m.recipeId)) map.set(m.recipeId, { date: d, slot: m.slot });
        if (m.plannedId && !map.has(m.plannedId)) map.set(m.plannedId, { date: d, slot: m.slot });
      }
    }
    return map;
  }, [weekStart, plan, dayLogs]);

  // Settimana di avvio: chi ha iniziato dopo quella domenica (o la domenica sera stessa) non ha preparato nulla.
  const first = firstUseDate(plan);
  if (first && prepSkipped(plan, weekStart, isStarterDay(weekStart, plan))) {
    return <StarterPrep plan={plan} weekStart={weekStart} offset={offset} onOpenWeek={onOpenWeek} />;
  }

  if (!tasks.length) {
    return (
      <Card>
        <EmptyState icon={ChefHat} title="Niente da preparare" text="Questa settimana i pasti si preparano sul momento, in pochi minuti." />
      </Card>
    );
  }

  const total = tasks.reduce((a, t) => a + t.minutes, 0);
  const doneTasks = tasks.filter((t) => doneSet.has(t.id));
  const doneMin = doneTasks.reduce((a, t) => a + t.minutes, 0);
  const allDone = doneTasks.length === tasks.length;
  const parallel = parallelMinutes(tasks.map((t) => t.minutes));
  const recipeIds = new Set(tasks.flatMap((t) => t.recipeIds ?? []));
  const prepPast = prepDay < today;

  const toggle = (t: PrepTask) => {
    const willBeDone = !doneSet.has(t.id);
    togglePrep(weekStart, t.id);
    if (willBeDone && doneTasks.length + 1 === tasks.length) {
      haptic('success');
      useUi.getState().toast('Preparazione completata: la settimana è pronta', 'good');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card variant="highlight" tone={allDone ? 'good' : 'accent'} padding="lg" as="section" aria-label="Riepilogo della preparazione">
        <p className="t-callout font-semibold text-ink-2">{capitalize(formatDayLong(prepDay))}</p>
        <div className="mt-2 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-baseline gap-1.5">
              <span className="t-num text-[3.25rem] leading-none text-ink">{total}</span>
              <span className="t-unit text-[0.9375rem] text-ink-2">min</span>
            </p>
            <p className="t-footnote mt-1.5 text-ink-2">
              di preparazione per {plural(recipeIds.size, 'ricetta', 'ricette')} della settimana
            </p>
          </div>
          <ProgressRing value={doneTasks.length / tasks.length} size={76} stroke={8} tone={allDone ? 'good' : 'accent'} label={`${doneTasks.length} attività fatte su ${tasks.length}`}>
            {allDone ? (
              <Check aria-hidden size={28} strokeWidth={2.6} className="text-good-ink" />
            ) : (
              <>
                <span className="t-num text-[1.5rem] leading-none text-ink">{doneTasks.length}</span>
                <span className="t-caption mt-0.5 text-ink-3">di {tasks.length}</span>
              </>
            )}
          </ProgressRing>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <ProgressBar value={total ? doneMin / total : 0} tone={allDone ? 'good' : 'accent'} label={`${doneMin} minuti fatti su ${total}`} />
          <div className="t-footnote flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-ink-2">
            <span className="whitespace-nowrap">{allDone ? (prepPast ? 'Fatta: la settimana è pronta' : 'Tutto pronto') : `Mancano ${fmtMinutes(total - doneMin)}`}</span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-ink-3">
              <Flame aria-hidden size={14} strokeWidth={2.2} />
              Con due fuochi circa {fmtMinutes(parallel)}
            </span>
          </div>
        </div>
        {!allDone && (
          <Button icon={Play} fullWidth size="lg" onClick={() => setPlaying(true)} className="mt-4">
            {doneTasks.length ? 'Riprendi la preparazione' : 'Inizia la preparazione'}
          </Button>
        )}
      </Card>

      {offset === 0 && wd >= 5 && (
        <Callout
          tone="accent"
          title={wd === 6 ? 'Oggi si prepara la settimana che inizia domani' : 'Domani si prepara la settimana che inizia lunedì'}
          action={
            <Button variant="ghost" size="sm" iconRight={ChevronRight} onClick={() => onOpenWeek(1)}>
              Apri la prossima settimana
            </Button>
          }
        />
      )}

      <section className="flex flex-col gap-3" aria-labelledby="prep-ordine">
        <SectionTitle id="prep-ordine" subtitle={allDone ? undefined : 'Parti da ciò che cuoce più a lungo: mentre va sul fuoco, prepari il resto.'}>
          Ordine consigliato
        </SectionTitle>
        <Card padding="none" as="section">
          <ol className="py-1.5">
            {tasks.map((t, i) => {
              const isDone = doneSet.has(t.id);
              const recipes = (t.recipeIds ?? []).map((id) => RECIPES[id]).filter(Boolean);
              return (
                <motion.li key={t.id} {...staggerItem(i)} className="relative flex flex-col gap-2.5 px-4 py-3">
                  {/* Linea che collega i passi */}
                  {i < tasks.length - 1 && <span aria-hidden className="absolute bottom-0 left-[31px] top-[46px] w-px bg-line" />}
                  {i > 0 && <span aria-hidden className="absolute left-[31px] top-0 h-3 w-px bg-line" />}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isDone}
                    onClick={() => {
                      haptic(isDone ? 'selection' : 'light');
                      toggle(t);
                    }}
                    className="flex w-full items-start gap-3.5 text-left"
                  >
                    <motion.span
                      aria-hidden
                      className={cn('t-num relative grid size-8 shrink-0 place-items-center rounded-full text-[1rem]', isDone ? 'text-[var(--bg)]' : 'text-ink-2')}
                      animate={{
                        backgroundColor: isDone ? 'var(--good)' : 'var(--card)',
                        boxShadow: isDone ? 'inset 0 0 0 2px var(--good)' : 'inset 0 0 0 2px var(--line-strong)',
                      }}
                      transition={{ duration: 0.2 }}
                    >
                      {isDone ? <Check size={16} strokeWidth={3.2} /> : i + 1}
                    </motion.span>
                    <span className="flex min-w-0 flex-1 flex-col pt-1">
                      <span className={cn('t-callout font-semibold transition-colors', isDone ? 'text-ink-3 line-through decoration-ink-3/60' : 'text-ink')}>
                        {t.title}
                      </span>
                      <span className={cn('t-footnote mt-0.5 inline-flex items-center gap-1', isDone ? 'text-good-ink' : 'text-ink-2')}>
                        <Timer aria-hidden size={13} strokeWidth={2.4} className="shrink-0" />
                        <span className="t-caption font-medium tabular">{t.minutes}&nbsp;min</span>
                      </span>
                      {/* Fatta: restano titolo e minuti, il resto si toglie. */}
                      {!isDone && <span className="t-footnote mt-1 text-ink-2">{t.yields}</span>}
                    </span>
                  </button>
                  {!isDone && recipes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pl-[46px]">
                      {recipes.map((r) => {
                        const use = firstUse.get(r.id);
                        const date = use?.date ?? weekStart;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                              haptic('selection');
                              useUi.getState().open({ type: 'recipe', recipeId: r.id, date, slot: use?.slot ?? r.slots[0] });
                            }}
                            className="flex min-h-8 max-w-full items-center gap-1.5 rounded-[16px] bg-ink-soft py-1 pl-1 pr-3 text-left transition-colors hover:bg-control"
                            aria-label={`Apri la ricetta: ${r.name}`}
                          >
                            <DishArt recipe={r} dayType={plan.week[weekdayOf(date)]?.dayType ?? 'palestra'} variant="thumb" className="size-6 shrink-0" />
                            <span className="t-caption font-medium leading-snug text-ink-2">{r.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </motion.li>
              );
            })}
          </ol>
        </Card>
      </section>

      {playing && (
        <PrepPlayer
          open
          weekStart={weekStart}
          tasks={tasks}
          done={done}
          onToggle={(t) => toggle(t)}
          onClose={() => setPlaying(false)}
        />
      )}
    </div>
  );
}


/**
 * Settimana di avvio: niente preparazione da fare (né da recuperare). Titolo, una frase con la prima
 * preparazione vera (la domenica prima della settimana normale) e il pulsante per guardarla.
 */
function StarterPrep({
  plan,
  weekStart,
  offset,
  onOpenWeek,
}: {
  plan: Plan;
  weekStart: ISODate;
  offset: number;
  onOpenWeek: (offset: number) => void;
}) {
  const end = starterEnd(plan);
  const firstPrep = end ? addDays(end, -1) : null;
  const nextTasks = end ? menuWeekFor(end, plan.startDate)?.prep ?? [] : [];
  const minutes = nextTasks.reduce((a, t) => a + t.minutes, 0);
  // Settimane da qui a quella che apre la prima preparazione (di solito una).
  const ahead = end ? Math.max(1, Math.round(daysBetween(weekStart, end) / 7)) : 1;
  return (
    <div className="flex flex-col gap-6">
      <Card variant="highlight" tone="accent" padding="lg" as="section" aria-label="Settimana di avvio">
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-[14px]"
            style={{ background: toneSoft('accent', 16), boxShadow: toneRing('accent'), color: toneInk('accent') }}
          >
            <Sparkles size={20} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="t-label text-ink-3">Settimana di avvio</p>
            <p className="t-title-2 mt-1 text-ink">Niente da preparare</p>
          </div>
        </div>
        <p className="t-callout mt-3 text-ink-2">
          {firstPrep
            ? `La prima preparazione è ${formatDayLong(firstPrep)}${minutes > 0 ? `, ${fmtMinutes(minutes)}` : ''}: fino ad allora si cucina sul momento.`
            : 'In questi giorni si cucina sul momento, in 15 minuti al massimo.'}
        </p>
        {firstPrep && nextTasks.length > 0 && (
          <Button variant="secondary" iconRight={ChevronRight} fullWidth onClick={() => onOpenWeek(offset + ahead)} className="mt-4">
            Guarda la prima preparazione
          </Button>
        )}
      </Card>
    </div>
  );
}
