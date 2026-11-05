/**
 * Bolle della chat in stile Messaggi di iOS: gruppi attaccati, coda sull'ultima bolla, separatori con la
 * data, foto, risposta in arrivo con il cursore, errori con il rimedio.
 */
import { memo, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CircleAlert, Coffee, KeyRound, NotebookPen, RotateCw, ShieldQuestion, StepForward } from 'lucide-react';
import type { ChatMessage } from '../../../domain/types';
import { photoReadable } from '../../../engine/coachTasks/photo';
import { planDayISO } from '../../../engine/sleep';
import type { CoachPhase } from '../../../lib/claude';
import { usePlanDay } from '../../../state/hooks';
import { useApp, useUi } from '../../../state/store';
import { nearestOpenSlot } from '../../pasti/logic';
import { cn, spring } from '../../../ui';
import type { SeparatorLabel } from '../chat';
import { RichText } from './RichText';

/** Raggi della bolla: coda sull'ultima del gruppo, angoli stretti tra bolle attaccate. */
function bubbleRadius(mine: boolean, first: boolean, last: boolean): CSSProperties {
  const big = 20;
  const top = first ? big : 7;
  const bottom = last ? 6 : 7;
  return mine
    ? { borderRadius: `${big}px ${top}px ${bottom}px ${big}px` }
    : { borderRadius: `${top}px ${big}px ${big}px ${bottom}px` };
}

export function Separator({ label }: { label: SeparatorLabel }) {
  return (
    <div className="flex justify-center pb-1 pt-4" role="separator" aria-label={`${label.day} ${label.time}`}>
      <span className="t-caption text-ink-3">
        <span className="font-semibold text-ink-2">{label.day}</span> {label.time}
      </span>
    </div>
  );
}

/**
 * Riga del coach. Conversazione a due, come in Messaggi: niente avatar accanto alle bolle,
 * il coach è nell'intestazione.
 */
function CoachRow({ children, className }: { last?: boolean; children: ReactNode; className?: string }) {
  return <div className={cn('flex min-w-0 flex-col items-start pr-[14%]', className)}>{children}</div>;
}

export interface MessageRowProps {
  message: ChatMessage;
  first: boolean;
  last: boolean;
  onOpenImage?: (src: string) => void;
  /** Ultimo messaggio dell'utente: per riprovare dopo un errore. */
  onRetry?: (message: ChatMessage) => void;
  onContinue?: () => void;
  onFixKey?: () => void;
  onBarPlan?: () => void;
  /** Tipo di errore noto in questa sessione (per il rimedio giusto). */
  errorKind?: string;
  /** Il messaggio è appena arrivato: entra con un'animazione. */
  fresh?: boolean;
  /** Ha risposto un altro modello (fallback lato server): il suo nome. */
  answeredBy?: string;
}

