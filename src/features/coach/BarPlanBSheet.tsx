/**
 * Piano B al bar: sempre disponibile, anche offline (dati da BAR_OPTIONS).
 *
 * In cima la scelta già decisa per il pasto di adesso e il tipo di giorno; sotto tutte le opzioni del banco
 * raggruppate per verdetto, con il motivo e i valori indicativi. Toccando le voci si compone l'ordine con i
 * totali; un tocco segna il pasto come sostituito nel diario di oggi (con nota), dolci compresi.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CakeSlice, Check, CircleCheck, Coffee, Lightbulb, X, type LucideIcon } from 'lucide-react';
import type { BarOption, ItemStatus, MealSlot } from '../../domain/types';
import { BAR_OPTIONS, BAR_VERDICTS } from '../../data/barPlanB';
import { MEAL_SLOTS } from '../../engine/menu';
import { DAY_TYPE_LABEL, fmtNumber, listIt, MEAL_SLOT_LABEL } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useNowHHMM, useToday } from '../../state/hooks';
import { useApp, useUi } from '../../state/store';
import { Button, Card, cn, DayTypeBadge, EmptyState, IconButton, Sheet, spring, springSnappy, toneColor, toneInk, toneSoft, type AnyTone } from '../../ui';
import { barCombo, barContext, fitCombo, optionsById, plannedMeal, sumApprox, sweetsThisWeek, VERDICT_ORDER } from './barPick';

const VERDICT_STYLE: Record<BarOption['verdict'], { tone: AnyTone; icon: LucideIcon }> = {
  si: { tone: 'good', icon: CircleCheck },
  meglio: { tone: 'warn', icon: Lightbulb },
  programmato: { tone: 'neutral', icon: CakeSlice },
};

const SLOT_ARTICLE: Record<MealSlot, string> = {
  colazione: 'la colazione',
  spuntino: 'lo spuntino',
  pranzo: 'il pranzo',
  merenda: 'la merenda',
  cena: 'la cena',
};

/** "Spuntino segnato", "Colazione segnata". */
const SLOT_MARKED: Record<MealSlot, string> = {
  colazione: 'Colazione segnata',
  spuntino: 'Spuntino segnato',
  pranzo: 'Pranzo segnato',
  merenda: 'Merenda segnata',
  cena: 'Cena segnata',
};

const n0 = (x: number) => fmtNumber(Math.round(x));

