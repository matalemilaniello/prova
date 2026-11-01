/**
 * Promemoria nel calendario: scegli quali, genera il file .ics e aggiungilo al calendario (download,
 * condivisione o copia). Il coprifuoco segue da solo la scala del sonno; quando il piano cambia la pagina
 * dice che il file va aggiornato. La scelta resta su questo dispositivo.
 */
import { useMemo, useState } from 'react';
import { CalendarCheck2, CalendarPlus, Check, ClipboardCheck, Coffee, Copy, Download, Dumbbell, HeartPulse, RefreshCw, Share, Smartphone, UtensilsCrossed } from 'lucide-react';
import { IS_PREVIEW, isStandalone } from '../../../app/env';
import { addMinutes } from '../../../engine/dates';
import { ICS_FILE_NAME, REMINDER_KINDS, REMINDER_LABEL, reminderEvents, remindersIcs, type ReminderEvent, type ReminderKind } from '../../../engine/ics';
import { canShareFiles, copyText, downloadText, shareText } from '../../../lib/backup';
import { WEEKDAY_SHORT, fmtDateLong, listIt } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { usePlanDay } from '../../../state/hooks';
import { useApp, useUi } from '../../../state/store';
import { Button, Callout, Card, NumberTicker, Pill, Sheet, TextArea, type AnyTone } from '../../../ui';
import { SelectRow, tileStyle } from '../components/controls';
import { useClosingSheet } from '../components/SupplementEditor';
import { saveCalendarFile, saveReminderKinds, useCalendarStatus, useReminderPrefs } from '../reminders';
import { Page, type PageProps } from './Page';

const MIME = 'text/calendar;charset=utf-8';

const KIND_ICON: Record<ReminderKind, { icon: typeof Coffee; tone: AnyTone }> = {
  controllo: { icon: ClipboardCheck, tone: 'good' },
  colazione: { icon: Coffee, tone: 'accent' },
  pranzo: { icon: UtensilsCrossed, tone: 'palestra' },
  palestra: { icon: Dumbbell, tone: 'palestra' },
  fisio: { icon: HeartPulse, tone: 'leggero' },
  coprifuoco: { icon: Smartphone, tone: 'riposo' },
  revisione: { icon: CalendarCheck2, tone: 'good' },
};

/** Solo gli eventi di questa settimana (il primo gradino della scala del sonno). */
const thisWeek = (events: ReminderEvent[]) => events.filter((e) => !e.stage || e.stage.index === 0);

