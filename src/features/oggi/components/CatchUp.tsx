/**
 * Recupero delle voci rimaste indietro: il foglio "Recupera" per oggi (il pomeriggio) e la card "Ieri sera" per
 * sistemare la giornata precedente il mattino dopo. Ogni riga ha Fatto, Sostituito e Saltato in linea.
 */
import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCheck } from 'lucide-react';
import type { DayType, ISODate, ItemStatus } from '../../../domain/types';
import type { DayItem } from '../../../engine/timeline';
import { formatWeekday } from '../../../engine/dates';
import { haptic } from '../../../lib/haptics';
import { plural } from '../../../lib/format';
import { useApp, useUi } from '../../../state/store';
import { Button, Card, Sheet, cn, spring } from '../../../ui';
import { BOARD_LABEL } from '../kinds';
import { StatusMark } from './StatusMark';

const CHOICES: { status: ItemStatus; label: string }[] = [
  { status: 'fatto', label: 'Fatto' },
  { status: 'sostituito', label: 'Sostituito' },
  { status: 'saltato', label: 'Saltato' },
];

/** Voci che si segnano con dei dati (controllo, minuti e RPE): "Fatto" apre il loro pannello. */
export function needsData(item: DayItem): boolean {
  return item.kind === 'controllo' || item.kind === 'calcio' || item.kind === 'palestra';
}

const OPEN_LABEL: Partial<Record<DayItem['kind'], string>> = { controllo: 'Compila', calcio: 'Minuti e RPE', palestra: 'Durata e RPE' };

export interface CatchUpRowProps {
  item: DayItem;
  dayType: DayType;
  status?: ItemStatus;
  onSet: (item: DayItem, status: ItemStatus | null) => void;
  /** Per le voci con dati: apre il pannello al posto di Fatto e Sostituito. */
  onOpen?: (item: DayItem) => void;
}

