/**
 * Obiettivi su tre livelli (docs/FASE2.md § 2, § 11.4): corpo (energia e macro), allenamento (qualità da allenare, rientro,
 * tempo e spazi) e stagione (le date, che sono fatti).
 *
 * - Corpo e allenamento sono una bozza: niente si applica da solo. In fondo, solo se qualcosa è cambiato rispetto al piano,
 *   «Vedi la proposta» fa nascere una proposta di obiettivi (`goalsProposal`) e apre il foglio con le differenze. Uscire
 *   senza approvare lascia tutto com'era, con la riga «Proposta in attesa».
 * - Le date della stagione si salvano subito: il cambio di fase che ne deriva fa nascere una proposta di blocco.
 * - Il via libera del fisioterapista di un rientro già in vigore e i segnali d'allarme sono fatti di sicurezza: valgono da
 *   subito (i segnali con «Annulla» per 5 secondi).
 * - La pagina mostra il piano proiettato: gli obiettivi approvati che valgono da domani sono già quelli scelti.
 */
import { useState } from 'react';
import { ArrowRight, Eye, History, Hourglass } from 'lucide-react';
import type { Goal, ISODate, SeasonCalendar, SeasonStage, TrainingGoal, TrainingQuality, TrainingSpace } from '../../../domain/types';
import { addDays, fromISO, isISODate } from '../../../engine/dates';
import { R8_TEXT, goalsProposal, r8Active } from '../../../engine/plan/build';
import { QUALITY_LABEL, dayMonthLabel, mondayOnOrAfter } from '../../../engine/plan/diff';
import { activeReturn, returnAdvice, returnStageOf, returnZone } from '../../../engine/plan/returnStages';
import { PRESET_BY_ID, PRESEASON_WEEKS_MAX, PRESEASON_WEEKS_MIN, preseasonWeeksOf, seasonOn, trainingForPhase } from '../../../engine/plan/season';
import { isLowerLegSite } from '../../../engine/training';
import { capitalize } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { usePlanDay } from '../../../state/hooks';
import { useApp, useUi } from '../../../state/store';
import { Button, Callout, Card, Chip, Field, ListGroup, ListRow, Select, Toggle, cn } from '../../../ui';
import { WarningSigns } from '../../allenamento/components/WarningSigns';
import {
  GOAL_NAME,
  GOAL_ORDER,
  PHASE_NAME,
  RIENTRO_OTHER_NOTE,
  goalDeltaFor,
  goalEffect,
  goalsDraftOf,
  lockedLine,
  needsPhysioToggle,
  newRientro,
  phaseCtxFor,
  presetRows,
  primaryOptions,
  qualitiesText,
  rientroMissingSite,
  secondaryOptions,
  shownTraining,
  stageChoices,
  withPreset,
  withQualities,
} from '../../allenamento/goals';
import { openProposalSheet, projectedAppData, stamped, submitProposal } from '../../piano/actions';
import { useOpenProposal, useProposalState } from '../../piano/useProposals';
import { ChoiceCards, FormRow, GroupLabel, MiniStepper } from '../components/controls';
import { Page, type PageProps } from './Page';

/** Valore di «Scegli tu» tra gli obiettivi pronti. */
const FREE = 'libera';

const SPACES: { value: TrainingSpace; label: string }[] = [
  { value: 'corsia', label: 'Corsia di 15-20 m' },
  { value: 'campo', label: 'Campo o parco' },
  { value: 'casa', label: 'Casa' },
];

const qualityName = (q: TrainingQuality) => capitalize(QUALITY_LABEL[q]);