export const MessageRow = memo(function MessageRow({
  message: m,
  first,
  last,
  onOpenImage,
  onRetry,
  onContinue,
  onFixKey,
  onBarPlan,
  errorKind,
  fresh,
  answeredBy,
}: MessageRowProps) {
  const reduce = useReducedMotion();
  const enter = fresh && !reduce ? { initial: { opacity: 0, y: 10, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: spring } : {};

  if (m.role === 'user') {
    return (
      <motion.div {...enter} className={cn('flex flex-col items-end gap-1 pl-[16%]', first ? 'mt-3' : 'mt-0.5')}>
        {m.image && (
          <button
            type="button"
            onClick={() => onOpenImage?.(m.image!)}
            className="block overflow-hidden rounded-[18px] border border-line bg-card-2"
            aria-label="Apri la foto"
          >
            <img src={m.image} alt="Foto allegata" className="block max-h-64 w-auto max-w-[min(240px,100%)] object-cover" />
          </button>
        )}
        {m.text.trim() && (
          <div
            className="selectable max-w-full whitespace-pre-wrap break-words bg-accent px-3.5 py-2 text-[1rem] leading-[1.38] text-on-accent [overflow-wrap:anywhere]"
            style={bubbleRadius(true, first || Boolean(m.image), last)}
          >
            {m.text}
          </div>
        )}
        {m.image && <PutInDiary message={m} />}
      </motion.div>
    );
  }

  // Errore: cosa è successo e come rimediare.
  if (m.error) {
    return (
      <motion.div {...enter} className="mt-3">
        <CoachRow last>
          <div
            role="alert"
            className="max-w-full rounded-[20px] rounded-bl-[6px] px-3.5 py-3"
            style={{ background: 'var(--bad-soft)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--bad) 24%, transparent)' }}
          >
            <p className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-bad-ink">
              <CircleAlert size={17} strokeWidth={2.3} aria-hidden />
              {errorKind === 'interrotta-rete' ? 'Risposta incompleta' : 'Risposta non arrivata'}
            </p>
            <p className="t-footnote mt-1 text-ink-2">{m.text}</p>
            <div className="-mb-1 mt-2 flex flex-wrap gap-2">
              {onRetry && (
                <BubbleAction icon={<RotateCw size={15} strokeWidth={2.4} aria-hidden />} onClick={() => onRetry(m)}>
                  Riprova
                </BubbleAction>
              )}
              {errorKind === 'chiave' || errorKind === 'permesso' ? (
                onFixKey && (
                  <BubbleAction icon={<KeyRound size={15} strokeWidth={2.4} aria-hidden />} onClick={onFixKey}>
                    Cambia chiave
                  </BubbleAction>
                )
              ) : errorKind === 'offline' || errorKind === 'rete' || errorKind === 'interrotta-rete' ? (
                onBarPlan && (
                  <BubbleAction icon={<Coffee size={15} strokeWidth={2.4} aria-hidden />} onClick={onBarPlan}>
                    Piano B al bar
                  </BubbleAction>
                )
              ) : null}
            </div>
          </div>
        </CoachRow>
      </motion.div>
    );
  }

  // Rifiuto del modello.
  if (m.stop === 'rifiuto') {
    return (
      <motion.div {...enter} className="mt-3">
        <CoachRow last>
          <div className="max-w-full rounded-[20px] rounded-bl-[6px] bg-card-2 px-3.5 py-3">
            <p className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-ink">
              <ShieldQuestion size={17} strokeWidth={2.3} aria-hidden className="text-ink-2" />
              Su questo il coach non risponde
            </p>
            <p className="t-footnote mt-1 text-ink-2">
              Riformula partendo da qualcosa di pratico: cosa hai mangiato, come ti senti, cosa prevede il piano di oggi.
            </p>
          </div>
        </CoachRow>
      </motion.div>
    );
  }

  return (
    <motion.div {...enter} className={first ? 'mt-3' : 'mt-0.5'}>
      <CoachRow last={last}>
        <div
          className="selectable max-w-full bg-card px-3.5 py-2.5 text-[1rem] leading-[1.4] text-ink shadow-card [overflow-wrap:anywhere]"
          style={bubbleRadius(false, first, last)}
        >
          <RichText text={m.text} />
        </div>
        {answeredBy && <p className="t-caption mt-1 px-1 text-ink-3">Risposta di {answeredBy}</p>}
        {m.stop === 'interrotta' && <p className="t-caption mt-1 px-1 text-ink-3">Risposta interrotta</p>}
        {m.stop === 'limite' && (
          <div className="mt-1.5 flex items-center gap-2 px-1">
            <span className="t-caption text-ink-3">Risposta lunga, tagliata qui</span>
            {onContinue && (
              <BubbleAction icon={<StepForward size={15} strokeWidth={2.4} aria-hidden />} onClick={onContinue}>
                Continua
              </BubbleAction>
            )}
          </div>
        )}
      </CoachRow>
    </motion.div>
  );
});

/**
 * «Metti nel diario» sotto una foto di oggi (docs/FASE2.md § 7.1): apre il foglio dei pasti dalla lettura, con il pasto
 * più vicino all'ora del messaggio non ancora segnato (si cambia nella scheda). Solo con la chiave e un modello che legge
 * le risposte strutturate; le foto dei giorni passati non lo mostrano.
 */
function PutInDiary({ message }: { message: ChatMessage }) {
  const today = usePlanDay();
  const plan = useApp((s) => s.plan);
  const readable = useApp((s) => photoReadable(s.settings));
  const at = new Date(message.createdAt);
  if (!readable || Number.isNaN(at.getTime()) || planDayISO(at, plan) !== today) return null;
  const open = () => {
    const log = useApp.getState().dayLogs[today];
    const hhmm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    const slot = nearestOpenSlot(today, hhmm, plan, log);
    useUi.getState().open({ type: 'mealLog', date: today, slot, mode: 'foto', chatMessageId: message.id });
  };
  return (
    <div className="mt-1">
      <BubbleAction icon={<NotebookPen size={15} strokeWidth={2.4} aria-hidden />} onClick={open}>
        Metti nel diario
      </BubbleAction>
    </div>
  );
}

function BubbleAction({ icon, onClick, children }: { icon: ReactNode; onClick: () => void; children: ReactNode }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="hit-44 inline-flex h-8 items-center gap-1.5 rounded-full bg-control px-3 text-[0.8125rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--control-line)]"
    >
      {icon}
      {children}
    </motion.button>
  );
}

