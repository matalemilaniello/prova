/**
 * Esercizi del fisioterapista: aggiungi, modifica, elimina, con serie, ripetizioni o secondi, recupero
 * e giorni della settimana. Legge e scrive direttamente lo stato (setPhysio, setScheduleDay).
 *
 * Uso:
 *   <PhysioEditor />                                  contenuto da mettere in una pagina (es. Impostazioni)
 *   <PhysioEditor open={o} onClose={…} />             lo stesso dentro un foglio dal basso
 *   <PhysioEditorSheet open={o} onClose={…} />        equivalente, esplicito
 */
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, HeartPulse, Plus, Trash2 } from 'lucide-react';
import type { Exercise, SessionExercise, Weekday } from '../../domain/types';
import { WEEKDAY_INITIAL, WEEKDAY_LONG } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { uid } from '../../lib/id';
import { useApp, useUi } from '../../state/store';
import { Button, Card, EmptyState, Field, Segmented, Sheet, Stepper, TextArea, TextInput, Toggle, cn, springSnappy, staggerItem } from '../../ui';
import { doseLabel, restLabel } from './lib';

export interface PhysioEditorProps {
  /** Mostra la scelta dei giorni (default true). */
  showDays?: boolean;
  className?: string;
  /** Se indicato, l'editor si apre in un foglio dal basso (come PhysioEditorSheet). */
  open?: boolean;
  onClose?: () => void;
}

interface FormState {
  name: string;
  unit: 'reps' | 'secondi';
  sets: number;
  repMin: number;
  repMax: number;
  perSide: boolean;
  restSec: number;
  equipment: string;
  cues: string;
  note: string;
}

const EMPTY_FORM: FormState = { name: '', unit: 'reps', sets: 3, repMin: 10, repMax: 15, perSide: false, restSec: 45, equipment: '', cues: '', note: '' };

function toForm(ex: Exercise | undefined, p: SessionExercise): FormState {
  return {
    name: ex?.name ?? '',
    unit: p.unit,
    sets: p.sets,
    repMin: p.repMin,
    repMax: p.repMax,
    perSide: Boolean(p.perSide),
    restSec: p.restSec,
    equipment: ex?.equipment ?? '',
    cues: (ex?.cues ?? []).join('\n'),
    note: p.note ?? '',
  };
}

/** Elenco degli esercizi del fisioterapista con aggiunta, modifica e giorni. */
export default function PhysioEditor({ open, onClose, ...rest }: PhysioEditorProps) {
  if (open !== undefined) return <PhysioEditorSheet open={open} onClose={onClose ?? (() => undefined)} />;
  return <PhysioEditorContent {...rest} />;
}

