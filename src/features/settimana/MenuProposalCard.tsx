/**
 * Card del menù nuovo (docs/FASE2.md § 5.3, § 11.5, § 11.6): «Menù nuovo · cambiano 4 pasti, 37 prodotti · Vedi», e a
 * spesa già cominciata «Dopo la spesa: servono 3 prodotti in più». Tutta la card è un solo pulsante che apre il foglio
 * della proposta (`planProposal`): lì si approva, si tiene il piano attuale o si chiede un’altra proposta. Spuntare la
 * lista non approva niente.
 *
 * `nested`: riquadro annidato dentro la card della spesa; altrimenti card a sé, in cima al menù della settimana dopo.
 */
import { ChevronRight, UtensilsCrossed } from 'lucide-react';
import { capitalize } from '../../lib/format';
import { Card, Pressable, cn, toneInk, toneRing, toneSoft } from '../../ui';
import { openProposalSheet } from '../piano/actions';
import { afterShoppingText, proposalSummary, type MenuProposalView } from './useMenuProposal';

export function MenuProposalCard({
  view,
  nested,
  ahead,
  className,
}: {
  view: MenuProposalView;
  nested?: boolean;
  /** La card sta sopra la spesa di questa settimana: il menù nuovo vale da lunedì. */
  ahead?: boolean;
  className?: string;
}) {
  const title = ahead ? 'Menù nuovo da lunedì' : 'Menù nuovo';
  const summary = proposalSummary(view);
  const after = view.shopped ? afterShoppingText(view.extra) : null;
  const body = (
    <Pressable
      onPress={() => openProposalSheet(view.proposal.id)}
      pressScale={0.985}
      className={cn('flex w-full items-center gap-3 text-left', nested ? 'min-h-14 px-3 py-2.5' : 'min-h-16 px-4 py-3')}
      aria-label={`${title}: ${summary}${after ? `. ${after}` : ''}. Vedi la proposta`}
    >
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-[11px]"
        style={{ background: toneSoft('accent', 16), boxShadow: toneRing('accent'), color: toneInk('accent') }}
      >
        <UtensilsCrossed size={17} strokeWidth={2.2} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="t-callout font-semibold text-ink">{title}</span>
        <span className="t-footnote text-ink-2">{capitalize(summary)}</span>
        {after && <span className="t-footnote mt-0.5 font-medium text-accent-ink">{after}</span>}
      </span>
      <span className="t-footnote inline-flex shrink-0 items-center gap-0.5 font-semibold text-accent-ink">
        Vedi
        <ChevronRight aria-hidden size={16} strokeWidth={2.4} />
      </span>
    </Pressable>
  );
  if (nested) {
    return (
      <Card variant="nested" padding="none" className={className}>
        {body}
      </Card>
    );
  }
  return (
    <Card padding="none" as="section" aria-label="Menù nuovo della settimana" className={className}>
      {body}
    </Card>
  );
}
