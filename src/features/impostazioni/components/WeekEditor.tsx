/**
 * Editor della settimana tipo, condiviso da Benvenuto e Impostazioni:
 * nastro dei 7 giorni, elenco dei giorni con le attività e foglio per modificare un giorno
 * (tipo di giorno, calcio con tipo/ora/durata, palestra con seduta/ora/facoltativa, fisioterapista).
 */
import { useRef } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Dumbbell, HeartPulse, Trophy } from 'lucide-react';
import type { DayType, FootballEvent, FootballKind, ScheduleDay, Weekday } from '../../../domain/types';
import { SESSIONS } from '../../../data/sessions';
import { DAY_TYPE_LABEL, DAY_TYPES, WEEKDAY_INITIAL, WEEKDAY_LONG, capitalize } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { Button, DAY_TYPE_ICON, DayTypeBadge, Segmented, Sheet, Toggle, cn, renderIcon, springSnappy, staggerItem, toneColor, toneInk, toneSoft } from '../../../ui';
import { dayActivities, suggestDayType } from '../lib';
import { FormRow, MiniStepper, TimePill } from './controls';

const ACTIVITY_ICON = { calcio: Trophy, palestra: Dumbbell, fisio: HeartPulse } as const;

// ───────────────────────── Nastro dei 7 giorni ─────────────────────────

export interface WeekRibbonProps {
  week: ScheduleDay[];
  onSelect?: (weekday: Weekday) => void;
  /** Giorno evidenziato (es. oggi). */
  highlight?: Weekday;
  className?: string;
}

