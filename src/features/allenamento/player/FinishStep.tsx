import { Flag } from 'lucide-react';
import { sessionLoad } from '../../../engine/training';
import { fmtNumber } from '../../../lib/format';
import { Field, RatingPicker, ScaleSlider, Stepper, TextArea } from '../../../ui';
import { RPE_LABELS } from '../lib';

export interface FinishStepProps {
  sessionName: string;
  durationMin: number;
  onDuration: (v: number) => void;
  /** Durata misurata dal lettore (per la nota sotto lo stepper). */
  measuredMin: number;
  rpe: number | undefined;
  onRpe: (v: number) => void;
  painSites: string[];
  pain: Record<string, number | undefined>;
  onPain: (site: string, v: number) => void;
  threshold: number;
  notes: string;
  onNotes: (v: string) => void;
  setsDone: number;
  setsPlanned: number;
  volume: number;
  /** Carico della settimana senza questa seduta e media delle 4 precedenti. */
  weekLoad: number;
  average: number | null;
}

const painWord = (v: number) => (v === 0 ? 'nessun dolore' : v <= 2 ? 'lieve' : v <= 4 ? 'moderato' : v <= 6 ? 'forte' : 'molto forte');

/** Fine seduta: durata, fatica percepita, dolore per zona e note. */
export function FinishStep(p: FinishStepProps) {
  const load = sessionLoad(p.durationMin, p.rpe ?? 0);
  const after = p.weekLoad + load;
  const pct = p.average && p.average > 0 ? after / p.average : null;

  return (
    <div className="flex flex-col gap-7 pb-8 pt-3">
      <header className="flex flex-col gap-2">
        <p className="t-label flex items-center gap-1.5 text-good-ink">
          <Flag size={13} strokeWidth={2.4} aria-hidden />
          Fine seduta
        </p>
        <h2 className="t-title text-ink">Com'è andata la {p.sessionName.replace(/^Seduta/, 'seduta')}?</h2>
        <p className="t-callout text-ink-2">
          {p.setsDone} serie su {p.setsPlanned}
          {p.volume > 0 ? `, ${fmtNumber(Math.round(p.volume))} kg sollevati` : ''}. Tre risposte e hai finito.
        </p>
      </header>

      <section className="flex flex-col gap-2 rounded-card bg-card p-4 shadow-card">
        <Stepper label="Durata" unit="min" size="lg" step={5} min={5} max={240} value={p.durationMin} onChange={p.onDuration} />
        <p className="t-footnote text-ink-3">
          {p.measuredMin > 0 ? `Misurata dal lettore: ${p.measuredMin} min. Correggila se hai fatto pause lunghe.` : 'Riscaldamento compreso.'}
        </p>
      </section>

      <section data-rpe className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-card">
        <RatingPicker
          label="Fatica percepita (RPE)"
          max={10}
          value={p.rpe}
          onChange={p.onRpe}
          lowLabel="Facile"
          highLabel="Massimale"
          labels={RPE_LABELS}
        />
        <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
          <span className="t-footnote text-ink-2">Carico della seduta</span>
          <span className="t-callout font-semibold text-ink tabular">
            {p.rpe ? `${p.durationMin} min × ${p.rpe} = ${fmtNumber(load)} UA` : "scegli l'RPE"}
          </span>
        </div>
        {pct !== null && p.rpe ? (
          <p className="t-footnote -mt-1 text-ink-3">
            La settimana arriva a {fmtNumber(after)} UA, il {fmtNumber(Math.round(pct * 100))}% della media delle settimane precedenti.
          </p>
        ) : null}
      </section>

      {p.painSites.length > 0 && (
        <section className="flex flex-col gap-5 rounded-card bg-card p-4 shadow-card" aria-label="Dolore per zona">
          <div>
            <h3 className="t-headline text-ink">Dolore durante la seduta</h3>
            <p className="t-footnote mt-0.5 text-ink-3">
              Da 0 a 10. La tacca è la tua soglia ({p.threshold}): se la superi, la prossima seduta mantiene i carichi.
            </p>
          </div>
          {p.painSites.map((site) => (
            <ScaleSlider
              key={site}
              label={site}
              value={p.pain[site]}
              onChange={(v) => p.onPain(site, v)}
              threshold={p.threshold}
              describe={painWord}
              lowLabel="Nessuno"
              highLabel="Fortissimo"
            />
          ))}
        </section>
      )}

      <Field label="Note" optional hint="Per esempio: gomito tranquillo con la chest press.">
        <TextArea value={p.notes} onChange={p.onNotes} rows={3} placeholder="Com'è andata" maxLength={400} />
      </Field>
    </div>
  );
}
