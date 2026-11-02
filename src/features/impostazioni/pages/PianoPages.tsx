/** Pagine del piano: settimana, orari dei pasti (e dolci), sonno, integratori. */
import { useState } from 'react';
import { AlarmClock, Apple, BedDouble, Cake, Coffee, RotateCcw, Sandwich, Soup, Target, UtensilsCrossed } from 'lucide-react';
import type { MealSlot, ScheduleDay, Supplement, Weekday } from '../../../domain/types';
import { DEFAULT_WEEK } from '../../../data/defaults';
import { curfewFor } from '../../../engine/sleep';
import { MEAL_SLOT_LABEL, listIt, plural } from '../../../lib/format';
import { useApp, useUi } from '../../../state/store';
import { Button, Callout, Card, Disclosure, ListGroup, Segmented, type AnyTone } from '../../../ui';
import { FormRow, MiniStepper, TimePill } from '../components/controls';
import { SleepStairs, SleepTargetHint } from '../components/SleepStairs';
import { SupplementList, SupplementSheet } from '../components/SupplementEditor';
import { DayEditorSheet, WeekDayList } from '../components/WeekEditor';
import { WorkWeekEditor } from '../components/WorkEditor';
import { MEAL_ORDER, mealOrderIssues, sleepSteps, weekWithoutWork, withWorkOf } from '../lib';
import { Page, type PageProps } from './Page';

// ───────────────────────── Settimana ─────────────────────────

export function SettimanaPage({ onBack, backLabel }: PageProps) {
  const week = useApp((s) => s.plan.week);
  const [editing, setEditing] = useState<Weekday | null>(null);
  // Il ripristino riguarda le attività: l'orario di lavoro resta com'è.
  const isDefault = JSON.stringify(weekWithoutWork(week)) === JSON.stringify(DEFAULT_WEEK);

  const reset = () => {
    const before = JSON.parse(JSON.stringify(week)) as ScheduleDay[];
    useApp.getState().updatePlan({ week: withWorkOf(JSON.parse(JSON.stringify(DEFAULT_WEEK)) as ScheduleDay[], week) });
    useUi.getState().toast('Settimana tipo ripristinata', 'neutral', { actionLabel: 'Annulla', onAction: () => useApp.getState().updatePlan({ week: before }) });
  };

  return (
    <Page title="Settimana" subtitle="Calcio, palestra, fisioterapista e lavoro, giorno per giorno. Vale per tutte le settimane." onBack={onBack} backLabel={backLabel}>
      <section className="flex flex-col gap-2">
        <WeekDayList week={week} onSelect={setEditing} />
        <p className="t-footnote px-1 text-ink-3">Il tipo di giorno decide calorie e carboidrati del menù.</p>
      </section>
      <WorkWeekEditor />
      {!isDefault && (
        <Button variant="ghost" icon={RotateCcw} className="self-center" onClick={reset}>
          Ripristina la settimana tipo
        </Button>
      )}
      <DayEditorSheet
        day={editing !== null ? (week.find((d) => d.weekday === editing) ?? null) : null}
        onClose={() => setEditing(null)}
        onChange={(wd, patch) => useApp.getState().setScheduleDay(wd, patch)}
      />
    </Page>
  );
}

// ───────────────────────── Orari dei pasti ─────────────────────────

const MEAL_ICON: Record<MealSlot, { icon: typeof Coffee; tone: AnyTone }> = {
  colazione: { icon: Coffee, tone: 'accent' },
  spuntino: { icon: Apple, tone: 'good' },
  pranzo: { icon: UtensilsCrossed, tone: 'palestra' },
  merenda: { icon: Sandwich, tone: 'warn' },
  cena: { icon: Soup, tone: 'riposo' },
};