/** I 7 giorni come tessere colorate per tipo di giorno: un colpo d'occhio sulla settimana. */
export function WeekRibbon({ week, onSelect, highlight, className }: WeekRibbonProps) {
  return (
    <div className={cn('grid grid-cols-7 gap-1.5', className)} role={onSelect ? 'group' : 'img'} aria-label="Settimana tipo">
      {week.map((d) => {
        const tone = d.dayType;
        const inner = (
          <>
            <span className={cn('t-label', highlight === d.weekday ? 'text-ink' : 'text-ink-3')}>{WEEKDAY_INITIAL[d.weekday]}</span>
            <span
              className="relative grid h-[52px] w-full place-items-center overflow-hidden rounded-[13px]"
              style={{ background: toneSoft(tone, 15), color: toneInk(tone), boxShadow: highlight === d.weekday ? `inset 0 0 0 1.5px ${toneColor(tone)}` : undefined }}
            >
              {renderIcon(DAY_TYPE_ICON[tone], 19, 2.2)}
              <span aria-hidden className="absolute inset-x-2.5 bottom-1.5 flex justify-center gap-[3px]">
                {d.football && <span className="h-[3px] w-[3px] rounded-full" style={{ background: toneColor('calcio') }} />}
                {d.gymSessionId && <span className="h-[3px] w-[3px] rounded-full" style={{ background: toneColor('palestra') }} />}
                {d.physio && <span className="h-[3px] w-[3px] rounded-full" style={{ background: toneColor('leggero') }} />}
              </span>
            </span>
          </>
        );
        const label = `${capitalize(WEEKDAY_LONG[d.weekday])}: ${DAY_TYPE_LABEL[tone]}`;
        return onSelect ? (
          <motion.button
            key={d.weekday}
            type="button"
            aria-label={label}
            whileTap={{ scale: 0.92 }}
            transition={springSnappy}
            onClick={() => {
              haptic('selection');
              onSelect(d.weekday);
            }}
            className="flex flex-col items-center gap-1.5"
          >
            {inner}
          </motion.button>
        ) : (
          <div key={d.weekday} className="flex flex-col items-center gap-1.5" aria-label={label}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────── Elenco dei giorni ─────────────────────────

export interface WeekDayListProps {
  week: ScheduleDay[];
  onSelect: (weekday: Weekday) => void;
  className?: string;
}

/** Elenco dei 7 giorni con tipo di giorno e attività; tocca un giorno per modificarlo. */
export function WeekDayList({ week, onSelect, className }: WeekDayListProps) {
  return (
    <ul className={cn('overflow-hidden rounded-card bg-card shadow-card', className)}>
      {week.map((d, i) => {
        const acts = dayActivities(d);
        return (
          <motion.li key={d.weekday} {...staggerItem(i, 0.025)} className={cn(i > 0 && 'relative before:absolute before:left-[19px] before:right-0 before:top-0 before:h-px before:bg-line')}>
            <motion.button
              type="button"
              whileTap={{ backgroundColor: 'var(--ink-soft)' }}
              onClick={() => {
                haptic('selection');
                onSelect(d.weekday);
              }}
              className="flex min-h-[60px] w-full items-center gap-3 py-2.5 pl-4 pr-3 text-left"
              aria-label={`${capitalize(WEEKDAY_LONG[d.weekday])}, ${DAY_TYPE_LABEL[d.dayType]}${acts.length ? `: ${acts.map((a) => a.label).join(', ')}` : ''}. Modifica`}
            >
              <span aria-hidden className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: toneColor(d.dayType) }} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="t-callout font-semibold text-ink">{capitalize(WEEKDAY_LONG[d.weekday])}</span>
                {acts.length ? (
                  <span className="t-footnote flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-ink-2">
                    {acts.map((a) => (
                      <span key={a.key} className="inline-flex items-center gap-1">
                        <span aria-hidden style={{ color: toneInk(a.tone) }}>
                          {renderIcon(ACTIVITY_ICON[a.key], 13, 2.4)}
                        </span>
                        {a.label}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="t-footnote text-ink-3">Nessuna attività</span>
                )}
              </span>
              <DayTypeBadge dayType={d.dayType} />
              <ChevronRight aria-hidden size={18} strokeWidth={2.2} className="shrink-0 text-ink-3" />
            </motion.button>
          </motion.li>
        );
      })}
    </ul>
  );
}

// ───────────────────────── Scelta del tipo di giorno ─────────────────────────

const DAY_TYPE_HINT: Record<DayType, string> = {
  calcio: 'Più carboidrati, ×1,25',
  palestra: 'Porzioni di riferimento',
  leggero: 'Carboidrati ×0,9',
  riposo: 'Carboidrati ×0,75',
};

export function DayTypePicker({ value, onChange }: { value: DayType; onChange: (t: DayType) => void }) {
  return (
    <div role="radiogroup" aria-label="Tipo di giorno" className="grid grid-cols-4 gap-2">
      {DAY_TYPES.map((t) => {
        const on = t === value;
        return (
          <motion.button
            key={t}
            type="button"
            role="radio"
            aria-checked={on}
            whileTap={{ scale: 0.94 }}
            transition={springSnappy}
            onClick={() => {
              if (!on) haptic('selection');
              onChange(t);
            }}
            className={cn('flex h-[74px] flex-col items-center justify-center gap-1.5 rounded-[16px] transition-[background-color,box-shadow] duration-200', !on && 'bg-card shadow-card')}
            style={on ? { background: toneSoft(t, 16), boxShadow: `inset 0 0 0 1.5px ${toneColor(t)}`, color: toneInk(t) } : { color: 'var(--ink-2)' }}
          >
            {renderIcon(DAY_TYPE_ICON[t], 22, on ? 2.4 : 2)}
            <span className={cn('text-[0.8125rem] font-semibold', on ? '' : 'text-ink-2')}>{DAY_TYPE_LABEL[t]}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

// ───────────────────────── Foglio di un giorno ─────────────────────────

const FOOTBALL_OPTIONS: { value: FootballKind; label: string }[] = [
  { value: 'partita', label: 'Partita' },
  { value: 'calcetto', label: 'Calcetto' },
  { value: 'allenamento', label: 'Allenamento' },
];

const FOOTBALL_DEFAULT: Record<FootballKind, FootballEvent> = {
  partita: { kind: 'partita', time: '21:00', durationMin: 90 },
  calcetto: { kind: 'calcetto', time: '21:00', durationMin: 60 },
  allenamento: { kind: 'allenamento', time: '20:30', durationMin: 90 },
};

const SESSION_IDS = ['A', 'B', 'C'].filter((id) => SESSIONS[id]);

export interface DayEditorSheetProps {
  /** Giorno da modificare; null = foglio chiuso. */
  day: ScheduleDay | null;
  onClose: () => void;
  /** Applica una modifica al giorno (le modifiche sono immediate). */
  onChange: (weekday: Weekday, patch: Partial<ScheduleDay>) => void;
}

export function DayEditorSheet({ day, onClose, onChange }: DayEditorSheetProps) {
  // Ricorda l'ultimo giorno mostrato, così il foglio resta pieno mentre si chiude.
  const last = useRef<ScheduleDay | null>(day);
  if (day) last.current = day;
  const d = day ?? last.current;
  // Ultime scelte, per riaccendere calcio o palestra con gli stessi valori.
  const memory = useRef<{ football?: FootballEvent; gym?: { id: string; time: string; optional: boolean } }>({});
  if (!d) return null;

  const apply = (patch: Partial<ScheduleDay>, retype = false) => {
    const next = { ...d, ...patch };
    onChange(d.weekday, retype ? { ...patch, dayType: suggestDayType(next) } : patch);
  };

  const sessionText = d.gymSessionId ? SESSIONS[d.gymSessionId] : undefined;

  return (
    <Sheet
      open={Boolean(day)}
      onClose={onClose}
      title={capitalize(WEEKDAY_LONG[d.weekday])}
      subtitle="Le modifiche valgono da subito, per tutte le settimane."
      footer={
        <Button fullWidth size="lg" onClick={onClose}>
          Fatto
        </Button>
      }
    >
      <div className="flex flex-col gap-6 pb-2 pt-1.5">
        <section className="flex flex-col gap-2.5" aria-label="Tipo di giorno">
          <h3 className="t-label px-1 text-ink-3">Tipo di giorno</h3>
          <DayTypePicker value={d.dayType} onChange={(t) => apply({ dayType: t })} />
          <p className="t-footnote px-1 text-ink-3">
            {DAY_TYPE_HINT[d.dayType]}. Il tipo di giorno decide calorie e carboidrati del menù.
          </p>
        </section>

        <section className="flex flex-col gap-2" aria-label="Calcio">
          <h3 className="t-label px-1 text-ink-3">Calcio</h3>
          <div className="overflow-hidden rounded-card bg-card shadow-card">
            <FormRow icon={Trophy} iconTone="calcio" label="C’è calcio">
              <Toggle
                label="C’è calcio"
                checked={Boolean(d.football)}
                onChange={(on) => {
                  if (on) apply({ football: memory.current.football ?? FOOTBALL_DEFAULT.partita }, true);
                  else {
                    memory.current.football = d.football;
                    apply({ football: undefined }, true);
                  }
                }}
              />
            </FormRow>
            {d.football && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ type: 'spring', stiffness: 420, damping: 38 }} className="overflow-hidden">
                <div className="border-t border-line px-4 py-3">
                  <Segmented
                    aria-label="Tipo di calcio"
                    size="sm"
                    value={d.football.kind}
                    onChange={(kind) => {
                      const prev = d.football!;
                      const def = FOOTBALL_DEFAULT[kind];
                      // Se orario e durata erano quelli tipici del tipo precedente, passa a quelli del nuovo.
                      const typical = prev.time === FOOTBALL_DEFAULT[prev.kind].time && prev.durationMin === FOOTBALL_DEFAULT[prev.kind].durationMin;
                      apply({ football: typical ? def : { ...prev, kind } });
                    }}
                    options={FOOTBALL_OPTIONS}
                  />
                </div>
                <div className="relative before:absolute before:left-4 before:right-0 before:top-0 before:h-px before:bg-line">
                  <FormRow label="Inizio">
                    <TimePill label="Inizio del calcio" value={d.football.time} onChange={(time) => apply({ football: { ...d.football!, time } })} />
                  </FormRow>
                </div>
                <div className="relative before:absolute before:left-4 before:right-0 before:top-0 before:h-px before:bg-line">
                  <FormRow label="Durata">
                    <MiniStepper
                      label="Durata del calcio"
                      value={d.football.durationMin}
                      min={30}
                      max={180}
                      step={15}
                      unit="min"
                      onChange={(durationMin) => apply({ football: { ...d.football!, durationMin } })}
                    />
                  </FormRow>
                </div>
              </motion.div>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-2" aria-label="Palestra">
          <h3 className="t-label px-1 text-ink-3">Palestra</h3>
          <div className="overflow-hidden rounded-card bg-card shadow-card">
            <FormRow icon={Dumbbell} iconTone="palestra" label="Seduta in palestra">
              <Toggle
                label="Seduta in palestra"
                checked={Boolean(d.gymSessionId)}
                onChange={(on) => {
                  if (on) {
                    const g = memory.current.gym ?? { id: 'A', time: '17:00', optional: false };
                    apply({ gymSessionId: g.id, gymTime: g.time, gymOptional: g.optional || undefined }, true);
                  } else {
                    memory.current.gym = { id: d.gymSessionId ?? 'A', time: d.gymTime ?? '17:00', optional: Boolean(d.gymOptional) };
                    apply({ gymSessionId: undefined, gymTime: undefined, gymOptional: undefined }, true);
                  }
                }}
              />
            </FormRow>
            {d.gymSessionId && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ type: 'spring', stiffness: 420, damping: 38 }} className="overflow-hidden">
                <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
                  <Segmented
                    aria-label="Seduta"
                    size="sm"
                    value={d.gymSessionId}
                    onChange={(id) => apply({ gymSessionId: id })}
                    options={SESSION_IDS.map((id) => ({ value: id, label: SESSIONS[id]?.name ?? `Seduta ${id}` }))}
                  />
                  {sessionText && (
                    <p className="t-footnote px-1 text-ink-2">
                      {sessionText.subtitle} · circa {sessionText.estMin} min
                    </p>
                  )}
                </div>
                <div className="relative before:absolute before:left-4 before:right-0 before:top-0 before:h-px before:bg-line">
                  <FormRow label="Ora">
                    <TimePill label="Ora della palestra" value={d.gymTime ?? '17:00'} onChange={(gymTime) => apply({ gymTime })} />
                  </FormRow>
                </div>
                <div className="relative before:absolute before:left-4 before:right-0 before:top-0 before:h-px before:bg-line">
                  <FormRow label="Facoltativa" hint="Se la salti la giornata resta riuscita">
                    <Toggle label="Seduta facoltativa" checked={Boolean(d.gymOptional)} onChange={(on) => apply({ gymOptional: on || undefined }, true)} />
                  </FormRow>
                </div>
              </motion.div>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-2" aria-label="Fisioterapista">
          <h3 className="t-label px-1 text-ink-3">Fisioterapista</h3>
          <div className="overflow-hidden rounded-card bg-card shadow-card">
            <FormRow icon={HeartPulse} iconTone="leggero" label="Esercizi del fisioterapista" hint="Compaiono nella giornata dopo pranzo">
              <Toggle label="Esercizi del fisioterapista" checked={Boolean(d.physio)} onChange={(on) => apply({ physio: on || undefined })} />
            </FormRow>
          </div>
        </section>
      </div>
    </Sheet>
  );
}
