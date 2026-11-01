/**
 * Ultima card del riepilogo, sopra "Comincia da oggi": gli avvisi nel calendario. Ritmo non manda notifiche e
 * il calendario è l'unico modo in cui raggiunge l'utente ad app chiusa; qui si aggiungono con un tocco i tre
 * promemoria che reggono l'abitudine (controllo del mattino, coprifuoco, revisione della domenica). La consegna è
 * quella di Impostazioni > Promemoria (`useCalendarDelivery`); gli altri promemoria restano lì.
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarPlus, Check } from 'lucide-react';
import type { Plan } from '../../domain/types';
import { REMINDER_LABEL, calendarStatus, reminderEvents, type ReminderEvent, type ReminderKind } from '../../engine/ics';
import { useApp } from '../../state/store';
import { Button, Card, spring } from '../../ui';
import { SelectRow, tileStyle } from '../impostazioni/components/controls';
import { ManualCopySheet } from '../impostazioni/components/ManualCopySheet';
import { isIOS } from '../impostazioni/install';
import { useReminderPrefs } from '../impostazioni/reminders';
import { useCalendarDelivery, type DeliveryMode } from '../impostazioni/useCalendarDelivery';

/** I promemoria proposti nel benvenuto, tutti già scelti. */
export const INVITE_KINDS: ReminderKind[] = ['controllo', 'coprifuoco', 'revisione'];

/** L'orario più frequente della prima settimana (il coprifuoco cambia nelle sere di calcio). */
function mainTime(events: ReminderEvent[]): string | null {
  const count = new Map<string, number>();
  for (const e of events) if (!e.stage || e.stage.index === 0) count.set(e.time, (count.get(e.time) ?? 0) + e.days.length);
  let best: string | null = null;
  for (const [t, n] of count) if (best === null || n > (count.get(best) ?? 0)) best = t;
  return best;
}

const NEXT_STEP: Record<DeliveryMode, string> = {
  scarica: 'Apri il file e tocca Aggiungi tutti.',
  condividi: 'Salva su File, apri il file e tocca Aggiungi tutti.',
  copia: 'Incolla il testo in un file .ics e aprilo con Calendario.',
};

export function CalendarInvite({ plan }: { plan: Plan }) {
  const physio = useApp((s) => s.physio);
  const [kinds, setKinds] = useState<ReminderKind[]>(INVITE_KINDS);
  const [done, setDone] = useState<DeliveryMode | null>(null);
  const today = plan.firstUse?.date ?? plan.startDate;
  const state = useMemo(() => ({ plan, physio }), [plan, physio]);
  const times = useMemo(() => {
    const out = {} as Record<ReminderKind, string | null>;
    for (const k of INVITE_KINDS) out[k] = mainTime(reminderEvents(state, [k], today));
    return out;
  }, [state, today]);
  const { mode, icon, deliver, manual, closeManual } = useCalendarDelivery({ state, kinds, today, rememberKinds: true, onDelivered: setDone });
  const [ios] = useState(isIOS);
  // Tornando a questo passo dopo aver aggiunto il file: resta fatto, a meno che nel frattempo il piano sia cambiato.
  const { file } = useReminderPrefs();
  const saved = useMemo(() => calendarStatus(file, state, today).state === 'aggiornato', [file, state, today]);
  const shown: DeliveryMode | null = done ?? (saved ? mode : null);

  const toggle = (k: ReminderKind, on: boolean) => setKinds((list) => INVITE_KINDS.filter((x) => (x === k ? on : list.includes(x))));

  return (
    <section aria-labelledby="avvisi-label">
      <Card padding="none" className="overflow-hidden">
        <div className="flex items-center gap-3.5 px-4 pb-2 pt-4">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px]" style={tileStyle(shown ? 'good' : 'accent')}>
            {shown ? <Check size={20} strokeWidth={2.6} /> : <CalendarPlus size={20} strokeWidth={2.2} />}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 id="avvisi-label" className="t-headline text-pretty text-ink">
              {ios ? 'Avvisi nel calendario dell’iPhone' : 'Avvisi nel calendario'}
            </h3>
            <p className="t-footnote text-pretty text-ink-2" aria-live="polite">
              {shown ? NEXT_STEP[shown] : 'Ritmo non manda notifiche: ci pensa il calendario.'}
            </p>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {!shown && (
            <motion.div initial={false} exit={{ height: 0, opacity: 0 }} transition={spring} className="overflow-hidden">
              <div className="flex flex-col divide-y divide-line">
                {INVITE_KINDS.map((k) => (
                  <SelectRow
                    key={k}
                    checked={kinds.includes(k)}
                    onChange={(on) => toggle(k, on)}
                    title={REMINDER_LABEL[k]}
                    meta={times[k] ? <span className="t-mono text-[0.8125rem] text-ink-2">{times[k]}</span> : undefined}
                  />
                ))}
              </div>
              <div className="px-4 pb-4 pt-2">
                {kinds.length ? (
                  <Button variant="secondary" fullWidth icon={icon} onClick={deliver}>
                    {mode === 'copia' ? 'Copia il calendario' : 'Aggiungi al calendario'}
                  </Button>
                ) : (
                  <p className="t-footnote py-2.5 text-center text-ink-3">Li trovi in Impostazioni, quando vuoi.</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
      {manual !== null && <ManualCopySheet text={manual} onClosed={closeManual} />}
    </section>
  );
}
