/**
 * Seduta fatta senza il lettore: durata e RPE in due tocchi, così il carico della settimana conta lo stesso.
 * Salva un WorkoutLog senza serie (la progressione dei carichi resta quella dell'ultima seduta registrata).
 */
import { useState } from 'react';
import { Check, Gauge, Play, Timer } from 'lucide-react';
import type { ISODate } from '../../../domain/types';
import { SESSIONS } from '../../../data/sessions';
import { fmtNumber } from '../../../lib/format';
import { uid } from '../../../lib/id';
import { useApp, useUi } from '../../../state/store';
import { Button, Card, Chip, RatingPicker, Sheet, Stepper } from '../../../ui';

const RPE_LABELS = ['Molto facile', 'Facile', 'Moderata', 'Un po’ impegnativa', 'Impegnativa', 'Dura', 'Molto dura', 'Durissima', 'Quasi massimale', 'Massimale'];

export interface QuickWorkoutSheetProps {
  open: boolean;
  date: ISODate;
  sessionId: string;
  itemId: string;
  onClose: () => void;
  onOpenPlayer: () => void;
}

export function QuickWorkoutSheet({ open, date, sessionId, itemId, onClose, onOpenPlayer }: QuickWorkoutSheetProps) {
  const session = SESSIONS[sessionId];
  const planned = session?.estMin ?? 55;
  const [minutes, setMinutes] = useState(planned);
  const [rpe, setRpe] = useState<number | undefined>(undefined);
  const quick = [...new Set([planned - 15, planned, planned + 15].filter((m) => m >= 10))];

  const save = () => {
    if (!rpe) return;
    const app = useApp.getState();
    app.saveWorkout({ id: uid('w'), date, sessionId, durationMin: minutes, rpe, pain: {}, exercises: [], notes: 'Registrata senza serie' });
    app.setItemStatus(date, itemId, 'fatto');
    useUi.getState().toast(`Seduta segnata · carico ${fmtNumber(minutes * rpe)}`, 'good');
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={session?.name ?? `Seduta ${sessionId}`}
      subtitle="Fatta senza registrarla: durata e fatica bastano per il carico"
      footer={
        <div className="flex gap-2.5">
          <Button size="lg" variant="secondary" icon={Play} onClick={onOpenPlayer} className="px-4">
            Lettore
          </Button>
          <Button size="lg" icon={Check} haptic="success" disabled={!rpe} onClick={save} className="min-w-0 flex-1">
            {rpe ? 'Salva' : 'Scegli la fatica'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5 pb-2">
        <Card padding="md" as="section" aria-label="Durata">
          <p className="t-headline flex items-center gap-2 text-ink">
            <Timer size={17} strokeWidth={2.3} aria-hidden className="text-palestra-ink" />
            Durata
          </p>
          <Stepper className="mt-3" label="Durata" hideLabel size="lg" value={minutes} onChange={setMinutes} step={5} min={10} max={180} unit="min" />
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {quick.map((m) => (
              <Chip key={m} selected={minutes === m} onChange={() => setMinutes(m)} className="h-9! px-3.5! text-[0.875rem]!">
                {fmtNumber(m)}
              </Chip>
            ))}
          </div>
        </Card>
        <Card padding="md" as="section" aria-label="Fatica percepita">
          <p className="t-headline flex items-center gap-2 text-ink">
            <Gauge size={17} strokeWidth={2.3} aria-hidden className="text-ink-2" />
            Fatica percepita
          </p>
          <p className="t-footnote mt-0.5 text-ink-3">RPE dell’intera seduta</p>
          <RatingPicker className="mt-3" label="RPE" hideLabel max={10} value={rpe} onChange={setRpe} labels={RPE_LABELS} lowLabel="Molto facile" highLabel="Massimale" />
        </Card>
      </div>
    </Sheet>
  );
}
