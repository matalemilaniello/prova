import { motion } from 'motion/react';
import { Check, Moon } from 'lucide-react';
import type { DayType } from '../../../domain/types';
import { fromISO } from '../../../engine/dates';
import { FOOTBALL_LABEL, WEEKDAY_INITIAL, WEEKDAY_LONG, fmtNumber } from '../../../lib/format';
import { Callout, Card, DAY_TYPE_ICON, Disclosure, cn, renderIcon, staggerItem, toneColor, toneInk, toneSoft } from '../../../ui';
import { LOAD_ALERT_RATIO, LOAD_LOOKBACK_WEEKS, type LoadStatus } from '../../../engine/training';
import type { WeekDayInfo } from '../useTraining';
import { LoadMeter } from './LoadMeter';

export interface WeekCardProps {
  days: WeekDayInfo[];
  status: LoadStatus;
  planned: number;
  onDay?: (day: WeekDayInfo) => void;
}

type TileState = 'done' | 'planned' | 'missed' | 'skipped' | 'rest';

function tileFor(d: WeekDayInfo): { state: TileState; tone: DayType; content: 'letter' | 'icon' | 'rest'; letter?: string; label: string } {
  const tone = d.dayType;
  if (d.gym) {
    const done = Boolean(d.gym.log);
    const state: TileState = done ? 'done' : d.isPast ? (d.gym.optional ? 'skipped' : 'missed') : 'planned';
    const what = `seduta ${d.gym.log?.sessionId ?? d.gym.sessionId}${d.gym.optional && !d.gym.log ? ' facoltativa' : ''}`;
    return { state, tone: d.football ? 'calcio' : tone === 'calcio' ? 'palestra' : tone, content: 'letter', letter: d.gym.log?.sessionId ?? d.gym.sessionId, label: `${what}, ${done ? 'fatta' : d.isPast ? 'non fatta' : 'in programma'}` };
  }
  if (d.football) {
    const done = Boolean(d.football.log);
    return {
      state: done ? 'done' : d.isPast ? 'missed' : 'planned',
      tone: 'calcio',
      content: 'icon',
      label: `${FOOTBALL_LABEL[d.football.kind].toLowerCase()}, ${done ? 'fatta' : d.isPast ? 'non segnata' : 'in programma'}`,
    };
  }
  if (d.extra.length) return { state: 'done', tone: 'palestra', content: 'letter', letter: d.extra[0].sessionId, label: 'seduta fuori programma, fatta' };
  return { state: 'rest', tone, content: 'rest', label: tone === 'riposo' ? 'riposo' : 'giorno leggero' };
}

/** Giorno toccabile: seduta fatta (dettaglio), seduta in programma (anteprima), calcio già giocato (minuti e RPE). */
export function actionable(d: WeekDayInfo): boolean {
  return Boolean(d.gym?.log || d.extra.length || (d.gym && !d.isPast) || (d.football && (d.isPast || d.isToday)));
}