export function PastiPage({ onBack, backLabel }: PageProps) {
  const mealTimes = useApp((s) => s.plan.mealTimes);
  const sweets = useApp((s) => s.plan.sweetsPerWeek);
  const update = useApp((s) => s.updatePlan);
  const issues = mealOrderIssues(mealTimes);

  return (
    <Page title="Orari dei pasti" subtitle="Gli orari dei giorni normali. La giornata li sposta da sola intorno al calcio e al lavoro." onBack={onBack} backLabel={backLabel}>
      <ListGroup>
        {MEAL_ORDER.map((slot) => (
          <FormRow key={slot} icon={MEAL_ICON[slot].icon} iconTone={MEAL_ICON[slot].tone} label={MEAL_SLOT_LABEL[slot]}>
            <TimePill label={`Orario di ${MEAL_SLOT_LABEL[slot].toLowerCase()}`} value={mealTimes[slot]} onChange={(t) => update({ mealTimes: { ...mealTimes, [slot]: t } })} />
          </FormRow>
        ))}
      </ListGroup>

      {issues.length > 0 && (
        <Callout tone="warn" title="Pasti fuori ordine">
          {listIt(issues.map((s) => MEAL_SLOT_LABEL[s]))} {issues.length === 1 ? 'arriva' : 'arrivano'} prima del pasto precedente. Controlla gli orari: la giornata li mostra in ordine di tempo.
        </Callout>
      )}

      {/* Come cambiano gli orari intorno al calcio: dietro un tocco, il sottotitolo lo accenna già. */}
      <Card padding="none" className="-mt-3 px-4 py-1">
        <Disclosure title="Nei giorni di calcio serale">
          <p className="t-callout">
            La merenda diventa pre-partita, circa 2 ore e 30 prima, e la cena diventa di recupero, dopo la doccia. Se il calcio finisce tardi la cena è leggera e veloce.
          </p>
        </Disclosure>
        <Disclosure title="Nei giorni di lavoro">
          <p className="t-callout">
            Un pasto che cade nel lavoro va in una pausa di almeno 30 minuti, oppure subito dopo, se il lavoro finisce entro un’ora. Altrimenti resta al suo orario ed è da portare. La colazione arriva 45 minuti prima di cominciare, mai prima della sveglia. L’orario di lavoro si scrive in Settimana.
          </p>
        </Disclosure>
      </Card>

      <ListGroup title="Dolci" footer="Previsti nel piano: non sono uno sgarro.">
        <FormRow icon={Cake} iconTone="riposo" label="A settimana">
          <MiniStepper label="Dolci previsti a settimana" value={sweets} min={0} max={7} step={1} onChange={(sweetsPerWeek) => update({ sweetsPerWeek })} />
        </FormRow>
      </ListGroup>
    </Page>
  );
}

// ───────────────────────── Sonno ─────────────────────────

const STEP_OPTIONS = [10, 15, 20, 30].map((m) => ({ value: String(m), label: `${m} min` }));
const CURFEW_OPTIONS = [15, 30, 45, 60].map((m) => ({ value: String(m), label: `${m} min` }));

