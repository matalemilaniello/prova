import { motion, useReducedMotion } from 'motion/react';
import { Check, Flag, TrendingUp, Trophy } from 'lucide-react';
import type { AppData, WorkoutLog } from '../../../domain/types';
import { formatDayLong } from '../../../engine/dates';
import { bestSet, lastEntryFor, sessionLoad, workoutSetCount, workoutVolume, type LoadStatus, type PersonalRecord } from '../../../engine/training';
import { fmtDelta, fmtNumber, listIt } from '../../../lib/format';
import { Callout, ProgressRing, cn, spring, staggerItem, toneInk, toneRing, toneSoft } from '../../../ui';
import { exerciseFor, kgLabel, shortName } from '../lib';
import { LoadMeter } from '../components/LoadMeter';

export interface SummaryStepProps {
  log: WorkoutLog;
  sessionName: string;
  setsPlanned: number;
  records: PersonalRecord[];
  status: LoadStatus;
  physio: AppData['physio'];
  /** Sedute registrate prima di questa (per i punti di partenza e i progressi). */
  history?: readonly WorkoutLog[];
}

/** Esercizi che contano per i punti di partenza e i progressi (niente riscaldamento e mobilità). */
const TRACKED = new Set(['spinta', 'tirata', 'gambe', 'prevenzione', 'core']);

/** Riepilogo dopo il salvataggio: numeri della seduta, record personali, carico della settimana. */
export function SummaryStep({ log, sessionName, setsPlanned, records, status, physio, history = [] }: SummaryStepProps) {
  const reduce = useReducedMotion();
  const prior = history.filter((w) => w.id !== log.id);
  const tracked = log.exercises.filter((e) => TRACKED.has(exerciseFor(e.exerciseId, physio)?.category ?? ''));
  // Prima volta con carico: il punto da cui la progressione riparte la prossima volta.
  const starts = tracked
    .filter((e) => !lastEntryFor(e.exerciseId, prior))
    .map((e) => ({ ex: e, best: bestSet(e) }))
    .filter((x): x is { ex: typeof x.ex; best: NonNullable<typeof x.best> } => Boolean(x.best && x.best.set.weightKg > 0));
  const firstEver = tracked.length > 0 && tracked.every((e) => !lastEntryFor(e.exerciseId, prior));
  const recordIds = new Set(records.map((r) => r.exerciseId));
  // Meglio dell'ultima volta (più ripetizioni o più carico), anche senza battere il record.
  const improved = tracked.filter((e) => {
    if (recordIds.has(e.exerciseId)) return false;
    const before = bestSet(lastEntryFor(e.exerciseId, prior)?.log)?.e1rm ?? 0;
    const now = bestSet(e)?.e1rm ?? 0;
    return before > 0 && now > before + 0.05;
  });
  const nameOf = (id: string) => shortName(exerciseFor(id, physio)?.name ?? id, id);
  const improvedText = (() => {
    const names = improved.map((e) => nameOf(e.exerciseId));
    return names.length > 4 ? `${names.slice(0, 3).join(', ')} e altri ${names.length - 3}` : listIt(names);
  })();
  const sets = workoutSetCount(log);
  const volume = workoutVolume(log);
  const load = sessionLoad(log.durationMin, log.rpe);
  const stats = [
    { label: 'Durata', value: fmtNumber(log.durationMin), unit: 'min' },
    { label: 'Carico', value: fmtNumber(load), unit: 'UA' },
    // Senza serie con carico il volume sarebbe 0 kg: meglio le serie fatte.
    volume > 0 ? { label: 'Volume', value: fmtNumber(Math.round(volume)), unit: 'kg' } : { label: 'Serie', value: fmtNumber(sets), unit: `su ${setsPlanned}` },
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

      {starts.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Punti di partenza">
          <h3 className="t-label px-1 text-ink-3">{firstEver ? 'Punti di partenza' : 'Nuovi punti di partenza'}</h3>
          <div className="overflow-hidden rounded-card bg-card shadow-card">
            {firstEver && (
              <div className="flex items-start gap-3 border-b border-line px-4 py-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-[11px]" style={{ background: toneSoft('good', 16), boxShadow: toneRing('good'), color: toneInk('good') }} aria-hidden>
                  <Flag size={17} strokeWidth={2.2} />
                </span>
                <p className="t-callout min-w-0 text-ink">
                  <span className="font-semibold">Prima seduta registrata.</span> Ecco i tuoi punti di partenza: la prossima volta ti propongo da qui.
                </p>
              </div>
            )}
            <ol>
              {starts.map(({ ex, best }, i) => (
                <motion.li key={ex.exerciseId} {...staggerItem(i + 4)} className={cn('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-line')}>
                  <span className="min-w-0 flex-1">
                    <span className="t-callout block font-semibold text-ink">{exerciseFor(ex.exerciseId, physio)?.name ?? ex.exerciseId}</span>
                    <span className="t-footnote block text-ink-2 tabular">
                      Serie migliore {kgLabel(best.set.weightKg)} × {best.set.reps}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="t-label block text-[0.625rem] text-ink-3">1RM stimato</span>
                    <span className="t-num text-[1.25rem] text-ink">{fmtNumber(Math.round(best.e1rm * 2) / 2, 1)}</span>
                    <span className="t-mono ml-0.5 text-[0.6875rem] text-ink-3">kg</span>
                  </span>
                </motion.li>
              ))}
            </ol>
            {!firstEver && <p className="t-footnote border-t border-line px-4 py-3 text-ink-2">La prossima volta ti propongo da qui.</p>}
          </div>
        </section>
      )}

      {(records.length > 0 || (!firstEver && volume > 0)) && (
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
                    style={{ background: toneSoft('accent', 16), boxShadow: toneRing('accent', 40), color: toneInk('accent') }}
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
        ) : improved.length > 0 ? (
          <p className="t-footnote flex items-start gap-2.5 rounded-card bg-card px-4 py-3.5 text-ink-2 shadow-card">
            <TrendingUp size={16} strokeWidth={2.4} className="mt-0.5 shrink-0 text-good-ink" aria-hidden />
            <span>
              <span className="font-semibold text-ink">Meglio dell’ultima volta in {improvedText}.</span> Con la
              progressione doppia salgono prima le ripetizioni, poi il carico: i record arrivano a ondate.
            </span>
          </p>
        ) : (
          <p className="t-footnote rounded-card bg-card px-4 py-3.5 text-ink-2 shadow-card">
            Oggi hai consolidato i carichi. Con la progressione doppia salgono prima le ripetizioni, poi il carico: i record
            arrivano a ondate.
          </p>
        )}
        {records.length > 0 && improved.length > 0 && (
          <p className="t-footnote flex items-start gap-2 px-1 text-ink-2">
            <TrendingUp size={15} strokeWidth={2.4} className="mt-0.5 shrink-0 text-good-ink" aria-hidden />
            Meglio dell’ultima volta anche in {improvedText}.
          </p>
        )}
      </section>
      )}

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