export default function ObiettiviPage({ onBack, open, backLabel }: PageProps) {
  const today = usePlanDay();
  const stored = useApp((s) => s.plan);
  const reviews = useApp((s) => s.reviews);
  const checkIns = useApp((s) => s.checkIns);
  const workoutLogs = useApp((s) => s.workoutLogs);
  const toast = useUi((s) => s.toast);
  // Il piano proiettato: gli obiettivi già approvati che valgono da domani sono quelli scelti.
  const { plan, profile } = useProposalState();
  const openGoals = useOpenProposal('obiettivi');

  const [goalPick, setGoalPick] = useState<Goal | undefined>();
  const [trainingPick, setTrainingPick] = useState<TrainingGoal | undefined>();

  const ctx = phaseCtxFor(stored, today);
  const r8 = r8Active(plan, checkIns, today);
  const goal = goalPick ?? profile.goal;
  const training = shownTraining(trainingPick, plan);
  const rows = presetRows(ctx, r8);
  const presetValue = training.presetId && rows.some((r) => r.preset.id === training.presetId) && PRESET_BY_ID[training.presetId]?.primary === training.primary ? training.presetId : FREE;
  const replaced = trainingForPhase(training, ctx).replaced;
  const locked = lockedLine(ctx);
  const draft = goalsDraftOf({ goal: goalPick, training: trainingPick }, plan, profile);
  const sites = profile.painSites;
  const usesRientro = training.primary === 'rientro' || training.secondary === 'rientro';

  const setTraining = (t: TrainingGoal) => setTrainingPick(t);
  const editTraining = (patch: Partial<TrainingGoal>) => setTrainingPick({ ...training, ...patch });
  const rientroInForce = Boolean(activeReturn(stored) && stored.training?.rientro?.site === training.rientro?.site);

  /**
   * Via libera del fisioterapista. Con il rientro già in vigore è un fatto e vale da subito (la proposta di blocco dopo
   * lo usa); in una bozza resta nella bozza. Senza via libera lo stadio scelto torna all'ultimo senza corsa né salti.
   */
  const setPhysio = (physioOk: boolean) => {
    const withOk = <R extends NonNullable<TrainingGoal['rientro']>>(r: R): R => {
      const next = { ...r };
      if (physioOk) next.physioOk = true;
      else delete next.physioOk;
      return next;
    };
    if (rientroInForce) {
      const t = useApp.getState().plan.training;
      if (t?.rientro) useApp.getState().updatePlan({ training: { ...t, rientro: withOk(t.rientro) } });
      if (trainingPick?.rientro) setTrainingPick({ ...trainingPick, rientro: withOk(trainingPick.rientro) });
      return;
    }
    const r = training.rientro;
    if (!r) return;
    const next = withOk(r);
    if (!physioOk) {
      const allowed = stageChoices(r.site, false);
      const top = allowed[allowed.length - 1]?.stage ?? 0;
      if (next.stage > top) next.stage = top;
    }
    editTraining({ rientro: next });
  };

  const pickPreset = (id: string) => {
    if (id === FREE) {
      const { presetId: _drop, ...rest } = training;
      setTraining(rest);
      return;
    }
    const preset = PRESET_BY_ID[id];
    if (preset) setTraining(withPreset(training, preset, sites, today));
  };

  const seeProposal = () => {
    if (rientroMissingSite(training)) {
      open('dolore');
      return;
    }
    if (!draft) return;
    const s = projectedAppData(useApp.getState());
    const p = goalsProposal(s, today, draft);
    if (!p) {
      toast('Il piano è già così', 'neutral');
      return;
    }
    haptic('selection');
    submitProposal(stamped(p), { open: true });
  };

  const goalOptions = GOAL_ORDER.map((g) => ({
    value: g,
    label: GOAL_NAME[g],
    ...(g === goal ? { text: goalEffect(goalDeltaFor(g, plan, profile, reviews)) } : {}),
  }));

  const presetOptions = [
    ...rows.map((r) => ({
      value: r.preset.id,
      label: r.preset.label,
      text: (
        <>
          {r.text}
          {r.r8 && <span className="mt-0.5 block font-medium text-warn-ink">{R8_TEXT}</span>}
        </>
      ),
    })),
    { value: FREE, label: 'Scegli tu', text: presetValue === FREE ? qualitiesText(training) : 'Principale e secondaria a scelta' },
  ];

  return (
    <Page title="Obiettivi" subtitle="Ogni cambio diventa una proposta: vedi cosa cambia e approvi." onBack={onBack} backLabel={backLabel}>
      <section className="flex flex-col gap-2.5" aria-labelledby="ob-corpo">
        <GroupLabel id="ob-corpo">Corpo</GroupLabel>
        <ChoiceCards aria-label="Obiettivo del corpo" columns={1} value={goal} onChange={(g) => setGoalPick(g)} options={goalOptions} />
      </section>

      <section className="flex flex-col gap-2.5" aria-labelledby="ob-allenamento">
        <GroupLabel id="ob-allenamento">Allenamento</GroupLabel>
        <ChoiceCards aria-label="Obiettivo di allenamento" columns={1} value={presetValue} onChange={pickPreset} options={presetOptions} />
        {presetValue === FREE && <FreeChoice training={training} ctx={ctx} sites={sites} today={today} onChange={setTraining} />}
        {replaced && <p className="t-footnote px-1 text-pretty text-ink-2">{`«${replaced.from}» non vale ${PHASE_NAME[ctx.phase]}: la proposta di blocco lo cambia in «${replaced.to}».`}</p>}
        {locked && <p className="t-footnote px-1 text-pretty text-ink-3">{locked}</p>}
        {usesRientro && (
          <RientroBlock
            training={training}
            sites={sites}
            today={today}
            inForce={rientroInForce}
            onDraft={(rientro) => editTraining({ rientro })}
            onPhysio={setPhysio}
            onAddZones={() => open('dolore')}
            advice={
              training.rientro && activeReturn(stored)?.site === training.rientro.site
                ? returnAdvice(training.rientro, mondayOnOrAfter(addDays(today, 1)), { plan: stored, checkIns, workoutLogs }).reason
                : undefined
            }
          />
        )}
      </section>

      <ListGroup title="Tempo e spazi">
        <FormRow label="Minuti per seduta">
          <MiniStepper label="Minuti per seduta" value={training.sessionMin ?? 60} min={30} max={90} step={5} unit="min" onChange={(sessionMin) => editTraining({ sessionMin })} />
        </FormRow>
        <FormRow label="Sedute in stagione" hint="La terza è facoltativa">
          <MiniStepper label="Sedute in stagione" value={training.gymPerWeek ?? 2} min={1} max={3} onChange={(gymPerWeek) => editTraining({ gymPerWeek })} />
        </FormRow>
        <div className="flex flex-col gap-2 px-4 pb-4 pt-3">
          <span className="t-callout font-medium text-ink">Oltre alla palestra</span>
          <div className="flex flex-wrap gap-2">
            {SPACES.map((o) => {
              const on = (training.spaces ?? []).includes(o.value);
              return (
                <Chip
                  key={o.value}
                  selected={on}
                  className="hit-44"
                  onChange={(sel) => {
                    const cur = (training.spaces ?? []).filter((x) => x !== o.value);
                    const spaces = sel ? [...cur, o.value] : cur;
                    editTraining({ spaces: spaces.length ? SPACES.map((x) => x.value).filter((v) => spaces.includes(v)) : undefined });
                  }}
                >
                  {o.label}
                </Chip>
              );
            })}
          </div>
        </div>
      </ListGroup>

      <SeasonGroup season={stored.season} today={today} />

      {draft ? (
        <div className="flex flex-col gap-2">
          <Button fullWidth size="lg" icon={rientroMissingSite(training) ? ArrowRight : Eye} onClick={seeProposal}>
            {rientroMissingSite(training) ? 'Scegli la zona del rientro' : 'Vedi la proposta'}
          </Button>
          <Button fullWidth variant="ghost" onClick={() => (setGoalPick(undefined), setTrainingPick(undefined))}>
            Lascia com’era
          </Button>
        </div>
      ) : (
        openGoals && (
          <ListGroup>
            <ListRow icon={Hourglass} iconTone="accent" title="Proposta in attesa" subtitle={openGoals.subtitle} onPress={() => openProposalSheet(openGoals.id)} />
          </ListGroup>
        )
      )}

      <ListGroup>
        <ListRow icon={History} iconTone="riposo" title="Storico del piano" onPress={() => open('storico')} />
      </ListGroup>
    </Page>
  );
}