export function SonnoPage({ onBack, backLabel }: PageProps) {
  const plan = useApp((s) => s.plan);
  const s = plan.sleep;
  const set = (patch: Partial<typeof s>) => useApp.getState().updatePlan({ sleep: { ...s, ...patch } });
  const weeks = sleepSteps(s).length - 1;

  return (
    <Page title="Sonno" subtitle="L’orario a letto si anticipa un passo a settimana, finché arrivi all’obiettivo." onBack={onBack} backLabel={backLabel}>
      <div className="flex flex-col gap-2.5">
        <Card padding="lg">
          <SleepStairs sleep={s} />
        </Card>
        <SleepTargetHint sleep={s} onApply={(target) => set({ target })} />
      </div>

      <ListGroup title="Orari">
        <FormRow icon={AlarmClock} iconTone="accent" label="Sveglia">
          <TimePill label="Sveglia" value={s.wake} onChange={(wake) => set({ wake })} />
        </FormRow>
        <FormRow icon={BedDouble} iconTone="riposo" label="A letto questa settimana">
          <TimePill label="A letto questa settimana" value={s.current} onChange={(current) => set({ current })} />
        </FormRow>
        <FormRow icon={Target} iconTone="good" label="Obiettivo" hint={weeks ? `Tra ${plural(weeks, 'settimana', 'settimane')}` : 'Raggiunto'}>
          <TimePill label="Obiettivo dell’orario a letto" value={s.target} onChange={(target) => set({ target })} />
        </FormRow>
      </ListGroup>

      <section className="flex flex-col gap-2" aria-label="Ritmo del sonno">
        <h3 className="t-label px-1 text-ink-3">Ritmo</h3>
        <div className="flex flex-col divide-y divide-line overflow-hidden rounded-card bg-card shadow-card">
          <div className="flex flex-col gap-2.5 px-4 py-3.5">
            <span className="t-callout font-medium text-ink">Passo settimanale</span>
            <Segmented aria-label="Passo settimanale" size="sm" value={String(s.stepMin)} onChange={(v) => set({ stepMin: Number(v) })} options={STEP_OPTIONS} />
          </div>
          <div className="flex flex-col gap-2.5 px-4 py-3.5">
            <span className="t-callout font-medium text-ink">Telefono fuori prima di dormire</span>
            <Segmented aria-label="Telefono fuori prima di dormire" size="sm" value={String(s.curfewLeadMin)} onChange={(v) => set({ curfewLeadMin: Number(v) })} options={CURFEW_OPTIONS} />
            <p className="t-footnote text-ink-3">Coprifuoco alle {curfewFor('', plan)}: in carica fuori dalla camera, luci basse.</p>
          </div>
        </div>
        <p className="t-footnote px-1 text-ink-3">Il passo avanza con la revisione della domenica, dopo almeno 5 notti su 7 a letto in orario.</p>
      </section>
    </Page>
  );
}

// ───────────────────────── Integratori ─────────────────────────

export function IntegratoriPage({ onBack, backLabel }: PageProps) {
  const supps = useApp((s) => s.plan.supplements);
  const [editing, setEditing] = useState<{ sup: Supplement | null; n: number } | null>(null);
  const setSupps = (list: Supplement[]) => useApp.getState().updatePlan({ supplements: list });
  const active = supps.filter((s) => s.active).length;

  return (
    <Page
      title="Integratori"
      subtitle={supps.length ? `${plural(active, 'attivo', 'attivi')} su ${supps.length}. Compaiono nella giornata con il pasto scelto.` : 'Compaiono nella giornata con il pasto scelto.'}
      onBack={onBack}
      backLabel={backLabel}
    >
      <section className="flex flex-col gap-2">
        <SupplementList
          supplements={supps}
          onToggle={(id, on) => setSupps(supps.map((s) => (s.id === id ? { ...s, active: on } : s)))}
          onEdit={(sup) => setEditing((e) => ({ sup, n: (e?.n ?? 0) + 1 }))}
          onAdd={() => setEditing((e) => ({ sup: null, n: (e?.n ?? 0) + 1 }))}
        />
        <p className="t-footnote px-1 text-ink-3">Dosi da concordare con il medico. Quelli sospesi spariscono dalla giornata.</p>
      </section>
      {editing && (
        <SupplementSheet
          key={editing.n}
          supplement={editing.sup}
          onClosed={() => setEditing(null)}
          onSave={(sup) => {
            const cur = useApp.getState().plan.supplements;
            setSupps(cur.some((s) => s.id === sup.id) ? cur.map((s) => (s.id === sup.id ? sup : s)) : [...cur, sup]);
            useUi.getState().toast(editing.sup ? 'Integratore aggiornato' : 'Integratore aggiunto', 'good');
          }}
          onDelete={(id) => {
            const cur = useApp.getState().plan.supplements;
            const removed = cur.find((s) => s.id === id);
            const index = cur.findIndex((s) => s.id === id);
            setSupps(cur.filter((s) => s.id !== id));
            if (removed) {
              useUi.getState().toast(`${removed.name} eliminato`, 'neutral', {
                actionLabel: 'Annulla',
                onAction: () => {
                  const now = useApp.getState().plan.supplements.slice();
                  now.splice(Math.min(index, now.length), 0, removed);
                  setSupps(now);
                },
              });
            }
          }}
        />
      )}
    </Page>
  );
}