/** Settimana di allenamento (palestra e calcio) con il carico e l'avviso quando si esagera. */
export function WeekCard({ days, status, planned, onDay }: WeekCardProps) {
  const projected = status.load + planned;
  const projOver = !status.alert && status.threshold !== null && projected > status.threshold;
  return (
    <Card padding="none" as="section" aria-label="Questa settimana" className="overflow-hidden">
      <ol className="grid grid-cols-7 gap-1 px-3 pb-3 pt-4">
        {days.map((d, i) => {
          const t = tileFor(d);
          const color = toneColor(t.tone);
          const sub = d.load > 0 ? fmtNumber(d.load) : d.football && !d.football.log && !d.isPast ? d.football.time : d.gym && !d.gym.log && !d.isPast ? (d.gym.time ?? '') : '';
          const body = (
            <>
              <span className={cn('t-label text-[0.625rem]', d.isToday ? 'text-accent-ink' : 'text-ink-3')}>{WEEKDAY_INITIAL[d.weekday]}</span>
              <span className={cn('t-caption -mt-0.5 tabular', d.isToday ? 'font-semibold text-ink' : 'text-ink-3')}>{fromISO(d.iso).getDate()}</span>
              <span
                className={cn(
                  'relative mt-1 grid size-10 place-items-center rounded-[12px] transition-colors',
                  t.state === 'missed' && 'opacity-55',
                  t.state === 'skipped' && 'opacity-40',
                )}
                style={
                  t.state === 'done'
                    ? { background: color, color: `var(--on-${t.tone})`, boxShadow: `0 6px 16px -8px ${color}` }
                    : t.state === 'planned'
                      ? { background: toneSoft(t.tone, 16), color: toneInk(t.tone), boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${color} 45%, transparent)` }
                      : t.state === 'rest'
                        ? { background: 'var(--ink-soft)', color: 'var(--ink-3)' }
                        : { boxShadow: 'inset 0 0 0 1.5px var(--line-strong)', color: 'var(--ink-3)', backgroundImage: 'none' }
                }
              >
                {t.content === 'letter' ? (
                  <span className="t-num text-[1.25rem] font-bold">{t.letter}</span>
                ) : t.content === 'icon' ? (
                  renderIcon(DAY_TYPE_ICON.calcio, 18, 2.3)
                ) : (
                  <Moon size={15} strokeWidth={2.2} aria-hidden />
                )}
                {t.state === 'done' && (
                  <span className="absolute -right-1 -top-1 grid size-[17px] place-items-center rounded-full border-2 border-card bg-good text-[var(--on-good)]">
                    <Check size={9} strokeWidth={4} aria-hidden />
                  </span>
                )}
                {d.gym && d.football && (
                  <span className="absolute -bottom-1 left-1/2 size-[7px] -translate-x-1/2 rounded-full border-2 border-card" style={{ background: 'var(--calcio)' }} />
                )}
              </span>
              <span className={cn('t-mono mt-1.5 h-3.5 text-[0.625rem] leading-none tabular', d.load > 0 ? 'text-ink-2' : 'text-ink-3')}>{sub}</span>
              {d.isToday && <span aria-hidden className="absolute inset-x-1.5 -bottom-1 h-[3px] rounded-full bg-accent shadow-[0_0_10px_var(--accent-glow)]" />}
            </>
          );
          const label = `${WEEKDAY_LONG[d.weekday]} ${fromISO(d.iso).getDate()}: ${t.label}${d.load > 0 ? `, carico ${d.load}` : ''}`;
          return (
            <motion.li key={d.iso} {...staggerItem(i, 0.03)} className="relative min-w-0">
              {onDay && actionable(d) ? (
                <button type="button" onClick={() => onDay(d)} aria-label={label} className="relative flex w-full flex-col items-center rounded-[14px] pb-1.5 pt-1">
                  {body}
                </button>
              ) : (
                <div aria-label={label} role="group" className="relative flex flex-col items-center pb-1.5 pt-1">
                  {body}
                </div>
              )}
            </motion.li>
          );
        })}
      </ol>
      <div className="border-t border-line p-4">
        <p className="t-label mb-3 text-ink-3">Carico della settimana</p>
        <LoadMeter status={status} planned={planned} />
        <Disclosure variant="inline" tone="quiet" title="Come si calcola" className="mt-2">
          Ogni seduta e ogni partita valgono minuti × RPE (metodo di Foster), in unità arbitrarie (UA). La soglia è il{' '}
          {fmtNumber(Math.round(LOAD_ALERT_RATIO * 100))}% della media delle settimane precedenti (fino a {LOAD_LOOKBACK_WEEKS}): oltre, il carico sale
          più in fretta dell’adattamento.
        </Disclosure>
        {status.alert ? (
          <Callout tone="warn" title="Oltre il 120% della media" className="mt-4">
            Picchi così aumentano il rischio di sovraccarico. Tieni leggere le prossime sedute e salta la facoltativa.
          </Callout>
        ) : projOver ? (
          <Callout tone="accent" title="Con il programma superi la soglia" className="mt-4">
            Arriveresti a {fmtNumber(projected)} UA: se la settimana è pesante, la seduta facoltativa è la prima da togliere.
          </Callout>
        ) : null}
      </div>
    </Card>
  );
}