/** Riga con le tre scelte in linea; toccare la scelta attiva la toglie. */
export function CatchUpRow({ item, dayType, status, onSet, onOpen }: CatchUpRowProps) {
  const data = Boolean(onOpen) && needsData(item) && !status;
  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
        <StatusMark item={item} dayType={dayType} status={status} size={28} />
        <p className="t-callout min-w-0 flex-1 truncate font-semibold text-ink">{item.title}</p>
        <span className="t-mono shrink-0 text-[0.75rem] text-ink-3">{item.time}</span>
      </div>
      {data ? (
        <div className="mt-2.5 grid grid-cols-3 gap-2 pl-10">
          <button
            type="button"
            onClick={() => onOpen?.(item)}
            className="t-footnote col-span-2 h-11 rounded-[12px] bg-accent font-semibold text-on-accent transition-transform duration-150 active:scale-95"
          >
            {OPEN_LABEL[item.kind] ?? 'Apri'}
          </button>
          <button
            type="button"
            onClick={() => {
              haptic('selection');
              onSet(item, 'saltato');
            }}
            className="t-footnote h-11 rounded-[12px] bg-control font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--control-line)] transition-transform duration-150 active:scale-95"
          >
            Saltato
          </button>
        </div>
      ) : (
      <div role="radiogroup" aria-label={`Stato: ${item.title}`} className="mt-2.5 grid grid-cols-3 gap-2 pl-10">
        {CHOICES.map((c) => {
          const on = status === c.status;
          return (
            <button
              key={c.status}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                haptic(c.status === 'fatto' && !on ? 'success' : 'selection');
                onSet(item, on ? null : c.status);
              }}
              className={cn(
                't-footnote h-11 min-w-0 rounded-[12px] px-1 font-semibold transition-[transform,background-color,box-shadow] duration-150 active:scale-95',
                on
                  ? c.status === 'fatto'
                    ? 'bg-good text-[var(--on-good)]'
                    : c.status === 'sostituito'
                      ? 'bg-warn text-[var(--on-warn)]'
                      : 'bg-ink-2 text-bg'
                  : 'bg-control text-ink-2 shadow-[inset_0_0_0_1px_var(--control-line)]',
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      )}
    </div>
  );
}

export interface RecoverSheetProps {
  open: boolean;
  date: ISODate;
  /** Voci da recuperare (istantanea all'apertura: restano in elenco anche dopo la scelta). */
  items: DayItem[];
  dayType: DayType;
  title?: string;
  onClose: () => void;
  /** Apre il pannello di una voce con dati (il foglio si chiude prima). */
  onOpen: (item: DayItem) => void;
}

/** Foglio "Recupera": tutte le voci rimaste indietro in un colpo, con un solo Annulla alla fine. */
export function RecoverSheet({ open, date, items, dayType, title = 'Recupera', onClose, onOpen }: RecoverSheetProps) {
  const statusOf = useApp((s) => s.dayLogs[date]?.status);
  // Stati di partenza, per l'Annulla unico.
  const before = useRef<Record<string, ItemStatus | undefined> | null>(null);
  if (open && !before.current) before.current = Object.fromEntries(items.map((i) => [i.id, statusOf?.[i.id]]));

  const set = (item: DayItem, st: ItemStatus | null) => useApp.getState().setItemStatus(date, item.id, st);

  const finish = () => {
    const start = before.current ?? {};
    before.current = null;
    const now = useApp.getState().dayLogs[date]?.status ?? {};
    const changed = items.filter((i) => now[i.id] !== start[i.id]);
    onClose();
    if (!changed.length) return;
    useUi.getState().toast(`Segnate ${plural(changed.length, 'voce', 'voci')}`, 'good', {
      actionLabel: 'Annulla',
      onAction: () => {
        for (const i of changed) useApp.getState().setItemStatus(date, i.id, start[i.id] ?? null);
      },
    });
  };

  const allDone = () => {
    haptic('success');
    for (const i of items) if (!needsData(i) && !useApp.getState().dayLogs[date]?.status?.[i.id]) set(i, 'fatto');
    finish();
  };

  return (
    <Sheet
      open={open}
      onClose={finish}
      title={title}
      subtitle="Un tocco per voce. Annulli tutto con una sola notifica."
      footer={
        <Button fullWidth size="lg" icon={CheckCheck} onClick={allDone} haptic={false}>
          Tutto fatto
        </Button>
      }
    >
      <Card padding="none" className="px-4">
        <div className="divide-y divide-line">
          {items.map((it) => (
            <CatchUpRow
              key={it.id}
              item={it}
              dayType={dayType}
              status={statusOf?.[it.id]}
              onSet={set}
              onOpen={(i) => {
                finish();
                onOpen(i);
              }}
            />
          ))}
        </div>
      </Card>
    </Sheet>
  );
}

export interface YesterdayCardProps {
  date: ISODate;
  items: DayItem[];
  dayType: DayType;
  onMore: () => void;
  onOpen: (item: DayItem) => void;
}

const INLINE = 3;

/** La mattina: le voci di ieri ancora aperte, da sistemare prima che la serie si spezzi per una dimenticanza. */
export function YesterdayCard({ date, items, dayType, onMore, onOpen }: YesterdayCardProps) {
  const statusOf = useApp((s) => s.dayLogs[date]?.status);
  // Le righe restano finché la card è montata: si vede la scelta, poi la card sparisce da sola.
  const [shown] = useState(() => items.slice(-INLINE));
  const rest = items.length - shown.filter((i) => items.some((x) => x.id === i.id)).length;
  const evening = shown.every((i) => Number(i.time.slice(0, 2)) >= 17 || Number(i.time.slice(0, 2)) < 5);
  const set = (item: DayItem, st: ItemStatus | null) => useApp.getState().setItemStatus(date, item.id, st);

  return (
    <Card padding="none" as="section" aria-labelledby="oggi-ieri" className="overflow-hidden">
      <div className="px-4 pt-4">
        <h2 id="oggi-ieri" className={cn(BOARD_LABEL, 'text-ink-3')}>
          {evening ? 'Ieri sera' : `Ieri, ${formatWeekday(date)}`}
        </h2>
        <p className="t-footnote mt-1.5 text-ink-2">
          {plural(items.length, 'voce ancora aperta', 'voci ancora aperte')}. Segnale adesso: una dimenticanza non deve spezzare la serie.
        </p>
      </div>
      <div className="divide-y divide-line px-4">
        <AnimatePresence initial={false}>
          {shown.map((it) => (
            <motion.div key={it.id} layout transition={spring}>
              <CatchUpRow item={it} dayType={dayType} status={statusOf?.[it.id]} onSet={set} onOpen={onOpen} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {rest > 0 && (
        <button
          type="button"
          onClick={onMore}
          className="t-footnote flex min-h-11 w-full items-center justify-center border-t border-line font-semibold text-accent-ink"
        >
          {`Altre ${rest} di ieri`}
        </button>
      )}
    </Card>
  );
}
