/**
 * Recupero delle voci rimaste indietro: il foglio "Recupera" per oggi (il pomeriggio) e per le voci di ieri ancora
 * aperte il mattino dopo, aperto da una riga compatta (`RecoverLink`), così il mattino resta della card Adesso. Ogni
 * riga del foglio ha Fatto, Sostituito e Saltato in linea (coprifuoco, letto e telefono fuori solo Fatto e Saltato).
 */
import { useRef } from 'react';
import { CheckCheck, ChevronRight } from 'lucide-react';
import type { DayType, ISODate, ItemStatus } from '../../../domain/types';
import type { DayItem } from '../../../engine/timeline';
import { haptic } from '../../../lib/haptics';
import { plural } from '../../../lib/format';
import { useApp, useUi } from '../../../state/store';
import { Button, Card, Sheet, cn } from '../../../ui';
import { canReplace } from '../kinds';
import { setItemStatusSynced } from '../shoppingSync';
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

/** Riga con le scelte in linea; toccare la scelta attiva la toglie. */
export function CatchUpRow({ item, dayType, status, onSet, onOpen }: CatchUpRowProps) {
  const data = Boolean(onOpen) && needsData(item) && !status;
  // Senza un'alternativa sensata restano Fatto (largo, come l'azione dei pannelli) e Saltato.
  const twoWay = !canReplace(item) && status !== 'sostituito';
  const choices = twoWay ? CHOICES.filter((c) => c.status !== 'sostituito') : CHOICES;
  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
        <StatusMark item={item} dayType={dayType} status={status} size={28} />
        {/* "Cena di recupero, veloce e digeribile" si legge "Cena di recupero": la riga resta intera. */}
        <p className="t-callout min-w-0 flex-1 truncate font-semibold text-ink">{item.title.split(',')[0]}</p>
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
        {choices.map((c) => {
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
                twoWay && c.status === 'fatto' && 'col-span-2',
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
  subtitle?: string;
  onClose: () => void;
  /** Apre il pannello di una voce con dati (il foglio si chiude prima). */
  onOpen: (item: DayItem) => void;
}

/** Foglio "Recupera": tutte le voci rimaste indietro in un colpo, con un solo Annulla alla fine. */
export function RecoverSheet({
  open,
  date,
  items,
  dayType,
  title = 'Recupera',
  subtitle = 'Un tocco per voce. Annulli tutto con una sola notifica.',
  onClose,
  onOpen,
}: RecoverSheetProps) {
  const statusOf = useApp((s) => s.dayLogs[date]?.status);
  // Stati di partenza, per l'Annulla unico.
  const before = useRef<Record<string, ItemStatus | undefined> | null>(null);
  if (open && !before.current) before.current = Object.fromEntries(items.map((i) => [i.id, statusOf?.[i.id]]));

  const set = (item: DayItem, st: ItemStatus | null) => setItemStatusSynced(date, item, st);

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
        for (const i of changed) setItemStatusSynced(date, i, start[i.id] ?? null);
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
      subtitle={subtitle}
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

/**
 * Riga compatta che apre il foglio del recupero: "3 voci rimaste indietro · Recupera" oggi, "5 voci di ieri da
 * segnare · Sistema" il mattino dopo. Un puntino ambra, il conto e l'azione: niente pulsanti grandi che tolgano il
 * posto alla card Adesso.
 */
export function RecoverLink({ text, action, onPress, className }: { text: string; action: string; onPress: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-haspopup="dialog"
      className={cn(
        't-footnote -mx-1 flex min-h-11 w-[calc(100%+8px)] items-center gap-2.5 rounded-control px-1 text-left font-medium text-ink-2 transition-colors duration-150 active:bg-ink-soft',
        className,
      )}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-warn" />
      <span className="min-w-0 flex-1">{text}</span>
      <span className="font-semibold text-accent-ink">{action}</span>
      <ChevronRight size={16} strokeWidth={2.4} className="-ml-1 shrink-0 text-accent-ink" aria-hidden />
    </button>
  );
}

/** "Una voce di ieri da segnare", "5 voci di ieri da segnare". */
export function yesterdayText(n: number): string {
  return n === 1 ? 'Una voce di ieri da segnare' : `${n} voci di ieri da segnare`;
}
