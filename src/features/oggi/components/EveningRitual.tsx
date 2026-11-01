/**
 * Rito della sera: dal coprifuoco meno 15 minuti, un foglio a tutto schermo scuro e calmo. Le prime tre cose di
 * domani, la sveglia e un solo pulsante che registra l'orario vero in cui il telefono esce dalla camera.
 * Il controllo del mattino dopo propone quell'orario come "A letto".
 */
import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AlarmClock, ChevronDown, MoonStar, SmartphoneCharging, Workflow } from 'lucide-react';
import type { DayType, HHMM, ISODate } from '../../../domain/types';
import { addDays } from '../../../engine/dates';
import { dayTypeFor } from '../../../engine/menu';
import { sleepHours } from '../../../engine/sleep';
import { buildDay, type DayItem, type TimelineState } from '../../../engine/timeline';
import { fmtHours, fmtMinutes } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { Button, FullScreenModal, cn, spring } from '../../../ui';
import { BOARD_LABEL } from '../kinds';
import { StatusMark } from './StatusMark';

/** Il rito resta scuro anche nel tema chiaro: a quest'ora la luce va abbassata. */
const NIGHT =
  '[color-scheme:dark] [--bg:#060b16] [--bg-elev:#0b1424] [--card:#0f192b] [--card-2:#152238] [--line:#1d2b44] [--line-strong:#283a5a] ' +
  '[--ink:#e8edf6] [--ink-2:#a3afc4] [--ink-3:#6b7a94] [--accent:#f5c04a] [--accent-ink:#f5c04a] [--on-accent:#1b1405] ' +
  '[--accent-glow:rgb(245_192_74/0.3)] [--riposo:#b39dff] [--riposo-ink:#b39dff] [--good:#4cc38a] [--good-ink:#4cc38a] ' +
  '[--on-good:#06140d] [--palestra:#6ea8fe] [--palestra-ink:#6ea8fe] [--calcio:#f5c04a] [--calcio-ink:#f5c04a] ' +
  '[--leggero:#4fd1c5] [--leggero-ink:#4fd1c5] [--control:rgb(232_237_246/0.08)] [--control-line:rgb(255_255_255/0.07)] ' +
  '[--ink-soft:rgb(232_237_246/0.07)] [--bar-bg:rgb(6_11_22/0.86)] [--bar-line:rgb(255_255_255/0.06)] [--focus:#f5c04a] ' +
  '[--floodlight:radial-gradient(110%_55%_at_50%_-8%,rgb(179_157_255/0.12),transparent_64%)]';

const GUIDE_KEY = 'ritmo:guida-riposo';

function guideSeen(): boolean {
  try {
    return globalThis.localStorage?.getItem(GUIDE_KEY) === '1';
  } catch {
    return false;
  }
}
function markGuideSeen() {
  try {
    globalThis.localStorage?.setItem(GUIDE_KEY, '1');
  } catch {
    /* non disponibile: la guida ricompare, pazienza */
  }
}

/** Le prime tre cose di domani: colazione, spuntino da portare, seduta o calcio (o il pranzo). */
export function tomorrowFirstThree(today: ISODate, state: TimelineState): DayItem[] {
  const items = buildDay(addDays(today, 1), state);
  const pick = (pred: (i: DayItem) => boolean) => items.find(pred);
  const out = [
    pick((i) => i.id === 'pasto:colazione'),
    pick((i) => i.id === 'pasto:spuntino'),
    pick((i) => i.kind === 'palestra' || i.kind === 'calcio') ?? pick((i) => i.id === 'pasto:pranzo'),
  ];
  return out.filter((x): x is DayItem => Boolean(x));
}

export interface EveningRitualProps {
  open: boolean;
  today: ISODate;
  state: TimelineState;
  now: HHMM;
  curfew: HHMM;
  bed: HHMM;
  /** Minuti al coprifuoco (negativo se passato). */
  curfewIn: number;
  done: boolean;
  onPhoneOut: (time: HHMM) => void;
  onClose: () => void;
}

