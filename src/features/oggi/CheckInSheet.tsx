/**
 * Controllo del mattino: peso, sonno, dolori ed energia in meno di 30 secondi.
 *
 * Niente dati inventati: un controllo nuovo parte vuoto. Peso, orari e dolori si salvano solo se l'utente li
 * indica, con scelte rapide (In orario, +15 min, Come ieri) per restare sotto i 30 secondi. Toccare solo Salva
 * registra il controllo fatto, non una notte in orario né una pesata finta.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Activity, AlarmClock, BedDouble, Check, Scale, Zap } from 'lucide-react';
import type { CheckIn, HHMM, ISODate } from '../../domain/types';
import { addDays, addMinutes, daysBetween, formatDayLong, formatRelativeDay, hhmmToMin, minToHHMM, nightMinutes, todayISO } from '../../engine/dates';
import { buildTimeline } from '../../engine/timeline';
import { bedtimeFor, isOnTargetFor, sleepHours } from '../../engine/sleep';
import { capitalize, fmtDelta, fmtHours, fmtKg, fmtMinutes } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useApp, useUi } from '../../state/store';
import { Button, Card, Chip, EmptyState, Pill, RatingPicker, ScaleSlider, Sheet, Stepper, cn, spring, toneInk, type AnyTone } from '../../ui';

const QUALITY_LABELS = ['Pessima', 'Scarsa', 'Discreta', 'Buona', 'Ottima'];

const painWord = (v: number) => (v === 0 ? 'nessuno' : v <= 3 ? 'lieve' : v <= 6 ? 'moderato' : 'forte');
const energyWord = (v: number) => (v <= 3 ? 'bassa' : v <= 6 ? 'media' : v <= 8 ? 'buona' : 'ottima');
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Gesto di prova sempre uguale per zona: senza un riferimento il numero cambia con l'umore. */
const TEST_GESTURES: { re: RegExp; text: string }[] = [
  { re: /tibi|stinc/i, text: '10 saltelli su una gamba' },
  { re: /polpacc|achill|cavigl/i, text: '10 sollevamenti sulle punte su una gamba' },
  { re: /gomit/i, text: 'stringi forte una bottiglia a braccio teso' },
  { re: /flessor|posterior/i, text: 'ponte su una gamba, 5 ripetizioni' },
  { re: /addutt|pube|inguin/i, text: 'stringi un pallone tra le ginocchia' },
  { re: /ginocch/i, text: '5 squat su una gamba, lenti' },
  { re: /spall/i, text: 'braccio teso sopra la testa' },
];
export function testGesture(site: string): string {
  return TEST_GESTURES.find((g) => g.re.test(site))?.text ?? 'primi passi del mattino';
}

/** Ultimo controllo prima della data (per proporre i valori di ieri). */
function previousCheckIn(checkIns: Record<ISODate, CheckIn>, date: ISODate): CheckIn | undefined {
  const dates = Object.keys(checkIns)
    .filter((d) => d < date)
    .sort();
  return dates.length ? checkIns[dates[dates.length - 1]] : undefined;
}

/** Ultimo valore noto di un campo prima della data, con la sua data. */
function lastValue<T>(checkIns: Record<ISODate, CheckIn>, date: ISODate, pick: (c: CheckIn) => T | undefined): { value: T; date: ISODate } | undefined {
  const dates = Object.keys(checkIns)
    .filter((d) => d < date)
    .sort()
    .reverse();
  for (const d of dates) {
    const v = pick(checkIns[d]);
    if (v !== undefined && v !== null) return { value: v, date: d };
  }
  return undefined;
}

/** Orario del rito della sera registrato ieri ("Telefono fuori alle 23:52"), se c'è. */
export function ritualTimeFor(notes: Record<string, string> | undefined): HHMM | undefined {
  const note = notes?.coprifuoco ?? notes?.['minima:telefono'];
  const m = note?.match(/(\d{2}:\d{2})/);
  return m?.[1];
}

