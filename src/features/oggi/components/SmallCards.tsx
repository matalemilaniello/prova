import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, ClipboardCheck, Lightbulb, RefreshCw, SmartphoneCharging } from 'lucide-react';
import type { DayType, HHMM, ISODate } from '../../../domain/types';
import { TIP_TOPIC_LABEL, tipOfDay } from '../../../data/tips';
import { fmtMinutes } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { Card, ProgressBar, spring, toneInk, toneSoft } from '../../../ui';

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
  onDone: () => void;
}

/** La sera: conto alla rovescia al coprifuoco del telefono. */
export function CurfewCard({ minutes, curfew, bed, onDone }: CurfewCardProps) {
  const now = minutes <= 0;
  // La barra si riempie nelle ultime 3 ore.
  const progress = Math.max(0, Math.min(1, 1 - minutes / 180));
  return (
    <Card padding="none" as="section" aria-labelledby="oggi-coprifuoco" tone="riposo">
      <div className="flex items-center gap-3.5 py-3.5 pl-5 pr-4">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full" style={{ background: toneSoft('riposo', 18), color: toneInk('riposo') }}>
          <SmartphoneCharging size={20} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="oggi-coprifuoco" className="t-headline text-ink">
            {now ? 'Telefono fuori adesso' : `Telefono fuori tra ${fmtMinutes(minutes)}`}
          </h3>
          <p className="t-footnote mt-0.5 text-ink-2">
            Coprifuoco alle {curfew}, a letto alle {bed}
          </p>
          {!now && minutes <= 180 && <ProgressBar value={progress} tone="riposo" size="xs" className="mt-2.5" label="Avvicinamento al coprifuoco" />}
        </div>
        {now && (
          <button
            type="button"
            onClick={onDone}
            className="t-footnote h-9 shrink-0 rounded-full px-3.5 font-semibold transition-transform duration-150 active:scale-95"
            style={{ background: toneSoft('riposo', 20), color: toneInk('riposo') }}
          >
            Fatto
          </button>
        )}
      </div>
    </Card>
  );
}

/** Consiglio del giorno, breve e motivato. "Un altro" scorre ai consigli successivi. */
export function TipCard({ date, dayType }: { date: ISODate; dayType: DayType }) {
  const [offset, setOffset] = useState(0);
  const tip = tipOfDay(date, dayType, offset);
  return (
    <Card padding="none" as="section" aria-labelledby="oggi-consiglio">
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="t-label flex min-w-0 items-center gap-2 text-accent-ink">
            <Lightbulb size={14} strokeWidth={2.4} aria-hidden className="shrink-0" />
            <span id="oggi-consiglio" className="truncate">
              Consiglio <span className="text-ink-3">· {TIP_TOPIC_LABEL[tip.topic]}</span>
            </span>
          </p>
          <button
            type="button"
            onClick={() => {
              haptic('selection');
              setOffset((n) => n + 1);
            }}
            className="hit-44 t-footnote -mr-1 inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-semibold text-accent-ink"
            aria-label="Un altro consiglio"
          >
            <RefreshCw size={14} strokeWidth={2.4} aria-hidden />
            Un altro
          </button>
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={tip.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring} aria-live="polite">
            <h4 className="t-headline mt-2.5 text-ink">{tip.title}</h4>
            <p className="t-callout selectable mt-1 text-ink-2">{tip.text}</p>
          </motion.div>
        </AnimatePresence>
      </div>
    </Card>
  );
}