export function EveningRitual({ open, today, state, now, curfew, bed, curfewIn, done, onPhoneOut, onClose }: EveningRitualProps) {
  const reduce = useReducedMotion();
  const [showGuide, setShowGuide] = useState(() => !guideSeen());
  const [guideOpen, setGuideOpen] = useState(false);
  const tomorrow = addDays(today, 1);
  const tomorrowType: DayType = dayTypeFor(tomorrow, state.plan);
  const list = open ? tomorrowFirstThree(today, state) : [];
  const wake = state.plan.sleep.wake;

  const label = (i: DayItem) => {
    if (i.id === 'pasto:spuntino') return 'Spuntino da portare';
    return i.title;
  };

  return (
    <FullScreenModal
      open={open}
      onClose={onClose}
      closeIcon="down"
      closeLabel="Chiudi il rito della sera"
      aria-label="Rito della sera"
      className={NIGHT}
      light={{ intensity: 0.3, curfew: true }}
      footer={
        <Button
          fullWidth
          size="lg"
          icon={SmartphoneCharging}
          haptic="success"
          disabled={done}
          onClick={() => {
            onPhoneOut(now);
            onClose();
          }}
        >
          {done ? 'Telefono già fuori' : 'Telefono in carica fuori'}
        </Button>
      }
    >
      <div className="mx-auto flex max-w-md flex-col pb-4">
        <motion.div
          className="flex flex-col items-center pt-4 text-center"
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.08 }}
        >
          <span aria-hidden className="grid size-16 place-items-center rounded-full text-riposo-ink shadow-[inset_0_0_0_1px_var(--riposo),0_0_40px_-8px_var(--riposo)]">
            <MoonStar size={28} strokeWidth={1.8} />
          </span>
          <p className={cn(BOARD_LABEL, 'mt-5 text-riposo-ink')}>Rito della sera</p>
          <h2 className="font-display mt-2 text-[2.75rem] font-bold leading-none text-ink">
            {curfewIn > 0 ? (
              <>
                Fuori tra <span className="tabular">{fmtMinutes(curfewIn)}</span>
              </>
            ) : (
              'Telefono fuori'
            )}
          </h2>
          <p className="t-callout mt-3 max-w-[30ch] text-ink-2">
            Coprifuoco alle <span className="t-mono">{curfew}</span>, a letto alle <span className="t-mono">{bed}</span>. Luci basse, domani è già deciso.
          </p>
        </motion.div>

        <section aria-labelledby="rito-domani" className="mt-8">
          <h3 id="rito-domani" className={cn(BOARD_LABEL, 'text-ink-3')}>
            Domani, le prime tre
          </h3>
          <ol className="mt-3 flex flex-col">
            {list.map((i, n) => (
              <motion.li
                key={i.id}
                className="flex items-center gap-3.5 border-b border-line py-3.5 last:border-b-0"
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.16 + n * 0.06 }}
              >
                <StatusMark item={i} dayType={tomorrowType} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="t-callout font-semibold text-ink">{label(i)}</p>
                  {i.detail && <p className="t-footnote mt-0.5 line-clamp-1 text-ink-2">{i.detail}</p>}
                </div>
                <span className="t-mono shrink-0 text-[0.8125rem] text-ink-3">{i.time}</span>
              </motion.li>
            ))}
          </ol>
        </section>

        <div className="mt-6 flex items-center gap-3.5 rounded-card bg-card px-4 py-4 shadow-[inset_0_0_0_1px_var(--line)]">
          <AlarmClock size={20} strokeWidth={2} aria-hidden className="shrink-0 text-ink-2" />
          <p className="t-callout min-w-0 flex-1 text-ink-2">
            Sveglia alle <span className="t-mono text-ink">{wake}</span>
          </p>
          <span className="t-num text-[1.375rem] text-ink">{fmtHours(sleepHours(bed, wake))}</span>
          <span className="t-caption -ml-2 text-ink-3">di sonno</span>
        </div>

        {showGuide && (
          <section aria-labelledby="rito-guida" className="mt-4 rounded-card bg-card shadow-[inset_0_0_0_1px_var(--line)]">
            <button
              type="button"
              onClick={() => {
                haptic('selection');
                setGuideOpen((o) => !o);
              }}
              aria-expanded={guideOpen}
              className="flex min-h-14 w-full items-center gap-3.5 px-4 text-left"
            >
              <Workflow size={20} strokeWidth={2} aria-hidden className="shrink-0 text-accent-ink" />
              <span id="rito-guida" className="t-callout min-w-0 flex-1 font-semibold text-ink">
                Fallo fare all’iPhone ogni sera
              </span>
              <ChevronDown size={18} strokeWidth={2.4} aria-hidden className={cn('shrink-0 text-ink-3 transition-transform duration-200', guideOpen && 'rotate-180')} />
            </button>
            {guideOpen && (
              <div className="px-4 pb-4">
                <ol className="t-footnote flex list-decimal flex-col gap-1.5 pl-5 text-ink-2 marker:text-ink-3">
                  <li>Apri Comandi Rapidi, scheda Automazione, poi Nuova automazione.</li>
                  <li>
                    Scegli Orario del giorno: <span className="t-mono text-ink">{curfew}</span>, ogni giorno, Esegui immediatamente.
                  </li>
                  <li>Aggiungi l’azione Imposta Full immersion: Riposo, attiva.</li>
                  <li>Facoltativo: aggiungi Imposta luminosità al 20%.</li>
                </ol>
                <p className="t-footnote mt-2.5 text-ink-3">Quando l’orario a letto avanza, aggiorna l’automazione.</p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    markGuideSeen();
                    setShowGuide(false);
                  }}
                >
                  Fatto, non mostrare più
                </Button>
              </div>
            )}
          </section>
        )}
      </div>
    </FullScreenModal>
  );
}
