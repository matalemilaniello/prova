import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, Undo2 } from 'lucide-react';
import type { Plan, Proposal } from '../../domain/types';
import { fmtKcal } from '../../lib/format';
import { Button, Card, Pill, cn, renderIcon, springSnappy, toneInk, toneRing, toneSoft } from '../../ui';
import { AREA_META } from './areas';

export type ProposalState = 'da-decidere' | 'accettata' | 'rimandata' | 'applicata';

export interface ProposalCardProps {
  proposal: Proposal;
  plan: Plan;
  state: ProposalState;
  /** Se false la proposta si legge soltanto (revisione di una settimana passata). */
  actionable: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  /** Torna "da decidere". */
  onUndo?: () => void;
}

/** Effetto sul piano, "prima → dopo". */
export function proposalChange(p: Proposal, plan: Plan): { from: string; to: string; note?: string } | null {
  if (p.apply?.type === 'sleepCurrent') return { from: plan.sleep.current, to: p.apply.value, note: 'a letto' };
  if (p.apply?.type === 'kcalDelta') {
    const t = plan.targets.palestra.kcal;
    return { from: fmtKcal(t), to: fmtKcal(t + p.apply.value), note: 'palestra' };
  }
  return null;
}

/** Icona dell'area: fondo tenue e anello di 1 px nel colore, il colore pieno solo sul segno. */
export function AreaIcon({ area, size = 40 }: { area: Proposal['area']; size?: number }) {
  const meta = AREA_META[area];
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-[12px]"
      style={{ width: size, height: size, background: toneSoft(meta.tone, 16), boxShadow: toneRing(meta.tone), color: toneInk(meta.tone) }}
    >
      {renderIcon(meta.icon, Math.round(size / 2), 2.1)}
    </span>
  );
}

/**
 * Una proposta della revisione: area, titolo, motivo, effetto sul piano e la scelta, "Accetta" pieno e
 * "Non ora" leggero. Le proposte informative (senza `apply`) si leggono soltanto.
 */
export function ProposalCard({ proposal, plan, state, actionable, onAccept, onDecline, onUndo }: ProposalCardProps) {
  const meta = AREA_META[proposal.area];
  const informative = proposal.apply === undefined;
  const fx = state === 'applicata' ? null : proposalChange(proposal, plan);
  const commitment = proposal.apply?.type === 'none';

  return (
    <Card
      as="article"
      padding="none"
      variant={informative ? 'outline' : 'default'}
      className={cn('transition-[box-shadow,opacity] duration-200', state === 'rimandata' && 'opacity-70')}
      style={state === 'accettata' || state === 'applicata' ? { boxShadow: 'inset 0 0 0 1.5px var(--good)' } : undefined}
    >
      <div className="flex gap-3 p-4">
        <AreaIcon area={proposal.area} />
        <div className="min-w-0 flex-1">
          <span className="t-label" style={{ color: toneInk(meta.tone) }}>
            {meta.label}
          </span>
          <h4 className="t-headline mt-0.5 text-ink">{proposal.title}</h4>
          <p className="t-footnote mt-1 text-pretty text-ink-2">{proposal.reason}</p>
          {fx && (
            <div className="mt-3 inline-flex h-8 items-center gap-2 rounded-full bg-ink-soft px-3">
              {fx.note && <span className="t-caption text-ink-3">{fx.note}</span>}
              <span className="t-mono text-[0.8125rem] text-ink-2">{fx.from}</span>
              <ArrowRight size={13} strokeWidth={2.4} aria-label="diventa" className="text-ink-3" />
              <span className="t-mono text-[0.8125rem] font-medium text-ink">{fx.to}</span>
            </div>
          )}
        </div>
      </div>

      {!informative && (
        <div className="flex min-h-[56px] items-center justify-between gap-2 border-t border-line py-2 pl-4 pr-2.5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={state}
              className={cn('t-footnote min-w-0', state === 'accettata' || state === 'applicata' ? 'font-medium text-good-ink' : 'text-ink-3')}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={springSnappy}
            >
              {state === 'applicata'
                ? commitment
                  ? 'Impegno preso'
                  : 'Già nel piano'
                : state === 'accettata'
                  ? commitment
                    ? 'Un impegno per la settimana'
                    : 'Cambia il piano da lunedì'
                  : state === 'rimandata'
                    ? 'Rimandata'
                    : actionable
                      ? commitment
                        ? 'Il piano non cambia'
                        : 'Cambia il piano'
                      : 'Non accettata'}
            </motion.span>
          </AnimatePresence>
          {state === 'applicata' || (!actionable && state === 'accettata') ? (
            <Pill tone="good" icon={Check} size="md">
              {commitment ? 'Accettata' : 'Applicata'}
            </Pill>
          ) : !actionable ? null : state === 'da-decidere' ? (
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="sm" onClick={onDecline} aria-label={`Non ora: ${proposal.title}`} haptic="selection" className="!text-ink-2">
                Non ora
              </Button>
              <Button variant="secondary" size="sm" icon={Check} onClick={onAccept} aria-label={`Accetta: ${proposal.title}`} haptic="light">
                Accetta
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" icon={Undo2} onClick={onUndo} aria-label={`Ripensaci: ${proposal.title}`} haptic="selection">
              {state === 'accettata' ? 'Annulla' : 'Ripensaci'}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
