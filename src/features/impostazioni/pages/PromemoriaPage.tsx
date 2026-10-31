/**
 * Promemoria nel calendario: scegli quali, genera il file .ics e scaricalo (o copialo nell'anteprima).
 * La scelta resta su questo dispositivo.
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, CalendarPlus, Copy, Download, Dumbbell, HeartPulse, Share, Smartphone, UtensilsCrossed, Coffee } from 'lucide-react';
import { IS_PREVIEW } from '../../../app/env';
import { todayISO } from '../../../engine/dates';
import { DEFAULT_REMINDERS, ICS_FILE_NAME, REMINDER_KINDS, REMINDER_LABEL, reminderEvents, remindersIcs, type ReminderEvent, type ReminderKind } from '../../../engine/ics';
import { canShareFiles, copyText, downloadText, shareText } from '../../../lib/backup';
import { WEEKDAY_SHORT, listIt } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { useApp, useUi } from '../../../state/store';
import { Button, Callout, Card, NumberTicker, Sheet, TextArea, type AnyTone } from '../../../ui';
import { SelectRow } from '../components/controls';
import { useClosingSheet } from '../components/SupplementEditor';
import { Page, type PageProps } from './Page';

const KEY = 'ritmo:promemoria';
const MIME = 'text/calendar;charset=utf-8';

function loadKinds(): ReminderKind[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(list)) return REMINDER_KINDS.filter((k) => list.includes(k));
  } catch {
    /* si usano quelli predefiniti */
  }
  return DEFAULT_REMINDERS;
}

function saveKinds(kinds: ReminderKind[]) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(kinds));
  } catch {
    /* pazienza */
  }
}

const KIND_ICON: Record<ReminderKind, { icon: typeof Coffee; tone: AnyTone }> = {
  colazione: { icon: Coffee, tone: 'accent' },
  pranzo: { icon: UtensilsCrossed, tone: 'palestra' },
  palestra: { icon: Dumbbell, tone: 'palestra' },
  fisio: { icon: HeartPulse, tone: 'leggero' },
  coprifuoco: { icon: Smartphone, tone: 'riposo' },
  revisione: { icon: CalendarCheck2, tone: 'good' },
};

