import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeftRight, Check, ChefHat, ClipboardList, Flag, HeartPulse, ListChecks, Minus, Play, RotateCcw, ShoppingBasket, Store, Timer } from 'lucide-react';
import type { DayType, HHMM, ItemStatus, MealSlot } from '../../../domain/types';
import type { DayItem, StatusSource } from '../../../engine/timeline';
import { haptic } from '../../../lib/haptics';
import { Button, Chip, Field, ListGroup, ListRow, Sheet, TextArea, cn, spring, springSnappy, toneColor, toneInk, toneRing, toneSoft, type Tone } from '../../../ui';
import { replaceSuggestions } from '../kinds';
import { StatusMark } from './StatusMark';

export interface ItemActionsSheetProps {
  item: DayItem | null;
  dayType: DayType;
  status?: ItemStatus;
  /** La voce della notte non si può ancora segnare: da che ora sì. */
  lockedUntil?: HHMM | null;
  source: StatusSource | null;
  note?: string;
  onClose: () => void;
  onSet: (item: DayItem, status: ItemStatus | null, note?: string) => void;
  onOpenDetail: (item: DayItem) => void;
  /** Apre il piano B al bar sul pasto della voce. */
  onPlanB: (slot?: MealSlot) => void;
}

const CHOICES: { status: ItemStatus; label: string; icon: typeof Check; tone: Tone }[] = [
  { status: 'fatto', label: 'Fatto', icon: Check, tone: 'good' },
  { status: 'sostituito', label: 'Sostituito', icon: ArrowLeftRight, tone: 'warn' },
  { status: 'saltato', label: 'Saltato', icon: Minus, tone: 'neutral' },
];

/** Foglio delle opzioni di una voce: fatto, sostituito con nota, saltato, da fare, e le azioni della voce. */
export function ItemActionsSheet(props: ItemActionsSheetProps) {
  // Tiene l'ultima voce durante l'animazione di chiusura.
  const last = useRef<DayItem | null>(null);
  if (props.item) last.current = props.item;
  const item = props.item ?? last.current;
  return (
    <Sheet
      open={Boolean(props.item)}
      onClose={props.onClose}
      title={item?.title}
      subtitle={item ? [item.time, item.detail].filter(Boolean).join(' · ') : undefined}
      footer={
        <Button variant="secondary" fullWidth size="lg" onClick={props.onClose}>
          Annulla
        </Button>
      }
    >
      {item && <Body key={item.id} {...props} item={item} />}
    </Sheet>
  );
}

