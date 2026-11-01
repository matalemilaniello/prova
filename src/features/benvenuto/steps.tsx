/**
 * I passi del benvenuto. Ogni passo riceve la bozza (profilo e piano) e i modi per cambiarla.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Activity,
  AlarmClock,
  BedDouble,
  CalendarCheck2,
  Check,
  Dumbbell,
  Hand,
  Lock,
  Moon,
  Pill as PillIcon,
  Smartphone,
  Sparkles,
  Target,
  TrendingUp,
  ArchiveRestore,
} from 'lucide-react';
import type { DayType, MacroTarget, Plan, Profile, ScheduleDay, Supplement, Weekday } from '../../domain/types';
import { computeTargets } from '../../engine/targets';
import { currentDate } from '../../engine/dates';
import { curfewFor } from '../../engine/sleep';
import { DAY_TYPE_LABEL, DAY_TYPES, WEEKDAY_LONG, WEEKDAY_SHORT, fmtNumber, listIt, plural } from '../../lib/format';
import { useNowHHMM, useToday } from '../../state/hooks';
import { BallIcon, Callout, Card, DayTypeBadge, Field, ListGroup, ListRow, NumberTicker, Segmented, TextInput, cn, staggerItem, toneColor, toneInk, toneSoft } from '../../ui';
import { ChoiceCards, FormRow, InlineNumber, TimePill, tileStyle } from '../impostazioni/components/controls';
import { InstallCard } from '../impostazioni/components/InstallCard';
import { PainSitesPicker } from '../impostazioni/components/Pickers';
import { SleepStairs } from '../impostazioni/components/SleepStairs';
import { SupplementList, SupplementSheet } from '../impostazioni/components/SupplementEditor';
import { DayEditorSheet, WeekDayList, WeekRibbon } from '../impostazioni/components/WeekEditor';
import { GOAL_OPTIONS, dayTypeCounts, hasErrors, matchEveNote, nextGymSession, relativeWeekday, sleepSteps, validateBody, type ProfileErrors } from '../impostazioni/lib';
import { DayDial } from './DayDial';

export interface StepProps {
  profile: Profile;
  plan: Plan;
  setProfile: (patch: Partial<Profile>) => void;
  setPlan: (patch: Partial<Plan>) => void;
  setDay: (weekday: Weekday, patch: Partial<ScheduleDay>) => void;
}

/** Intestazione di un passo: etichetta, titolo grande, sottotitolo. */
export function StepHeader({ eyebrow, title, children }: { eyebrow: ReactNode; title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-2.5">
      <span className="t-label text-accent-ink">{eyebrow}</span>
      <h1 tabIndex={-1} data-step-title className="t-large-title text-[2.5rem] leading-[0.98] text-ink outline-none">{title}</h1>
      {children && <p className="t-body max-w-[34ch] text-ink-2">{children}</p>}
    </header>
  );
}

// ───────────────────────── 1 · Benvenuto ─────────────────────────

const PRINCIPLES: { icon: typeof Hand; tone: 'accent' | 'good' | 'palestra'; title: string; text: string }[] = [
  {
    icon: CalendarCheck2,
    tone: 'accent',
    title: 'Decidi una volta, esegui sette',
    text: 'Pasti, sedute e orari li sceglie il piano. Durante la settimana non pianifichi niente.',
  },
  {
    icon: Hand,
    tone: 'good',
    title: 'Un tocco per voce',
    text: 'Fatto, sostituito o saltato. Niente grammi da pesare. Nei giorni no bastano quattro cose.',
  },
  {
    icon: TrendingUp,
    tone: 'palestra',
    title: 'Il piano impara',
    text: 'La domenica, in dieci minuti, rivedi la settimana e accetti le correzioni proposte.',
  },
];

/** Diametro del quadrante: più piccolo sugli schermi bassi, così i tre principi restano sopra il pulsante. */
function dialSize(): number {
  const h = typeof window === 'undefined' ? 900 : window.innerHeight;
  return h >= 900 ? 264 : h >= 820 ? 200 : 176;
}

