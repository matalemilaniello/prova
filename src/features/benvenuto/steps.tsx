/**
 * I passi del benvenuto. Ogni passo riceve la bozza (profilo e piano) e i modi per cambiarla.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AlarmClock, ArchiveRestore, BedDouble, CalendarCheck2, Check, Hand, Lock, Smartphone, Sparkles, Target, TrendingUp } from 'lucide-react';
import type { DayType, MacroTarget, Plan, Profile, ScheduleDay, Supplement, Weekday } from '../../domain/types';
import { computeTargets } from '../../engine/targets';
import { currentDate, formatDayLong } from '../../engine/dates';
import { curfewFor } from '../../engine/sleep';
import { DAY_TYPE_LABEL, DAY_TYPES, fmtNumber } from '../../lib/format';
import { useNow } from '../../state/hooks';
import { Card, DayTypeBadge, Disclosure, Field, ListGroup, NumberTicker, Segmented, TextInput, cn, staggerItem, toneInk, toneSoft } from '../../ui';
import { ChoiceCards, FormRow, InlineNumber, TimePill, tileStyle } from '../impostazioni/components/controls';
import { InstallCard } from '../impostazioni/components/InstallCard';
import { PainSitesPicker } from '../impostazioni/components/Pickers';
import { SleepStairs, SleepTargetHint } from '../impostazioni/components/SleepStairs';
import { SupplementList, SupplementSheet } from '../impostazioni/components/SupplementEditor';
import { DayEditorSheet, WeekDayList } from '../impostazioni/components/WeekEditor';
import { GOAL_OPTIONS, hasErrors, impactRuleNote, matchCarbNote, targetDayCounts, targetDaysLabel, validateBody, type ProfileErrors } from '../impostazioni/lib';
import { DayDial } from './DayDial';
import { finalizePlan, firstWeekSteps, startInfo } from './firstWeek';
import { CalendarInvite } from './CalendarInvite';
import { FirstWeekList } from './FirstWeekList';

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
    text: 'In settimana non pianifichi niente.',
  },
  {
    icon: Hand,
    tone: 'good',
    title: 'Un tocco per voce',
    text: 'Nei giorni no bastano quattro cose.',
  },
  {
    icon: TrendingUp,
    tone: 'palestra',
    title: 'Il piano impara',
    text: 'Si corregge ogni domenica.',
  },
];

/**
 * Diametro del quadrante: più piccolo sugli schermi bassi, così i tre principi restano sopra il pulsante. Sotto i
 * 380 px di larghezza i testi vanno a capo prima: il quadrante cede altri 24 px e la pagina resta senza scorrimento.
 */
function dialSize(): number {
  const h = typeof window === 'undefined' ? 900 : window.innerHeight;
  const w = typeof window === 'undefined' ? 390 : window.innerWidth;
  const base = h >= 900 ? 264 : h >= 800 ? 176 : 156;
  return w < 380 && base < 264 ? base - 24 : base;
}