// ───────────────────────── Scegli tu ─────────────────────────

function FreeChoice({
  training,
  ctx,
  sites,
  today,
  onChange,
}: {
  training: TrainingGoal;
  ctx: ReturnType<typeof phaseCtxFor>;
  sites: readonly string[];
  today: ISODate;
  onChange: (t: TrainingGoal) => void;
}) {
  const primaries = primaryOptions(ctx);
  const primary = primaries.includes(training.primary) ? training.primary : primaries[0];
  const secondaries = secondaryOptions(ctx, primary, training.rientro);
  const secondary = training.secondary && secondaries.includes(training.secondary) ? training.secondary : undefined;
  return (
    <Card padding="md" className="flex flex-col gap-3">
      <Field label="Principale">
        <Select
          value={primary}
          onChange={(q) => onChange(withQualities(training, q, secondary, sites, today))}
          options={primaries.map((q) => ({ value: q, label: qualityName(q) }))}
        />
      </Field>
      <Field label="Secondaria">
        <Select
          value={secondary ?? ''}
          onChange={(q) => onChange(withQualities(training, primary, (q || undefined) as TrainingQuality | undefined, sites, today))}
          options={[{ value: '', label: 'Nessuna' }, ...secondaries.map((q) => ({ value: q, label: qualityName(q) }))]}
        />
      </Field>
    </Card>
  );
}

