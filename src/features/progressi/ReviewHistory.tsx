import { ClipboardCheck } from 'lucide-react';
import type { ISODate, WeeklyReview } from '../../domain/types';
import { formatWeekRange } from '../../engine/dates';
import { reviewScore, skinfoldSum } from '../../engine/review';
import { capitalize, fmtCm, fmtDelta, fmtNumber } from '../../lib/format';
import { ListGroup, ListRow } from '../../ui';

/** Revisioni salvate, dalla più recente: voto medio, vita e variazione, pliche. Il resto è dentro la revisione. */
export function ReviewHistory({ reviews, onOpen, limit = 6 }: { reviews: WeeklyReview[]; onOpen: (weekStart: ISODate) => void; limit?: number }) {
  const sorted = reviews.slice().sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
  const shown = sorted.slice(0, limit);
  return (
    <ListGroup
      title="Revisioni"
      footer={sorted.length > limit ? `Le ultime ${limit} di ${sorted.length}.` : undefined}
    >
      {shown.map((r, i) => {
        const older = sorted[i + 1];
        const parts = [`voto medio ${fmtNumber(reviewScore(r), 1, true)}`];
        if (r.waistCm !== undefined) {
          const d = older?.waistCm !== undefined ? ` (${fmtDelta(r.waistCm - older.waistCm, 'cm', 1)})` : '';
          parts.push(`vita ${fmtCm(r.waistCm)}${d}`);
        }
        const folds = skinfoldSum(r);
        if (folds !== null) parts.push(`pliche ${fmtNumber(folds, 1)}\u00a0mm`);
        return (
          <ListRow
            key={r.weekStart}
            icon={ClipboardCheck}
            iconTone="good"
            title={capitalize(formatWeekRange(r.weekStart))}
            subtitle={capitalize(parts.join(' · '))}
            onPress={() => onOpen(r.weekStart)}
          />
        );
      })}
    </ListGroup>
  );
}
