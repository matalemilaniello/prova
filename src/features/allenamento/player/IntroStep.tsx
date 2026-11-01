import { motion } from 'motion/react';
import { ArrowLeftRight, Clock, HeartPulse, History, Layers, ListOrdered, Sprout, TrendingUp } from 'lucide-react';
import type { ISODate, WorkoutLog } from '../../../domain/types';
import { compareHHMM, formatDayLong, formatRelativeDay } from '../../../engine/dates';
import { useNowHHMM } from '../../../state/hooks';
import { estimateSessionMin } from '../../../data/sessions';
import { sessionLoad, type PainGate, type Suggestion } from '../../../engine/training';
import { fmtNumber } from '../../../lib/format';
import { Callout, Pill, cn, keepHyphens, staggerItem } from '../../../ui';
import { SessionGlyph } from '../components/SessionGlyph';
import { daysPhrase, doseLabel, estimateMinutes, exerciseFor, kgLabel, plannedSets, type PlayerPlan } from '../lib';

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
  const increases = plan.items.filter((it) => suggestions[it.key]?.kind === 'aumenta').length;
  const minutes = plan.intro
    ? Math.round((session.estMin * estimateMinutes(own.map((i) => i.item))) / Math.max(1, estimateSessionMin(session)))
    : session.estMin;
  const swapped = own.filter((i) => i.replacedFrom);

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
                {s.unit && <span className="t-mono text-[0.75rem] text-ink-2">{s.unit}</span>}
              </dd>
            </div>
          ))}
        </dl>
        <p className="t-callout text-ink-2">{session.focus}</p>
      </header>

      {plan.intro && (
        <Callout tone="good" icon={Sprout} title={plan.intro === 1 ? 'Prima volta con questa seduta' : 'Seconda volta con questa seduta'}>
          Una serie in meno per esercizio e una ripetizione di riserva in più. L'indolenzimento degli esercizi nuovi ha il
          picco dopo {keepHyphens('48-72')} ore: così arrivi fresco alla partita.{' '}
          {plan.intro === 1 ? 'Dalla terza volta la seduta è completa.' : 'Dalla prossima volta la seduta è completa.'}
        </Callout>
      )}

      {(gate.level !== 'ok' || swapped.length > 0) && (
        <Callout tone={gate.level === 'riduci' ? 'bad' : 'warn'} title={gate.title}>
          {gate.level === 'ok' ? 'Nel riscaldamento gli esercizi con salti diventano varianti senza volo, il resto come previsto.' : gate.message}
        </Callout>
      )}

      {lastSession && (
        <div className="flex items-start gap-3 rounded-[16px] px-3.5 py-3" style={{ background: 'var(--ink-soft)' }}>
          {increases > 0 ? (
            <TrendingUp size={18} strokeWidth={2.4} className="mt-0.5 shrink-0 text-good-ink" aria-hidden />
          ) : (
            <History size={18} strokeWidth={2.4} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
          )}
          <p className="t-footnote text-ink-2">
            <span className="font-semibold text-ink">
              Ultima volta {formatDayLong(lastSession.date)}
            </span>
            {` · ${lastSession.durationMin} min, RPE ${lastSession.rpe}, carico ${fmtNumber(sessionLoad(lastSession.durationMin, lastSession.rpe))} UA. `}
            {increases > 0
              ? `Oggi sali di carico in ${increases === 1 ? 'un esercizio' : `${increases} esercizi`}.`
              : 'Oggi cerchi una ripetizione in più a parità di carico.'}
          </p>
        </div>
      )}

      {plan.blocks.map((b, bi) => {
        const min = estimateMinutes(b.items.map((i) => i.item));
        return (
          <section key={b.title} className="flex flex-col gap-2" aria-label={b.title}>
            <div className="flex items-baseline justify-between px-1">
              <h3 className={cn('t-label flex items-center gap-1.5', b.physio ? 'text-leggero-ink' : 'text-ink-3')}>
                {b.physio && <HeartPulse size={12} strokeWidth={2.4} aria-hidden />}
                {b.title}
              </h3>
              <span className="t-mono text-[0.75rem] text-ink-3">circa {min} min</span>
            </div>
            <ol className="overflow-hidden rounded-card bg-card shadow-card">
              {b.items.map((it, i) => {
                const s = suggestions[it.key];
                const w = s?.weightKg ?? 0;
                return (
                  <motion.li
                    key={it.key}
                    {...staggerItem(bi * 3 + i, 0.02, 0.25)}
                    className={cn('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-line')}
                  >
                    <span className="t-mono w-4 shrink-0 text-[0.75rem] text-ink-3">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="t-callout block font-medium text-ink">{it.exercise?.name ?? it.item.exerciseId}</span>
                      {it.replacedFrom && (
                        <span className="t-caption mt-0.5 flex items-center gap-1 font-medium text-warn-ink">
                          <ArrowLeftRight size={11} strokeWidth={2.4} aria-hidden />
                          al posto di: {exerciseFor(it.replacedFrom)?.name.toLowerCase() ?? it.replacedFrom}
                        </span>
                      )}
                      <span className={cn('t-mono mt-0.5 block text-[0.75rem]', b.physio ? 'text-leggero-ink' : 'text-ink-3')}>{doseLabel(it.item)}</span>
                    </span>
                    {w > 0 && !it.warmup && (
                      <span className="flex shrink-0 items-center gap-1">
                        {s.kind === 'aumenta' && <TrendingUp size={14} strokeWidth={2.6} className="text-good-ink" aria-label="Carico in aumento" />}
                        <span className={cn('t-callout font-semibold tabular', s.kind === 'aumenta' ? 'text-good-ink' : 'text-ink-2')}>{kgLabel(w)}</span>
                      </span>
                    )}
                  </motion.li>
                );
              })}
            </ol>
            {b.physio && (
              <p className="t-footnote px-1 text-ink-3">
                {plan.physioDay
                  ? 'Oggi il fisioterapista li prevede: falli qui o a casa.'
                  : plan.physioDays.length
                    ? `Facoltativi oggi: il fisioterapista li prevede ${daysPhrase(plan.physioDays)}.`
                    : 'Facoltativi: segui le indicazioni del fisioterapista.'}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
