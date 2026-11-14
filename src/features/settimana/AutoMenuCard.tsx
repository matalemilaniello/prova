/**
 * Il menù della settimana dopo è entrato da solo: una card quieta lo dice e lascia due uscite, «Un altro menù» e «Tieni
 * quello di prima». Non chiede niente: senza toccarla, da lunedì vale il menù nuovo.
 */
import { UtensilsCrossed } from 'lucide-react';
import type { ISODate, PlanProposal } from '../../domain/types';
import { Button, Card, toneInk, toneRing, toneSoft } from '../../ui';
import { anotherMenu, keepPreviousMenu } from './useMenuProposal';

export function AutoMenuCard({
  view,
  today,
  ahead,
  nested,
  className,
}: {
  view: { proposal: PlanProposal; monday: ISODate; meals: number };
  today: ISODate;
  /** La card sta sopra la spesa di questa settimana: il menù nuovo vale da lunedì. */
  ahead?: boolean;
  nested?: boolean;
  className?: string;
}) {
  const meals = view.meals === 0 ? 'Stessi pasti di questa settimana' : view.meals === 1 ? 'Cambia un pasto' : `Cambiano ${view.meals} pasti`;
  return (
    <Card variant={nested ? 'nested' : undefined} padding="none" as="section" aria-label="Menù nuovo della settimana" className={className}>
      <div className="flex items-center gap-3 px-4 pt-3">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-[11px]"
          style={{ background: toneSoft('good', 16), boxShadow: toneRing('good'), color: toneInk('good') }}
        >
          <UtensilsCrossed size={17} strokeWidth={2.2} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="t-callout font-semibold text-ink">{ahead ? 'Menù nuovo da lunedì' : 'Menù nuovo'}</span>
          <span className="t-footnote text-ink-2">{meals}. È già nel piano.</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-x-1 px-2 pb-1.5 pt-1">
        <Button size="sm" variant="ghost" onClick={() => anotherMenu(view.proposal.id, today)}>
          Un altro menù
        </Button>
        <Button size="sm" variant="ghost" onClick={() => keepPreviousMenu(view.proposal.id, today)}>
          Tieni quello di prima
        </Button>
      </div>
    </Card>
  );
}
