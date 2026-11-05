/**
 * Segnali d'allarme di una zona sotto il ginocchio (docs/FASE2.md § 3.8): nella pagina Dolore e nel rientro della pagina
 * Obiettivi. Un tocco su «Ho uno di questi segnali» ferma gli impatti da subito (`setImpactHold`): stadio del rientro a 0,
 * via libera del fisioterapista tolto, livello 0 in ogni seduta, quella di oggi compresa. L'avviso «Impatti fermi» ha
 * «Annulla» per 5 secondi, per il tocco sbagliato; dopo, gli impatti tornano solo con il via libera esplicito
 * (`clearImpactHold`). Non è una diagnosi e il testo non lo dice mai come tale.
 */
import { ShieldCheck, TriangleAlert } from 'lucide-react';
import type { ISODate, Plan } from '../../../domain/types';
import { isISODate } from '../../../engine/dates';
import { fromDayLabel } from '../../../engine/plan/diff';
import { impactHoldOn } from '../../../engine/training';
import { haptic } from '../../../lib/haptics';
import { useApp, useUi } from '../../../state/store';
import { Button, Card, Callout, cn, toneInk, toneRing, toneSoft } from '../../../ui';

/** I tre segnali (§ 3.8), nell'ordine. */
export const WARNING_SIGNS = ['Dolore in un punto preciso dell’osso', 'Dolore a riposo o di notte', 'Saltello su una gamba doloroso'] as const;

export const HOLD_ADVICE = 'Senti il fisioterapista o il medico prima di correre o saltare.';

/** Ferma gli impatti per la zona, con «Annulla» per 5 secondi che rimette fermo e rientro com'erano. */
export function holdImpacts(site: string, today: ISODate): void {
  const before: Pick<Plan, 'impactHold' | 'training'> = { impactHold: useApp.getState().plan.impactHold, training: useApp.getState().plan.training };
  useApp.getState().setImpactHold(site, today);
  haptic('warning');
  useUi.getState().toast('Impatti fermi', 'warn', {
    actionLabel: 'Annulla',
    durationMs: 5000,
    onAction: () => useApp.getState().updatePlan(before),
  });
}

/** Via libera esplicito: gli impatti tornano e il rientro riparte dallo stadio 0 con i suoi criteri. */
export function releaseImpacts(): void {
  useApp.getState().clearImpactHold();
  haptic('success');
  useUi.getState().toast('Via libera segnato', 'good');
}

export function WarningSigns({ site, today, label, className }: { site: string; today: ISODate; label?: string; className?: string }) {
  const plan = useApp((s) => s.plan);
  const hold = impactHoldOn(plan, today);
  if (hold) {
    return (
      <Callout
        tone="warn"
        title={isISODate(hold.since) ? `Impatti fermi ${fromDayLabel(hold.since)}` : 'Impatti fermi'}
        className={className}
        action={
          <div className="pl-3.5">
            <Button variant="secondary" fullWidth icon={ShieldCheck} className="h-auto! min-h-11 whitespace-normal! py-2.5 text-left leading-snug" onClick={releaseImpacts}>
              Il fisioterapista o il medico mi ha dato il via libera
            </Button>
          </div>
        }
      >
        {HOLD_ADVICE}
      </Callout>
    );
  }
  return (
    <Card padding="none" className={cn('overflow-hidden', className)}>
      <button
        type="button"
        onClick={() => holdImpacts(site, today)}
        className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-ink-soft"
      >
        <span aria-hidden className="grid size-[30px] shrink-0 place-items-center rounded-[9px]" style={{ background: toneSoft('bad', 16), boxShadow: toneRing('bad'), color: toneInk('bad') }}>
          <TriangleAlert size={17} strokeWidth={2.2} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="t-callout font-semibold text-ink">Ho uno di questi segnali</span>
          {label && <span className="t-footnote text-ink-3">{label}</span>}
        </span>
      </button>
      <ul className="flex flex-col gap-1 border-t border-line px-4 pb-3.5 pt-2.5">
        {WARNING_SIGNS.map((s) => (
          <li key={s} className="t-footnote flex gap-2 text-ink-2">
            <span aria-hidden className="mt-[0.45em] size-1 shrink-0 rounded-full bg-ink-3" />
            {s}
          </li>
        ))}
      </ul>
    </Card>
  );
}
