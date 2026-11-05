/**
 * Impostazioni: elenco raggruppato in stile iOS con sotto-pagine che entrano da destra.
 * Il gesto o tasto "indietro" del sistema chiude la sotto-pagina (fuori dall'anteprima).
 * Anteprime: #impostazioni?sezione=profilo|obiettivi|settimana|pasti|gusti|sonno|integratori|dolore|fisio|promemoria|coach|backup|info
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Activity,
  BellRing,
  CalendarDays,
  ChevronRight,
  Clock,
  Database,
  FlaskConical,
  HeartPulse,
  Info,
  Moon,
  Pill as PillIcon,
  Salad,
  Sparkles,
  Target,
  Trash2,
  TriangleAlert,
  User,
} from 'lucide-react';
import { goBack, navigate, parseRoute, useRoute } from '../../app/router';
import { IS_PREVIEW } from '../../app/env';
import { getUrlParam } from '../../app/urlParams';
import { isProfileComplete } from '../../data/defaults';
import { currentDate } from '../../engine/dates';
import { modelLabel } from '../../lib/claude';
import { setLastBackupAt } from '../../lib/backup';
import { fmtDateLong, fmtKg, fmtNumber, listIt, plural } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { safeStorage, useApp, useUi } from '../../state/store';
import { Button, Card, ListGroup, ListRow, Pill, Screen, ScreenSkeleton, Toggle, cn, toneInk, toneRing, toneSoft } from '../../ui';
import { useSessionDraft } from '../allenamento/draft';
import { clearDraft } from '../benvenuto/draft';
import { InlineReveal, tileStyle } from './components/controls';
import { InstallCard } from './components/InstallCard';
import { ThemePicker } from './components/Pickers';
import { canSuggestInstall } from './install';
import { GOAL_LABEL, MEAL_ORDER, ageOf, initials, painSummary, weekSummary } from './lib';
import { foodLabel, userExclusions } from '../../engine/exclusions';
import { PAGE_IDS, PAGE_TITLE, type PageId, type PageProps } from './pages/Page';
import { clearReminderPrefs, useCalendarStatus } from './reminders';

const ProfiloPage = lazy(() => import('./pages/ProfiloPage'));
const ObiettiviPage = lazy(() => import('./pages/ObiettiviPage'));
const PromemoriaPage = lazy(() => import('./pages/PromemoriaPage'));
const CoachPage = lazy(() => import('./pages/CoachPage'));
const BackupPage = lazy(() => import('./pages/BackupPage'));
const InfoPage = lazy(() => import('./pages/InfoPage'));
const SettimanaPage = lazy(() => import('./pages/PianoPages').then((m) => ({ default: m.SettimanaPage })));
const PastiPage = lazy(() => import('./pages/PianoPages').then((m) => ({ default: m.PastiPage })));
const SonnoPage = lazy(() => import('./pages/PianoPages').then((m) => ({ default: m.SonnoPage })));
const IntegratoriPage = lazy(() => import('./pages/PianoPages').then((m) => ({ default: m.IntegratoriPage })));
const DolorePage = lazy(() => import('./pages/SalutePages').then((m) => ({ default: m.DolorePage })));
const FisioPage = lazy(() => import('./pages/SalutePages').then((m) => ({ default: m.FisioPage })));

const GustiPage = lazy(() => import('./pages/GustiPage'));

const PAGES: Record<PageId, ComponentType<PageProps>> = {
  profilo: ProfiloPage,
  obiettivi: ObiettiviPage,
  settimana: SettimanaPage,
  pasti: PastiPage,
  gusti: GustiPage,
  sonno: SonnoPage,
  integratori: IntegratoriPage,
  dolore: DolorePage,
  fisio: FisioPage,
  promemoria: PromemoriaPage,
  coach: CoachPage,
  backup: BackupPage,
  info: InfoPage,
};

/** Copia dei dati dell'utente salvata dallo store prima dei dati di esempio. */
const PRE_DEMO_KEY = 'ritmo:pre-demo';