function PhysioEditorContent({ showDays = true, className }: Omit<PhysioEditorProps, 'open' | 'onClose'>) {
  const physio = useApp((s) => s.physio);
  const week = useApp((s) => s.plan.week);
  const [editing, setEditing] = useState<{ index: number | null; session: number } | null>(null);
  const byId = new Map(physio.exercises.map((e) => [e.id, e]));
  const list = physio.prescriptions.map((p, i) => ({ p, ex: byId.get(p.exerciseId), i }));
  const openNew = () => setEditing((e) => ({ index: null, session: (e?.session ?? 0) + 1 }));

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <section className="flex flex-col gap-2" aria-label="Esercizi del fisioterapista">
        {list.length ? (
          <>
            <ul className="overflow-hidden rounded-card bg-card shadow-card">
              {list.map(({ p, ex, i }, n) => (
                <motion.li key={`${p.exerciseId}-${i}`} {...staggerItem(n)} className={cn(n > 0 && 'border-t border-line')}>
                  <button
                    type="button"
                    onClick={() => {
                      haptic('selection');
                      setEditing((e) => ({ index: i, session: (e?.session ?? 0) + 1 }));
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-ink-soft"
                  >
                    <span
                      className="grid size-[30px] shrink-0 place-items-center rounded-[9px]"
                      style={{ background: 'color-mix(in srgb, var(--leggero) 18%, transparent)', color: 'var(--leggero)' }}
                      aria-hidden
                    >
                      <HeartPulse size={17} strokeWidth={2.2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="t-callout block font-medium text-ink">{ex?.name ?? 'Esercizio senza nome'}</span>
                      <span className="t-footnote mt-0.5 block text-leggero-ink tabular">
                        {doseLabel(p)} · recupero {restLabel(p.restSec)}
                      </span>
                      {p.note && <span className="t-footnote mt-1 block text-ink-3">{p.note}</span>}
                    </span>
                    <ChevronRight size={18} strokeWidth={2.2} className="-mr-1 shrink-0 text-ink-3" aria-hidden />
                  </button>
                </motion.li>
              ))}
            </ul>
            <Button variant="secondary" icon={Plus} fullWidth onClick={openNew}>
              Aggiungi esercizio
            </Button>
          </>
        ) : (
          <Card padding="none">
            <EmptyState
              compact
              icon={HeartPulse}
              title="Nessun esercizio del fisioterapista"
              text="Aggiungi quelli che ti ha dato: li trovi nella giornata e in fondo alle sedute di palestra."
              action={
                <Button icon={Plus} onClick={openNew}>
                  Aggiungi esercizio
                </Button>
              }
            />
          </Card>
        )}
      </section>

      {showDays && (
        <section className="flex flex-col gap-2" aria-labelledby="fisio-giorni">
          <h3 id="fisio-giorni" className="t-label px-1 text-ink-3">
            Giorni
          </h3>
          <Card padding="md">
            <div className="flex justify-between gap-1.5" role="group" aria-label="Giorni degli esercizi del fisioterapista">
              {week.map((d) => (
                <DayToggle key={d.weekday} weekday={d.weekday} on={Boolean(d.physio)} />
              ))}
            </div>
          </Card>
          <p className="t-footnote px-1 text-ink-3">Nei giorni scelti compaiono nella timeline di Oggi. Nelle sedute di palestra li trovi sempre, in fondo.</p>
        </section>
      )}

      {editing && (
        <PhysioExerciseSheet key={editing.session} index={editing.index} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

export { PhysioEditor };

function DayToggle({ weekday, on }: { weekday: Weekday; on: boolean }) {
  return (
    <motion.button
      type="button"
      aria-pressed={on}
      aria-label={WEEKDAY_LONG[weekday]}
      whileTap={{ scale: 0.9 }}
      transition={springSnappy}
      onClick={() => {
        haptic('selection');
        useApp.getState().setScheduleDay(weekday, { physio: !on });
      }}
      className={cn('t-num grid size-10 place-items-center rounded-full text-[1.125rem] transition-colors duration-150', on ? 'text-[var(--on-leggero)]' : 'bg-control text-ink-2')}
      style={on ? { background: 'var(--leggero)', boxShadow: '0 4px 14px -6px var(--leggero)' } : undefined}
    >
      {WEEKDAY_INITIAL[weekday]}
    </motion.button>
  );
}

/** Lo stesso editor dentro un foglio dal basso. */
export function PhysioEditorSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} size="large" title="Esercizi del fisioterapista" subtitle="Dosi e giorni come te li ha indicati.">
      <PhysioEditorContent className="pb-4" />
    </Sheet>
  );
}

// ───────────────────────── Modifica di un esercizio ─────────────────────────

function PhysioExerciseSheet({ index, onClose }: { index: number | null; onClose: () => void }) {
  const physio = useApp((s) => s.physio);
  const toast = useUi((s) => s.toast);
  const existing = index !== null ? physio.prescriptions[index] : undefined;
  const ex = existing ? physio.exercises.find((e) => e.id === existing.exerciseId) : undefined;
  const [open, setOpen] = useState(true);
  const [form, setForm] = useState<FormState>(() => (existing ? toForm(ex, existing) : EMPTY_FORM));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tried, setTried] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const nameError = tried && !form.name.trim() ? "Scrivi il nome dell’esercizio." : undefined;

  // Chiusura animata: il foglio esce, poi il genitore lo smonta.
  const close = () => setOpen(false);
  useEffect(() => {
    if (open) return;
    const id = window.setTimeout(onClose, 320);
    return () => window.clearTimeout(id);
  }, [open, onClose]);

  const save = () => {
    setTried(true);
    const name = form.name.trim();
    if (!name) {
      haptic('warning');
      return;
    }
    const id = existing?.exerciseId ?? `fisio_${uid()}`;
    const exercise: Exercise = {
      ...(ex ?? {}),
      id,
      name,
      category: 'fisio',
      equipment: form.equipment.trim() || 'Corpo libero',
      cues: form.cues
        .split('\n')
        .map((c) => c.trim())
        .filter(Boolean),
      elbowFriendly: ex?.elbowFriendly ?? true,
    };
    const repMin = Math.min(form.repMin, form.repMax);
    const repMax = Math.max(form.repMin, form.repMax);
    const prescription: SessionExercise = {
      ...(existing ?? {}),
      exerciseId: id,
      sets: form.sets,
      repMin,
      repMax,
      unit: form.unit,
      restSec: form.restSec,
      progression: 'nessuna',
      perSide: form.perSide || undefined,
      note: form.note.trim() || undefined,
    };
    const exercises = ex ? physio.exercises.map((e) => (e.id === id ? exercise : e)) : [...physio.exercises, exercise];
    const prescriptions = index !== null ? physio.prescriptions.map((p, i) => (i === index ? prescription : p)) : [...physio.prescriptions, prescription];
    useApp.getState().setPhysio(exercises, prescriptions);
    haptic('success');
    toast(existing ? 'Esercizio aggiornato' : 'Esercizio aggiunto', 'good');
    close();
  };

  const remove = () => {
    if (index === null || !existing) return;
    if (!confirmDelete) {
      haptic('warning');
      setConfirmDelete(true);
      return;
    }
    const before = useApp.getState().physio;
    const stillUsed = before.prescriptions.some((p, i) => i !== index && p.exerciseId === existing.exerciseId);
    useApp.getState().setPhysio(
      stillUsed ? before.exercises : before.exercises.filter((e) => e.id !== existing.exerciseId),
      before.prescriptions.filter((_, i) => i !== index),
    );
    toast('Esercizio eliminato', 'neutral', { actionLabel: 'Annulla', onAction: () => useApp.getState().setPhysio(before.exercises, before.prescriptions) });
    close();
  };

  const timed = form.unit === 'secondi';
  const step = timed ? 5 : 1;
  const unit = timed ? 's' : 'rip.';

  return (
    <Sheet
      open={open}
      onClose={close}
      size="large"
      title={existing ? 'Modifica esercizio' : 'Nuovo esercizio'}
      subtitle="Dal fisioterapista"
      footer={
        <Button fullWidth size="lg" onClick={save}>
          {existing ? 'Salva le modifiche' : 'Aggiungi'}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-4">
        <Field label="Nome" error={nameError}>
          <TextInput value={form.name} onChange={(v) => set('name', v)} placeholder="Es. Isometria del soleo al muro" autoComplete="off" enterKeyHint="done" maxLength={80} />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="t-footnote px-1 font-semibold text-ink-2">Si misura in</span>
          <Segmented
            aria-label="Unità"
            fullWidth
            value={form.unit}
            onChange={(v) => {
              const u = v as FormState['unit'];
              setForm((f) =>
                u === f.unit ? f : u === 'secondi' ? { ...f, unit: u, repMin: 30, repMax: 45 } : { ...f, unit: u, repMin: 10, repMax: 15 },
              );
            }}
            options={[
              { value: 'reps', label: 'Ripetizioni' },
              { value: 'secondi', label: 'Secondi' },
            ]}
          />
        </div>

        <Card padding="md" className="flex flex-col gap-5">
          <Stepper label="Serie" min={1} max={10} value={form.sets} onChange={(v) => set('sets', v)} />
          <div className="grid grid-cols-2 gap-4">
            <Stepper
              label={timed ? 'Da (secondi)' : 'Da'}
              unit={unit}
              min={1}
              max={timed ? 600 : 100}
              step={step}
              value={form.repMin}
              onChange={(v) => setForm((f) => ({ ...f, repMin: v, repMax: Math.max(v, f.repMax) }))}
            />
            <Stepper
              label={timed ? 'A (secondi)' : 'A'}
              unit={unit}
              min={1}
              max={timed ? 600 : 100}
              step={step}
              value={form.repMax}
              onChange={(v) => setForm((f) => ({ ...f, repMax: v, repMin: Math.min(v, f.repMin) }))}
            />
          </div>
          <Stepper label="Recupero" min={0} max={300} step={15} value={form.restSec} format={restLabel} onChange={(v) => set('restSec', v)} />
          <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
            <div>
              <p className="t-callout font-medium text-ink" id="fisio-lato">
                Per lato
              </p>
              <p className="t-footnote text-ink-3">Una gamba o un braccio alla volta</p>
            </div>
            <Toggle checked={form.perSide} onChange={(v) => set('perSide', v)} aria-labelledby="fisio-lato" />
          </div>
        </Card>

        <p className="t-footnote -mt-2 px-1 text-ink-2">
          Riepilogo: <span className="font-semibold text-ink">{doseLabel({ ...form, exerciseId: '', progression: 'nessuna', repMin: Math.min(form.repMin, form.repMax), repMax: Math.max(form.repMin, form.repMax) })}</span>, recupero {restLabel(form.restSec)}
        </p>

        <Field label="Attrezzatura" optional>
          <TextInput value={form.equipment} onChange={(v) => set('equipment', v)} placeholder="Es. muro, elastico, manubrio leggero" maxLength={60} />
        </Field>
        <Field label="Indicazioni" optional hint="Una per riga: compaiono durante la seduta.">
          <TextArea value={form.cues} onChange={(v) => set('cues', v)} rows={3} placeholder={'Ginocchio sopra le dita\nScendi in 3 secondi'} maxLength={400} />
        </Field>
        <Field label="Nota del fisioterapista" optional>
          <TextInput value={form.note} onChange={(v) => set('note', v)} placeholder="Es. dolore fino a 3 su 10 accettabile" maxLength={120} />
        </Field>

        {existing && (
          <Button variant="danger" icon={Trash2} fullWidth onClick={remove}>
            {confirmDelete ? 'Tocca di nuovo per eliminare' : 'Elimina esercizio'}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
