/**
 * Righe del blocco in Allenamento (docs/FASE2.md § 11.5): la card in cima con la proposta di blocco aperta («Nuovo blocco
 * pronto · Vedi cosa cambia»), il blocco già approvato che entra più avanti («Dal 9 novembre: forza, poi potenza», con il
 * dettaglio e «Annulla», § 5.4), la riga quando la settimana non lascia un giorno per la palestra e «Blocchi precedenti».
 */
import { CalendarClock, ChevronRight, History, Sparkles } from 'lucide-react';
import type { PlanProposal } from '../../../domain/types';
import { NO_GYM_DAY_TEXT } from '../../../engine/plan/build';
import { keepHyphens, Button, Card, ListGroup, ListRow, toneInk, toneRing, toneSoft } from '../../../ui';
import { pendingBlockDetail, pendingBlockTitle } from '../blocks';

export function BlockProposalCard({ proposal, onOpen }: { proposal: PlanProposal; onOpen: () => void }) {
  const reason = proposal.reasons[0];
  return (
    <Card variant="highlight" tone="accent" padding="lg" as="section" aria-label="Nuovo blocco pronto">
      <div className="relative flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px]" style={{ background: toneSoft('accent', 16), boxShadow: toneRing('accent'), color: toneInk('accent') }}>
            <Sparkles size={20} strokeWidth={2.2} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="t-label text-accent-ink">Nuovo blocco pronto</p>
            <h2 className="t-headline text-ink">{proposal.title}</h2>
            {proposal.subtitle && <p className="t-footnote text-ink-2">{keepHyphens(proposal.subtitle)}</p>}
          </div>
        </div>
        {reason && <p className="t-footnote text-pretty text-ink-2">{keepHyphens(reason)}</p>}
        <Button fullWidth iconRight={ChevronRight} onClick={onOpen}>
          Vedi cosa cambia
        </Button>
      </div>
    </Card>
  );
}

export function PendingBlockCard({ proposal, onOpen, onUndo }: { proposal: PlanProposal; onOpen: () => void; onUndo: () => void }) {
  return (
    <Card padding="md" as="section" aria-label="Blocco approvato" className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-[30px] shrink-0 place-items-center rounded-[9px]" style={{ background: toneSoft('palestra', 16), boxShadow: toneRing('palestra'), color: toneInk('palestra') }}>
          <CalendarClock size={17} strokeWidth={2.2} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="t-callout font-semibold text-ink">{pendingBlockTitle(proposal)}</p>
          {proposal.patch.program && <p className="t-footnote text-ink-2">{pendingBlockDetail(proposal.patch.program)}</p>}
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={onOpen}>
          Dettagli
        </Button>
        <Button variant="ghost" size="sm" className="flex-1" onClick={onUndo}>
          Annulla
        </Button>
      </div>
    </Card>
  );
}

/** La settimana non ha un giorno per la palestra: la proposta non nasce e restano le sedute di prima (§ 3.12). */
export function NoGymDayLine() {
  return <p className="t-footnote px-1 text-pretty text-ink-2">{NO_GYM_DAY_TEXT}.</p>;
}

export function PastBlocksRow({ onOpen }: { onOpen: () => void }) {
  return (
    <ListGroup>
      <ListRow icon={History} iconTone="riposo" title="Blocchi precedenti" onPress={onOpen} />
    </ListGroup>
  );
}