// ───────────────────────── Risposta in arrivo ─────────────────────────

const PHASE_HINT: Record<CoachPhase, string> = {
  attesa: 'Si collega a Claude',
  ragiona: 'Ragiona sui dati di oggi',
  scrive: '',
};

/** Tre puntini e, se l'attesa si allunga, cosa sta facendo. */
export function TypingRow({ phase, startedAt }: { phase: CoachPhase; startedAt: number }) {
  const reduce = useReducedMotion();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const left = Math.max(0, 1800 - (Date.now() - startedAt));
    const id = window.setTimeout(() => setSlow(true), left);
    return () => window.clearTimeout(id);
  }, [startedAt]);
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="mt-3"
      role="status"
      aria-label="Il coach sta scrivendo"
    >
      <CoachRow last>
        <div className="flex h-[40px] items-center gap-[5px] rounded-[20px] rounded-bl-[6px] bg-card px-4 shadow-card">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="size-[7px] rounded-full bg-ink-3"
              animate={reduce ? { opacity: [0.4, 0.9, 0.4] } : { y: [0, -3.5, 0], opacity: [0.45, 1, 0.45] }}
              transition={{ duration: 1.05, repeat: Infinity, delay: i * 0.16, ease: 'easeInOut' }}
            />
          ))}
        </div>
        {slow && PHASE_HINT[phase] && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="t-caption mt-1 px-1 text-ink-3">
            {PHASE_HINT[phase]}
          </motion.p>
        )}
      </CoachRow>
    </motion.div>
  );
}

/** Bolla che si riempie mentre arriva il testo, con il cursore che lampeggia. */
export function StreamingRow({ text }: { text: string }) {
  return (
    <div className="mt-3" aria-busy="true">
      <CoachRow last>
        <div
          className="max-w-full bg-card px-3.5 py-2.5 text-[1rem] leading-[1.4] text-ink shadow-card [overflow-wrap:anywhere]"
          style={bubbleRadius(false, true, true)}
        >
          <RichText text={text} tail={<Caret />} />
        </div>
      </CoachRow>
    </div>
  );
}

function Caret() {
  const reduce = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      className="ml-0.5 inline-block h-[1.05em] w-[2.5px] translate-y-[0.18em] rounded-full bg-accent shadow-[0_0_8px_var(--accent-glow)]"
      animate={reduce ? undefined : { opacity: [1, 1, 0.15, 0.15, 1] }}
      transition={{ duration: 1, repeat: Infinity, times: [0, 0.45, 0.5, 0.95, 1], ease: 'linear' }}
    />
  );
}
