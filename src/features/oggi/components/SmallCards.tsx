import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, ClipboardCheck, Lightbulb, MoonStar, RefreshCw, SmartphoneCharging } from 'lucide-react';
import type { DayType, HHMM, ISODate } from '../../../domain/types';
import { TIP_TOPIC_LABEL, tipOfDay } from '../../../data/tips';
import { fmtMinutes } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { Card, ProgressBar, cn, spring, toneInk } from '../../../ui';
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

/** Consiglio del giorno, breve e motivato. "Un altro" scorre ai consigli successivi. */
export function TipCard({ date, dayType, firstId }: { date: ISODate; dayType: DayType; firstId?: string }) {
  const [offset, setOffset] = useState(0);
  const tip = tipOfDay(date, dayType, offset, firstId);
  return (
    <Card padding="none" as="section" aria-labelledby="oggi-consiglio">
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <p className={cn(BOARD_LABEL, 'flex min-w-0 items-center gap-2 text-accent-ink')}>
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