function Section({ icon, tone, title, hint, action, children }: { icon: typeof Scale; tone: AnyTone; title: string; hint?: ReactNode; action?: ReactNode; children: ReactNode }) {
  const Icon = icon;
  return (
    <Card as="section" padding="none" aria-label={title}>
      <div className="flex items-center gap-3 px-4 pt-4">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-card-2"
          style={{ color: toneInk(tone), boxShadow: 'inset 0 0 0 1px var(--line)' }}
        >
          <Icon size={17} strokeWidth={2.3} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="t-headline text-ink">{title}</h3>
          {hint && <p className="t-footnote text-ink-3">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="px-4 pb-4 pt-3">{children}</div>
    </Card>
  );
}

interface QuickOption {
  key: string;
  label: string;
  value: HHMM | null;
}

export default function CheckInSheet({ date, onClose }: { date: ISODate; onClose: () => void }) {
  // Istantanea all'apertura: il foglio non si ridisegna mentre si chiude dopo il salvataggio.
  const [{ existing, checkIns, profile, plan, yesterdayNotes }] = useState(() => {
    const s = useApp.getState();
    return {
      existing: s.checkIns[date],
      checkIns: s.checkIns,
      profile: s.profile,
      plan: s.plan,
      yesterdayNotes: s.dayLogs[addDays(date, -1)]?.notes,
    };
  });

  const prev = useMemo(() => previousCheckIn(checkIns, date), [checkIns, date]);
  const lastWeight = useMemo(() => lastValue(checkIns, date, (c) => (c.weightKg && c.weightKg > 0 ? c.weightKg : undefined)), [checkIns, date]);
  const sites = profile.painSites;
  // La notte appartiene a ieri: dopo la partita l'orario previsto è più tardi.
  const plannedBed = bedtimeFor(addDays(date, -1), plan);
  const ritual = ritualTimeFor(yesterdayNotes);

  const [weight, setWeight] = useState<number>(() => existing?.weightKg ?? lastWeight?.value ?? (profile.startWeightKg || 70));
  const [weighed, setWeighed] = useState<boolean>(() => typeof existing?.weightKg === 'number');
  const [bed, setBed] = useState<HHMM | undefined>(existing?.bedTime);
  const [bedKey, setBedKey] = useState<string | null>(() => (existing?.bedTime ? 'altro' : null));
  const [wake, setWake] = useState<HHMM | undefined>(existing?.wakeTime);
  const [wakeKey, setWakeKey] = useState<string | null>(() => (existing?.wakeTime ? 'altro' : null));
  const [quality, setQuality] = useState<number | undefined>(existing?.sleepQuality);
  const [pain, setPain] = useState<Record<string, number>>(() => (existing ? { ...existing.pain } : {}));
  const [energy, setEnergy] = useState<number | undefined>(existing?.energy);

  const bedOptions: QuickOption[] = [
    ...(ritual && ritual !== plannedBed ? [{ key: 'rito', label: `Rito ${ritual}`, value: ritual }] : []),
    { key: 'orario', label: 'In orario', value: plannedBed },
    { key: '15', label: '+15 min', value: addMinutes(plannedBed, 15) },
    { key: '30', label: '+30 min', value: addMinutes(plannedBed, 30) },
    { key: '60', label: '+1 h', value: addMinutes(plannedBed, 60) },
    { key: 'altro', label: 'Altro', value: null },
  ];
  const wakeOptions: QuickOption[] = [
    { key: 'orario', label: 'Prevista', value: plan.sleep.wake },
    { key: '-15', label: '−15 min', value: addMinutes(plan.sleep.wake, -15) },
    { key: '+15', label: '+15 min', value: addMinutes(plan.sleep.wake, 15) },
    { key: 'altro', label: 'Altro', value: null },
  ];

  const hours = bed && wake ? sleepHours(bed, wake) : undefined;
  const onTarget = bed ? isOnTargetFor(bed, date, plan) : undefined;
  const lateBy = bed ? nightMinutes(bed) - nightMinutes(plannedBed) : 0;
  const today = todayISO();
  const relative = daysBetween(date, today) === 0 ? '' : ` (${formatRelativeDay(date, today)})`;

  const pickBed = (o: QuickOption) => {
    haptic('selection');
    if (bedKey === o.key) {
      setBedKey(null);
      if (o.key !== 'altro') setBed(undefined);
      return;
    }
    setBedKey(o.key);
    setBed(o.value ?? bed ?? ritual ?? plannedBed);
  };
  const pickWake = (o: QuickOption) => {
    haptic('selection');
    if (wakeKey === o.key) {
      setWakeKey(null);
      if (o.key !== 'altro') setWake(undefined);
      return;
    }
    setWakeKey(o.key);
    setWake(o.value ?? wake ?? plan.sleep.wake);
  };

  const save = () => {
    const app = useApp.getState();
    const touchedPain = Object.fromEntries(Object.entries(pain).filter(([s, v]) => sites.includes(s) && typeof v === 'number'));
    const checkIn: CheckIn = {
      date,
      weightKg: weighed ? round1(weight) : undefined,
      bedTime: bed,
      wakeTime: wake,
      sleepHours: hours !== undefined ? round1(hours) : undefined,
      sleepQuality: quality,
      pain: touchedPain,
      energy,
    };
    app.saveCheckIn(checkIn);
    const log = app.dayLogs[date];
    if (!log?.status?.controllo) app.setItemStatus(date, 'controllo', 'fatto');
    // La notte di ieri si segna solo con un orario indicato davvero e in orario.
    const yesterday = addDays(date, -1);
    const yLog = app.dayLogs[yesterday];
    if (bed && onTarget && !yLog?.status?.letto && !yLog?.minimal) {
      const hasBed = buildTimeline(yesterday, app).some((i) => i.id === 'letto');
      if (hasBed) app.setItemStatus(yesterday, 'letto', 'fatto');
    }
    useUi.getState().toast(hours !== undefined ? `Controllo salvato · ${fmtHours(hours)} di sonno` : 'Controllo salvato', 'good');
    onClose();
  };

  const weightDelta = lastWeight && weighed ? weight - lastWeight.value : undefined;

  return (
    <Sheet
      open
      size="large"
      title={existing ? 'Modifica il controllo' : 'Controllo del mattino'}
      subtitle={`${capitalize(formatDayLong(date))}${relative} · meno di 30 secondi`}
      onClose={onClose}
      footer={
        <Button fullWidth size="lg" icon={Check} haptic="success" onClick={save}>
          {existing ? 'Salva le modifiche' : 'Salva'}
        </Button>
      }
    >
      <div className="flex flex-col gap-3.5 pb-2">
        <Section
          icon={Scale}
          tone="neutral"
          title="Peso"
          hint="A digiuno, dopo il bagno"
          action={
            weighed ? (
              <button type="button" onClick={() => setWeighed(false)} className="hit-44 t-footnote shrink-0 font-semibold text-accent-ink">
                Non pesato
              </button>
            ) : undefined
          }
        >
          {weighed ? (
            <>
              <Stepper label="Peso" hideLabel size="lg" value={weight} onChange={setWeight} step={0.1} min={30} max={250} unit="kg" />
              <p className="t-footnote mt-2 text-center text-ink-3">
                {lastWeight ? (
                  <>
                    Ultima pesata {fmtKg(lastWeight.value)}, {formatRelativeDay(lastWeight.date, date)}
                    {weightDelta !== undefined && Math.abs(weightDelta) >= 0.05 && (
                      <span className="font-medium text-ink-2"> · {fmtDelta(weightDelta, 'kg')}</span>
                    )}
                  </>
                ) : (
                  'Prima pesata: da qui parte la media dei 7 giorni.'
                )}
              </p>
            </>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="t-footnote text-ink-2">
                {lastWeight ? `Ultima pesata ${fmtKg(lastWeight.value)}, ${formatRelativeDay(lastWeight.date, date)}.` : 'Ancora nessuna pesata.'} Se oggi
                non ti pesi, la media usa quelle che ci sono.
              </p>
              <Button
                variant="secondary"
                size="md"
                icon={Scale}
                onClick={() => {
                  setWeight(lastWeight?.value ?? (profile.startWeightKg || 70));
                  setWeighed(true);
                }}
              >
                Mi sono pesato
              </Button>
            </div>
          )}
        </Section>

        <Section icon={BedDouble} tone="riposo" title="Sonno" hint="Tocca l’orario vero: senza scelta la notte non si registra">
          <QuickTime
            icon={BedDouble}
            label="A letto"
            planned={plannedBed}
            value={bed}
            options={bedOptions}
            selected={bedKey}
            onPick={pickBed}
            stepper={
              bedKey === 'altro' && bed ? (
                <Stepper
                  label="A letto"
                  hideLabel
                  value={nightMinutes(bed)}
                  onChange={(m) => setBed(minToHHMM(m))}
                  step={5}
                  min={20 * 60}
                  max={28 * 60}
                  format={(n) => minToHHMM(n)}
                />
              ) : null
            }
          />
          <div className="my-3 h-px bg-line" />
          <QuickTime
            icon={AlarmClock}
            label="Sveglia"
            planned={plan.sleep.wake}
            value={wake}
            options={wakeOptions}
            selected={wakeKey}
            onPick={pickWake}
            stepper={
              wakeKey === 'altro' && wake ? (
                <Stepper
                  label="Sveglia"
                  hideLabel
                  value={hhmmToMin(wake)}
                  onChange={(m) => setWake(minToHHMM(m))}
                  step={5}
                  min={4 * 60}
                  max={12 * 60}
                  format={(n) => minToHHMM(n)}
                />
              ) : null
            }
          />
          <AnimatePresence initial={false}>
            {hours !== undefined && (
              <motion.div
                key="ore"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={spring}
                className="overflow-hidden"
              >
                <div className="mt-3 flex items-center justify-between gap-3 rounded-[14px] bg-card-2 px-4 py-3">
                  <p className="flex items-baseline gap-1.5">
                    <span className="t-num text-[1.75rem] text-ink">{fmtHours(hours)}</span>
                    <span className="t-footnote text-ink-2">di sonno</span>
                  </p>
                  {onTarget ? (
                    <Pill tone="good" icon={Check}>
                      In orario
                    </Pill>
                  ) : (
                    <Pill tone="warn">
                      {fmtMinutes(lateBy)} dopo le {plannedBed}
                    </Pill>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <RatingPicker className="mt-4" label="Qualità del sonno" max={5} value={quality} onChange={setQuality} labels={QUALITY_LABELS} />
        </Section>

        <Section icon={Activity} tone="bad" title="Dolore" hint={`Sempre con lo stesso gesto di prova. Soglia ${plan.painThreshold} su 10`}>
          {sites.length ? (
            <div className="flex flex-col gap-5">
              {sites.map((site) => {
                const last = prev?.pain?.[site];
                const v = pain[site];
                return (
                  <div key={site}>
                    <ScaleSlider
                      label={site}
                      value={v}
                      onChange={(n) => setPain((p) => ({ ...p, [site]: n }))}
                      scheme="pain"
                      threshold={plan.painThreshold}
                      ghost={typeof last === 'number' ? last : undefined}
                      ghostLabel={prev?.date === addDays(date, -1) ? 'ieri' : 'l’ultima volta'}
                      describe={painWord}
                      lowLabel="Nessuno"
                      highLabel="Massimo"
                    />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <p className="t-footnote min-w-0 text-ink-3">
                        Prova: <span className="text-ink-2">{testGesture(site)}</span>
                      </p>
                      {typeof last === 'number' && v === undefined && (
                        <Chip selected={false} onChange={() => setPain((p) => ({ ...p, [site]: last }))} className="h-9! px-3.5! text-[0.875rem]!">
                          {prev?.date === addDays(date, -1) ? `Come ieri (${last})` : `Come l’ultima volta (${last})`}
                        </Chip>
                      )}
                      {v !== undefined && !existing && (
                        <button
                          type="button"
                          className="hit-44 t-footnote font-semibold text-ink-3"
                          onClick={() =>
                            setPain((p) => {
                              const n = { ...p };
                              delete n[site];
                              return n;
                            })
                          }
                        >
                          Togli
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState compact title="Nessuna zona da monitorare" text="Scegli le zone di dolore nelle impostazioni: le ritrovi qui ogni mattina." className="py-3" />
          )}
        </Section>

        <Section icon={Zap} tone="good" title="Energia">
          <ScaleSlider label="Come ti senti adesso" value={energy} onChange={setEnergy} min={1} max={10} scheme="energy" describe={energyWord} lowLabel="A terra" highLabel="Al massimo" />
        </Section>
      </div>
    </Sheet>
  );
}

/** Orario con scelte rapide; "Altro" apre lo stepper da 5 minuti. */
function QuickTime({
  icon,
  label,
  planned,
  value,
  options,
  selected,
  onPick,
  stepper,
}: {
  icon: typeof Scale;
  label: string;
  planned: HHMM;
  value: HHMM | undefined;
  options: QuickOption[];
  selected: string | null;
  onPick: (o: QuickOption) => void;
  stepper: ReactNode;
}) {
  const Icon = icon;
  return (
    <div role="group" aria-label={label}>
      <div className="flex items-baseline justify-between gap-3">
        <p className={cn('t-callout flex items-center gap-2 font-medium text-ink')}>
          <Icon size={16} strokeWidth={2.2} className="self-center text-ink-3" aria-hidden />
          {label}
          {value && <span className="t-mono text-[0.9375rem] font-semibold text-ink">{value}</span>}
        </p>
        <span className="t-mono shrink-0 text-[0.75rem] text-ink-3">previsto {planned}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o.key} selected={selected === o.key} onChange={() => onPick(o)} className="h-10! px-3! text-[0.875rem]!">
            {o.label}
          </Chip>
        ))}
      </div>
      <AnimatePresence initial={false}>
        {stepper && (
          <motion.div key="stepper" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring} className="overflow-hidden">
            <div className="pt-3">{stepper}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
