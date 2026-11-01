/**
 * Integratori: elenco con interruttore "attivo" e foglio per aggiungere o modificare.
 * Condiviso da Benvenuto (bozza locale) e Impostazioni (stato salvato).
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Pill as PillIcon, Plus, Trash2 } from 'lucide-react';
import type { Supplement } from '../../../domain/types';
import { doseUndefined } from '../../../engine/timeline';
import { haptic } from '../../../lib/haptics';
import { uid } from '../../../lib/id';
import { Button, EmptyState, Field, Sheet, TextArea, TextInput, Toggle, cn, staggerItem } from '../../../ui';
import { TIMING_OPTIONS, TIMING_TEXT, sortSupplements } from '../lib';
import { CompactChoice, FormRow, InlineReveal } from './controls';

/** Chiude un foglio con l'animazione, poi avvisa il genitore (che lo smonta). */
export function useClosingSheet(onClosed: () => void, delay = 340): [boolean, () => void] {
  const [open, setOpen] = useState(true);
  const cb = useRef(onClosed);
  cb.current = onClosed;
  useEffect(() => {
    if (open) return;
    const t = window.setTimeout(() => cb.current(), delay);
    return () => window.clearTimeout(t);
  }, [open, delay]);
  return [open, () => setOpen(false)];
}

// ───────────────────────── Elenco ─────────────────────────

export interface SupplementListProps {
  supplements: Supplement[];
  onToggle: (id: string, active: boolean) => void;
  onEdit: (s: Supplement) => void;
  onAdd: () => void;
  className?: string;
}

export function SupplementList({ supplements, onToggle, onEdit, onAdd, className }: SupplementListProps) {
  const list = sortSupplements(supplements);
  if (!list.length) {
    return (
      <div className={cn('rounded-card bg-card shadow-card', className)}>
        <EmptyState
          compact
          icon={PillIcon}
          title="Nessun integratore"
          text="Aggiungi quelli che prendi: compaiono nella giornata con il pasto giusto, così non li dimentichi."
          action={
            <Button icon={Plus} size="sm" onClick={onAdd}>
              Aggiungi integratore
            </Button>
          }
        />
      </div>
    );
  }
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <ul className="overflow-hidden rounded-card bg-card shadow-card">
        {list.map((s, i) => (
          <motion.li
            key={s.id}
            {...staggerItem(i, 0.03)}
            className={cn('flex items-center gap-1 pr-4', i > 0 && 'relative before:absolute before:left-[58px] before:right-0 before:top-0 before:h-px before:bg-line')}
          >
            <motion.button
              type="button"
              whileTap={{ backgroundColor: 'var(--ink-soft)' }}
              onClick={() => {
                haptic('selection');
                onEdit(s);
              }}
              aria-label={`Modifica ${s.name}`}
              className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 rounded-r-[14px] py-2.5 pl-4 pr-2 text-left"
            >
              <span
                aria-hidden
                className="grid size-[30px] shrink-0 place-items-center rounded-[9px] transition-colors duration-200"
                style={{
                  background: s.active ? 'color-mix(in srgb, var(--leggero) 18%, transparent)' : 'var(--ink-soft)',
                  color: s.active ? 'var(--leggero)' : 'var(--ink-3)',
                }}
              >
                <PillIcon size={17} strokeWidth={2.2} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn('t-callout font-medium transition-colors duration-200', s.active ? 'text-ink' : 'text-ink-3')}>{s.name}</span>
                <span className="t-footnote mt-0.5 text-ink-2">
                  {[s.dose, TIMING_TEXT[s.timing]].filter(Boolean).join(' · ')}
                </span>
                {s.active && doseUndefined(s) && (
                  <span className="t-footnote mt-1 font-medium text-warn-ink">Finché manca la dose non entra nella giornata</span>
                )}
              </span>
              <ChevronRight aria-hidden size={16} strokeWidth={2.2} className="shrink-0 text-ink-3" />
            </motion.button>
            <Toggle label={`${s.name} attivo`} checked={s.active} onChange={(on) => onToggle(s.id, on)} tone="good" />
          </motion.li>
        ))}
      </ul>
      <Button variant="secondary" icon={Plus} fullWidth onClick={onAdd}>
        Aggiungi integratore
      </Button>
    </div>
  );
}