/** "Mar e ven alle 17:00 · sab alle 11:00", "Ogni giorno alle 07:30". Raggruppa gli eventi con lo stesso orario. */
function describe(events: ReminderEvent[]): string {
  const byTime = new Map<string, number[]>();
  for (const e of thisWeek(events)) byTime.set(e.time, [...(byTime.get(e.time) ?? []), ...(e.planDays ?? e.days)]);
  const parts = [...byTime.entries()].map(([time, days]) => {
    const uniq = [...new Set(days)].sort((a, b) => a - b) as (0 | 1 | 2 | 3 | 4 | 5 | 6)[];
    return `${uniq.length === 7 ? 'ogni giorno' : listIt(uniq.map((d) => WEEKDAY_SHORT[d]))} alle ${time}`;
  });
  const s = parts.join(' · ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Avvisi in una settimana tipo. */
const weeklyAlerts = (events: ReminderEvent[]) => thisWeek(events).reduce((n, e) => n + e.days.length, 0);

export default function PromemoriaPage({ onBack, open, backLabel }: PageProps) {
  const plan = useApp((s) => s.plan);
  const physio = useApp((s) => s.physio);
  const { kinds } = useReminderPrefs();
  const today = usePlanDay();
  const [manual, setManual] = useState<string | null>(null);
  const shareable = useMemo(() => !IS_PREVIEW && canShareFiles(), []);
  // Su iPhone, nell'app installata, il download di un file spesso non apre niente: meglio il foglio Condividi.
  const shareFirst = useMemo(() => shareable && isStandalone(), [shareable]);

  const byKind = useMemo(() => {
    const out = {} as Record<ReminderKind, ReminderEvent[]>;
    for (const k of REMINDER_KINDS) out[k] = reminderEvents({ plan, physio }, [k], today);
    return out;
  }, [plan, physio, today]);
  const available = useMemo(() => kinds.filter((k) => byKind[k].length > 0), [kinds, byKind]);
  const perWeek = available.reduce((n, k) => n + weeklyAlerts(byKind[k]), 0);
  const status = useCalendarStatus(available);
  const staged = byKind.coprifuoco.some((e) => e.stage && e.stage.count > 1);
  const targetCurfew = addMinutes(plan.sleep.target, -plan.sleep.curfewLeadMin);
  const noPhysio = physio.prescriptions.length === 0 && plan.week.some((d) => d.physio);

  const toast = useUi.getState().toast;
  const build = () => remindersIcs({ plan, physio }, available, { start: today, now: new Date() });
  const delivered = (message: string) => {
    saveCalendarFile({ plan, physio }, available, today);
    haptic('success');
    toast(message, 'good');
  };

  const setKind = (k: ReminderKind, on: boolean) => saveReminderKinds(on ? [...kinds, k] : kinds.filter((x) => x !== k));

  const copy = async () => {
    if (!available.length) return;
    const text = build();
    if (await copyText(text)) delivered('Calendario copiato negli appunti');
    else setManual(text);
  };

  const download = async () => {
    if (!available.length) return;
    if (IS_PREVIEW) return copy();
    if (downloadText(ICS_FILE_NAME, build(), MIME)) delivered('Calendario scaricato: aprilo per aggiungere gli eventi');
    else await copy();
  };

  const share = async () => {
    if (!available.length) return;
    const res = await shareText(ICS_FILE_NAME, build(), MIME, 'Promemoria di Ritmo');
    if (res === 'condiviso') delivered('Calendario condiviso: aprilo per aggiungere gli eventi');
    else if (res === 'non-disponibile') await download();
  };

  const stale = status.state === 'da-aggiornare';
  const none = !available.length;

  return (
    <Page title="Promemoria" subtitle="Ritmo non manda notifiche: crea un calendario con la tua settimana, ogni evento con un avviso all’orario." onBack={onBack} backLabel={backLabel}>
      <Card variant="highlight" tone={stale ? 'warn' : undefined} padding="lg" className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-[16px]" style={tileStyle(stale ? 'warn' : 'accent')}>
            {stale ? <RefreshCw size={24} strokeWidth={2.2} /> : <CalendarPlus size={26} strokeWidth={2} />}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="flex items-baseline gap-1.5">
              <NumberTicker value={perWeek} className="t-num text-[2.5rem] leading-none text-ink" />
              <span className="t-callout font-medium text-ink">{perWeek === 1 ? 'avviso a settimana' : 'avvisi a settimana'}</span>
            </span>
            <span className="mt-1.5">
              {status.state === 'aggiornato' && (
                <Pill tone="good" icon={Check}>
                  Nel calendario dal {shortDate(status.at)}
                </Pill>
              )}
              {stale && <Pill tone="warn">Da aggiornare</Pill>}
              {status.state === 'assente' && <Pill tone="neutral">Non ancora nel calendario</Pill>}
            </span>
          </div>
        </div>
        <p className="t-footnote text-ink-2">
          All’orario giusto, con il fuso di Roma e l’ora legale.{staged ? ' Il coprifuoco scende da solo con la scala del sonno, senza rifare il file.' : ''}
        </p>
      </Card>

      {stale && (
        <Callout tone="warn" title={status.reason === 'sonno' ? 'Il coprifuoco nel calendario è avanti' : 'Il piano è cambiato'}>
          {status.reason === 'sonno'
            ? `Il file del ${shortDate(status.at)} prevedeva a letto alle ${status.bed} questa settimana, il piano dice ${plan.sleep.current}. Scarica il file nuovo, così l’avviso torna giusto.`
            : `Dal ${shortDate(status.at)} sono cambiati orari, giorni o promemoria scelti. Scarica il file nuovo e sostituisci il calendario Ritmo.`}
        </Callout>
      )}

      <section className="flex flex-col gap-2" aria-labelledby="quali-promemoria">
        <h3 id="quali-promemoria" className="t-label px-1 text-ink-3">
          Quali promemoria
        </h3>
        <Card padding="none" className="overflow-hidden">
          {REMINDER_KINDS.map((k, i) => {
            const evs = byKind[k];
            const empty = evs.length === 0;
            const subtitle = empty ? (
              k === 'fisio' && noPhysio ? (
                'Prima inserisci gli esercizi del fisioterapista'
              ) : (
                'Nessun giorno in programma'
              )
            ) : k === 'coprifuoco' && staged ? (
              <>
                {describe(evs)}
                <span className="block text-ink-3">
                  Segue la scala del sonno fino alle {targetCurfew}, un passo a settimana
                </span>
              </>
            ) : (
              describe(evs)
            );
            return (
              <div key={k} className={i > 0 ? 'relative before:absolute before:left-[58px] before:right-0 before:top-0 before:z-10 before:h-px before:bg-line' : undefined}>
                <SelectRow
                  icon={KIND_ICON[k].icon}
                  tone={KIND_ICON[k].tone}
                  checked={kinds.includes(k) && !empty}
                  disabled={empty}
                  onChange={(on) => setKind(k, on)}
                  title={REMINDER_LABEL[k]}
                  subtitle={subtitle}
                />
              </div>
            );
          })}
        </Card>
        {noPhysio && (
          <button type="button" onClick={() => open('fisio')} className="t-footnote hit-44 self-start px-1 font-medium text-accent-ink">
            Inserisci gli esercizi del fisioterapista
          </button>
        )}
      </section>

      <div className="flex flex-col gap-2.5">
        {IS_PREVIEW ? (
          <Button size="lg" fullWidth icon={Copy} disabled={none} onClick={copy}>
            Copia il calendario
          </Button>
        ) : shareFirst ? (
          <>
            <Button size="lg" fullWidth icon={Share} disabled={none} onClick={share}>
              Condividi il calendario
            </Button>
            <div className="flex gap-2.5">
              <Button variant="secondary" className="flex-1" icon={Download} disabled={none} onClick={download}>
                Scarica
              </Button>
              <Button variant="secondary" className="flex-1" icon={Copy} disabled={none} onClick={copy}>
                Copia il testo
              </Button>
            </div>
          </>
        ) : (
          <>
            <Button size="lg" fullWidth icon={Download} disabled={none} onClick={download}>
              Scarica il calendario
            </Button>
            <div className="flex gap-2.5">
              {shareable && (
                <Button variant="secondary" className="flex-1" icon={Share} disabled={none} onClick={share}>
                  Condividi
                </Button>
              )}
              <Button variant="secondary" className="flex-1" icon={Copy} disabled={none} onClick={copy}>
                Copia il testo
              </Button>
            </div>
          </>
        )}
        {none && <p className="t-footnote text-center text-ink-3">Scegli almeno un promemoria.</p>}
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
              'In Calendario crea un calendario chiamato Ritmo: così spegni o togli tutti gli avvisi in un attimo.',
              shareFirst
                ? 'Tocca Condividi, scegli Salva su File e apri il file da File. Poi tocca Aggiungi tutti e scegli Ritmo.'
                : 'Apri il file scaricato, tocca Aggiungi tutti e scegli il calendario Ritmo.',
              'Quando il piano cambia, qui compare Da aggiornare. Per non avere doppioni elimina il calendario Ritmo e aggiungi il file nuovo.',
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

/** "4 novembre" */
function shortDate(iso: string): string {
  return fmtDateLong(iso).replace(/^\S+\s/, '');
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
