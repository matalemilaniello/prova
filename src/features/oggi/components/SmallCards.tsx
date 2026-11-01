import { useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CalendarPlus, ChevronDown, ChevronRight, ClipboardCheck, HeartPulse, Lightbulb, MoonStar, Pill, RefreshCw, SmartphoneCharging } from 'lucide-react';
import type { DayType, HHMM, ISODate } from '../../../domain/types';
import { TIP_TOPIC_LABEL, tipOfDay, type TipContext } from '../../../data/tips';
import type { SetupTask } from '../../../engine/timeline';
import { CALENDAR_TASK_TEXT, type CalendarTask } from '../../impostazioni/reminders';
import { fmtMinutes, listIt } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { Card, ListGroup, ListRow, ProgressBar, cn, spring, toneInk } from '../../../ui';
import { BOARD_LABEL } from '../kinds';

/** Card in cima quando il controllo del mattino non è ancora fatto. */
export function CheckInPrompt({ onOpen, morning }: { onOpen: () => void; morning: boolean }) {
  return (
    <Card variant="highlight" tone="accent" onPress={onOpen} aria-label="Controllo del mattino: peso, sonno, dolori ed energia. Apri">
      <div className="relative flex items-center gap-3.5">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-accent text-on-accent shadow-[0_6px_18px_-8px_var(--accent-glow)]">
          <ClipboardCheck size={22} strokeWidth={2.3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="t-headline block text-ink">Controllo del mattino</span>
          <span className="t-footnote mt-0.5 block text-ink-2">
            {morning ? 'Peso, sonno, dolori ed energia: meno di 30 secondi.' : 'Non ancora fatto. Bastano 30 secondi anche adesso.'}
          </span>
        </span>
        <ChevronRight aria-hidden size={20} strokeWidth={2.3} className="shrink-0 text-ink-3" />
      </div>
    </Card>
  );
}

export interface CurfewCardProps {
  minutes: number;
  curfew: HHMM;
  bed: HHMM;
  /** Dal coprifuoco meno 15 minuti: la card apre il rito della sera. */
  ritual: boolean;
  onRitual: () => void;
}

/** La sera: conto alla rovescia al coprifuoco del telefono; da un quarto d'ora prima apre il rito della sera. */
export function CurfewCard({ minutes, curfew, bed, ritual, onRitual }: CurfewCardProps) {
  const now = minutes <= 0;
  // La barra si riempie nelle ultime 3 ore.
  const progress = Math.max(0, Math.min(1, 1 - minutes / 180));
  const body = (
    <div className="flex items-center gap-3.5 py-3.5 pl-4 pr-4">
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center rounded-full bg-card-2"
        style={{ color: toneInk('riposo'), boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--riposo) 55%, transparent)' }}
      >
        {ritual ? <MoonStar size={19} strokeWidth={2.1} /> : <SmartphoneCharging size={20} strokeWidth={2.2} />}
      </span>
      <div className="min-w-0 flex-1">
        <h3 id="oggi-coprifuoco" className="t-headline text-ink">
          {now ? 'Telefono fuori adesso' : `Telefono fuori tra ${fmtMinutes(minutes)}`}
        </h3>
        <p className="t-footnote mt-0.5 text-ink-2">
          {ritual ? 'Apri il rito della sera: domani in tre righe, poi luci basse' : `Coprifuoco alle ${curfew}, a letto alle ${bed}`}
        </p>
        {!now && !ritual && minutes <= 180 && <ProgressBar value={progress} tone="riposo" size="xs" className="mt-2.5" label="Avvicinamento al coprifuoco" />}
      </div>
      {ritual && <ChevronRight aria-hidden size={20} strokeWidth={2.3} className="shrink-0 text-ink-3" />}
    </div>
  );
  if (ritual) {
    return (
      <Card padding="none" tone="riposo" onPress={onRitual} aria-label={`Rito della sera: telefono fuori ${now ? 'adesso' : `tra ${fmtMinutes(minutes)}`}. Apri`}>
        {body}
      </Card>
    );
  }
  return (
    <Card padding="none" as="section" aria-labelledby="oggi-coprifuoco" tone="riposo">
      {body}
    </Card>
  );
}

/** Cosa dice la riga "Da completare" (nei test e nell'interfaccia). */
export function setupText(task: SetupTask | CalendarTask): string {
  if (task.kind === 'calendario') return CALENDAR_TASK_TEXT[task.state];
  return task.kind === 'fisio' ? 'Inserisci gli esercizi del fisioterapista' : `${listIt(task.names)}: inserisci la dose`;
}

const SETUP_ICON = (task: SetupTask | CalendarTask) =>
  task.kind === 'calendario' ? (task.state === 'da-aggiornare' ? RefreshCw : CalendarPlus) : task.kind === 'fisio' ? HeartPulse : Pill;

/**
 * Configurazione rimasta da completare, sotto la timeline: una riga neutra, una cosa alla volta, senza orario.
 * Non conta nella giornata.
 */
export function SetupRow({ task, onPress }: { task: SetupTask | CalendarTask; onPress: () => void }) {
  return (
    <ListGroup>
      <ListRow
        icon={SETUP_ICON(task)}
        iconTone="neutral"
        title={<span className="text-ink-2">Da completare</span>}
        subtitle={setupText(task)}
        onPress={onPress}
      />
    </ListGroup>
  );
}

/** Prima frase di un consiglio (cosa fare) e il resto (perché), per mostrarlo chiuso con "Leggi". */
export function splitTip(text: string): { lead: string; rest: string } {
  const m = text.match(/^(.+?[.!?])\s+(.+)$/s);
  return m ? { lead: m[1], rest: m[2] } : { lead: text, rest: '' };
}

/**
 * Consiglio del giorno, chiuso di base: solo il titolo. "Leggi" apre il testo (cosa fare e perché) e il pulsante
 * per passare al consiglio successivo.
 */
export function TipCard({ date, dayType, firstId, context }: { date: ISODate; dayType: DayType; firstId?: string; context?: TipContext }) {
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const tip = tipOfDay(date, dayType, offset, firstId, context);
  const { lead, rest } = splitTip(tip.text);
  const id = useId();
  const next = (
    <button
      type="button"
      onClick={() => {
        haptic('selection');
        setOffset((n) => n + 1);
      }}
      className="hit-44 t-footnote -mr-1 inline-flex shrink-0 items-center gap-1 whitespace-nowrap px-1 font-semibold text-accent-ink"
      aria-label="Un altro consiglio"
    >
      <RefreshCw size={14} strokeWidth={2.4} aria-hidden />
      Un altro
    </button>
  );
  return (
    <Card variant="outline" padding="none" as="section" aria-labelledby="oggi-consiglio">
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <p className={cn(BOARD_LABEL, 'flex min-w-0 items-center gap-2 text-accent-ink')}>
            <Lightbulb size={14} strokeWidth={2.4} aria-hidden className="shrink-0" />
            <span className="truncate">
              Consiglio <span className="text-ink-3">· {TIP_TOPIC_LABEL[tip.topic]}</span>
            </span>
          </p>
          {rest ? (
            <button
              type="button"
              onClick={() => {
                haptic('selection');
                setOpen((o) => !o);
              }}
              aria-expanded={open}
              aria-controls={id}
              className="hit-44 t-footnote -mr-1 inline-flex shrink-0 items-center gap-1 px-1 font-semibold text-accent-ink"
            >
              {open ? 'Chiudi' : 'Leggi'}
              <ChevronDown size={15} strokeWidth={2.5} aria-hidden className={cn('transition-transform duration-200', open && 'rotate-180')} />
            </button>
          ) : (
            next
          )}
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={tip.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring} aria-live="polite">
            <h4 id="oggi-consiglio" className="t-headline mt-2 text-ink">
              {tip.title}
            </h4>
            {/* Chiuso resta il titolo: il testo, cosa fare e perché, è dietro "Leggi". */}
            {!rest && <p className="t-callout selectable mt-1 text-ink-2">{lead}</p>}
            <AnimatePresence initial={false}>
              {open && rest && (
                <motion.div
                  id={id}
                  key="rest"
                  className="overflow-hidden"
                  initial={reduce ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={spring}
                >
                  <p className="t-callout selectable pt-1 text-ink-2">
                    {lead} {rest}
                  </p>
                  <div className="-mb-2 mt-1 flex justify-end">{next}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>
      </div>
    </Card>
  );
}
