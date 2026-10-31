/**
 * Controllo del mattino: peso, sonno, dolori ed energia in meno di 30 secondi.
 * Tutto è precompilato (ultimo peso, orari del piano, ultimi dolori): spesso basta toccare Salva.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Activity, AlarmClock, BedDouble, Check, Scale, Zap } from 'lucide-react';
import type { CheckIn, ISODate } from '../../domain/types';
import { addDays, daysBetween, formatDayLong, formatRelativeDay, hhmmToMin, minToHHMM, nightMinutes, todayISO } from '../../engine/dates';
import { buildTimeline } from '../../engine/timeline';
import { isOnTarget, sleepHours } from '../../engine/sleep';
import { capitalize, fmtDelta, fmtHours, fmtKg, fmtMinutes } from '../../lib/format';
import { useApp, useUi } from '../../state/store';
import { Button, Card, EmptyState, Pill, RatingPicker, ScaleSlider, Sheet, Stepper, cn, toneInk, toneSoft, type AnyTone } from '../../ui';

const QUALITY_LABELS = ['Pessima', 'Scarsa', 'Discreta', 'Buona', 'Ottima'];

const painWord = (v: number) => (v === 0 ? 'nessuno' : v <= 3 ? 'lieve' : v <= 6 ? 'moderato' : 'forte');
const energyWord = (v: number) => (v <= 3 ? 'bassa' : v <= 6 ? 'media' : v <= 8 ? 'buona' : 'ottima');
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Ultimo controllo prima della data (per precompilare e confrontare). */
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

