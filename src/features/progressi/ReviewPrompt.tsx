import { ArrowRight, CalendarClock, Check, ChevronRight } from 'lucide-react';
import type { ISODate, WeeklyReview } from '../../domain/types';
import { formatWeekRange } from '../../engine/dates';
import { reviewScore, reviewStep } from '../../engine/review';
import { capitalize, fmtNumber, listIt } from '../../lib/format';
import { Button, Card, toneInk, toneRing, toneSoft } from '../../ui';
import { DayBulbs } from './DayBulbs';
import type { CalendarDay } from './series';

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
  /** Le sette giornate della settimana da rivedere (tabellone). */
  days?: CalendarDay[];
  onOpen: () => void;
}

/** Invito alla revisione della domenica (o promemoria se è rimasta da fare), oppure revisione già salvata. */
export function ReviewPrompt({ weekStart, sunday, available, saved, changes, count, days, onOpen }: ReviewPromptProps) {
  const range = formatWeekRange(weekStart);

  if (!available) {
    return (
      <Card variant="outline" className="flex items-start gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-ink-soft text-ink-2">
          <CalendarClock size={20} strokeWidth={2.1} />
        </span>
        <div className="min-w-0">
          <p className="t-headline text-ink">Il primo referto arriva domenica</p>
          <p className="t-footnote mt-1 text-pretty text-ink-2">Dieci minuti per rivedere la settimana: numeri, voti, misure e le correzioni del piano.</p>
        </div>
      </Card>
    );
  }

  if (saved) {
    const accepted = saved.acceptedProposals.length;
    const step = reviewStep(saved);
    return (
      <Card onPress={onOpen} className="flex items-center gap-3" aria-label={`Revisione della settimana ${range}, salvata. Apri`}>
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px]" style={{ background: toneSoft('good', 16), boxShadow: toneRing('good'), color: toneInk('good') }}>
          <Check size={20} strokeWidth={2.6} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="t-headline block text-ink">Settimana chiusa</span>
          <span className="t-footnote mt-0.5 block text-ink-2">
            {range} · voto medio {fmtNumber(reviewScore(saved), 1, true)}
            {accepted > 0 && ` · ${accepted} ${accepted === 1 ? 'proposta accettata' : 'proposte accettate'}`}
            {step && ` · scalino: ${step.title.toLowerCase()}`}
          </span>
        </span>
        <ChevronRight size={20} className="shrink-0 text-ink-3" aria-hidden />
      </Card>
    );
  }

  const preview = changes.length
    ? `Pronta la proposta: ${listIt(changes)}.`
    : count
      ? `${count} ${count === 1 ? 'proposta pronta' : 'proposte pronte'} per la prossima settimana.`
      : '';

  return (
    <Card variant={sunday ? 'highlight' : 'default'} tone={sunday ? 'accent' : undefined} padding="lg" as="section" aria-label={sunday ? 'Revisione della domenica' : 'Revisione da fare'}>
      <div className="relative flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="t-label" style={{ color: sunday ? 'var(--accent-ink)' : 'var(--ink-3)' }}>
            {sunday ? 'Referto della settimana' : 'Revisione da fare'}
          </span>
          <span className="t-mono text-ink-3">10 min</span>
        </div>
        <div>
          <h2 className="font-display text-[2.125rem] font-bold uppercase leading-[0.95] text-ink">{sunday ? 'Chiudi la settimana' : 'Settimana da chiudere'}</h2>
          <p className="t-callout mt-2 text-pretty text-ink-2">
            {capitalize(range)}: referto, voti e misure, poi accetti le correzioni del piano. {preview}
          </p>
        </div>
        {days && days.length === 7 && <DayBulbs days={days} size="sm" className="max-w-[260px]" />}
        <Button size="lg" variant={sunday ? 'primary' : 'secondary'} fullWidth iconRight={ArrowRight} onClick={onOpen}>
          {sunday ? 'Apri il referto' : 'Apri la revisione'}
        </Button>
      </div>
    </Card>
  );
}
