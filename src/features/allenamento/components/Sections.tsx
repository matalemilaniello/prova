import { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Dumbbell, HeartPulse, Plus, Trophy } from 'lucide-react';
import type { AppData, ISODate, Plan, WorkoutLog } from '../../../domain/types';
import { SESSION_LIST } from '../../../data/sessions';
import { formatWeekdayShort, fromISO } from '../../../engine/dates';
import { sessionLoad, workoutVolume } from '../../../engine/training';
import { fmtDelta, fmtNumber, WEEKDAY_LONG } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { Button, Card, EmptyState, Pill, SectionTitle, cn, springSnappy, staggerItem } from '../../../ui';
import { daysPhrase, doseLabel, exerciseFor, physioWeekdays, sessionTone } from '../lib';
import { agoLabel, type StrengthRow } from '../useTraining';
import { SessionGlyph } from './SessionGlyph';

// ───────────────────────── Sedute A, B, C ─────────────────────────

export function SessionsSection({ plan, history, today, onOpen }: { plan: Plan; history: WorkoutLog[]; today: ISODate; onOpen: (id: string) => void }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="sedute-titolo">
      <SectionTitle id="sedute-titolo">Le sedute</SectionTitle>
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
                    <span className="t-mono text-[0.75rem] text-ink-3">{s.estMin} min</span>
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
  return (
    <section className="flex flex-col gap-3" aria-labelledby="fisio-titolo">
      <SectionTitle id="fisio-titolo" action={list.length ? { label: 'Modifica', onPress: onEdit } : undefined}>
        Dal fisioterapista
      </SectionTitle>
      {list.length ? (
        <Card padding="none" className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <span
              className="grid size-[30px] shrink-0 place-items-center rounded-[9px]"
              style={{ background: 'color-mix(in srgb, var(--leggero) 18%, transparent)', color: 'var(--leggero)' }}
              aria-hidden
            >
              <HeartPulse size={17} strokeWidth={2.2} />
            </span>
            <p className="t-footnote min-w-0 flex-1 text-ink-2">
              <span className="font-semibold text-ink">{list.length === 1 ? '1 esercizio' : `${list.length} esercizi`}</span>
              {days.length ? ` · ${daysPhrase(days)}` : ' · nessun giorno scelto'}, e in fondo a ogni seduta
            </p>
          </div>
          <ul>
            {list.map(({ p, ex }, i) => (
              <li key={`${p.exerciseId}-${i}`} className={cn('flex items-center gap-3 px-4 py-2.5', i > 0 && 'border-t border-line')}>
                <span className="t-mono w-4 shrink-0 text-[0.75rem] text-ink-3">{i + 1}</span>
                <span className="t-callout min-w-0 flex-1 text-ink">{ex?.name ?? p.exerciseId}</span>
                <span className="t-mono shrink-0 text-[0.75rem] text-leggero-ink">{doseLabel(p, { perSide: false })}</span>
              </li>
            ))}
          </ul>
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
  const shown = all ? rows : rows.slice(0, 4);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="forza-titolo">
      <SectionTitle
        id="forza-titolo"
        subtitle="1RM stimato con la formula di Epley, variazione nelle ultime 4 settimane"
        action={rows.length > 4 ? { label: all ? 'Meno' : 'Tutti', onPress: () => setAll((v) => !v) } : undefined}
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
  recordsById,
  onOpen,
  onStart,
}: {
  history: WorkoutLog[];
  recordsById: Record<string, number>;
  onOpen: (log: WorkoutLog) => void;
  onStart: () => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? history : history.slice(0, 5);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="storico-titolo">
      <SectionTitle id="storico-titolo" action={history.length > 5 ? { label: all ? 'Mostra meno' : `Tutte (${history.length})`, onPress: () => setAll((v) => !v) } : undefined}>
        Storico
      </SectionTitle>
      {history.length ? (
        <ul className="overflow-hidden rounded-card bg-card shadow-card">
          {shown.map((w, i) => {
            const prs = recordsById[w.id] ?? 0;
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
                    <span className="flex items-center gap-2">
                      <span className="t-callout font-semibold text-ink">Seduta {w.sessionId}</span>
                      {prs > 0 && (
                        <Pill tone="accent" icon={Trophy}>
                          {prs === 1 ? '1 record' : `${prs} record`}
                        </Pill>
                      )}
                    </span>
                    <span className="t-footnote mt-0.5 block text-ink-2 tabular">
                      {w.durationMin} min · RPE {w.rpe} · {fmtNumber(sessionLoad(w.durationMin, w.rpe))} UA
                      {vol > 0 ? ` · ${fmtNumber(Math.round(vol))} kg` : ''}
                    </span>
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

