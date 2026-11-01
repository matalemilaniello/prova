import { ArrowRight, Check, ChevronRight } from 'lucide-react';
import type { ISODate, WeeklyReview } from '../../domain/types';
import { daysBetween, formatDayLong, formatWeekRange, formatWeekSpan } from '../../engine/dates';
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
  /** Oggi (giornata del piano): per il conto dei giorni alla prima revisione. */
  today?: ISODate;
  /** Domenica della prima revisione, quando la revisione non è ancora disponibile. */
  firstReview?: ISODate | null;
  /** Le giornate della prima settimana da rivedere, quando non è ancora disponibile. */
  upcoming?: CalendarDay[];
  onOpen: () => void;
}

/** "domani", "tra 6 giorni". */
function countdown(days: number): string {
  return days <= 1 ? 'domani' : `tra ${days} giorni`;
}

/** Invito alla revisione della domenica (o promemoria se è rimasta da fare), oppure revisione già salvata. */
export function ReviewPrompt({ weekStart, sunday, available, saved, changes, count, days, today, firstReview, upcoming, onOpen }: ReviewPromptProps) {
  const range = formatWeekRange(weekStart);

  if (!available) {
    // Prima settimana: niente revisione di giorni non vissuti, solo l'appuntamento e il conto alla rovescia.
    const left = firstReview && today ? Math.max(1, daysBetween(today, firstReview)) : null;
    return (
      <Card variant="outline" padding="lg" as="section" aria-label="Prima revisione">
        <div className="flex items-baseline justify-between gap-3">
          <span className="t-label text-ink-3">Revisione della settimana</span>
          <span className="t-mono text-ink-3">10 min</span>
        </div>
        <div className="mt-3 flex items-end justify-between gap-4">
          <h2 className="t-title min-w-0 text-pretty text-ink">
            {firstReview ? `La prima revisione è ${formatDayLong(firstReview)}` : 'La prima revisione è domenica'}
          </h2>
          {left !== null && (
            <p className="flex shrink-0 flex-col items-end">
              <span className="sr-only">{capitalize(countdown(left))}</span>
              <span className="t-num text-[2.75rem] leading-[0.85] text-accent-ink" aria-hidden>
                {fmtNumber(left)}
              </span>
              <span className="t-label mt-1 text-[0.75rem] text-ink-3" aria-hidden>
                {left === 1 ? 'giorno' : 'giorni'}
              </span>
            </p>
          )}
        </div>
        <p className="t-callout mt-3 text-pretty text-ink-2">
          Dieci minuti per rivedere la tua prima settimana: numeri, voti e misure, poi le correzioni del piano. Fino ad allora segna le voci di Oggi, il resto lo fa Ritmo.
        </p>
        {upcoming && upcoming.length === 7 && <DayBulbs days={upcoming} size="sm" className="mt-4 max-w-[260px]" />}
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
            {sunday ? 'Revisione della settimana' : 'Revisione da fare'}
          </span>
          <span className="t-mono text-ink-3">10 min</span>
        </div>
        <div>
          <h2 className="t-large-title text-[2.125rem] text-ink">{sunday ? 'Chiudi la settimana' : 'Settimana da chiudere'}</h2>
          <p className="t-callout mt-2 text-pretty text-ink-2">
            {capitalize(formatWeekSpan(weekStart))}: numeri, voti e misure, poi accetti le correzioni del piano. {preview}
          </p>
        </div>
        {days && days.length === 7 && <DayBulbs days={days} size="sm" className="max-w-[260px]" />}
        <Button size="lg" variant={sunday ? 'primary' : 'secondary'} fullWidth iconRight={ArrowRight} onClick={onOpen}>
          Apri la revisione
        </Button>
      </div>
    </Card>
  );
}