function initialStack(): PageId[] {
  const s = getUrlParam('sezione');
  return s && (PAGE_IDS as string[]).includes(s) ? [s as PageId] : [];
}

export default function ImpostazioniScreen() {
  const [stack, setStack] = useState<PageId[]>(initialStack);
  const [dir, setDir] = useState<1 | -1>(1);
  const pushed = useRef(0);
  const reduce = useReducedMotion();
  const route = useRoute();
  const top = stack[stack.length - 1];

  // Uscendo dalle impostazioni si riparte dall'elenco.
  useEffect(() => {
    if (route !== 'impostazioni') {
      setStack([]);
      pushed.current = 0;
    }
  }, [route]);

  // La schermata resta montata: `#impostazioni?sezione=promemoria` (es. dalla revisione) apre la pagina anche dopo.
  useEffect(() => {
    const apply = () => {
      const q = location.hash.indexOf('?');
      if (q === -1 || parseRoute(location.hash) !== 'impostazioni') return;
      const sec = new URLSearchParams(location.hash.slice(q + 1)).get('sezione');
      if (sec && (PAGE_IDS as string[]).includes(sec)) {
        setDir(1);
        setStack([sec as PageId]);
      }
    };
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, []);

  // Indietro del sistema (Android, gesto del browser): chiude la sotto-pagina.
  useEffect(() => {
    if (IS_PREVIEW) return;
    const onPop = (e: PopStateEvent) => {
      const depth = typeof (e.state as { ritmoImp?: number } | null)?.ritmoImp === 'number' ? (e.state as { ritmoImp: number }).ritmoImp : 0;
      if (depth < pushed.current) {
        pushed.current = depth;
        setDir(-1);
        setStack((s) => s.slice(0, depth));
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Pila attuale anche fuori dal ciclo di render (la cronologia si tocca fuori dagli aggiornamenti di stato).
  const stackRef = useRef(stack);
  stackRef.current = stack;

  // Focus: alla sotto-pagina quando si apre, di nuovo sulla riga di partenza quando si torna.
  const returnFocus = useRef<HTMLElement[]>([]);
  const pageRef = useRef<HTMLDivElement>(null);
  const depth = stack.length;
  const prevDepth = useRef(depth);
  useEffect(() => {
    const from = prevDepth.current;
    prevDepth.current = depth;
    if (depth > from) {
      const t = window.setTimeout(() => pageRef.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true }), 80);
      return () => window.clearTimeout(t);
    }
    if (depth < from) {
      const el = returnFocus.current.splice(depth)[0];
      if (el?.isConnected) window.setTimeout(() => el.focus({ preventScroll: true }), 80);
    }
  }, [depth]);

  const open = useCallback((id: PageId) => {
    const next = [...stackRef.current, id];
    if (document.activeElement instanceof HTMLElement) returnFocus.current[next.length - 1] = document.activeElement;
    setDir(1);
    setStack(next);
    if (!IS_PREVIEW) {
      try {
        history.pushState({ ...(history.state ?? {}), ritmoImp: next.length }, '');
        pushed.current = next.length;
      } catch {
        /* cronologia non disponibile */
      }
    }
  }, []);

  const back = useCallback(() => {
    setDir(-1);
    if (!IS_PREVIEW && pushed.current > 0 && (history.state as { ritmoImp?: number } | null)?.ritmoImp === pushed.current) {
      history.back();
      return;
    }
    setStack((s) => s.slice(0, -1));
  }, []);

  const variants = {
    enter: (d: number) => (reduce ? { opacity: 0 } : { x: d > 0 ? '100%' : '-28%', opacity: d > 0 ? 1 : 0.6 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => (reduce ? { opacity: 0 } : { x: d > 0 ? '-28%' : '100%', opacity: d > 0 ? 0.6 : 1 }),
  };
  const transition = { type: 'spring', stiffness: 380, damping: 40, mass: 0.9 } as const;

  const Current = top ? PAGES[top] : null;
  const backLabel = stack.length > 1 ? PAGE_TITLE[stack[stack.length - 2]] : 'Impostazioni';

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg">
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={reduce ? { opacity: top ? 0 : 1 } : { x: top ? '-28%' : 0, opacity: top ? 0.6 : 1 }}
        transition={transition}
        aria-hidden={top ? true : undefined}
        inert={top ? true : undefined}
      >
        <RootPage open={open} />
      </motion.div>
      <AnimatePresence initial={false} custom={dir}>
        {Current && top && (
          <motion.div
            key={`${stack.length}-${top}`}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={transition}
            ref={pageRef}
            className="absolute inset-0 z-10 bg-bg shadow-[-12px_0_32px_-12px_rgb(0_0_0/0.35)]"
          >
            <Suspense fallback={<ScreenSkeleton />}>
              <Current onBack={back} open={open} backLabel={backLabel} />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ───────────────────────── Elenco principale ─────────────────────────

function RootPage({ open }: { open: (id: PageId) => void }) {
  const profile = useApp((s) => s.profile);
  const plan = useApp((s) => s.plan);
  const physio = useApp((s) => s.physio);
  const settings = useApp((s) => s.settings);
  const toast = useUi((s) => s.toast);
  const [confirmReset, setConfirmReset] = useState(false);

  const year = currentDate().getFullYear();
  const complete = isProfileComplete(profile);
  const age = ageOf(profile.birthYear, year);
  const kcals = Object.values(plan.targets).map((t) => t.kcal);
  const activeSupps = plan.supplements.filter((s) => s.active).length;
  const excludedNames = userExclusions(plan).map((e) => foodLabel(e.foodId));
  const physioCount = physio.prescriptions.length;
  const hasPreDemo = settings.demoData && safeStorage.getItem(PRE_DEMO_KEY) !== null;
  const calendar = useCalendarStatus();
  const [showInstall] = useState(canSuggestInstall);

  const toggleDemo = (on: boolean) => {
    // Una seduta lasciata a metà appartiene ai dati che stanno per essere sostituiti.
    useSessionDraft.getState().clear();
    if (on) {
      useApp.getState().loadDemo();
      toast('Dati di esempio caricati. I tuoi tornano quando li togli', 'neutral');
    } else {
      // Senza una copia dei dati si riparte dal benvenuto: si torna su Oggi.
      if (!hasPreDemo) navigate('oggi');
      useApp.getState().clearDemo();
      toast(hasPreDemo ? 'Dati di esempio rimossi: bentornato ai tuoi' : 'Dati di esempio rimossi', 'good');
    }
  };

  const resetAll = () => {
    haptic('warning');
    clearDraft();
    setLastBackupAt(null);
    clearReminderPrefs();
    useSessionDraft.getState().clear();
    void useSessionDraft.persist.clearStorage();
    navigate('oggi');
    useApp.getState().resetAll();
    useUi.getState().toast('Dati azzerati. Si riparte dal benvenuto', 'neutral');
  };

  return (
    <Screen title="Impostazioni" onBack={goBack} bottom="safe">
      {settings.demoData && (
        <Card variant="highlight" tone="riposo" padding="md" className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[11px]" style={tileStyle('riposo')}>
              <FlaskConical size={18} strokeWidth={2.2} />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="t-callout font-semibold text-ink">Stai guardando i dati di esempio</p>
              <p className="t-footnote text-ink-2">{hasPreDemo ? 'Quando li togli tornano i tuoi dati, come li avevi lasciati.' : 'Quando vuoi iniziare davvero, toglili e completa il benvenuto: bastano due minuti.'}</p>
            </div>
          </div>
          <Button variant="secondary" size="sm" className="self-start" onClick={() => toggleDemo(false)}>
            {hasPreDemo ? 'Torna ai tuoi dati' : 'Inizia con i tuoi dati'}
          </Button>
        </Card>
      )}

      {showInstall && <InstallCard compact note="L’app installata parte vuota. Per portarci i dati, qui in Backup ed esportazione tocca Copia, poi nell’app scegli Hai già un backup? Ripristinalo." />}

      {/* Profilo, come la scheda dell'ID Apple. */}
      <Card padding="md" onPress={() => open('profilo')} aria-label="Profilo" className="flex items-center gap-4">
        {/* L'ambra è luce: un anello sottile sul blu, non un disco pieno che in questa pagina brillerebbe più di tutto. */}
        <span
          aria-hidden
          className="relative grid size-[60px] shrink-0 place-items-center overflow-hidden rounded-full"
          style={{ background: toneSoft('accent', 16), boxShadow: toneRing('accent'), color: toneInk('accent') }}
        >
          {initials(profile.name) ? <span className="t-num text-[1.625rem] tracking-[0.02em]">{initials(profile.name)}</span> : <User size={28} strokeWidth={2.2} />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="t-headline truncate text-ink">{profile.name?.trim() || 'Il tuo profilo'}</span>
          {complete ? (
            <span className="t-footnote text-ink-2">
              {age}{'\u00a0'}anni · {fmtNumber(profile.heightCm)}{'\u00a0'}cm · {fmtKg(profile.startWeightKg)}
            </span>
          ) : (
            <span className="t-footnote font-medium text-accent-ink">Completa anno, altezza e peso</span>
          )}
          <Pill tone="accent" className="mt-0.5">
            {GOAL_LABEL[profile.goal]}
          </Pill>
        </span>
        <ChevronRight size={20} strokeWidth={2.2} className="shrink-0 text-ink-3" aria-hidden />
      </Card>

      <ListGroup title="Piano">
        <ListRow
          icon={Target}
          iconTone="accent"
          title="Obiettivi per tipo di giorno"
          subtitle={`${fmtNumber(Math.min(...kcals))}-${fmtNumber(Math.max(...kcals))} kcal · proteine ${fmtNumber(plan.targets.palestra.proteinG)} g`}
          onPress={() => open('obiettivi')}
        />
        <ListRow icon={CalendarDays} iconTone="palestra" title="Settimana" subtitle={weekSummary(plan.week)} onPress={() => open('settimana')} />
        <ListRow
          icon={Clock}
          iconTone="calcio"
          title="Orari dei pasti"
          subtitle={MEAL_ORDER.map((m) => plan.mealTimes[m]).join(' · ')}
          onPress={() => open('pasti')}
        />
        <ListRow
          icon={Salad}
          iconTone="good"
          title="Gusti"
          subtitle={excludedNames.length ? `Non mangio: ${excludedNames.length > 3 ? `${excludedNames.slice(0, 3).join(', ')} e altri ${excludedNames.length - 3}` : listIt(excludedNames)}` : 'Togli quello che non ti piace'}
          onPress={() => open('gusti')}
        />
        <ListRow icon={Moon} iconTone="riposo" title="Sonno" subtitle={`A letto alle ${plan.sleep.current}, obiettivo ${plan.sleep.target}`} onPress={() => open('sonno')} />
        <ListRow icon={PillIcon} iconTone="leggero" title="Integratori" value={plan.supplements.length ? plural(activeSupps, 'attivo', 'attivi') : 'Nessuno'} onPress={() => open('integratori')} />
      </ListGroup>

      <ListGroup title="Salute">
        <ListRow
          icon={Activity}
          iconTone="bad"
          title="Zone di dolore e soglia"
          subtitle={painSummary(profile.painSites, plan)}
          onPress={() => open('dolore')}
        />
        <ListRow icon={HeartPulse} iconTone="leggero" title="Esercizi del fisioterapista" value={physioCount ? plural(physioCount, 'esercizio', 'esercizi') : 'Nessuno'} onPress={() => open('fisio')} />
      </ListGroup>

      <ListGroup title="Promemoria e coach">
        <ListRow
          icon={BellRing}
          iconTone="warn"
          title="Promemoria nel calendario"
          subtitle={
            calendar.state === 'da-aggiornare' ? (
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <Pill tone="warn" dot>
                  Da aggiornare
                </Pill>
                <span>{calendar.reason === 'sonno' ? 'Il coprifuoco è cambiato' : 'Il piano è cambiato'}</span>
              </span>
            ) : calendar.state === 'aggiornato' ? (
              `Nel calendario dal ${fmtDateLong(calendar.at).replace(/^\S+\s/, '')}`
            ) : (
              'Avvisi all’orario nel calendario dell’iPhone'
            )
          }
          onPress={() => open('promemoria')}
        />
        <ListRow
          icon={Sparkles}
          iconTone="accent"
          title="Coach"
          subtitle={modelLabel(settings.coachModel)}
          trailing={settings.coachApiKey ? <Pill tone="good" dot>Attivo</Pill> : <Pill tone="neutral">Da attivare</Pill>}
          onPress={() => open('coach')}
        />
      </ListGroup>

      <section className="flex flex-col gap-2" aria-labelledby="tema-label">
        <h3 id="tema-label" className="t-label px-1 text-ink-3">
          Aspetto
        </h3>
        <Card padding="md">
          <ThemePicker value={settings.theme} onChange={(theme) => useApp.getState().updateSettings({ theme })} />
        </Card>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="dati-label">
        <ListGroup title={<span id="dati-label">Dati</span>}>
          <ListRow icon={Database} iconTone="palestra" title="Backup ed esportazione" subtitle="Esporta o importa i tuoi dati in JSON" onPress={() => open('backup')} />
          <ListRow
            icon={FlaskConical}
            iconTone="riposo"
            title="Dati di esempio"
            subtitle={settings.demoData ? 'Attivi: tre settimane d’uso simulate' : 'Prova l’app piena, i tuoi dati restano da parte'}
            trailing={<Toggle label="Dati di esempio" checked={settings.demoData} onChange={toggleDemo} />}
          />
          <ListRow icon={Trash2} iconTone="bad" title="Azzera tutto" destructive chevron={false} onPress={() => setConfirmReset((v) => !v)} />
        </ListGroup>
        <InlineReveal open={confirmReset}>
          <div className="flex flex-col gap-3 rounded-card bg-bad-soft p-4 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--bad)_28%,transparent)]" role="alert">
            <div className="flex gap-3">
              <TriangleAlert size={20} strokeWidth={2.2} className="mt-0.5 shrink-0 text-bad-ink" aria-hidden />
              <div className="flex flex-col gap-1">
                <p className="t-callout font-semibold text-ink">Cancellare tutto da questo telefono?</p>
                <p className="t-footnote text-ink-2">Profilo, piano, diario, controlli, sedute, revisioni, chat e impostazioni. Non si può annullare.</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="danger" icon={Trash2} fullWidth onClick={resetAll}>
                Sì, azzera tutto
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setConfirmReset(false)}>
                  Annulla
                </Button>
                <Button variant="secondary" className="flex-1" icon={Database} onClick={() => (setConfirmReset(false), open('backup'))}>
                  Prima un backup
                </Button>
              </div>
            </div>
          </div>
        </InlineReveal>
      </section>

      <ListGroup>
        <ListRow icon={Info} iconTone="neutral" title="Informazioni e privacy" onPress={() => open('info')} />
      </ListGroup>

      <p className={cn('t-footnote -mt-2 pb-2 text-center text-ink-3')}>Ritmo · i tuoi dati restano su questo telefono</p>
    </Screen>
  );
}
