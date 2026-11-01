import { Check, HeartPulse, Settings } from 'lucide-react';
import type { AppData, Exercise, SessionExercise } from '../../../domain/types';
import { EXERCISES } from '../../../data/exercises';
import { fmtMinutes } from '../../../lib/format';
import { Button, Card, EmptyState, Sheet } from '../../../ui';

export interface PhysioSheetProps {
  open: boolean;
  physio: AppData['physio'];
  minutes: number;
  done: boolean;
  onClose: () => void;
  onDone: () => void;
  onSettings: () => void;
}

function dose(p: SessionExercise): string {
  const reps = p.repMin === p.repMax ? `${p.repMin}` : `${p.repMin}-${p.repMax}`;
  const unit = p.unit === 'secondi' ? ' s' : '';
  return `${p.sets} × ${reps}${unit}${p.perSide ? ' per lato' : ''}`;
}

/** Esercizi del fisioterapista di oggi, con dosi e indicazioni. */
export function PhysioSheet({ open, physio, minutes, done, onClose, onDone, onSettings }: PhysioSheetProps) {
  const byId = new Map<string, Exercise>(physio.exercises.map((e) => [e.id, e]));
  const list = physio.prescriptions.map((p) => ({ p, ex: byId.get(p.exerciseId) ?? EXERCISES[p.exerciseId] }));
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Esercizi del fisioterapista"
      subtitle={list.length ? `${list.length} esercizi · circa ${fmtMinutes(minutes)}` : undefined}
      footer={
        list.length ? (
          <Button
            fullWidth
            size="lg"
            icon={Check}
            haptic="success"
            onClick={() => {
              onDone();
              onClose();
            }}
          >
            {done ? 'Fatti' : 'Segna fatti'}
          </Button>
        ) : undefined
      }
    >
      {list.length ? (
        <ol className="flex flex-col gap-3 pb-2">
          {list.map(({ p, ex }, i) => (
            <li key={`${p.exerciseId}-${i}`}>
              <Card padding="md">
                <div className="flex items-start gap-3">
                  <span className="t-num grid size-8 shrink-0 place-items-center rounded-full bg-ink-soft text-[1.0625rem] text-ink-2">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="t-headline text-ink">{ex?.name ?? p.exerciseId}</p>
                    <p className="t-footnote mt-1 font-medium tabular text-palestra-ink">
                      {dose(p)} · recupero {p.restSec} s
                    </p>
                    {ex?.cues?.length ? (
                      <ul className="t-footnote mt-2 flex list-disc flex-col gap-0.5 pl-4 text-ink-2 marker:text-ink-3">
                        {ex.cues.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    ) : null}
                    {p.note && <p className="t-footnote mt-2 font-medium text-warn-ink">{p.note}</p>}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState
          icon={HeartPulse}
          title="Nessun esercizio inserito"
          text="Aggiungi gli esercizi che ti ha dato il fisioterapista: compariranno qui e nelle sedute."
          action={
            <Button
              variant="secondary"
              icon={Settings}
              onClick={() => {
                onClose();
                onSettings();
              }}
            >
              Apri le impostazioni
            </Button>
          }
        />
      )}
    </Sheet>
  );
}
