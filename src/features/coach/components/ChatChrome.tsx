/**
 * Cornice della chat: intestazione sfocata con il coach, intestazione della conversazione con quello che
 * il coach vede di oggi, avviso dell'anteprima, invito ad attivare, suggerimenti a tutta larghezza.
 */
import { ChevronRight, Coffee, Ellipsis, KeyRound, Moon, WifiOff } from 'lucide-react';
import { motion } from 'motion/react';
import type { CoachDaySummary } from '../../../engine/coachContext';
import { fmtHours, fmtKcal, plural } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { modelLabel } from '../../../lib/claude';
import { Button, cn, DayTypeBadge, DemoBadge, IconButton, Pill, staggerItem, toneRing } from '../../../ui';
import type { Suggestion } from '../suggestions';
import { CoachAvatar } from './CoachAvatar';

export const HEADER_CORE = 62;

export function ChatHeader({
  onBarPlan,
  onOptions,
  onContext,
  status,
}: {
  onBarPlan: () => void;
  onOptions: () => void;
  onContext: () => void;
  /** Riga sotto il nome (es. "sta scrivendo"). */
  status?: string;
}) {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      {/* Quasi opaca: sotto scorre testo, non solo colore, e la sfocatura non c'è ovunque. */}
      <div aria-hidden className="glass absolute inset-0 border-b border-[var(--bar-line)]" />
      {/* Sfumatura sotto il bordo: il testo che scorre sparisce prima di toccare la barra. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-full h-4" style={{ background: 'linear-gradient(var(--bg-elev), transparent)' }} />
      <div
        className="relative flex items-end"
        style={{
          height: `calc(var(--safe-top) + ${HEADER_CORE}px)`,
          paddingLeft: 'calc(var(--gutter) - 4px + var(--safe-left))',
          paddingRight: 'calc(var(--gutter) - 4px + var(--safe-right))',
        }}
      >
        <div className="flex w-full items-center pb-2">
          <div className="flex w-20 justify-start">
            <IconButton icon={Coffee} label="Piano B al bar" size="sm" variant="tinted" onClick={onBarPlan} />
          </div>
          <button
            type="button"
            onClick={() => {
              haptic('selection');
              onContext();
            }}
            className="mx-auto flex min-w-0 flex-col items-center gap-[3px] rounded-[14px] px-3 pt-0.5"
            aria-label="Coach: cosa vede della tua giornata"
          >
            <CoachAvatar size={30} />
            <span className="flex items-center gap-0.5 text-[0.8125rem] font-semibold leading-none text-ink">
              Coach
              <ChevronRight size={13} strokeWidth={2.6} aria-hidden className="text-ink-3" />
            </span>
            {status && <span className="sr-only">{status}</span>}
          </button>
          <div className="flex w-20 justify-end">
            <IconButton icon={Ellipsis} label="Opzioni del coach" size="sm" variant="tinted" onClick={onOptions} />
          </div>
        </div>
      </div>
    </header>
  );
}

/** In cima alla conversazione: il coach, il modello e quello che vede di oggi (tocca per i dettagli). */
export function ConversationIntro({
  summary,
  model,
  onContext,
  children,
}: {
  summary: CoachDaySummary;
  model?: string;
  onContext: () => void;
  children?: React.ReactNode;
}) {
  const pills = [
    <DayTypeBadge key="dt" dayType={summary.dayType} size="sm" label={`${summary.matchEve ? 'Vigilia della partita' : dayLabel(summary.dayType)} · ${fmtKcal(summary.kcal)}`} />,
    summary.total > 0 ? (
      <Pill key="voci" tone={summary.done === summary.total ? 'good' : 'neutral'}>
        {summary.minimal ? 'Giornata minima · ' : ''}
        {summary.done} su {plural(summary.total, 'voce', 'voci')}
      </Pill>
    ) : null,
    summary.sleepH !== null ? (
      <Pill key="sonno" tone="riposo" icon={Moon}>
        {fmtHours(summary.sleepH)} a letto
      </Pill>
    ) : !summary.checkInDone ? (
      <Pill key="ctrl" tone="warn">
        Controllo da fare
      </Pill>
    ) : null,
    summary.pain ? (
      <Pill key="dolore" tone={summary.pain.over ? 'warn' : 'neutral'}>
        {summary.pain.site} {summary.pain.value} su 10
      </Pill>
    ) : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col items-center px-2 pb-2 pt-3 text-center">
      <CoachAvatar size={76} glow />
      <h2 className="t-title mt-3.5 text-ink">Coach</h2>
      <p className="t-footnote mt-1 text-ink-2">Allenatore e nutrizionista · {modelLabel(model)}</p>
      <div className="mt-3.5 flex max-w-[340px] flex-wrap justify-center gap-1.5">{pills}</div>
      {summary.activity && <p className="t-footnote mt-2.5 text-ink-3">Oggi: {lowerFirst(summary.activity)}</p>}
      <button
        type="button"
        onClick={() => {
          haptic('selection');
          onContext();
        }}
        className="hit-44 t-footnote mt-2 inline-flex items-center gap-0.5 font-semibold text-accent-ink"
      >
        Cosa vede il coach
        <ChevronRight size={14} strokeWidth={2.6} aria-hidden />
      </button>
      <DemoBadge className="mt-3" />
      {children}
    </div>
  );
}

const DAY_LABEL = { calcio: 'Calcio', palestra: 'Palestra', leggero: 'Leggero', riposo: 'Riposo' } as const;
const dayLabel = (d: keyof typeof DAY_LABEL) => DAY_LABEL[d];
const lowerFirst = (s: string) => (s.length > 1 && s[1] === s[1].toLowerCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/**
 * Al posto della barra di scrittura nell'anteprima: la rete esterna è bloccata, come in Messaggi quando
 * non si può rispondere. Il piano B al bar resta a un tocco con la tazza in alto a sinistra, un solo accesso.
 * `onBarPlan` resta nella firma per chi la usa già.
 */
export function PreviewStrip(_props: { onBarPlan?: () => void }) {
  return (
    <div
      className="flex items-center gap-3 py-3"
      style={{ paddingLeft: 'calc(var(--gutter) + var(--safe-left))', paddingRight: 'calc(var(--gutter) - 4px + var(--safe-right))' }}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink-soft text-ink-2">
        <WifiOff size={18} strokeWidth={2.2} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="t-callout font-semibold text-ink">Anteprima senza rete</p>
        <p className="t-caption text-ink-2">Il coach risponde nell’app installata.</p>
      </div>
    </div>
  );
}

/** Al posto della barra di scrittura quando manca la chiave ma c'è una conversazione. */
export function ActivateStrip({ onActivate }: { onActivate: () => void }) {
  return (
    <div
      className="flex items-center gap-3 py-3"
      style={{ paddingLeft: 'calc(var(--gutter) + var(--safe-left))', paddingRight: 'calc(var(--gutter) - 4px + var(--safe-right))' }}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink" style={{ boxShadow: toneRing('accent') }}>
        <KeyRound size={19} strokeWidth={2.2} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="t-callout font-semibold text-ink">Collega il coach</p>
        <p className="t-caption text-ink-2">Serve la tua chiave di Claude: resta su questo telefono.</p>
      </div>
      <Button size="sm" onClick={onActivate}>
        Attiva
      </Button>
    </div>
  );
}

/** Suggerimenti grandi della conversazione vuota. */
export function SuggestionGrid({ items, onPick, className }: { items: Suggestion[]; onPick: (s: Suggestion) => void; className?: string }) {
  return (
    <div className={cn('grid w-full grid-cols-2 gap-2.5', className)}>
      {items.map((s, i) => {
        const Icon = s.icon;
        return (
          <motion.button
            key={s.id}
            type="button"
            {...staggerItem(i, 0.05)}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              haptic('selection');
              onPick(s);
            }}
            className="flex min-h-[96px] flex-col justify-between gap-3 rounded-[18px] bg-card p-3.5 text-left shadow-card"
          >
            <span className="grid size-8 place-items-center rounded-[10px] bg-accent-soft text-accent-ink" style={{ boxShadow: toneRing('accent') }}>
              <Icon size={17} strokeWidth={2.2} aria-hidden />
            </span>
            <span className="t-callout font-semibold leading-snug text-ink">{s.text}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
