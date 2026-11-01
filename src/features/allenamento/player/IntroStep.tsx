import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeftRight, ChevronDown, Clock, HeartPulse, History, Layers, ListOrdered, Sprout, TrendingDown, TrendingUp } from 'lucide-react';
import type { ISODate, WorkoutLog } from '../../../domain/types';
import { compareHHMM, formatDayLong, formatRelativeDay } from '../../../engine/dates';
import { useNowHHMM } from '../../../state/hooks';
import type { PainGate, Suggestion } from '../../../engine/training';
import { capitalize as capitalizeFirst } from '../../../lib/format';
import { Callout, Disclosure, Pill, cn, staggerItem } from '../../../ui';
import { haptic } from '../../../lib/haptics';
import { SessionGlyph } from '../components/SessionGlyph';
import { coveredPhrase, daysPhrase, doseLabel, estimateMinutes, exerciseFor, kgLabel, plannedSets, shortName, type PlayerPlan } from '../lib';

export interface IntroStepProps {
  plan: PlayerPlan;
  date: ISODate;
  today: ISODate;
  time?: string;
  optional: boolean;
  gate: PainGate;
  lastSession: WorkoutLog | null;
  /** Suggerimento per chiave dell'esercizio. */
  suggestions: Record<string, Suggestion>;
  /** Colore del tipo di giorno della seduta. */
  tone: 'palestra' | 'leggero' | 'riposo';
}