// ───────────────────────── Foglio di modifica ─────────────────────────

export interface SupplementSheetProps {
  /** Integratore da modificare; null per uno nuovo. */
  supplement: Supplement | null;
  onSave: (s: Supplement) => void;
  onDelete?: (id: string) => void;
  /** Chiamata a chiusura completata (il genitore smonta il foglio). */
  onClosed: () => void;
}

export function SupplementSheet({ supplement, onSave, onDelete, onClosed }: SupplementSheetProps) {
  const [open, close] = useClosingSheet(onClosed);
  const [name, setName] = useState(supplement?.name ?? '');
  const [dose, setDose] = useState(supplement?.dose ?? '');
  const [timing, setTiming] = useState<Supplement['timing']>(supplement?.timing ?? 'colazione');
  const [note, setNote] = useState(supplement?.note ?? '');
  const [active, setActive] = useState(supplement?.active ?? true);
  const [tried, setTried] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const nameError = tried && !name.trim() ? 'Scrivi il nome, ad esempio Creatina monoidrato.' : undefined;
  const doseError = tried && !dose.trim() ? 'Scrivi la dose, ad esempio 5 g.' : undefined;

  const save = () => {
    setTried(true);
    if (!name.trim() || !dose.trim()) {
      haptic('warning');
      if (!name.trim()) nameRef.current?.focus();
      return;
    }
    onSave({
      id: supplement?.id ?? uid('sup'),
      name: name.trim().replace(/\s+/g, ' '),
      dose: dose.trim(),
      timing,
      note: note.trim() || undefined,
      active,
    });
    haptic('success');
    close();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={supplement ? 'Modifica integratore' : 'Nuovo integratore'}
      initialFocus={supplement ? undefined : nameRef}
      footer={
        <Button fullWidth size="lg" onClick={save}>
          {supplement ? 'Salva' : 'Aggiungi'}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <Field label="Nome" error={nameError}>
          <TextInput ref={nameRef} value={name} onChange={setName} placeholder="Es. Creatina monoidrato" autoCapitalize="sentences" maxLength={60} />
        </Field>
        <Field label="Dose" error={doseError} hint="Come te l’hanno indicata: grammi, capsule, gocce.">
          <TextInput value={dose} onChange={setDose} placeholder="Es. 5 g" maxLength={60} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="t-footnote px-1 font-semibold text-ink-2">Quando</span>
          <CompactChoice aria-label="Quando prenderlo" value={timing} onChange={setTiming} options={TIMING_OPTIONS} />
          <p className="t-footnote px-1 text-ink-3">
            {timing === 'sera' ? 'Compare insieme al coprifuoco del telefono.' : `Compare nella giornata insieme al pasto: ${TIMING_TEXT[timing]}.`}
          </p>
        </div>
        <Field label="Nota" optional>
          <TextArea value={note} onChange={setNote} rows={2} placeholder="Es. con un bicchiere d’acqua" maxLength={160} />
        </Field>
        <div className="overflow-hidden rounded-card bg-card shadow-card">
          <FormRow label="Attivo" hint="Se lo sospendi resta nell’elenco ma sparisce dalla giornata">
            <Toggle label="Integratore attivo" checked={active} onChange={setActive} tone="good" />
          </FormRow>
        </div>

        {supplement && onDelete && (
          <div className="flex flex-col gap-2">
            {!confirmDelete && (
              <Button variant="ghost" icon={Trash2} className="self-center !text-bad-ink" onClick={() => setConfirmDelete(true)}>
                Elimina integratore
              </Button>
            )}
            <InlineReveal open={confirmDelete}>
              <div className="flex flex-col gap-3 rounded-[16px] bg-bad-soft p-4" role="alert">
                <p className="t-callout text-ink">
                  Eliminare <strong className="font-semibold">{supplement.name}</strong>? Sparisce dalla giornata e dai promemoria.
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(false)}>
                    Annulla
                  </Button>
                  <Button
                    variant="danger"
                    className="flex-1"
                    icon={Trash2}
                    onClick={() => {
                      onDelete(supplement.id);
                      haptic('warning');
                      close();
                    }}
                  >
                    Elimina
                  </Button>
                </div>
              </div>
            </InlineReveal>
          </div>
        )}
      </div>
    </Sheet>
  );
}