export function StepWelcome({ plan, install, onRestore }: Pick<StepProps, 'plan'> & { install?: boolean; onRestore?: () => void }) {
  const [size] = useState(dialSize);
  return (
    <div className="flex flex-col gap-4">
      <div className="-mt-2 flex justify-center">
        <DayDial plan={plan} weekday={0} size={size} />
      </div>
      <StepHeader eyebrow="Benvenuto in Ritmo" title="La tua giornata, già decisa">
        Pasti, allenamento intorno al calcio e sonno: li decide il piano, tu esegui.
      </StepHeader>
      {install && (
        <InstallCard compact note="Su iPhone l’app installata non vede i dati scritti in Safari: installala adesso e comincia dall’icona." />
      )}
      <ul className="flex flex-col gap-3">
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
      <div className="flex flex-col items-start gap-2.5">
        <p className="t-footnote flex items-center gap-2 text-ink-3">
          <Lock size={14} strokeWidth={2.2} aria-hidden className="shrink-0" />
          Niente account: tutto resta su questo telefono.
        </p>
        {onRestore && (
          <button type="button" onClick={onRestore} className="t-footnote hit-44 inline-flex items-center gap-2 font-semibold text-accent-ink">
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
        <TextInput value={profile.expertise ?? ''} onChange={(expertise) => setProfile({ expertise: expertise || undefined })} placeholder="Es. allenatore, fisioterapista" maxLength={80} />
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
            kcal al giorno: Mifflin-St Jeor per il fattore di attività di ogni giornata. Proteine <strong className="font-semibold text-ink">{fmtNumber(targets.palestra.proteinG)} g</strong>, cioè 1,9 g per kg.
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
  // Un solo elemento: l'elenco dei giorni, che è anche l'editor (la striscia delle icone ripeteva le stesse cose).
  return (
    <div className="flex flex-col gap-7">
      <StepHeader eyebrow="Passo 3 di 5 · Settimana" title="La tua settimana">
        Calcio, palestra e fisioterapista sono già al loro posto. Tocca un giorno per cambiarlo.
      </StepHeader>
      <WeekDayList week={plan.week} onSelect={setEditing} />
      <p className="t-footnote -mt-4 px-1 text-ink-3">Il tipo di giorno decide calorie e carboidrati.</p>
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
  return (
    <div className="flex flex-col gap-7">
      <StepHeader eyebrow="Passo 4 di 5 · Sonno" title="Il sonno, un passo alla volta">
        Ogni settimana a letto {s.stepMin} minuti prima: abbastanza poco da non accorgertene.
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
      <div className="flex flex-col gap-2.5">
        <Card padding="lg">
          <SleepStairs sleep={s} />
        </Card>
        <SleepTargetHint sleep={s} onApply={(target) => set({ target })} />
      </div>
      <section className="flex flex-col gap-2" aria-labelledby="coprifuoco-label">
        <h3 id="coprifuoco-label" className="t-label px-1 text-ink-3">
          Telefono fuori dalla camera
        </h3>
        <Segmented aria-label="Minuti prima di andare a letto" value={String(s.curfewLeadMin)} onChange={(v) => set({ curfewLeadMin: Number(v) })} options={CURFEW_OPTIONS} />
        <p className="t-footnote flex items-start gap-2 px-1 text-ink-3">
          <Smartphone size={14} strokeWidth={2.2} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Questa settimana: telefono in carica fuori dalla camera alle <strong className="font-semibold text-ink-2">{curfew}</strong>, a letto alle{' '}
            <strong className="font-semibold text-ink-2">{s.current}</strong>.
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
  const impactNote = impactRuleNote(profile.painSites, plan.painThreshold, plan.impactThreshold);
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
          {impactNote ? ` ${impactNote}` : ''}
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
  // Lo stesso piano che si salva toccando "Comincia da oggi": inizio di lunedì e primo avvio adesso.
  const now = useNow(30_000);
  const final = useMemo(() => finalizePlan(plan, targets, now), [plan, targets, now]);
  const steps = useMemo(() => firstWeekSteps(final, profile.painSites), [final, profile.painSites]);
  const start = startInfo(final);
  const first = final.firstUse?.date ?? final.startDate;
  // Vigilie della partita: mangiano come un giorno di calcio (porzioni e obiettivo), e lì si contano. Un tipo di
  // giorno che la settimana non usa (di solito il riposo, quando la domenica è la vigilia) non compare.
  const counts = targetDayCounts(plan.week);
  const carbNote = matchCarbNote(plan.week, targets.calcio.carbG, profile.startWeightKg);
  const used = DAY_TYPES.filter((t) => counts[t] > 0);
  const name = profile.name?.trim().split(/\s+/)[0];
  // I giorni di avvio finiscono il giorno prima dell'inizio ("fino ad allora") o dentro la settimana 1 (chi
  // comincia di domenica non ha tempo per la preparazione: ricette veloci anche la prima settimana).
  const until = start.starterUntil;
  const intro = start.startsLater
    ? until && until < start.startDate
      ? `Il piano parte ${formatDayLong(start.startDate)}: fino ad allora ricette veloci, senza preparazione.`
      : `Il piano parte ${formatDayLong(start.startDate)}.${until ? ` Fino a ${formatDayLong(until)} ricette veloci, senza preparazione.` : ''}`
    : `Si comincia adesso, senza niente da recuperare.${until ? ` Fino a ${formatDayLong(until)} ricette veloci, senza preparazione.` : ''}`;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col items-start gap-5">
        <ReadyBadge />
        <StepHeader eyebrow={name ? `Tutto pronto, ${name}` : 'Tutto pronto'} title="Il tuo piano è pronto">
          {intro}
        </StepHeader>
      </div>

      {steps.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="prima-settimana-label">
          <h3 id="prima-settimana-label" className="t-label px-1 text-ink-3">
            La prima settimana
          </h3>
          <FirstWeekList steps={steps} first={first} />
        </section>
      )}

      <section className="flex flex-col gap-2" aria-labelledby="kcal-label">
        <h3 id="kcal-label" className="t-label px-1 text-ink-3">
          Calorie per tipo di giorno
        </h3>
        {/* Solo i tipi che la settimana usa davvero; con un numero dispari il primo (il calcio) prende tutta la riga. */}
        <div className="grid grid-cols-2 gap-2.5">
          {used.map((t, i) => {
            const wide = used.length % 2 === 1 && i === 0;
            return (
              <motion.div key={t} {...staggerItem(i, 0.06)} className={wide ? 'col-span-2' : undefined}>
                <Card padding="md" className="flex h-full flex-col gap-2 overflow-hidden">
                  <span
                    aria-hidden
                    className={cn('pointer-events-none absolute rounded-full', wide ? '-right-10 -top-16 size-44' : '-right-6 -top-8 size-24')}
                    style={{ background: `radial-gradient(circle, ${toneSoft(t, 22)}, transparent 70%)` }}
                  />
                  <div className="relative flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                    <DayTypeBadge dayType={t} variant="dot" />
                    <span className="t-label text-[0.75rem] text-ink-2">{targetDaysLabel(t, plan.week)}</span>
                  </div>
                  <div className={cn('relative flex gap-x-3 gap-y-1', wide ? 'flex-wrap items-end justify-between' : 'flex-col')}>
                    <div className="flex items-baseline gap-1">
                      <NumberTicker value={targets[t].kcal} duration={0.9} className={cn('t-num text-ink', wide ? 'text-[2.5rem]' : 'text-[2rem]')} />
                      <span className="t-unit text-ink-3">kcal</span>
                    </div>
                    <span className={cn('t-caption tabular flex flex-wrap gap-x-2 text-ink-2', wide && 'pb-1')}>
                      <span className="whitespace-nowrap">P {fmtNumber(targets[t].proteinG)}</span>
                      <span className="whitespace-nowrap">C {fmtNumber(targets[t].carbG)}</span>
                      <span className="whitespace-nowrap">G {fmtNumber(targets[t].fatG)}</span>
                    </span>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
        {/* La chiave delle sigle e il perché della vigilia stanno dietro un tocco: in vista restano i numeri. */}
        <Disclosure variant="inline" tone="quiet" title="Come si leggono" className="px-1">
          P, C e G sono proteine, carboidrati e grassi in grammi. {carbNote ? `${carbNote} ` : ''}Sono numeri di partenza: la
          revisione della domenica propone le correzioni.
        </Disclosure>
      </section>

      {/* Chi deve ancora installare l'app rifà questi passi dall'icona: gli avvisi li aggiunge lì, una volta sola. */}
      {install ? (
        <InstallCard note="Installata, Ritmo parte da capo: i dati scritti in Safari restano a Safari. Installala adesso e rifai questi passi dall’icona, bastano due minuti." />
      ) : (
        <CalendarInvite plan={final} />
      )}
    </div>
  );
}