// ───────────────────────── Rientro ─────────────────────────

function RientroBlock({
  training,
  sites,
  today,
  inForce,
  advice,
  onDraft,
  onPhysio,
  onAddZones,
}: {
  training: TrainingGoal;
  sites: readonly string[];
  today: ISODate;
  /** Il rientro di questa zona è già nel piano: stadio e via libera valgono da subito, lo stadio lo decide il criterio. */
  inForce: boolean;
  advice?: string;
  onDraft: (r: NonNullable<TrainingGoal['rientro']>) => void;
  onPhysio: (ok: boolean) => void;
  onAddZones: () => void;
}) {
  const r = training.rientro;
  if (!sites.length || !r) {
    return (
      <Callout
        tone="accent"
        title="Il rientro segue una zona del profilo"
        action={
          <Button variant="ghost" size="sm" iconRight={ArrowRight} onClick={onAddZones}>
            Scegli le zone
          </Button>
        }
      >
        Aggiungi la zona di dolore da seguire, poi torna qui.
      </Callout>
    );
  }
  const stage = returnStageOf(r);
  const choices = stageChoices(r.site, Boolean(r.physioOk));
  const physio = needsPhysioToggle(r.site);
  return (
    <div className="flex flex-col gap-2.5">
      <Card padding="md" className="flex flex-col gap-3">
        {sites.length > 1 && (
          <Field label="Zona">
            <Select value={r.site} onChange={(site) => onDraft(newRientro(sites, today, site) ?? r)} options={sites.map((s) => ({ value: s, label: s }))} />
          </Field>
        )}
        {inForce ? (
          <div className="flex flex-col gap-0.5">
            <p className="t-callout font-semibold text-ink">{`Stadio ${stage.stage} · ${r.site}`}</p>
            <p className="t-footnote text-ink-2">{stage.content}</p>
            {advice && <p className="t-footnote text-ink-3">{advice}</p>}
          </div>
        ) : (
          <Field label={sites.length > 1 ? 'Da dove parti' : `Da dove parti · ${r.site}`} hint={`Per salire: ${stage.criterion.charAt(0).toLowerCase()}${stage.criterion.slice(1)}`}>
            <Select
              value={String(stage.stage)}
              onChange={(v) => onDraft({ ...r, stage: Number(v) as typeof r.stage })}
              options={choices.map((c) => ({ value: String(c.stage), label: `Stadio ${c.stage} · ${c.content}` }))}
            />
          </Field>
        )}
      </Card>
      {physio && (
        <ListGroup footer={r.physioOk ? undefined : 'Gli stadi con corsa o salti arrivano solo con il via libera.'}>
          <FormRow label="Il fisioterapista ha dato il via libera" htmlFor="ob-physio">
            <Toggle checked={Boolean(r.physioOk)} onChange={onPhysio} label="Il fisioterapista ha dato il via libera" />
          </FormRow>
        </ListGroup>
      )}
      {isLowerLegSite(r.site) && <WarningSigns site={r.site} today={today} />}
      {returnZone(r.site) === 'altro' && <p className="t-footnote px-1 text-ink-3">{RIENTRO_OTHER_NOTE}</p>}
    </div>
  );
}