export function StepWelcome({ plan, install, onRestore }: Pick<StepProps, 'plan'> & { install?: boolean; onRestore?: () => void }) {
  const [size] = useState(dialSize);
  return (
    <div className="flex flex-col gap-5">
      <div className="-mt-2 flex justify-center">
        <DayDial plan={plan} weekday={0} size={size} />
      </div>
      <StepHeader eyebrow="Benvenuto in Ritmo" title="La tua giornata, già decisa">
        Pasti, allenamento intorno al calcio, sonno: tu esegui e segni con un tocco.
      </StepHeader>
      {install && (
        <InstallCard compact note="Su iPhone l’app installata non vede i dati scritti in Safari: installala adesso e comincia dall’icona." />
      )}
      <ul className="flex flex-col gap-3.5">
        {PRINCIPLES.map((p, i) => (
          <motion.li key={p.title} {...staggerItem(i + 2, 0.08, 0.6)} className="flex gap-3.5">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px]" style={tileStyle(p.tone)}>
              <p.icon size={20} strokeWidth={2.2} />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5 pt-0.5">
              <span className="t-headline text-ink">{p.title}</span>
              <span className="t-callout text-ink-2">{p.text}</span>
            </span>
          </motion.li>
        ))}
      </ul>
      <div className="flex flex-col items-start gap-1">
        <p className="t-footnote flex items-center gap-2 text-ink-3">
          <Lock size={14} strokeWidth={2.2} aria-hidden className="shrink-0" />
          Niente account: tutto resta su questo telefono.
        </p>
        {onRestore && (
          <button type="button" onClick={onRestore} className="t-footnote hit-44 inline-flex min-h-[44px] items-center gap-2 font-semibold text-accent-ink">
            <ArchiveRestore size={15} strokeWidth={2.2} aria-hidden className="shrink-0" />
            Hai già un backup? Ripristinalo
          </button>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── 2 · Tu ─────────────────────────

export function StepYou({ profile, setProfile, errors, showErrors }: StepProps & { errors: ProfileErrors; showErrors: boolean }) {
  const year = currentDate().getFullYear();
  const shown = showErrors ? errors : {};
  const valid = !hasErrors(validateBody(profile, year));
  const targets = useMemo(() => (valid ? computeTargets(profile, profile.startWeightKg, currentDate()) : null), [profile, valid]);

  return (
    <div className="flex flex-col gap-7">
      <StepHeader eyebrow="Passo 2 di 5 · Tu" title="Parliamo di te">
        Servono per calorie e proteine dei quattro tipi di giornata. Restano su questo telefono.
      </StepHeader>

      <Field label="Come ti chiami" optional>
        <TextInput value={profile.name ?? ''} onChange={(name) => setProfile({ name: name || undefined })} placeholder="Nome" autoComplete="given-name" autoCapitalize="words" maxLength={40} />
      </Field>

      <div className="flex flex-col gap-2">
        <span className="t-label px-1 text-ink-3" id="sesso-label">
          Sesso
        </span>
        <Segmented
          aria-label="Sesso"
          value={profile.sex}
          onChange={(sex) => setProfile({ sex })}
          options={[
            { value: 'M', label: 'Uomo' },
            { value: 'F', label: 'Donna' },
          ]}
        />
      </div>

      <ListGroup title="Corpo" footer={showErrors && hasErrors(errors) ? undefined : 'Il peso di partenza serve solo per iniziare: poi conta quello dei controlli del mattino.'}>
        <FormRow label="Anno di nascita" htmlFor="ob-anno" error={shown.birthYear}>
          <InlineNumber id="ob-anno" value={profile.birthYear || undefined} onChange={(v) => setProfile({ birthYear: v ?? 0 })} placeholder="es. 1995" chars={6} invalid={Boolean(shown.birthYear)} />
        </FormRow>
        <FormRow label="Altezza" htmlFor="ob-altezza" error={shown.heightCm}>
          <InlineNumber id="ob-altezza" value={profile.heightCm || undefined} onChange={(v) => setProfile({ heightCm: v ?? 0 })} placeholder="es. 178" unit="cm" chars={5} invalid={Boolean(shown.heightCm)} />
        </FormRow>
        <FormRow label="Peso" htmlFor="ob-peso" error={shown.startWeightKg}>
          <InlineNumber
            id="ob-peso"
            value={profile.startWeightKg || undefined}
            onChange={(v) => setProfile({ startWeightKg: v ?? 0 })}
            placeholder="es. 72,5"
            decimals={1}
            unit="kg"
            chars={5}
            invalid={Boolean(shown.startWeightKg)}
            enterKeyHint="done"
          />
        </FormRow>
      </ListGroup>

      <section className="flex flex-col gap-2" aria-labelledby="obiettivo-label">
        <h3 id="obiettivo-label" className="t-label px-1 text-ink-3">
          Obiettivo
        </h3>
        <ChoiceCards aria-label="Obiettivo" value={profile.goal} onChange={(goal) => setProfile({ goal })} options={GOAL_OPTIONS} />
      </section>

      <EstimateCard targets={targets} />

      <Field label="Competenze" optional hint="Il coach adatta il tono: niente spiegazioni da principiante.">
        <TextInput value={profile.expertise ?? ''} onChange={(expertise) => setProfile({ expertise: expertise || undefined })} placeholder="Es. allenatore, fisioterapista, medico dello sport" maxLength={80} />
      </Field>
    </div>
  );
}

/** Stima del fabbisogno che si aggiorna mentre scrivi. */
function EstimateCard({ targets }: { targets: Record<DayType, MacroTarget> | null }) {
  return (
    <Card variant="highlight" padding="lg" className="flex flex-col gap-4" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <span className="t-label text-ink-3">Fabbisogno stimato</span>
        <Sparkles size={16} strokeWidth={2.2} className="text-accent-ink" aria-hidden />
      </div>
      {targets ? (
        <>
          <div className="grid grid-cols-4 gap-2">
            {DAY_TYPES.map((t) => (
              <div key={t} className="flex flex-col gap-1">
                <span className="text-[0.75rem] font-semibold" style={{ color: toneInk(t) }}>
                  {DAY_TYPE_LABEL[t]}
                </span>
                <NumberTicker value={targets[t].kcal} className="t-num text-[1.625rem] text-ink" />
              </div>
            ))}
          </div>
          <p className="t-footnote text-ink-2">
            kcal al giorno · proteine <strong className="font-semibold text-ink">{fmtNumber(targets.palestra.proteinG)} g</strong>, cioè 1,9 g per kg. Calcolo Mifflin-St Jeor per l’attività di ogni giornata.
          </p>
        </>
      ) : (
        <p className="t-callout text-ink-2">Scrivi anno, altezza e peso: qui compaiono le calorie di ogni tipo di giornata.</p>
      )}
    </Card>
  );
}

// ───────────────────────── 3 · Settimana ─────────────────────────

export function StepWeek({ plan, setDay }: StepProps) {
  const [editing, setEditing] = useState<Weekday | null>(null);
  const counts = dayTypeCounts(plan.week);
  return (
    <div className="flex flex-col gap-7">
      <StepHeader eyebrow="Passo 3 di 5 · Settimana" title="La tua settimana">
        Calcio, palestra e fisioterapista sono già al loro posto. Tocca un giorno per cambiarlo.
      </StepHeader>
      <Card padding="md" className="flex flex-col gap-3.5">
        <WeekRibbon week={plan.week} onSelect={setEditing} />
        <p className="t-footnote flex flex-wrap gap-x-3 gap-y-1 text-ink-2">
          {counts.map(({ type, count }) => (
            <span key={type} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full" style={{ background: toneColor(type) }} />
              {count} {DAY_TYPE_LABEL[type].toLowerCase()}
            </span>
          ))}
        </p>
      </Card>
      <WeekDayList week={plan.week} onSelect={setEditing} />
      <p className="t-footnote -mt-3 px-1 text-ink-3">Il tipo di giorno decide calorie e carboidrati: più alti nei giorni di calcio, più bassi nel riposo.</p>
      <DayEditorSheet day={editing !== null ? (plan.week.find((d) => d.weekday === editing) ?? null) : null} onClose={() => setEditing(null)} onChange={setDay} />
    </div>
  );
}

// ───────────────────────── 4 · Sonno ─────────────────────────

const CURFEW_OPTIONS = [15, 30, 45, 60].map((m) => ({ value: String(m), label: `${m} min` }));

export function StepSleep({ plan, setPlan }: StepProps) {
  const s = plan.sleep;
  const set = (patch: Partial<Plan['sleep']>) => setPlan({ sleep: { ...s, ...patch } });
  const curfew = curfewFor('', plan);
  const weeks = sleepSteps(s).length - 1;
  return (
    <div className="flex flex-col gap-7">
      <StepHeader eyebrow="Passo 4 di 5 · Sonno" title="Il sonno, un passo alla volta">
        Ogni settimana l’orario a letto si anticipa di {s.stepMin} minuti, finché arrivi all’obiettivo. Abbastanza poco da non accorgertene.
      </StepHeader>
      <ListGroup>
        <FormRow icon={AlarmClock} iconTone="accent" label="Sveglia">
          <TimePill label="Sveglia" value={s.wake} onChange={(wake) => set({ wake })} />
        </FormRow>
        <FormRow icon={BedDouble} iconTone="riposo" label="Di solito vai a letto" hint="Il punto di partenza, senza giudizi">
          <TimePill label="Di solito vai a letto" value={s.current} onChange={(current) => set({ current })} />
        </FormRow>
        <FormRow icon={Target} iconTone="good" label="Obiettivo">
          <TimePill label="Obiettivo dell’orario a letto" value={s.target} onChange={(target) => set({ target })} />
        </FormRow>
      </ListGroup>
      <Card padding="lg">
        <SleepStairs sleep={s} />
      </Card>
      <section className="flex flex-col gap-2" aria-labelledby="coprifuoco-label">
        <h3 id="coprifuoco-label" className="t-label px-1 text-ink-3">
          Telefono fuori dalla camera
        </h3>
        <Segmented aria-label="Minuti prima di andare a letto" value={String(s.curfewLeadMin)} onChange={(v) => set({ curfewLeadMin: Number(v) })} options={CURFEW_OPTIONS} />
        <p className="t-footnote flex items-start gap-2 px-1 text-ink-3">
          <Smartphone size={14} strokeWidth={2.2} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Questa settimana: telefono in carica fuori dalla camera alle <strong className="font-semibold text-ink-2">{curfew}</strong>, a letto alle{' '}
            <strong className="font-semibold text-ink-2">{s.current}</strong>.{weeks === 0 ? '' : ` Obiettivo in ${plural(weeks, 'settimana', 'settimane')}.`}
          </span>
        </p>
      </section>
    </div>
  );
}

// ───────────────────────── 5 · Zone e integratori ─────────────────────────

export function StepWatch({ profile, plan, setProfile, setPlan }: StepProps) {
  const [editing, setEditing] = useState<{ sup: Supplement | null; n: number } | null>(null);
  const supps = plan.supplements;
  return (
    <div className="flex flex-col gap-7">
      <StepHeader eyebrow="Passo 5 di 5 · Da tenere d’occhio" title="Dolori e integratori">
        Le zone che segni ogni mattina da 0 a 10 e gli integratori da non dimenticare.
      </StepHeader>
      <section className="flex flex-col gap-2.5" aria-labelledby="zone-label">
        <h3 id="zone-label" className="t-label px-1 text-ink-3">
          Zone da monitorare
        </h3>
        <PainSitesPicker value={profile.painSites} onChange={(painSites) => setProfile({ painSites })} />
        <p className="t-footnote px-1 text-ink-3">
          Sopra {plan.painThreshold} su 10, o se il dolore peggiora, l’app propone di mantenere o ridurre il carico.
        </p>
      </section>
      <section className="flex flex-col gap-2.5" aria-labelledby="integratori-label">
        <h3 id="integratori-label" className="t-label px-1 text-ink-3">
          Integratori
        </h3>
        <SupplementList
          supplements={supps}
          onToggle={(id, active) => setPlan({ supplements: supps.map((s) => (s.id === id ? { ...s, active } : s)) })}
          onEdit={(sup) => setEditing((e) => ({ sup, n: (e?.n ?? 0) + 1 }))}
          onAdd={() => setEditing((e) => ({ sup: null, n: (e?.n ?? 0) + 1 }))}
        />
        <p className="t-footnote px-1 text-ink-3">Compaiono nella giornata con il pasto scelto. Dosi da concordare con il medico.</p>
      </section>
      {editing && (
        <SupplementSheet
          key={editing.n}
          supplement={editing.sup}
          onClosed={() => setEditing(null)}
          onSave={(sup) =>
            setPlan({ supplements: supps.some((s) => s.id === sup.id) ? supps.map((s) => (s.id === sup.id ? sup : s)) : [...supps, sup] })
          }
          onDelete={(id) => setPlan({ supplements: supps.filter((s) => s.id !== id) })}
        />
      )}
    </div>
  );
}

// ───────────────────────── Finale · Il tuo piano è pronto ─────────────────────────

function ReadyBadge() {
  const reduce = useReducedMotion();
  return (
    <div className="relative grid size-[84px] place-items-center" aria-hidden>
      <span className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, var(--accent-glow), transparent 70%)', animation: reduce ? undefined : 'ritmo-glow 1.6s 0.7s ease-out both' }} />
      <svg viewBox="0 0 84 84" className="absolute inset-0">
        <circle cx="42" cy="42" r="36" fill="none" stroke="var(--line)" strokeWidth="5" />
        <motion.circle
          cx="42"
          cy="42"
          r="36"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="5"
          strokeLinecap="round"
          transform="rotate(-90 42 42)"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        />
      </svg>
      <motion.span
        className="grid size-12 place-items-center rounded-full bg-accent text-on-accent shadow-[0_8px_24px_-8px_var(--accent-glow)]"
        initial={reduce ? false : { scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.75 }}
      >
        <Check size={26} strokeWidth={3} />
      </motion.span>
    </div>
  );
}

export function StepReady({ profile, plan, targets, install }: Pick<StepProps, 'profile' | 'plan'> & { targets: Record<DayType, MacroTarget>; install?: boolean }) {
  const today = useToday();
  const now = useNowHHMM();
  const next = nextGymSession(plan, today, now);
  const curfew = curfewFor('', plan);
  const weeks = sleepSteps(plan.sleep).length - 1;
  const counts = Object.fromEntries(dayTypeCounts(plan.week).map((c) => [c.type, c.count])) as Partial<Record<DayType, number>>;
  const active = plan.supplements.filter((s) => s.active);
  const footballDays = plan.week.filter((d) => d.football).map((d) => WEEKDAY_SHORT[d.weekday]);
  // Vigilie della partita: mangiano come un giorno di calcio (porzioni e obiettivo).
  const eveNote = matchEveNote(plan.week);
  const name = profile.name?.trim().split(/\s+/)[0];

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col items-start gap-5">
        <ReadyBadge />
        <StepHeader eyebrow={name ? `Tutto pronto, ${name}` : 'Tutto pronto'} title="Il tuo piano è pronto">
          Questi sono i numeri di partenza. Ogni domenica la revisione li aggiusta con i tuoi dati.
        </StepHeader>
      </div>

      <section className="flex flex-col gap-2" aria-labelledby="kcal-label">
        <h3 id="kcal-label" className="t-label px-1 text-ink-3">
          Calorie per tipo di giorno
        </h3>
        <div className="grid grid-cols-2 gap-2.5">
          {DAY_TYPES.map((t, i) => (
            <motion.div key={t} {...staggerItem(i, 0.06)}>
              <Card padding="md" className="flex h-full flex-col gap-2 overflow-hidden">
                <span aria-hidden className="pointer-events-none absolute -right-6 -top-8 size-24 rounded-full" style={{ background: `radial-gradient(circle, ${toneSoft(t, 22)}, transparent 70%)` }} />
                <div className="relative flex items-center justify-between gap-2">
                  <DayTypeBadge dayType={t} variant="dot" />
                  <span className="t-label text-[0.75rem] text-ink-2">{counts[t] ? plural(counts[t]!, 'giorno', 'giorni') : 'nessuno'}</span>
                </div>
                <div className="relative flex items-baseline gap-1">
                  <NumberTicker value={targets[t].kcal} duration={0.9} className="t-num text-[2rem] text-ink" />
                  <span className="t-mono text-[0.75rem] text-ink-3">kcal</span>
                </div>
                <span className="t-mono relative flex flex-wrap gap-x-2 text-[0.6875rem] text-ink-2">
                  <span className="whitespace-nowrap">P {fmtNumber(targets[t].proteinG)}</span>
                  <span className="whitespace-nowrap">C {fmtNumber(targets[t].carbG)}</span>
                  <span className="whitespace-nowrap">G {fmtNumber(targets[t].fatG)}</span>
                </span>
              </Card>
            </motion.div>
          ))}
        </div>
        {eveNote && (
          <p className="t-footnote px-1 text-pretty text-ink-3">{`${eveNote}: ${fmtNumber(targets.calcio.kcal)} kcal, per arrivare in campo con il glicogeno pieno.`}</p>
        )}
      </section>

      <ListGroup title="La prima settimana">
        <ListRow
          icon={Dumbbell}
          iconTone="palestra"
          title="Prima seduta"
          subtitle={next ? `${relativeWeekday(next.inDays, WEEKDAY_LONG[next.weekday])} alle ${next.time}${next.optional ? ', facoltativa' : ''}` : undefined}
          value={next ? next.name : 'Nessuna in programma'}
        />
        <ListRow icon={BallIcon} iconTone="calcio" title="Calcio" value={footballDays.length ? listIt(footballDays) : 'Nessuno'} />
        <ListRow
          icon={Moon}
          iconTone="riposo"
          title="A letto questa settimana"
          subtitle={`Telefono fuori alle ${curfew}${weeks ? `, obiettivo ${plan.sleep.target} in ${plural(weeks, 'settimana', 'settimane')}` : ''}`}
          value={<span className="t-num text-[1.25rem] text-ink">{plan.sleep.current}</span>}
        />
        <ListRow icon={PillIcon} iconTone="leggero" title="Integratori" value={active.length ? plural(active.length, 'attivo', 'attivi') : 'Nessuno'} />
        <ListRow icon={Activity} iconTone="bad" title="Zone monitorate" value={profile.painSites.length ? listIt(profile.painSites) : 'Nessuna'} />
      </ListGroup>

      {install && (
        <InstallCard note="Installata, Ritmo parte da capo: i dati scritti in Safari restano a Safari. Installala adesso e rifai questi passi dall’icona, bastano due minuti." />
      )}

      {!profile.painSites.length && (
        <Callout tone="neutral" title="Nessuna zona di dolore">
          Puoi aggiungerle quando vuoi dalle impostazioni: il controllo del mattino chiederà solo sonno, peso ed energia.
        </Callout>
      )}
      <p className={cn('t-footnote px-1 text-ink-3')}>Puoi cambiare tutto dalle impostazioni, quando vuoi.</p>
    </div>
  );
}
