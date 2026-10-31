import { motion, useReducedMotion } from 'motion/react';
import { Check, Trophy } from 'lucide-react';
import type { AppData, WorkoutLog } from '../../../domain/types';
import { formatDayLong } from '../../../engine/dates';
import { sessionLoad, workoutSetCount, workoutVolume, type LoadStatus, type PersonalRecord } from '../../../engine/training';
import { fmtDelta, fmtNumber } from '../../../lib/format';
import { Callout, ProgressRing, cn, spring, staggerItem } from '../../../ui';
import { exerciseFor, kgLabel } from '../lib';
import { LoadMeter } from '../components/LoadMeter';

export interface SummaryStepProps {
  log: WorkoutLog;
  sessionName: string;
  setsPlanned: number;
  records: PersonalRecord[];
  status: LoadStatus;
  physio: AppData['physio'];
}

/** Riepilogo dopo il salvataggio: numeri della seduta, record personali, carico della settimana. */
export function SummaryStep({ log, sessionName, setsPlanned, records, status, physio }: SummaryStepProps) {
  const reduce = useReducedMotion();
  const sets = workoutSetCount(log);
  const volume = workoutVolume(log);
  const load = sessionLoad(log.durationMin, log.rpe);
  const stats = [
    { label: 'Durata', value: fmtNumber(log.durationMin), unit: 'min' },
    { label: 'Carico', value: fmtNumber(load), unit: 'UA' },
    { label: 'Volume', value: fmtNumber(Math.round(volume)), unit: 'kg' },
    { label: 'RPE', value: fmtNumber(log.rpe), unit: 'su 10' },
  ];

  return (
    <div className="flex flex-col gap-6 pb-8 pt-4">
      <header className="flex flex-col items-center gap-4 text-center">
        <ProgressRing value={setsPlanned ? Math.min(1, sets / setsPlanned) : 1} size={132} stroke={10} tone="good" label={`${sets} serie su ${setsPlanned}`}>
          <motion.span
            initial={reduce ? false : { scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...spring, delay: 0.25 }}
            className="grid size-14 place-items-center rounded-full bg-good text-[var(--on-good)]"
          >
            <Check size={30} strokeWidth={3} aria-hidden />
          </motion.span>
        </ProgressRing>
        <div>
          <h2 className="t-title text-ink">{sessionName} salvata</h2>
          <p className="t-callout mt-1 text-ink-2">
            {formatDayLong(log.date)} · {sets} serie su {setsPlanned}
          </p>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card bg-line shadow-card">
        {stats.map((s, i) => (
          <motion.div key={s.label} {...staggerItem(i)} className="flex flex-col gap-1 bg-card px-4 py-3.5">
            <dt className="t-label text-ink-3">{s.label}</dt>
            <dd className="flex items-baseline gap-1">
              <span className="t-num text-[2rem] text-ink">{s.value}</span>
              <span className="t-mono text-[0.75rem] text-ink-2">{s.unit}</span>
            </dd>
          </motion.div>
        ))}
      </dl>

      <section className="flex flex-col gap-2" aria-label="Record personali">
        <h3 className="t-label px-1 text-ink-3">Record personali</h3>
        {records.length ? (
          <ol className="overflow-hidden rounded-card bg-card shadow-card">
            {records.map((r, i) => {
              const gain = r.e1rm - r.previous;
              return (
                <motion.li key={r.exerciseId} {...staggerItem(i + 4)} className={cn('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-line')}>
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-[11px]"
                    style={{ background: 'color-mix(in srgb, var(--accent) 18%, transparent)', color: 'var(--accent-ink)' }}
                    aria-hidden
                  >
                    <Trophy size={17} strokeWidth={2.2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-callout block font-semibold text-ink">{exerciseFor(r.exerciseId, physio)?.name ?? r.exerciseId}</span>
                    <span className="t-footnote block text-ink-2">
                      {kgLabel(r.weightKg)} × {r.reps} · 1RM stimato {kgLabel(Math.round(r.e1rm * 2) / 2)}
                    </span>
                  </span>
                  <span className="t-callout shrink-0 font-semibold text-good-ink tabular">{fmtDelta(gain, 'kg', 1)}</span>
                </motion.li>
              );
            })}
          </ol>
        ) : (
          <p className="t-footnote rounded-card bg-card px-4 py-3.5 text-ink-2 shadow-card">
            Nessun record oggi. Con la progressione doppia i record arrivano a ondate: prima le ripetizioni, poi il carico.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-label="Carico della settimana">
        <h3 className="t-label px-1 text-ink-3">Carico della settimana</h3>
        <div className="rounded-card bg-card p-4 shadow-card">
          <LoadMeter status={status} planned={0} />
        </div>
        {status.alert && (
          <Callout tone="warn" title="Settimana oltre il 120% della media">
            Tieni leggere le prossime sedute e, se è in programma, salta la seduta facoltativa.
          </Callout>
        )}
      </section>
    </div>
  );
}
