import { ShoppingBasket } from 'lucide-react';
import type { DayType, ISODate } from '../../../domain/types';
import { formatDayLong } from '../../../engine/dates';
import type { DayItem } from '../../../engine/timeline';
import { capitalize } from '../../../lib/format';
import { Button, Card, DayTypeBadge, Sheet } from '../../../ui';
import { StatusMark } from './StatusMark';

export interface TomorrowSheetProps {
  open: boolean;
  date: ISODate;
  items: DayItem[];
  dayType: DayType;
  /** Vigilia della partita: il nome del tipo di giorno lo dice. */
  matchEve?: boolean;
  onClose: () => void;
  /** Domani c'è la spesa: la lista si apre da qui. */
  onShopping?: () => void;
}

/**
 * La giornata di domani, già decisa: si apre dalla card Adesso quando resta solo la sera da segnare. Solo lettura,
 * come un'occhiata al tabellone prima di andare a letto.
 */
export function TomorrowSheet({ open, date, items, dayType, matchEve, onClose, onShopping }: TomorrowSheetProps) {
  const list = items.filter((i) => i.kind !== 'letto');
  const shopping = list.some((i) => i.kind === 'spesa') && onShopping;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Domani"
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          {capitalize(formatDayLong(date))}
          <DayTypeBadge dayType={dayType} size="sm" label={matchEve ? 'Vigilia della partita' : undefined} />
        </span>
      }
      footer={
        shopping ? (
          <Button fullWidth size="lg" variant="secondary" icon={ShoppingBasket} onClick={onShopping}>
            Lista della spesa
          </Button>
        ) : undefined
      }
    >
      <Card padding="none" className="px-4">
        <ol className="divide-y divide-line" aria-label="Voci di domani">
          {list.map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-3">
              <span className="t-mono w-[42px] shrink-0 text-[0.75rem] text-ink-3">{i.time}</span>
              <StatusMark item={i} dayType={dayType} size={28} />
              <div className="min-w-0 flex-1">
                <p className="t-callout font-semibold leading-snug text-ink">{i.title}</p>
                {i.detail && <p className="t-footnote mt-0.5 line-clamp-1 text-ink-2">{i.detail}</p>}
                {i.carry && <p className="t-caption mt-0.5 font-medium text-ink-2">Da portare al lavoro</p>}
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </Sheet>
  );
}