function lowerFirst(s: string): string {
  return s.length > 1 && s[1] === s[1].toLowerCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

export default function BarPlanBSheet({ slot: initialSlot, onClose }: { slot?: MealSlot; onClose: () => void }) {
  const plan = useApp((s) => s.plan);
  const dayLogs = useApp((s) => s.dayLogs);
  const calendarDay = useToday();
  const now = useNowHHMM();
  const toast = useUi((s) => s.toast);
  const reduce = useReducedMotion();

  const ctx = useMemo(() => barContext({ plan }, calendarDay, now), [plan, calendarDay, now]);
  const [slot, setSlot] = useState<MealSlot>(initialSlot ?? ctx.slot);
  const [selected, setSelected] = useState<string[]>([]);
  const chipsRef = useRef<HTMLDivElement>(null);

  // Il pasto scelto sta al centro della fila (la cena è in fondo a destra): all'apertura subito, poi con
  // uno scorrimento morbido. I bordi della fila sfumano, così un pasto tagliato non sembra un errore.
  const firstScroll = useRef(true);
  useEffect(() => {
    const row = chipsRef.current;
    const chip = row?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!row || !chip) return;
    const left = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: reduce || firstScroll.current ? 'auto' : 'smooth' });
    firstScroll.current = false;
  }, [slot, reduce]);

  // Nei giorni di calcio e alla vigilia la scelta si avvicina al pasto previsto dal menù (carboidrati compresi).
  const planned = useMemo(() => plannedMeal({ plan, dayLogs }, ctx.today, slot), [plan, dayLogs, ctx.today, slot]);
  const combo = useMemo(() => {
    const c = fitCombo(barCombo(slot, ctx.dayType, ctx.preFootball && slot === 'merenda', ctx.matchEve), ctx.dayType, planned, slot);
    return { ...c, options: optionsById(c.ids) };
  }, [slot, ctx.dayType, ctx.preFootball, ctx.matchEve, planned]);
  const comboTotal = sumApprox(combo.options);

  const groups = useMemo(
    () => VERDICT_ORDER.map((v) => ({ verdict: v, options: BAR_OPTIONS.filter((o) => o.verdict === v) })).filter((g) => g.options.length),
    [],
  );
  const chosen = useMemo(() => optionsById(selected), [selected]);
  const total = sumApprox(chosen);

  const sweetsUsed = sweetsThisWeek(dayLogs, ctx.today);
  const sweetsLeft = Math.max(0, plan.sweetsPerWeek - sweetsUsed);
  const minimal = Boolean(dayLogs[ctx.today]?.minimal);
  const slotInfo = ctx.schedule[slot];

  const toggle = (id: string) => {
    haptic('selection');
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  /** Segna il pasto come sostituito con la nota dell'ordine; i dolci programmati contano tra i dolci. */
  const mark = () => {
    if (!chosen.length) return;
    const st = useApp.getState();
    const itemId = `pasto:${slot}`;
    const prevLog = st.getDayLog(ctx.today);
    const prevStatus: ItemStatus | undefined = prevLog.status[itemId];
    const prevNote = prevLog.notes[itemId];
    const sweets = chosen.filter((o) => o.verdict === 'programmato').length;
    const note = `Al bar: ${listIt(chosen.map((o) => lowerFirst(o.name)))}`;
    st.setItemStatus(ctx.today, itemId, 'sostituito', note);
    if (sweets) st.addSweet(ctx.today, sweets);
    haptic('success');
    toast(`${SLOT_MARKED[slot]}: preso al bar`, 'good', {
      actionLabel: 'Annulla',
      onAction: () => {
        const s2 = useApp.getState();
        s2.setItemStatus(ctx.today, itemId, prevStatus ?? null, prevNote ?? '');
        if (sweets) s2.addSweet(ctx.today, -sweets);
      },
    });
    onClose();
  };

  const footer =
    chosen.length > 0 ? (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <IconButton icon={X} label="Togli la selezione" size="sm" variant="tinted" onClick={() => setSelected([])} />
          <p className="t-footnote min-w-0 flex-1 truncate text-ink-2" aria-live="polite">
            {chosen.length === 1 ? '1 voce' : `${chosen.length} voci`} per {SLOT_ARTICLE[slot]}
          </p>
          <div className="flex shrink-0 flex-col items-end">
            <span className="flex items-baseline gap-1">
              <span className="t-num text-[1.5rem] text-ink">{n0(total.kcal)}</span>
              <span className="t-caption text-ink-2">kcal</span>
            </span>
            <span className="t-caption tabular-nums text-ink-3">
              P {n0(total.proteinG)} g · C {n0(total.carbG)} g · G {n0(total.fatG)} g
            </span>
          </div>
        </div>
        {!minimal && (
          <Button icon={Check} size="lg" fullWidth onClick={mark}>
            Segna {SLOT_ARTICLE[slot]} nel diario
          </Button>
        )}
      </div>
    ) : undefined;

  return (
    <Sheet
      open
      onClose={onClose}
      size="large"
      title="Piano B al bar"
      subtitle="Funziona anche senza rete. Valori indicativi della porzione tipica."
      footer={footer}
    >
      {BAR_OPTIONS.length === 0 ? (
        <EmptyState icon={Coffee} title="Opzioni in arrivo" text="Le scelte migliori al bar compaiono qui." />
      ) : (
        <div className="flex flex-col gap-6 pb-4">
          {/* Pasto */}
          <div
            ref={chipsRef}
            role="radiogroup"
            aria-label="Per quale pasto"
            className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5 pt-1"
            style={{
              maskImage: 'linear-gradient(90deg, transparent, #000 20px, #000 calc(100% - 20px), transparent)',
              WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 20px, #000 calc(100% - 20px), transparent)',
            }}
          >
            {MEAL_SLOTS.map((s) => {
              const active = s === slot;
              return (
                <motion.button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  whileTap={{ scale: 0.95 }}
                  transition={springSnappy}
                  onClick={() => {
                    if (s === slot) return;
                    haptic('selection');
                    setSlot(s);
                  }}
                  className={cn(
                    'relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[0.875rem] font-semibold transition-colors duration-150',
                    active ? 'bg-ink text-bg' : 'bg-control text-ink-2 shadow-[inset_0_0_0_1px_var(--control-line)]',
                  )}
                >
                  {MEAL_SLOT_LABEL[s]}
                  {s === ctx.slot && (
                    <span aria-label="adesso" className={cn('size-1.5 rounded-full', active ? 'bg-accent' : 'bg-accent')} />
                  )}
                </motion.button>
              );
            })}
            {/* Lo spazio in fondo tiene l'ultimo pasto fuori dalla sfumatura del bordo. */}
            <span aria-hidden className="w-3 shrink-0" />
          </div>

          {/* La scelta di adesso */}
          {combo.options.length > 0 && (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={slot}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={spring}
              >
                <Card variant="highlight" tone="accent" padding="lg">
                  <div className="flex items-start justify-between gap-3">
                    <p className="t-label pt-1 text-accent-ink">
                      {slotInfo.title} · {slotInfo.time}
                    </p>
                    <DayTypeBadge dayType={ctx.scheduledDayType} label={ctx.matchEve ? 'Vigilia della partita' : DAY_TYPE_LABEL[ctx.scheduledDayType]} />
                  </div>
                  <ul className="mt-3 flex flex-col gap-2">
                    {combo.options.map((o) => (
                      <li key={o.id} className="flex items-baseline gap-2.5">
                        <span aria-hidden className="size-1.5 shrink-0 translate-y-[-0.2em] rounded-full bg-accent" />
                        <span className="t-headline min-w-0 flex-1 text-ink">{o.name}</span>
                        {combo.options.length > 1 && <span className="t-mono shrink-0 text-[0.75rem] text-ink-3">{n0(o.approx.kcal)}</span>}
                      </li>
                    ))}
                  </ul>
                  <p className="t-footnote mt-2.5 text-ink-2">{combo.why}</p>
                  <div className="mt-4 flex items-end justify-between gap-3 border-t border-line pt-3.5">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="flex items-baseline gap-1 whitespace-nowrap">
                          <span className="t-num text-[1.75rem] text-ink">{n0(comboTotal.kcal)}</span>
                          <span className="t-caption text-ink-2">kcal</span>
                        </span>
                        <span className="flex items-baseline gap-1 whitespace-nowrap">
                          <span className="t-num text-[1.75rem] text-ink">{n0(comboTotal.proteinG)}</span>
                          <span className="t-caption text-ink-2">g proteine</span>
                        </span>
                      </div>
                      <span className="t-caption tabular-nums text-ink-3">
                        {`C\u00a0${n0(comboTotal.carbG)}\u00a0g · G\u00a0${n0(comboTotal.fatG)}\u00a0g · fibre\u00a0${n0(comboTotal.fiberG)}\u00a0g`}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="shrink-0"
                      onClick={() => {
                        haptic('light');
                        setSelected(combo.options.map((o) => o.id));
                      }}
                    >
                      {combo.options.length === 1 ? 'Prendo questo' : 'Prendo questi'}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            </AnimatePresence>
          )}

          {/* Tutte le opzioni, per verdetto */}
          {groups.map((g) => {
            const style = VERDICT_STYLE[g.verdict];
            const Icon = style.icon;
            const hint =
              g.verdict === 'programmato'
                ? sweetsLeft > 0
                  ? `${BAR_VERDICTS.programmato.hint}. ${sweetsLeft === 1 ? 'Ti resta 1 dolce' : `Ti restano ${sweetsLeft} dolci`} su ${plan.sweetsPerWeek} questa settimana.`
                  : `Hai già i ${plan.sweetsPerWeek} dolci previsti questa settimana: meglio rimandare.`
                : BAR_VERDICTS[g.verdict].hint;
            return (
              <section key={g.verdict} className="flex flex-col gap-2.5" aria-labelledby={`bar-${g.verdict}`}>
                <div className="flex items-start gap-2.5 px-1">
                  <span
                    aria-hidden
                    className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-[9px]"
                    style={{ background: toneSoft(style.tone, 18), color: g.verdict === 'programmato' ? 'var(--ink-2)' : toneColor(style.tone) }}
                  >
                    <Icon size={16} strokeWidth={2.3} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 id={`bar-${g.verdict}`} className="t-headline flex items-baseline gap-2 text-ink">
                      {BAR_VERDICTS[g.verdict].label}
                      <span className="t-mono text-[0.75rem] font-normal text-ink-3">{g.options.length}</span>
                    </h3>
                    <p
                      className="t-footnote mt-0.5"
                      style={{ color: g.verdict === 'programmato' && sweetsLeft === 0 ? toneInk('warn') : 'var(--ink-3)' }}
                    >
                      {hint}
                    </p>
                  </div>
                </div>
                <div className="overflow-hidden rounded-card bg-card shadow-card">
                  {g.options.map((o, i) => (
                    <OptionRow key={o.id} option={o} selected={selected.includes(o.id)} onToggle={() => toggle(o.id)} divider={i > 0} />
                  ))}
                </div>
              </section>
            );
          })}

          <p className="t-footnote px-1 text-ink-3">
            Tocca le voci che prendi: vedi i totali e segni il pasto nel diario di oggi con un tocco.
          </p>
        </div>
      )}
    </Sheet>
  );
}