function Body({ item, dayType, status, lockedUntil, source, note, onClose, onSet, onOpenDetail, onPlanB }: ItemActionsSheetProps & { item: DayItem }) {
  const [replacing, setReplacing] = useState(status === 'sostituito');
  const [text, setText] = useState(note ?? '');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const suggestions = replaceSuggestions(item);

  useEffect(() => {
    if (replacing && status !== 'sostituito') {
      const id = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 260);
      return () => window.clearTimeout(id);
    }
  }, [replacing, status]);

  const choose = (s: ItemStatus) => {
    if (lockedUntil && s !== 'saltato') {
      haptic('warning');
      return;
    }
    if (s === 'sostituito') {
      haptic('selection');
      setReplacing(true);
      return;
    }
    haptic(s === 'fatto' ? 'success' : 'light');
    onSet(item, s);
    onClose();
  };

  const saveReplace = () => {
    haptic('success');
    onSet(item, 'sostituito', text);
    onClose();
  };

  const detailRow = (() => {
    const go = () => {
      onClose();
      onOpenDetail(item);
    };
    switch (item.kind) {
      case 'pasto':
        return item.ref ? <ListRow key="detail" icon={ChefHat} iconTone={dayType} title="Apri la ricetta" subtitle="Porzioni, passaggi e alternative" onPress={go} /> : null;
      case 'palestra':
        return <ListRow key="detail" icon={Play} iconTone="palestra" title="Apri la seduta" subtitle="Esercizi, serie e carichi suggeriti" onPress={go} />;
      case 'calcio':
        return (
          <ListRow
            key="detail"
            icon={Timer}
            iconTone="calcio"
            title={source === 'registro' ? 'Modifica minuti e RPE' : 'Segna minuti e RPE'}
            subtitle="Servono per il carico della settimana"
            onPress={go}
          />
        );
      case 'controllo':
        return <ListRow key="detail" icon={ClipboardList} iconTone="accent" title={source ? 'Modifica il controllo' : 'Compila il controllo'} onPress={go} />;
      case 'fisio':
        return <ListRow key="detail" icon={HeartPulse} iconTone="neutral" title="Vedi gli esercizi" onPress={go} />;
      case 'spesa':
        return <ListRow key="detail" icon={ShoppingBasket} iconTone="neutral" title="Apri la lista della spesa" subtitle="Per reparto, con le spunte" onPress={go} />;
      case 'preparazione':
        return <ListRow key="detail" icon={ListChecks} iconTone="accent" title="Apri la preparazione" subtitle="Attività, minuti e resa" onPress={go} />;
      case 'revisione':
        return <ListRow key="detail" icon={Flag} iconTone="accent" title="Apri la revisione della settimana" onPress={go} />;
      default:
        return null;
    }
  })();

  const planB =
    item.kind === 'pasto' ? (
      <ListRow
        key="planb"
        icon={Store}
        iconTone="accent"
        title="Piano B al bar"
        subtitle={item.slot === 'colazione' ? 'Cornetto e cappuccino? Ecco cosa scegliere' : 'Cosa prendere se non hai il pasto con te'}
        onPress={() => {
          onClose();
          onPlanB(item.slot);
        }}
      />
    ) : null;

  const reset =
    source === 'diario' ? (
      <ListRow
        key="reset"
        icon={RotateCcw}
        iconTone="neutral"
        title="Segna come da fare"
        chevron={false}
        onPress={() => {
          haptic('selection');
          onSet(item, null);
          onClose();
        }}
      />
    ) : null;

  const rows = [detailRow, planB, reset].filter(Boolean);

  return (
    <div className="flex flex-col gap-5 pb-2">
      {lockedUntil && (
        <p className="t-footnote px-1 text-ink-2">Si segna dalle {lockedUntil}, quando posi davvero il telefono.</p>
      )}
      {source === 'registro' && (
        <div className="flex items-center gap-2.5 px-1">
          <StatusMark item={item} dayType={dayType} status={status} size={22} />
          <p className="t-footnote text-ink-2">Segnata in automatico dalla registrazione.</p>
        </div>
      )}

      <div role="radiogroup" aria-label="Stato della voce" className="grid grid-cols-3 gap-2.5">
        {CHOICES.map((c) => {
          const on = replacing ? c.status === 'sostituito' : status === c.status;
          const color = c.tone === 'neutral' ? 'var(--ink-2)' : toneColor(c.tone);
          const locked = Boolean(lockedUntil) && c.status !== 'saltato';
          return (
            <motion.button
              key={c.status}
              type="button"
              role="radio"
              aria-checked={status === c.status}
              aria-disabled={locked || undefined}
              whileTap={locked ? undefined : { scale: 0.96 }}
              transition={springSnappy}
              onClick={() => choose(c.status)}
              className={cn('flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-[18px] bg-card px-2 shadow-card transition-shadow duration-200', locked && 'opacity-45')}
              style={on ? { boxShadow: `inset 0 0 0 2px ${color}`, background: c.tone === 'neutral' ? 'var(--card)' : toneSoft(c.tone, 10) } : undefined}
            >
              <span
                aria-hidden
                className="grid size-10 place-items-center rounded-full"
                style={{
                  background: c.tone === 'neutral' ? 'var(--ink-soft)' : on ? color : toneSoft(c.tone, 18),
                  boxShadow: c.tone === 'neutral' || on ? undefined : toneRing(c.tone),
                  color: c.tone === 'neutral' ? 'var(--ink-2)' : on ? `var(--on-${c.tone})` : toneInk(c.tone),
                }}
              >
                <c.icon size={20} strokeWidth={2.6} />
              </span>
              <span className={cn('t-footnote font-semibold', on ? 'text-ink' : 'text-ink-2')}>{c.label}</span>
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {replacing && (
          <motion.div
            key="replace"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-card">
              <Field label="Cosa hai fatto al posto?" optional>
                <TextArea
                  ref={inputRef}
                  value={text}
                  onChange={setText}
                  rows={2}
                  maxLength={140}
                  placeholder={item.kind === 'pasto' ? 'Es. panino con bresaola al bar' : 'Una nota breve'}
                  enterKeyHint="done"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      saveReplace();
                    }
                  }}
                />
              </Field>
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <Chip key={s} selected={text === s} onChange={(on) => setText(on ? s : '')} className="h-9 px-3.5 text-[0.875rem]">
                      {s}
                    </Chip>
                  ))}
                </div>
              )}
              <Button icon={ArrowLeftRight} fullWidth onClick={saveReplace} haptic={false}>
                Segna come sostituito
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {rows.length > 0 && <ListGroup>{rows}</ListGroup>}
    </div>
  );
}
