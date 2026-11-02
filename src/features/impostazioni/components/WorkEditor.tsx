/**
 * Orario di lavoro della settimana tipo: un campo per giorno, da lunedì a domenica. Si scrive come viene
 * ("9-13.30", "8:30-10:00, 10:30-13:00"), vuoto se il giorno è libero. Il testo si legge con `parseWork` quando si esce
 * dal campo (o con Invio): se è valido si salva e il campo mostra gli orari normalizzati, altrimenti l'errore resta
 * sotto il campo e il piano tiene l'orario di prima. Sotto ogni giorno, cosa fa il lavoro ai pasti e gli avvisi.
 */
import { useEffect, useState } from 'react';
import type { Plan, ScheduleDay } from '../../../domain/types';
import { formatWork, parseWork } from '../../../engine/work';
import { WEEKDAY_LONG, capitalize } from '../../../lib/format';
import { useApp } from '../../../state/store';
import { Card, Field, TextInput, keepHyphens } from '../../../ui';
import { workMealNote, workWarnings } from '../lib';

export function WorkWeekEditor() {
  const plan = useApp((s) => s.plan);
  return (
    <section className="flex flex-col gap-2" aria-labelledby="impostazioni-lavoro">
      <h3 id="impostazioni-lavoro" className="t-label px-1 text-ink-3">
        Lavoro
      </h3>
      <Card padding="md" className="flex flex-col gap-4">
        {plan.week.map((d) => (
          <WorkDayField key={d.weekday} day={d} plan={plan} />
        ))}
      </Card>
      <p className="t-footnote px-1 text-ink-3">
        {keepHyphens('Per esempio 9-13.30, oppure 8:30-10:00, 10:30-13:00. Vuoto se non lavori. I pasti si spostano intorno al lavoro.')}
      </p>
    </section>
  );
}

function WorkDayField({ day, plan }: { day: ScheduleDay; plan: Plan }) {
  const saved = formatWork(day.work);
  const [text, setText] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  // Fuori dal campo il testo segue il piano (backup importato, «Annulla»).
  useEffect(() => {
    if (!focused && !error) setText(saved);
  }, [saved, focused, error]);

  const commit = () => {
    const r = parseWork(text);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    const next = formatWork(r.blocks);
    if (next !== saved) useApp.getState().setScheduleDay(day.weekday, { work: r.blocks.length ? r.blocks : undefined });
    setText(next);
  };

  const note = error ? null : workMealNote(day, plan);
  const warnings = error ? [] : workWarnings(day, plan);
  const name = capitalize(WEEKDAY_LONG[day.weekday]);
  return (
    <Field
      label={name}
      error={error ?? undefined}
      hint={
        note || warnings.length ? (
          <>
            {note}
            {warnings.map((w) => (
              <span key={w} className="mt-0.5 block text-warn-ink">
                {w}
              </span>
            ))}
          </>
        ) : undefined
      }
    >
      <TextInput
        value={text}
        onChange={(v) => {
          setText(v);
          // Dopo un errore il campo si ricontrolla mentre si corregge (si salva sempre all'uscita).
          if (error) {
            const r = parseWork(v);
            setError(r.ok ? null : r.error);
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        placeholder="Libero"
        aria-label={`Orario di lavoro di ${WEEKDAY_LONG[day.weekday]}`}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="done"
        maxLength={80}
      />
    </Field>
  );
}