function Section({ icon, tone, title, hint, action, children }: { icon: typeof Scale; tone: AnyTone; title: string; hint?: ReactNode; action?: ReactNode; children: ReactNode }) {
  const Icon = icon;
  return (
    <Card as="section" padding="none" aria-label={title}>
      <div className="flex items-center gap-3 px-4 pt-4">
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px]" style={{ background: toneSoft(tone, 16), color: toneInk(tone) }}>
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

export default function CheckInSheet({ date, onClose }: { date: ISODate; onClose: () => void }) {
  // Istantanea all'apertura: il foglio non si ridisegna mentre si chiude dopo il salvataggio.
  const [{ existing, checkIns, profile, plan }] = useState(() => {
    const s = useApp.getState();
    return { existing: s.checkIns[date], checkIns: s.checkIns, profile: s.profile, plan: s.plan };
  });

  const prev = useMemo(() => previousCheckIn(checkIns, date), [checkIns, date]);
  const lastWeight = useMemo(() => lastValue(checkIns, date, (c) => (c.weightKg && c.weightKg > 0 ? c.weightKg : undefined)), [checkIns, date]);
  const sites = profile.painSites;

  const [weight, setWeight] = useState<number>(() => existing?.weightKg ?? lastWeight?.value ?? (profile.startWeightKg || 70));
  const [weighed, setWeighed] = useState<boolean>(() => (existing ? typeof existing.weightKg === 'number' : true));
  const [bed, setBed] = useState(() => existing?.bedTime ?? plan.sleep.current);
  const [wake, setWake] = useState(() => existing?.wakeTime ?? plan.sleep.wake);
  const [quality, setQuality] = useState<number | undefined>(existing?.sleepQuality);
  const [pain, setPain] = useState<Record<string, number>>(() => {
    if (existing) return { ...existing.pain };
    const out: Record<string, number> = {};
    for (const s of sites) {
      const v = prev?.pain?.[s];
      if (typeof v === 'number') out[s] = v;
    }
    return out;
  });
  const [energy, setEnergy] = useState<number | undefined>(existing?.energy);

  const hours = sleepHours(bed, wake);
  const onTarget = isOnTarget(bed, plan);
  const lateBy = nightMinutes(bed) - nightMinutes(plan.sleep.current);
  const today = todayISO();
  const relative = daysBetween(date, today) === 0 ? '' : ` (${formatRelativeDay(date, today)})`;

  const save = () => {
    const app = useApp.getState();
    const checkIn: CheckIn = {
      date,
      weightKg: weighed ? round1(weight) : undefined,
      bedTime: bed,
      wakeTime: wake,
      sleepHours: round1(hours),
      sleepQuality: quality,
      pain: Object.fromEntries(Object.entries(pain).filter(([s]) => sites.includes(s))),
      energy,
    };
    app.saveCheckIn(checkIn);
    // Il controllo è fatto; la notte appena passata in orario segna il "A letto" di ieri.
    const log = app.dayLogs[date];
    if (!log?.status?.controllo) app.setItemStatus(date, 'controllo', 'fatto');
    const yesterday = addDays(date, -1);
    const yLog = app.dayLogs[yesterday];
    if (onTarget && !yLog?.status?.letto && !yLog?.minimal) {
      const hasBed = buildTimeline(yesterday, app).some((i) => i.id === 'letto');
      if (hasBed) app.setItemStatus(yesterday, 'letto', 'fatto');
    }
    useUi.getState().toast(`Controllo salvato · ${fmtHours(hours)} di sonno`, 'good');
    onClose();
  };

  // Stepper degli orari: minuti "notturni" per l'ora a letto (00:30 dopo 23:30), minuti del giorno per la sveglia.
  const bedMin = nightMinutes(bed);
  const wakeMin = hhmmToMin(wake);

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
          tone="accent"
          title="Peso"
          hint="A digiuno, dopo il bagno"
          action={
            <button
              type="button"
              onClick={() => setWeighed((w) => !w)}
              className="hit-44 t-footnote shrink-0 font-semibold text-accent-ink"
              aria-pressed={!weighed}
            >
              {weighed ? 'Non pesato' : 'Aggiungi'}
            </button>
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
            <p className="t-callout text-ink-2">Nessun problema: la media settimanale usa le pesate che ci sono.</p>
          )}
        </Section>

        <Section icon={BedDouble} tone="riposo" title="Sonno" hint={`Fase attuale: a letto alle ${plan.sleep.current}`}>
          <div className="flex flex-col">
            <TimeRow
              icon={BedDouble}
              label="A letto"
              value={bedMin}
              min={20 * 60}
              max={28 * 60}
              onChange={(m) => setBed(minToHHMM(m))}
            />
            <div className="my-1 h-px bg-line" />
            <TimeRow icon={AlarmClock} label="Sveglia" value={wakeMin} min={4 * 60} max={12 * 60} onChange={(m) => setWake(minToHHMM(m))} />
          </div>
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
              <Pill tone="warn">{fmtMinutes(lateBy)} dopo le {plan.sleep.current}</Pill>
            )}
          </div>
          <RatingPicker
            className="mt-4"
            label="Qualità del sonno"
            max={5}
            value={quality}
            onChange={setQuality}
            labels={QUALITY_LABELS}
          />
        </Section>

        <Section icon={Activity} tone="bad" title="Dolore" hint={`Soglia ${plan.painThreshold} su 10: oltre, il carico si frena`}>
          {sites.length ? (
            <div className="flex flex-col gap-5">
              {sites.map((site) => {
                const last = prev?.pain?.[site];
                return (
                  <div key={site}>
                    <ScaleSlider
                      label={site}
                      value={pain[site]}
                      onChange={(v) => setPain((p) => ({ ...p, [site]: v }))}
                      scheme="pain"
                      threshold={plan.painThreshold}
                      describe={painWord}
                      lowLabel="Nessuno"
                      highLabel="Massimo"
                    />
                    {typeof last === 'number' && !existing && (
                      <p className="t-caption mt-1 text-ink-3">Precompilato con l’ultimo valore: {last}</p>
                    )}
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

/** Riga con orario e stepper da 5 minuti (tieni premuto per scorrere veloce). */
function TimeRow({
  icon,
  label,
  value,
  min,
  max,
  onChange,
}: {
  icon: typeof Scale;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (m: number) => void;
}) {
  const Icon = icon;
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className={cn('t-callout flex items-center gap-2 font-medium text-ink')}>
        <Icon size={16} strokeWidth={2.2} className="text-ink-3" aria-hidden />
        {label}
      </span>
      <Stepper label={label} hideLabel value={value} onChange={onChange} step={5} min={min} max={max} format={(n) => minToHHMM(n)} className="w-[190px]" />
    </div>
  );
}