/** Anteprima della seduta: cosa ti aspetta, quanto dura, cosa è cambiato dall'ultima volta. */
export function IntroStep({ plan, date, today, time, optional, gate, lastSession, suggestions, tone }: IntroStepProps) {
  const { session } = plan;
  // Numeri della seduta, senza il blocco del fisioterapista (facoltativo, ha i suoi minuti).
  const own = plan.items.filter((i) => !i.physio);
  const exercises = own.length;
  const sets = plannedSets(own);
  const nowHHMM = useNowHHMM();
  const when = formatRelativeDay(date, today);
  const upcoming = Boolean(time) && (date > today || (date === today && compareHHMM(nowHHMM, time!) < 0));
  const whenLabel = `${when.charAt(0).toUpperCase()}${when.slice(1)}${upcoming ? ` alle ${time}` : ''}`;
  const kinds = plan.items.map((it) => suggestions[it.key]);
  const increases = kinds.filter((k) => k?.kind === 'aumenta').length;
  const stalls = kinds.filter((k) => k?.stalled).length;
  // Esercizi frenati o cambiati dalla regola del dolore: lì niente "una ripetizione in più".
  const braked = kinds.filter((k) => k && !k.stalled && (k.kind === 'mantieni' || k.kind === 'riduci' || k.kind === 'sostituisci')).length;
  // Riscaldamento e blocco del fisioterapista sono sempre uguali: chiusi di base, si aprono con un tocco.
  const [openBlocks, setOpenBlocks] = useState<Record<string, boolean>>({});
  const reduce = useReducedMotion();
  const { duration, covered } = plan;
  const minutes = duration.own;
  const swapped = own.filter((i) => i.replacedKind === 'impatto');

  return (
    <div className="flex flex-col gap-6 pb-8 pt-3">
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <SessionGlyph letter={session.id} size="xl" tone={tone} solid />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill tone={tone}>{whenLabel}</Pill>
              {optional && <Pill tone="leggero">Facoltativa</Pill>}
            </div>
            <h2 className="t-large-title mt-2 text-ink">{session.name}</h2>
            <p className="t-callout mt-1 text-ink-2">{session.subtitle}</p>
          </div>
        </div>
        <dl className="grid grid-cols-3 overflow-hidden rounded-[18px] bg-card shadow-card">
          {[
            { icon: Clock, label: 'Durata', value: `${minutes}`, unit: 'min' },
            { icon: ListOrdered, label: 'Esercizi', value: `${exercises}` },
            { icon: Layers, label: 'Serie', value: `${sets}` },
          ].map((s, i) => (
            <div key={s.label} className={cn('flex flex-col gap-1 px-4 py-3', i > 0 && 'border-l border-line')}>
              <dt className="t-label flex items-center gap-1 text-ink-3">
                <s.icon size={12} strokeWidth={2.4} aria-hidden />
                {s.label}
              </dt>
              <dd className="flex items-baseline gap-1">
                <span className="t-num text-[1.75rem] text-ink">{s.value}</span>
                {s.unit && <span className="t-unit text-ink-2">{s.unit}</span>}
              </dd>
            </div>
          ))}
        </dl>
        {/* Il perché della seduta dietro un tocco; i minuti del fisioterapista stanno sul loro blocco, in fondo. */}
        <Disclosure variant="inline" title="Com’è pensata" className="-mt-1 px-1">
          {session.focus}
        </Disclosure>
      </header>

      {plan.intro && (
        <Callout tone="good" icon={Sprout} title={plan.intro === 1 ? 'Prima volta con questa seduta' : 'Seconda volta con questa seduta'}>
          Una serie in meno per esercizio e una ripetizione di riserva in più.{' '}
          {plan.intro === 1 ? 'Dalla terza volta la seduta è completa.' : 'Dalla prossima volta la seduta è completa.'}
          <Disclosure variant="inline" title="Perché" className="mt-1">
            Gli esercizi nuovi danno più indolenzimento, con il picco tra 24 e 72 ore, e dalle volte successive molto meno
            (effetto della serie ripetuta): così i primi giorni non pesano sul calcio.
          </Disclosure>
        </Callout>
      )}

      {(gate.level !== 'ok' || swapped.length > 0) && (
        <Callout tone={gate.level === 'riduci' ? 'bad' : 'warn'} title={gate.title}>
          {gate.level === 'ok' ? 'Nel riscaldamento gli esercizi con salti diventano varianti senza volo, il resto come previsto.' : gate.message}
        </Callout>
      )}

      {lastSession && (
        <div className="flex items-start gap-3 rounded-[16px] bg-card-3 px-3.5 py-3">
          {increases > 0 ? (
            <TrendingUp size={18} strokeWidth={2.4} className="mt-0.5 shrink-0 text-good-ink" aria-hidden />
          ) : stalls > 0 ? (
            <TrendingDown size={18} strokeWidth={2.4} className="mt-0.5 shrink-0 text-palestra-ink" aria-hidden />
          ) : (
            <History size={18} strokeWidth={2.4} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
          )}
          <p className="t-footnote text-ink-2">
            <span className="block font-semibold text-ink">Ultima volta {formatDayLong(lastSession.date)}</span>
            {`${lastSession.durationMin}\u00a0min, RPE\u00a0${lastSession.rpe}. `}
            {progressPhrase(increases, stalls, braked)}
          </p>
        </div>
      )}

      {plan.blocks.map((b, bi) => {
        const todo = b.items.filter((i) => !i.coveredBy);
        const min = estimateMinutes(todo.map((i) => i.item));
        const collapsible = b.physio || b.items.every((i) => i.warmup);
        const open = !collapsible || Boolean(openBlocks[b.title]);
        const listId = `blocco-${bi}`;
        // Nel blocco che si apre il titolo sta dentro il pulsante (che a sua volta sta nel titolo h3).
        const TitleTag = collapsible ? 'span' : 'h3';
        const heading = (
          <>
            <TitleTag className={cn('t-label flex items-center gap-1.5', b.physio ? 'text-leggero-ink' : 'text-ink-3')}>
              {b.physio && <HeartPulse size={12} strokeWidth={2.4} aria-hidden />}
              {b.title}
            </TitleTag>
            <span className="t-footnote flex shrink-0 items-center gap-1.5 whitespace-nowrap text-ink-3 tabular">
              {min}&nbsp;min
              {collapsible && (
                <motion.span aria-hidden className="inline-flex" animate={{ rotate: open ? 180 : 0 }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}>
                  <ChevronDown size={15} strokeWidth={2.4} />
                </motion.span>
              )}
            </span>
          </>
        );
        const list = (
          <ol id={listId} className="overflow-hidden rounded-card bg-card shadow-card">
            {b.items.map((it, i) => {
              const s = suggestions[it.key];
              const w = s?.weightKg ?? 0;
              const n = it.coveredBy ? null : it.indexInBlock + 1;
              return (
                <motion.li
                  key={it.key}
                  {...staggerItem(bi * 3 + i, 0.02, 0.25)}
                  className={cn('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-line')}
                >
                  <span className={cn('t-mono w-4 shrink-0 text-[0.75rem]', it.coveredBy ? 'text-leggero-ink' : 'text-ink-3')}>
                    {n ?? <HeartPulse size={13} strokeWidth={2.4} aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('t-callout block font-medium', it.coveredBy ? 'text-ink-3 line-through decoration-ink-4' : 'text-ink')}>
                      {it.exercise?.name ?? it.item.exerciseId}
                    </span>
                    {it.replacedFrom && (
                      <span className="t-caption mt-0.5 flex items-center gap-1 font-medium text-warn-ink">
                        <ArrowLeftRight size={11} strokeWidth={2.4} aria-hidden />
                        al posto di: {shortName(exerciseFor(it.replacedFrom)?.name ?? it.replacedFrom, it.replacedFrom)}
                      </span>
                    )}
                    {it.coveredBy ? (
                      <span className="t-caption mt-0.5 block font-medium text-leggero-ink">Già nel blocco del fisioterapista</span>
                    ) : (
                      <span className={cn('t-footnote mt-0.5 block tabular', b.physio ? 'text-leggero-ink' : 'text-ink-3')}>{doseLabel(it.item)}</span>
                    )}
                  </span>
                  {w > 0 && !it.warmup && !it.coveredBy && (
                    <span className="flex shrink-0 items-center gap-1">
                      {s.kind === 'aumenta' && <TrendingUp size={14} strokeWidth={2.6} className="text-good-ink" aria-label="Carico in aumento" />}
                      {s.stalled && <TrendingDown size={14} strokeWidth={2.6} className="text-palestra-ink" aria-label="Carico ridotto per ripartire" />}
                      <span className={cn('t-callout font-semibold tabular', s.kind === 'aumenta' ? 'text-good-ink' : 'text-ink-2')}>{kgLabel(w)}</span>
                    </span>
                  )}
                </motion.li>
              );
            })}
          </ol>
        );
        return (
          <section key={b.title} className="flex flex-col gap-2" aria-label={b.title}>
            {collapsible ? (
              <h3 className="flex flex-col">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={listId}
                  onClick={() => {
                    haptic('selection');
                    setOpenBlocks((m) => ({ ...m, [b.title]: !open }));
                  }}
                  className={cn(
                    'flex min-h-11 items-center justify-between gap-3 rounded-card px-4 text-left',
                    // Chiuso è una riga a sé, come una card; aperto torna un'intestazione sopra l'elenco.
                    open ? '-mb-1' : 'bg-card shadow-card',
                  )}
                >
                  {heading}
                </button>
              </h3>
            ) : (
              <div className="flex items-baseline justify-between px-1">{heading}</div>
            )}
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  key="lista"
                  initial={collapsible && !reduce ? { height: 0, opacity: 0 } : false}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={reduce ? { duration: 0 } : { height: { type: 'spring', stiffness: 380, damping: 36 }, opacity: { duration: 0.18 } }}
                  className={collapsible ? 'overflow-hidden' : undefined}
                >
                  {list}
                </motion.div>
              )}
            </AnimatePresence>
            {b.physio && open && (
              <p className="t-footnote px-1 text-ink-3">
                {plan.physioDay
                  ? 'Oggi il fisioterapista li prevede: falli qui o a casa.'
                  : plan.physioDays.length
                    ? `Facoltativi oggi: il fisioterapista li prevede ${daysPhrase(plan.physioDays)}.`
                    : 'Facoltativi: segui le indicazioni del fisioterapista.'}
                {covered.length > 0 &&
                  ` ${capitalizeFirst(coveredPhrase(covered))} ${covered.length === 1 ? 'lavora' : 'lavorano'} gli stessi tessuti: ${covered.length === 1 ? 'lo salti' : 'li salti'}, per non raddoppiare il carico.`}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * Cosa cambia oggi rispetto all'ultima volta: carichi in salita, carichi ridotti dopo uno stallo o una ripetizione in
 * più. Con esercizi frenati dalla regola del dolore la ripetizione in più non si nomina: lo dice l'avviso sopra.
 */
function progressPhrase(increases: number, stalls: number, braked: number): string {
  const count = (n: number) => (n === 1 ? 'un esercizio' : `${n} esercizi`);
  if (braked > 0) return increases > 0 ? `Dove il dolore non frena, sali di carico in ${count(increases)}.` : '';
  if (increases > 0 && stalls > 0) return `Oggi sali di carico in ${count(increases)} e scendi in ${count(stalls)} per ripartire.`;
  if (increases > 0) return `Oggi sali di carico in ${count(increases)}.`;
  if (stalls > 0) return `Oggi scendi di carico in ${count(stalls)} per ripartire, negli altri cerchi una ripetizione in più.`;
  return 'Oggi cerchi una ripetizione in più a parità di carico.';
}
