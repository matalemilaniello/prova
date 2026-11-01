/**
 * Calcio: minuti giocati e fatica percepita (RPE 1-10). Salva il FootballLog e segna la voce fatta.
 * Il carico della seduta è minuti × RPE (metodo di Foster), lo stesso che usa la revisione.
 */
import { useMemo, useState } from 'react';
import { Check, Gauge, Timer, Trash2, Weight } from 'lucide-react';
import type { FootballKind, ISODate } from '../../domain/types';
import { daysBetween, formatDayLong, formatRelativeDay, todayISO, weekdayOf } from '../../engine/dates';
import { FOOTBALL_TITLE } from '../../engine/timeline';
import { capitalize, fmtNumber } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useApp, useUi } from '../../state/store';
import { Button, Card, Chip, NumberTicker, RatingPicker, Sheet, Stepper, toneInk, toneRing, toneSoft } from '../../ui';
// Una sola scala per palestra e calcio (CR10 di Foster): il carico della settimana somma minuti × RPE di entrambi.
import { RPE_LABELS } from '../allenamento/lib';


export default function FootballSheet({ date, kind, itemId, onClose }: { date: ISODate; kind: FootballKind; itemId: string; onClose: () => void }) {
  // Istantanea all'apertura: il foglio non si ridisegna mentre si chiude dopo il salvataggio.
  const [{ plan, existing }] = useState(() => {
    const s = useApp.getState();
    return { plan: s.plan, existing: s.footballLogs.find((f) => f.date === date && f.kind === kind) };
  });

  const scheduled = useMemo(() => {
    const day = plan.week.find((d) => d.weekday === weekdayOf(date));
    if (day?.football?.kind === kind) return day.football;
    return plan.week.find((d) => d.football?.kind === kind)?.football;
  }, [plan.week, date, kind]);
  const planned = scheduled?.durationMin ?? 90;

  const [minutes, setMinutes] = useState(existing?.durationMin ?? planned);
  const [rpe, setRpe] = useState<number | undefined>(existing?.rpe);
  const load = rpe ? minutes * rpe : 0;

  const quick = useMemo(() => {
    const set = new Set([planned - 30, planned - 15, planned, planned + 15].filter((m) => m > 0 && m <= 180));
    return [...set].sort((a, b) => a - b);
  }, [planned]);

  const today = todayISO();
  const when = daysBetween(date, today) === 0 ? capitalize(formatDayLong(date)) : capitalize(formatRelativeDay(date, today));
  const title = FOOTBALL_TITLE[kind];

  const save = () => {
    if (!rpe) return;
    const app = useApp.getState();
    app.saveFootball({ id: existing?.id ?? `f-${date}-${kind}`, date, kind, durationMin: minutes, rpe });
    app.setItemStatus(date, itemId, 'fatto');
    useUi.getState().toast(`Salvato · carico ${fmtNumber(minutes * rpe)}`, 'good');
    onClose();
  };

  const remove = () => {
    if (!existing) return;
    const app = useApp.getState();
    app.deleteFootball(existing.id);
    if (app.dayLogs[date]?.status?.[itemId] === 'fatto') app.setItemStatus(date, itemId, null);
    haptic('warning');
    useUi.getState().toast('Registrazione eliminata', 'neutral', {
      actionLabel: 'Annulla',
      onAction: () => {
        useApp.getState().saveFootball(existing);
        useApp.getState().setItemStatus(date, itemId, 'fatto');
      },
    });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      subtitle={`${when}${scheduled ? ` · ${scheduled.time}` : ''} · minuti giocati e fatica`}
      footer={
        <div className="flex gap-2.5">
          {existing && <Button variant="danger" size="lg" icon={Trash2} onClick={remove} aria-label="Elimina la registrazione" />}
          <Button fullWidth size="lg" icon={Check} haptic="success" disabled={!rpe} onClick={save} className="flex-1">
            {rpe ? 'Salva' : 'Scegli la fatica'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5 pb-2">
        <Card as="section" padding="none" aria-label="Minuti giocati">
          <div className="flex items-center gap-3 px-4 pt-4">
            <span aria-hidden className="grid size-8 place-items-center rounded-[10px]" style={{ background: toneSoft('calcio', 18), boxShadow: toneRing('calcio'), color: toneInk('calcio') }}>
              <Timer size={17} strokeWidth={2.3} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="t-headline text-ink">Minuti giocati</h3>
              <p className="t-footnote text-ink-3">In programma {fmtNumber(planned)} minuti</p>
            </div>
          </div>
          <div className="px-4 pb-4 pt-3">
            <Stepper label="Minuti giocati" hideLabel size="lg" value={minutes} onChange={setMinutes} step={5} min={5} max={180} unit="min" />
            <div className="mt-3.5 flex flex-wrap justify-center gap-2">
              {quick.map((m) => (
                <Chip key={m} selected={minutes === m} onChange={() => setMinutes(m)} className="h-9 px-3.5 text-[0.875rem]">
                  {fmtNumber(m)}
                </Chip>
              ))}
            </div>
          </div>
        </Card>

        <Card as="section" padding="none" aria-label="Fatica percepita">
          <div className="flex items-center gap-3 px-4 pt-4">
            <span aria-hidden className="grid size-8 place-items-center rounded-[10px]" style={{ background: toneSoft('bad', 16), boxShadow: toneRing('bad'), color: toneInk('bad') }}>
              <Gauge size={17} strokeWidth={2.3} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="t-headline text-ink">Fatica percepita</h3>
              <p className="t-footnote text-ink-3">RPE dell’intera seduta, 30 minuti dopo la fine</p>
            </div>
          </div>
          <div className="px-4 pb-4 pt-3">
            <RatingPicker label="RPE" hideLabel max={10} value={rpe} onChange={setRpe} labels={RPE_LABELS} lowLabel={RPE_LABELS[0]} highLabel={RPE_LABELS[9]} />
            <p className="t-callout mt-3 min-h-[1.4em] text-center font-semibold" style={{ color: rpe ? 'var(--ink)' : 'var(--ink-3)' }} aria-live="polite">
              {rpe ? `${rpe} · ${RPE_LABELS[rpe - 1]}` : 'Tocca un numero da 1 a 10'}
            </p>
          </div>
        </Card>

        <Card padding="md" as="section" aria-label="Carico della seduta">
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid size-10 place-items-center rounded-full" style={{ background: toneSoft('calcio', 18), boxShadow: toneRing('calcio'), color: toneInk('calcio') }}>
              <Weight size={19} strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="t-label text-ink-3">Carico della seduta</p>
              <p className="t-footnote mt-0.5 text-ink-2">Minuti × RPE: entra nel carico della settimana</p>
            </div>
            <p className="flex items-baseline gap-1">
              {rpe ? <NumberTicker value={load} className="t-num text-[2rem] text-ink" /> : <span className="t-num text-[2rem] text-ink-3">–</span>}
              <span className="t-mono text-ink-3">UA</span>
            </p>
          </div>
        </Card>
      </div>
    </Sheet>
  );
}