/** "Mar e ven alle 17:00 · sab alle 11:00", "Ogni giorno alle 07:30". Raggruppa gli eventi con lo stesso orario. */
function describe(events: ReminderEvent[]): string {
  const byTime = new Map<string, number[]>();
  for (const e of events) byTime.set(e.time, [...(byTime.get(e.time) ?? []), ...e.days]);
  const parts = [...byTime.entries()].map(([time, days]) => {
    const uniq = [...new Set(days)].sort((a, b) => a - b) as (0 | 1 | 2 | 3 | 4 | 5 | 6)[];
    return `${uniq.length === 7 ? 'ogni giorno' : listIt(uniq.map((d) => WEEKDAY_SHORT[d]))} alle ${time}`;
  });
  const s = parts.join(' · ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function PromemoriaPage({ onBack, backLabel }: PageProps) {
  const plan = useApp((s) => s.plan);
  const physio = useApp((s) => s.physio);
  const [kinds, setKinds] = useState<ReminderKind[]>(loadKinds);
  const [manual, setManual] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shareable = useMemo(() => !IS_PREVIEW && canShareFiles(), []);
  useEffect(() => saveKinds(kinds), [kinds]);

  const today = todayISO();
  const byKind = useMemo(() => {
    const out = {} as Record<ReminderKind, ReminderEvent[]>;
    for (const k of REMINDER_KINDS) out[k] = reminderEvents({ plan, physio }, [k], today);
    return out;
  }, [plan, physio, today]);
  const available = kinds.filter((k) => byKind[k].length > 0);
  const total = available.reduce((n, k) => n + byKind[k].length, 0);

  const build = () => remindersIcs({ plan, physio }, available, { start: today, now: new Date() });
  const toast = useUi.getState().toast;

  const copy = async () => {
    const text = build();
    if (await copyText(text)) {
      haptic('success');
      toast('Calendario copiato negli appunti', 'good');
    } else setManual(text);
  };

  const download = async () => {
    if (!available.length) return;
    if (IS_PREVIEW) return copy();
    setBusy(true);
    const ok = downloadText(ICS_FILE_NAME, build(), MIME);
    setBusy(false);
    if (ok) {
      haptic('success');
      toast('File pronto: aprilo per aggiungere gli eventi', 'good');
    } else await copy();
  };

  const share = async () => {
    const res = await shareText(ICS_FILE_NAME, build(), MIME, 'Promemoria di Ritmo');
    if (res === 'non-disponibile') await download();
  };

  return (
    <Page title="Promemoria" subtitle="Ritmo non manda notifiche: crea un calendario con la tua settimana, ogni evento con un avviso all’orario." onBack={onBack} backLabel={backLabel}>
      <Card variant="highlight" padding="lg" className="flex items-center gap-4">
        <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-[16px] bg-accent-soft text-accent-ink">
          <CalendarPlus size={26} strokeWidth={2} />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="flex items-baseline gap-1.5">
            <NumberTicker value={total} className="t-num text-[2.25rem] text-ink" />
            <span className="t-callout font-medium text-ink">{total === 1 ? 'evento' : 'eventi'}</span>
          </span>
          <span className="t-footnote text-ink-2">Si ripetono ogni settimana, con il fuso di Roma e l’ora legale.</span>
        </div>
      </Card>

      <section className="flex flex-col gap-2" aria-labelledby="quali-promemoria">
        <h3 id="quali-promemoria" className="t-label px-1 text-ink-3">
          Quali promemoria
        </h3>
        <Card padding="none" className="overflow-hidden">
          {REMINDER_KINDS.map((k, i) => {
            const evs = byKind[k];
            const empty = evs.length === 0;
            return (
              <div key={k} className={i > 0 ? 'relative before:absolute before:left-[58px] before:right-0 before:top-0 before:z-10 before:h-px before:bg-line' : undefined}>
                <SelectRow
                  icon={KIND_ICON[k].icon}
                  tone={KIND_ICON[k].tone}
                  checked={kinds.includes(k) && !empty}
                  disabled={empty}
                  onChange={(on) => setKinds((cur) => (on ? REMINDER_KINDS.filter((x) => x === k || cur.includes(x)) : cur.filter((x) => x !== k)))}
                  title={REMINDER_LABEL[k]}
                  subtitle={empty ? 'Nessun giorno in programma' : describe(evs)}
                />
              </div>
            );
          })}
        </Card>
      </section>

      <div className="flex flex-col gap-2.5">
        <Button size="lg" fullWidth icon={IS_PREVIEW ? Copy : Download} loading={busy} disabled={!available.length} onClick={download}>
          {IS_PREVIEW ? 'Copia il calendario' : 'Scarica il calendario'}
        </Button>
        {!IS_PREVIEW && (
          <div className="flex gap-2.5">
            {shareable && (
              <Button variant="secondary" className="flex-1" icon={Share} disabled={!available.length} onClick={share}>
                Condividi
              </Button>
            )}
            <Button variant="secondary" className="flex-1" icon={Copy} disabled={!available.length} onClick={copy}>
              Copia il testo
            </Button>
          </div>
        )}
        {!available.length && <p className="t-footnote text-center text-ink-3">Scegli almeno un promemoria.</p>}
      </div>

      {IS_PREVIEW && (
        <Callout tone="warn" title="Anteprima senza download">
          Qui i file non si scaricano: il calendario viene copiato negli appunti. Incollalo in un file con estensione .ics, oppure usa l’app installata.
        </Callout>
      )}

      <section className="flex flex-col gap-2" aria-labelledby="come-promemoria">
        <h3 id="come-promemoria" className="t-label px-1 text-ink-3">
          Come aggiungerlo
        </h3>
        <Card padding="none">
          <ol className="flex flex-col">
            {[
              'Apri il file scaricato: su iPhone tocca Aggiungi tutti.',
              'Scegli un calendario dedicato, ad esempio Ritmo: così lo spegni o lo togli in un attimo.',
              'Se cambi il piano, rigenera il file. Gli eventi hanno lo stesso identificativo e molti calendari li aggiornano invece di duplicarli.',
            ].map((t, i) => (
              <li key={i} className={i > 0 ? 'relative flex gap-3 px-4 py-3.5 before:absolute before:left-[52px] before:right-0 before:top-0 before:h-px before:bg-line' : 'flex gap-3 px-4 py-3.5'}>
                <span aria-hidden className="t-num grid size-7 shrink-0 place-items-center rounded-full bg-control text-[0.9375rem] text-ink-2">
                  {i + 1}
                </span>
                <span className="t-callout pt-0.5 text-ink-2">{t}</span>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      {manual !== null && <ManualCopySheet text={manual} onClosed={() => setManual(null)} />}
    </Page>
  );
}

/** Quando gli appunti non sono disponibili: il testo da selezionare e copiare a mano. */
export function ManualCopySheet({ text, onClosed, title = 'Copia a mano' }: { text: string; onClosed: () => void; title?: string }) {
  const [open, close] = useClosingSheet(onClosed);
  return (
    <Sheet open={open} onClose={close} size="large" title={title} subtitle="Gli appunti non sono disponibili qui. Tieni premuto sul testo, scegli Seleziona tutto e poi Copia.">
      <TextArea value={text} onChange={() => undefined} readOnly rows={16} className="selectable font-mono text-[0.75rem]" aria-label="Testo da copiare" onFocus={(e) => e.currentTarget.select()} />
    </Sheet>
  );
}
