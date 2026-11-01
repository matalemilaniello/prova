import { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Dumbbell, HeartPulse, Plus, Trophy } from 'lucide-react';
import type { AppData, ISODate, Plan, WorkoutLog } from '../../../domain/types';
import { SESSION_LIST } from '../../../data/sessions';
import { formatWeekdayShort, fromISO } from '../../../engine/dates';
import { introLevel, physioCoverage, sessionDuration, sessionLoad, workoutVolume, type PersonalRecord } from '../../../engine/training';
import { capitalize, fmtDelta, fmtNumber, listIt, WEEKDAY_LONG } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { Button, Card, Disclosure, EmptyState, Pill, SectionTitle, cn, springSnappy, staggerItem, toneInk, toneRing, toneSoft } from '../../../ui';
import { daysPhrase, doseLabel, exerciseFor, physioWeekdays, sessionTone, shortName } from '../lib';
import { agoLabel, type StrengthRow } from '../useTraining';
import { SessionGlyph } from './SessionGlyph';

// ───────────────────────── Sedute A, B, C ─────────────────────────

export function SessionsSection({
  plan,
  history,
  today,
  physio,
  onOpen,
}: {
  plan: Plan;
  history: WorkoutLog[];
  today: ISODate;
  physio?: AppData['physio'];
  onOpen: (id: string) => void;
}) {
  // Minuti come nel lettore: fase di ingresso compresa, senza i doppioni del fisioterapista.
  const durations = SESSION_LIST.map((s) => sessionDuration(s, physio, { intro: introLevel(s.id, history) !== null }));
  const physioMin = durations[0]?.physio ?? 0;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="sedute-titolo">
      <SectionTitle id="sedute-titolo" subtitle={physioMin > 0 ? `Con gli esercizi del fisioterapista circa ${physioMin} min in più` : undefined}>
        Le sedute
      </SectionTitle>
      <ul className="overflow-hidden rounded-card bg-card shadow-card">
        {SESSION_LIST.map((s, i) => {
          const days = plan.week.filter((d) => d.gymSessionId === s.id);
          const last = history.find((w) => w.sessionId === s.id);
          const when = days.length ? days.map((d) => WEEKDAY_LONG[d.weekday]).join(' e ') : 'fuori programma';
          const optional = days.some((d) => d.gymOptional);
          return (
            <motion.li key={s.id} {...staggerItem(i)} className={cn(i > 0 && 'border-t border-line')}>
              <motion.button
                type="button"
                whileTap={{ backgroundColor: 'var(--ink-soft)' }}
                onClick={() => {
                  haptic('selection');
                  onOpen(s.id);
                }}
                className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left"
              >
                <SessionGlyph letter={s.id} size="md" tone={sessionTone(s.id, plan)} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="t-headline text-ink">{s.name}</span>
                    <span className="t-mono text-[0.75rem] text-ink-3">{durations[i].own} min</span>
                  </span>
                  <span className="t-footnote mt-0.5 block text-ink-2">{s.subtitle}</span>
                  <span className="t-caption mt-1 block text-ink-3">
                    {when}
                    {optional ? ', facoltativa' : ''}
                    {last ? ` · fatta ${agoLabel(last.date, today)}` : ''}
                  </span>
                </span>
                <ChevronRight size={18} strokeWidth={2.2} className="-mr-1 shrink-0 text-ink-3" aria-hidden />
              </motion.button>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}

// ───────────────────────── Fisioterapista ─────────────────────────

export function PhysioSection({ physio, plan, onEdit }: { physio: AppData['physio']; plan: Plan; onEdit: () => void }) {
  const days = physioWeekdays(plan);
  const list = physio.prescriptions.map((p) => ({ p, ex: exerciseFor(p.exerciseId, physio) }));
  // Esercizi delle sedute che lavorano gli stessi tessuti: il lettore li salta.
  const covered = [
    ...new Set(SESSION_LIST.flatMap((s) => [...physioCoverage(s, physio).values()].map((c) => shortName(exerciseFor(c.exerciseId)?.name ?? c.exerciseId, c.exerciseId)))),
  ];
  return (
    <section className="flex flex-col gap-3" aria-labelledby="fisio-titolo">
      <SectionTitle id="fisio-titolo" action={list.length ? { label: 'Modifica', onPress: onEdit } : undefined}>
        Dal fisioterapista
      </SectionTitle>
      {list.length ? (
        // L'elenco è sempre lo stesso (lo scrive l'utente): chiuso di base, con i giorni come riassunto.
        <Card padding="none" className="px-4 py-1.5">
          <Disclosure
            icon={
              <span
                className="grid size-[30px] shrink-0 place-items-center rounded-[9px]"
                style={{ background: toneSoft('leggero', 16), boxShadow: toneRing('leggero'), color: toneInk('leggero') }}
                aria-hidden
              >
                <HeartPulse size={17} strokeWidth={2.2} />
              </span>
            }
            title={list.length === 1 ? '1 esercizio' : `${list.length} esercizi`}
            summary={days.length ? listIt(days) : 'nessun giorno'}
            contentClassName="pb-2 pt-1"
          >
            <p className="t-footnote text-ink-2">
              {days.length ? `${capitalize(daysPhrase(days))}, e in fondo a ogni seduta.` : 'Nessun giorno scelto: li trovi in fondo a ogni seduta.'}
            </p>
            <ul className="mt-2">
              {list.map(({ p, ex }, i) => (
                <li key={`${p.exerciseId}-${i}`} className="flex items-center gap-3 border-t border-line py-2.5">
                  <span className="t-mono w-4 shrink-0 text-[0.75rem] text-ink-3">{i + 1}</span>
                  <span className="t-callout min-w-0 flex-1 text-ink">{ex?.name ?? p.exerciseId}</span>
                  <span className="t-mono shrink-0 text-[0.75rem] text-leggero-ink">{doseLabel(p, { perSide: false })}</span>
                </li>
              ))}
            </ul>
            {covered.length > 0 && (
              <p className="t-footnote border-t border-line pt-3 text-ink-3">
                Nelle sedute salti {listIt(covered)}: lavorano gli stessi tessuti, così il carico non raddoppia.
              </p>
            )}
          </Disclosure>
        </Card>
      ) : (
        <Card padding="none">
          <EmptyState
            compact
            icon={HeartPulse}
            title="Nessun esercizio del fisioterapista"
            text="Inserisci quelli che ti ha dato: compaiono nella giornata e in fondo alle sedute."
            action={
              <Button size="sm" icon={Plus} onClick={onEdit}>
                Aggiungi
              </Button>
            }
          />
        </Card>
      )}
    </section>
  );
}

// ───────────────────────── Forza stimata ─────────────────────────

function Sparkline({ values }: { values: number[] }) {
  const w = 64;
  const h = 24;
  if (values.length < 2) return <span className="block h-6 w-16" aria-hidden />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 4) + 2, h - 3 - ((v - min) / span) * (h - 6)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0">
      <path d={`${d} L${last[0].toFixed(1)},${h} L2,${h} Z`} fill="color-mix(in srgb, var(--palestra) 14%, transparent)" />
      <path d={d} fill="none" stroke="var(--palestra)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.6} fill="var(--palestra)" stroke="var(--card)" strokeWidth={1.4} />
    </svg>
  );
}

export function StrengthSection({ rows, physio }: { rows: StrengthRow[]; physio: AppData['physio'] }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, 3);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="forza-titolo">
      <SectionTitle
        id="forza-titolo"
        subtitle="1RM stimato (Epley) e variazione in 4 settimane"
        action={rows.length > 3 ? { label: all ? 'Meno' : `Tutti (${rows.length})`, onPress: () => setAll((v) => !v) } : undefined}
      >
        Forza stimata
      </SectionTitle>
      <ul className="overflow-hidden rounded-card bg-card shadow-card">
        {shown.map((r, i) => (
          <motion.li key={r.exerciseId} {...staggerItem(i)} className={cn('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-line')}>
            <span className="t-callout min-w-0 flex-1 font-medium text-ink">{exerciseFor(r.exerciseId, physio)?.name ?? r.exerciseId}</span>
            <Sparkline values={r.points.map((p) => p.e1rm)} />
            <span className="flex w-[72px] shrink-0 flex-col items-end">
              <span className="t-num text-[1.25rem] text-ink">
                {fmtNumber(Math.round(r.latest * 2) / 2, 1)}
                <span className="t-mono ml-0.5 text-[0.6875rem] text-ink-3">kg</span>
              </span>
              <span className={cn('t-caption font-semibold tabular', r.delta > 0.05 ? 'text-good-ink' : 'text-ink-3')}>{fmtDelta(r.delta, 'kg', 1)}</span>
            </span>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

// ───────────────────────── Storico ─────────────────────────

export function HistorySection({
  history,
  recordById,
  physio,
  onOpen,
  onStart,
}: {
  history: WorkoutLog[];
  /** Record ancora imbattuto della seduta (uno al massimo), per id. */
  recordById: Record<string, PersonalRecord | null>;
  physio: AppData['physio'];
  onOpen: (log: WorkoutLog) => void;
  onStart: () => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? history : history.slice(0, 3);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="storico-titolo">
      <SectionTitle id="storico-titolo" action={history.length > 3 ? { label: all ? 'Meno' : `Tutte (${history.length})`, onPress: () => setAll((v) => !v) } : undefined}>
        Storico
      </SectionTitle>
      {history.length ? (
        <ul className="overflow-hidden rounded-card bg-card shadow-card">
          {shown.map((w, i) => {
            const rec = recordById[w.id];
            const vol = workoutVolume(w);
            return (
              <motion.li key={w.id} {...staggerItem(i)} className={cn(i > 0 && 'border-t border-line')}>
                <motion.button
                  type="button"
                  whileTap={{ backgroundColor: 'var(--ink-soft)' }}
                  transition={springSnappy}
                  onClick={() => {
                    haptic('selection');
                    onOpen(w);
                  }}
                  className="flex w-full items-center gap-3.5 px-4 py-3 text-left"
                >
                  <span className="flex w-10 shrink-0 flex-col items-center rounded-[11px] bg-ink-soft py-1.5" aria-hidden>
                    <span className="t-label text-[0.5625rem] text-ink-3">{formatWeekdayShort(w.date)}</span>
                    <span className="t-num text-[1.25rem] text-ink">{fromISO(w.date).getDate()}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-callout block font-semibold text-ink">Seduta {w.sessionId}</span>
                    <span className="t-footnote mt-0.5 block text-ink-2 tabular">
                      {w.durationMin} min · RPE {w.rpe} · {fmtNumber(sessionLoad(w.durationMin, w.rpe))} UA
                      {vol > 0 ? ` · ${fmtNumber(Math.round(vol))}\u00a0kg` : ''}
                    </span>
                    {rec && (
                      <Pill tone="accent" icon={Trophy} className="mt-1.5 min-w-0 shrink!">
                        Record: {shortName(exerciseFor(rec.exerciseId, physio)?.name ?? rec.exerciseId, rec.exerciseId)}
                      </Pill>
                    )}
                  </span>
                  <ChevronRight size={18} strokeWidth={2.2} className="-mr-1 shrink-0 text-ink-3" aria-hidden />
                </motion.button>
              </motion.li>
            );
          })}
        </ul>
      ) : (
        <Card padding="none">
          <EmptyState
            compact
            icon={Dumbbell}
            title="Ancora nessuna seduta"
            text="Dopo la prima trovi qui carichi, durata, carico interno e record personali."
            action={
              <Button size="sm" onClick={onStart}>
                Inizia la prima
              </Button>
            }
          />
        </Card>
      )}
    </section>
  );
}

