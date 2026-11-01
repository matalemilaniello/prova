/**
 * Benvenuto: 5 passi a schermo intero e il riepilogo "Il tuo piano è pronto".
 * Precompilato con i valori predefiniti; la bozza resta sul telefono se l'app si chiude a metà.
 * Alla fine gli obiettivi si ricalcolano dal profilo (computeTargets) e il piano parte dal lunedì di questa settimana.
 * Anteprime: ?onboarding=1 e ?step=1…6.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, ChevronLeft, FlaskConical } from 'lucide-react';
import type { Plan, Profile, ScheduleDay, Weekday } from '../../domain/types';
import { DEFAULT_PROFILE, defaultPlan } from '../../data/defaults';
import { navigate } from '../../app/router';
import { getUrlParam } from '../../app/urlParams';
import { currentDate, nowHHMM, todayISO, weekStart } from '../../engine/dates';
import { planDayISO } from '../../engine/sleep';
import { computeTargets } from '../../engine/targets';
import { haptic } from '../../lib/haptics';
import { useApp } from '../../state/store';
import { Button, Floodlights, cn, useKeyboardInset } from '../../ui';
import { useSessionDraft } from '../allenamento/draft';
import { canSuggestInstall } from '../impostazioni/install';
import { hasErrors, validateBody } from '../impostazioni/lib';
import { clearDraft, loadDraft, saveDraft } from './draft';
import { RestoreSheet } from './RestoreSheet';
import { StepReady, StepSleep, StepWatch, StepWeek, StepWelcome, StepYou } from './steps';

const STEPS = 5;
const READY = 5;
const LAST = READY;

function initialState(): { step: number; profile: Profile; plan: Plan } {
  const fresh = { profile: JSON.parse(JSON.stringify(DEFAULT_PROFILE)) as Profile, plan: defaultPlan(todayISO()) };
  const param = Number(getUrlParam('step'));
  if (Number.isInteger(param) && param >= 1 && param <= LAST + 1) return { step: param - 1, ...fresh };
  const draft = loadDraft();
  if (draft) return { step: Math.min(Math.max(0, draft.step), LAST), profile: draft.profile, plan: draft.plan };
  return { step: 0, ...fresh };
}

export default function BenvenutoScreen() {
  const [init] = useState(initialState);
  const [step, setStep] = useState(init.step);
  const [dir, setDir] = useState<1 | -1>(1);
  const [profile, setProfileState] = useState<Profile>(init.profile);
  const [plan, setPlanState] = useState<Plan>(init.plan);
  const [showErrors, setShowErrors] = useState(false);
  const [nudge, setNudge] = useState(0);
  const [restoring, setRestoring] = useState(false);
  const [install] = useState(canSuggestInstall);
  const reduce = useReducedMotion();
  const kb = useKeyboardInset();
  const year = currentDate().getFullYear();

  // Salva la bozza a ogni cambio (non con ?step=, che serve alle anteprime).
  const isPreviewStep = useRef(getUrlParam('step') !== null);
  useEffect(() => {
    if (isPreviewStep.current) return;
    if (step === 0 && !profile.birthYear && !profile.heightCm && !profile.startWeightKg) return;
    saveDraft({ v: 1, step, profile, plan });
  }, [step, profile, plan]);

  const setProfile = useCallback((patch: Partial<Profile>) => setProfileState((p) => ({ ...p, ...patch })), []);
  const setPlan = useCallback((patch: Partial<Plan>) => setPlanState((p) => ({ ...p, ...patch })), []);
  const setDay = useCallback(
    (weekday: Weekday, patch: Partial<ScheduleDay>) =>
      setPlanState((p) => ({ ...p, week: p.week.map((d) => (d.weekday === weekday ? ({ ...d, ...patch, weekday } as ScheduleDay) : d)) })),
    [],
  );

  // A ogni passo il focus va al titolo, così i lettori di schermo annunciano dove sei.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-step="${step}"] [data-step-title]`)?.focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(t);
  }, [step]);

  const errors = useMemo(() => validateBody(profile, year), [profile, year]);
  const targets = useMemo(() => computeTargets(profile, profile.startWeightKg, currentDate()), [profile]);

  const go = (to: number) => {
    setDir(to > step ? 1 : -1);
    setStep(Math.max(0, Math.min(LAST, to)));
  };

  const next = () => {
    if (step === 1 && hasErrors(errors)) {
      setShowErrors(true);
      setNudge((n) => n + 1);
      haptic('warning');
      const first = errors.birthYear ? 'ob-anno' : errors.heightCm ? 'ob-altezza' : 'ob-peso';
      const el = document.getElementById(first);
      el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      window.setTimeout(() => el?.focus({ preventScroll: true }), reduce ? 0 : 280);
      return;
    }
    (document.activeElement as HTMLElement | null)?.blur?.();
    haptic('light');
    go(step + 1);
  };

  const finish = () => {
    // La giornata del piano (alle 00:30 è ancora ieri), come in Oggi.
    const now = currentDate();
    const today = planDayISO(now, plan);
    const cleanProfile: Profile = { ...profile, name: profile.name?.trim() || undefined, expertise: profile.expertise?.trim() || undefined };
    // Primo avvio: le voci prima di adesso non contano e la prima settimana della revisione parte da qui.
    const finalPlan: Plan = { ...plan, targets, startDate: weekStart(today), firstUse: plan.firstUse ?? { date: today, time: nowHHMM(now) } };
    clearDraft();
    useSessionDraft.getState().clear();
    haptic('success');
    navigate('oggi');
    useApp.getState().completeOnboarding(cleanProfile, finalPlan);
  };

  const tryDemo = () => {
    clearDraft();
    useSessionDraft.getState().clear();
    haptic('light');
    navigate('oggi');
    useApp.getState().loadDemo();
  };

  const variants = {
    enter: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: d * 48 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: d * -48 }),
  };

  const stepProps = { profile, plan, setProfile, setPlan, setDay };

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-bg" style={kb ? { paddingBottom: kb } : undefined}>
      <Backdrop step={step} />

      {/* Barra in alto: indietro, avanzamento, passo. */}
      <header className="relative z-10 flex shrink-0 items-center gap-3 px-[calc(var(--gutter)-6px)] pb-2 pt-[calc(var(--safe-top)+10px)]">
        <div className="w-11">
          <AnimatePresence initial={false}>
            {step > 0 && (
              <motion.button
                type="button"
                aria-label="Indietro"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  haptic('selection');
                  go(step - 1);
                }}
                className="grid size-11 place-items-center rounded-full text-ink-2 hover:text-ink"
              >
                <ChevronLeft size={26} strokeWidth={2.4} aria-hidden />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        <Progress step={step} />
        <div className="t-mono w-11 text-right text-[0.75rem] text-ink-3" aria-hidden>
          {step < READY ? `${step + 1}/${STEPS}` : ''}
        </div>
      </header>

      {/* Passi: scorrono di lato con una molla. */}
      <main className="relative min-h-0 flex-1">
        <AnimatePresence initial={false} custom={dir}>
          <motion.section
            key={step}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 380, damping: 36, mass: 0.9 }}
            data-step={step}
            className="no-scrollbar absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain px-[calc(var(--gutter)+var(--safe-left))] pb-10 pt-4"
            aria-label={`Passo ${Math.min(step + 1, STEPS)} di ${STEPS}`}
          >
            <div className="mx-auto w-full max-w-[520px]">
              {step === 0 && <StepWelcome plan={plan} install={install} onRestore={() => setRestoring(true)} />}
              {step === 1 && <StepYou {...stepProps} errors={errors} showErrors={showErrors} />}
              {step === 2 && <StepWeek {...stepProps} />}
              {step === 3 && <StepSleep {...stepProps} />}
              {step === 4 && <StepWatch {...stepProps} />}
              {step === READY && <StepReady profile={profile} plan={plan} targets={targets} install={install} />}
            </div>
          </motion.section>
        </AnimatePresence>
        {/* Dissolvenza sopra il piede. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-bg to-transparent" />
      </main>

      <footer className="relative z-10 shrink-0 px-[calc(var(--gutter)+var(--safe-left))] pb-[max(var(--safe-bottom),16px)] pt-2">
        <div className="mx-auto flex w-full max-w-[520px] flex-col gap-2">
          {step === 0 ? (
            <>
              <Button size="lg" fullWidth iconRight={ArrowRight} onClick={next}>
                Inizia
              </Button>
              <Button size="lg" variant="ghost" fullWidth icon={FlaskConical} onClick={tryDemo}>
                Prova con dati di esempio
              </Button>
            </>
          ) : step === READY ? (
            <Button size="lg" fullWidth iconRight={ArrowRight} onClick={finish}>
              Comincia da oggi
            </Button>
          ) : (
            <motion.div key={nudge} animate={nudge && !reduce ? { x: [0, -7, 6, -4, 3, 0] } : undefined} transition={{ duration: 0.38 }}>
              <Button size="lg" fullWidth iconRight={ArrowRight} onClick={next}>
                {step === 4 ? 'Vedi il piano' : 'Continua'}
              </Button>
            </motion.div>
          )}
        </div>
      </footer>
      {restoring && <RestoreSheet onClosed={() => setRestoring(false)} />}
    </div>
  );
}

/** Avanzamento a 5 segmenti, come le storie: il segmento attivo si riempie con una molla. */
function Progress({ step }: { step: number }) {
  return (
    <div className="flex flex-1 gap-1.5" role="progressbar" aria-label="Avanzamento del benvenuto" aria-valuemin={1} aria-valuemax={STEPS} aria-valuenow={Math.min(step + 1, STEPS)}>
      {Array.from({ length: STEPS }, (_, i) => (
        <span key={i} className="relative h-1 flex-1 overflow-hidden rounded-full bg-ink-soft">
          {/* Segmenti in ambra pieno: ambra trasparente sul blu diventa oliva. */}
          <motion.span
            className="absolute inset-y-0 left-0 rounded-full bg-accent"
            initial={false}
            animate={{ width: i <= step ? '100%' : '0%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          />
        </span>
      ))}
    </div>
  );
}

/**
 * Riflettori e righe del campo sullo sfondo: le luci si accendono un poco a ogni passo, mentre il piano prende
 * forma, e al riepilogo arrivano a piena luce con un bagliore breve.
 */
function Backdrop({ step }: { step: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <Floodlights intensity={0.2 + (0.8 * step) / READY} flare={step === READY ? 1 : false} pitch={false} height={460} />
      <svg className={cn('absolute -bottom-24 left-1/2 w-[720px] -translate-x-1/2')} viewBox="0 0 720 360" fill="none">
        <circle cx="360" cy="360" r="120" stroke="var(--pitch-line)" strokeWidth="2" />
        <line x1="0" y1="360" x2="720" y2="360" stroke="var(--pitch-line)" strokeWidth="2" />
      </svg>
    </div>
  );
}
