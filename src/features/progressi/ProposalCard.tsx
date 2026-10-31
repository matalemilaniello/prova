import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, Info, Undo2 } from 'lucide-react';
import type { Plan, Proposal } from '../../domain/types';
import { fmtKcal } from '../../lib/format';
import { Button, Card, Pill, cn, renderIcon, springSnappy, toneColor, toneInk, toneSoft } from '../../ui';
import { AREA_META } from './areas';

export type ProposalState = 'da-decidere' | 'accettata' | 'applicata';

export interface ProposalCardProps {
  proposal: Proposal;
  plan: Plan;
  state: ProposalState;
  /** Se false la proposta si legge soltanto (revisione di una settimana passata). */
  actionable: boolean;
  onToggle: () => void;
}

/** Effetto sul piano, "prima → dopo". */
function effect(p: Proposal, plan: Plan): { from: string; to: string } | null {
  if (p.apply?.type === 'sleepCurrent') return { from: plan.sleep.current, to: p.apply.value };
  if (p.apply?.type === 'kcalDelta') {
    const t = plan.targets.palestra.kcal;
    return { from: fmtKcal(t), to: fmtKcal(t + p.apply.value) };
  }
  return null;
}

/** Una proposta della revisione: area, titolo, motivo, effetto sul piano e scelta. */
export function ProposalCard({ proposal, plan, state, actionable, onToggle }: ProposalCardProps) {
  const meta = AREA_META[proposal.area];
  const informative = proposal.apply === undefined;
  const fx = state === 'applicata' ? null : effect(proposal, plan);
  const accepted = state !== 'da-decidere';

  return (
    <Card
      as="article"
      padding="none"
      variant={informative ? 'outline' : 'default'}
      className={cn('transition-shadow duration-200', accepted && !informative && 'shadow-[inset_0_0_0_1.5px_var(--good)]')}
    >
      <div className="flex gap-3 p-4">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-[12px]"
          style={{ background: toneSoft(meta.tone, 16), color: toneColor(meta.tone) }}
        >
          {renderIcon(meta.icon, 20, 2.1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="t-label" style={{ color: toneInk(meta.tone) }}>
              {meta.label}
            </span>
            {informative && (
              <span className="t-caption inline-flex items-center gap-1 text-ink-3">
                <Info size={13} strokeWidth={2.2} aria-hidden />
                Solo informativa
              </span>
            )}
          </div>
          <h4 className="t-headline mt-1 text-ink">{proposal.title}</h4>
          <p className="t-footnote mt-1 text-ink-2">{proposal.reason}</p>
          {fx && (
            <div className="t-mono mt-3 inline-flex h-7 items-center gap-2 rounded-full bg-ink-soft px-3 text-[0.75rem] text-ink-2">
              <span>{fx.from}</span>
              <ArrowRight size={13} strokeWidth={2.4} aria-label="diventa" />
              <span className="font-medium text-ink">{fx.to}</span>
              {proposal.apply?.type === 'kcalDelta' && <span className="text-ink-3">palestra</span>}
            </div>
          )}
        </div>
      </div>

      {!informative && (
        <div className="flex min-h-[52px] items-center justify-between gap-3 border-t border-line py-2 pl-4 pr-2.5">
          <AnimatePresence mode="wait" initial={false}>
            {state === 'applicata' ? (
              <motion.span key="app" className="t-footnote text-ink-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {proposal.apply?.type === 'none' ? 'Impegno preso' : 'Già nel piano'}
              </motion.span>
            ) : state === 'accettata' ? (
              <motion.span
                key="acc"
                className="t-footnote font-medium text-good-ink"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={springSnappy}
              >
                {proposal.apply?.type === 'none' ? 'Accettata' : 'Si applica quando salvi'}
              </motion.span>
            ) : (
              <motion.span
                key="todo"
                className="t-footnote text-ink-3"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={springSnappy}
              >
                {actionable ? (proposal.apply?.type === 'none' ? 'Un impegno per la settimana' : 'Cambia il piano') : 'Non accettata'}
              </motion.span>
            )}
          </AnimatePresence>
          {state === 'applicata' ? (
            <Pill tone="good" icon={Check} size="md">
              {proposal.apply?.type === 'none' ? 'Accettata' : 'Applicata'}
            </Pill>
          ) : !actionable ? (
            state === 'accettata' ? (
              <Pill tone="good" icon={Check} size="md">
                Accettata
              </Pill>
            ) : null
          ) : state === 'accettata' ? (
            <Button variant="ghost" size="sm" icon={Undo2} onClick={onToggle} aria-label={`Annulla: ${proposal.title}`} haptic="selection">
              Annulla
            </Button>
          ) : (
            <Button variant="secondary" size="sm" icon={Check} onClick={onToggle} aria-label={`Accetta: ${proposal.title}`} haptic="light">
              Accetta
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