// ───────────────────────── Stagione ─────────────────────────

/** Data con il selettore del sistema: il testo in vista, l'input trasparente sopra (il tocco apre la rotella). */
function DateRow({ label, value, onChange, hint }: { label: string; value?: ISODate; onChange: (v?: ISODate) => void; hint?: string }) {
  const id = `ob-data-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <FormRow label={label} htmlFor={id} hint={hint}>
      <div className="flex shrink-0 items-center gap-1">
        <span className="relative inline-flex h-11 min-w-[6.5rem] items-center justify-end rounded-[10px] px-2.5 focus-within:bg-field focus-within:shadow-[0_0_0_2px_var(--focus)]">
          <span className={cn('t-callout font-semibold tabular', value ? 'text-ink' : 'text-accent-ink')} aria-hidden>
            {value ? dayMonthYear(value) : 'Scegli'}
          </span>
          <input
            id={id}
            type="date"
            value={value ?? ''}
            onChange={(e) => onChange(isISODate(e.target.value) ? e.target.value : undefined)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </span>
        {value && (
          <button type="button" onClick={() => onChange(undefined)} className="hit-44 t-footnote font-semibold text-ink-3" aria-label={`Togli: ${label}`}>
            Togli
          </button>
        )}
      </div>
    </FormRow>
  );
}

/** «9 nov 2026» compatto per le righe. */
function dayMonthYear(iso: ISODate): string {
  return `${dayMonthLabel(iso)} ${fromISO(iso).getFullYear()}`;
}

function SeasonGroup({ season, today }: { season: SeasonCalendar | undefined; today: ISODate }) {
  const [saved, setSaved] = useState(false);
  const info = seasonOn(addDays(today, 1), season);
  const set = (patch: Partial<SeasonCalendar>) => {
    const next: SeasonCalendar = { ...(useApp.getState().plan.season ?? {}), ...patch };
    (Object.keys(next) as (keyof SeasonCalendar)[]).forEach((k) => next[k] === undefined && delete next[k]);
    useApp.getState().updatePlan({ season: Object.keys(next).length ? next : undefined });
    setSaved(true);
  };
  const footer = `${saved ? 'Date salvate. ' : ''}${season?.lastMatch || season?.firstMatch ? `Da domani: ${stageLabel(info.phase, info.stage)}.` : 'Senza date vale sempre la stagione.'}`;
  return (
    <ListGroup title="Stagione" footer={footer}>
      <DateRow label="Ultima partita" value={season?.lastMatch} onChange={(lastMatch) => set({ lastMatch })} />
      <DateRow label="Prima partita della prossima stagione" value={season?.firstMatch} onChange={(firstMatch) => set({ firstMatch })} />
      <FormRow label="Settimane di precampionato">
        <MiniStepper
          label="Settimane di precampionato"
          value={preseasonWeeksOf(season)}
          min={PRESEASON_WEEKS_MIN}
          max={PRESEASON_WEEKS_MAX}
          onChange={(preseasonWeeks) => set({ preseasonWeeks })}
        />
      </FormRow>
    </ListGroup>
  );
}

/** «in stagione», «pausa estiva, transizione», «precampionato, rifinitura». */
function stageLabel(phase: ReturnType<typeof seasonOn>['phase'], stage: SeasonStage): string {
  if (phase === 'stagione') return 'in stagione';
  if (phase === 'pausa') return stage === 'transizione' ? 'pausa estiva, transizione' : 'pausa estiva';
  return stage === 'rifinitura' ? 'precampionato, rifinitura' : 'precampionato';
}