function OptionRow({ option: o, selected, onToggle, divider }: { option: BarOption; selected: boolean; onToggle: () => void; divider: boolean }) {
  const a = o.approx;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        'relative flex w-full gap-3 px-4 py-3.5 text-left transition-colors duration-150 active:bg-ink-soft',
        divider && 'before:absolute before:left-[52px] before:right-0 before:top-0 before:h-px before:bg-line',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full transition-colors duration-150',
          selected ? 'bg-accent text-on-accent' : 'shadow-[inset_0_0_0_1.5px_var(--line-strong)]',
        )}
      >
        <AnimatePresence initial={false}>
          {selected && (
            <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={springSnappy}>
              <Check size={14} strokeWidth={3.2} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline justify-between gap-3">
          <span className="t-callout font-semibold text-ink">{o.name}</span>
          <span className="flex shrink-0 items-baseline gap-0.5">
            <span className="t-num text-[1.125rem] text-ink">{n0(a.kcal)}</span>
            <span className="t-caption text-ink-3">kcal</span>
          </span>
        </span>
        <span className="t-footnote mt-0.5 text-ink-2">{o.why}</span>
        <span className="t-caption mt-1.5 tabular-nums text-ink-3">
          P {fmtNumber(a.proteinG, 1)} g · C {fmtNumber(a.carbG, 1)} g · G {fmtNumber(a.fatG, 1)} g · fibre {fmtNumber(a.fiberG, 1)} g
        </span>
      </span>
    </button>
  );
}
