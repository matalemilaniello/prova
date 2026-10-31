import { ArrowRight, CalendarClock, Check, ChevronRight, ClipboardCheck } from 'lucide-react';
import type { ISODate, WeeklyReview } from '../../domain/types';
import { formatWeekRange } from '../../engine/dates';
import { reviewScore } from '../../engine/review';
import { fmtNumber, listIt } from '../../lib/format';
import { Button, Card, Pill } from '../../ui';

export interface ReviewPromptProps {
  weekStart: ISODate;
  /** È domenica: la revisione è in evidenza. */
  sunday: boolean;
  /** La settimana da rivedere esiste nel piano. */
  available: boolean;
  saved?: WeeklyReview;
  /** Proposte che cambiano il piano, per l'anteprima ("a letto alle 00:00"). */
  changes: string[];
  /** Proposte in tutto. */
  count: number;
  onOpen: () => void;
}

/** Invito alla revisione della domenica (o promemoria se è rimasta da fare), oppure revisione già salvata. */
export function ReviewPrompt({ weekStart, sunday, available, saved, changes, count, onOpen }: ReviewPromptProps) {
  const range = formatWeekRange(weekStart);

  if (!available) {
    return (
      <Card variant="outline" className="flex items-start gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-ink-soft text-ink-2">
          <CalendarClock size={20} strokeWidth={2.1} />
        </span>
        <div className="min-w-0">
          <p className="t-headline text-ink">La prima revisione arriva domenica</p>
          <p className="t-footnote mt-1 text-ink-2">
            Dieci minuti per rivedere la settimana: voti, misure e proposte per aggiornare il piano.
          </p>
        </div>
      </Card>
    );
  }

  if (saved) {
    const accepted = saved.acceptedProposals.length;
    return (
      <Card onPress={onOpen} className="flex items-center gap-3" aria-label={`Revisione della settimana ${range}, salvata. Apri`}>
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-good-soft text-good">
          <Check size={20} strokeWidth={2.6} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="t-headline block text-ink">Revisione salvata</span>
          <span className="t-footnote mt-0.5 block text-ink-2">
            {range} · voto medio {fmtNumber(reviewScore(saved), 1, true)}
            {accepted > 0 && ` · ${accepted} ${accepted === 1 ? 'proposta accettata' : 'proposte accettate'}`}
          </span>
        </span>
        <ChevronRight size={20} className="shrink-0 text-ink-3" aria-hidden />
      </Card>
    );
  }

  const preview = changes.length ? `Proposta: ${listIt(changes)}.` : count ? `${count} ${count === 1 ? 'proposta pronta' : 'proposte pronte'} per la prossima settimana.` : '';

  if (sunday) {
    return (
      <Card variant="highlight" tone="accent" padding="lg" as="section" aria-label="Revisione della domenica">
        <div className="relative flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <Pill tone="accent" icon={ClipboardCheck} size="md">
              Revisione della domenica
            </Pill>
            <span className="t-mono text-ink-3">10 min</span>
          </div>
          <div>
            <h2 className="t-title text-ink">Chiudi la settimana</h2>
            <p className="t-callout mt-1.5 text-ink-2">
              {range}: voti, misure e numeri, poi accetti le correzioni del piano. {preview}
            </p>
          </div>
          <Button size="lg" fullWidth iconRight={ArrowRight} onClick={onOpen}>
            Inizia la revisione
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card as="section" aria-label="Revisione da fare" className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-accent-soft text-accent-ink">
          <ClipboardCheck size={20} strokeWidth={2.1} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="t-label text-accent-ink">Revisione da fare</p>
          <p className="t-headline mt-1 text-ink">Settimana {range}</p>
          <p className="t-footnote mt-1 text-ink-2">Non l’hai ancora chiusa. {preview}</p>
        </div>
      </div>
      <Button variant="secondary" fullWidth iconRight={ArrowRight} onClick={onOpen}>
        Apri la revisione
      </Button>
    </Card>
  );
}
