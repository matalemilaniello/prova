/**
 * Avvio: legge i parametri dell'URL per anteprime e screenshot (§4) prima del primo disegno.
 * ?today=YYYY-MM-DD e ?now=HH:MM fissano l'orologio; ?demo=1 carica i dati di esempio;
 * ?onboarding=1 mostra il benvenuto; ?theme=scuro|chiaro (o dark|light) forza il tema; ?overlay=… apre un pannello
 * (anche quelli della fase 2: mealLog, planProposal, supplement).
 * Le proposte del piano approvate in attesa entrano nel piano il loro primo giorno (docs/FASE2.md § 5.4): all'avvio,
 * al ritorno in primo piano, ogni minuto (cambio di giornata) e quando cambiano le proposte.
 * Dopo il primo disegno si caricano le regie delle proposte (`setupPlanProposals`): i generatori registrati, il ritorno
 * in primo piano del menù della settimana dopo (§ 4.10) e la proposta di blocco della giornata (§ 5.3); la nota di «Da
 * comprare in più» ascolta le approvazioni da subito (§ 5.3). Con `?overlay=planProposal` il foglio si apre dopo, sulla
 * proposta aperta più recente (anche il menù della settimana dopo, se è il momento).
 */
import type { AppData, FootballKind, ISODate, Overlay, TimelineItem } from '../domain/types';
import { RECIPES } from '../data/recipes';
import { SESSIONS } from '../data/sessions';
import { addDays, isHHMM, isISODate, setNowProvider, todayISO, weekdayOf } from '../engine/dates';
import { mealsForDate } from '../engine/menu';
import { isPendingApproval } from '../engine/plan/proposals';
import { planTodayISO } from '../engine/sleep';
import { DATA_REPLACED_EVENT, useApp, useUi } from '../state/store';
import { isStandalone, requestPersistentStorage } from './env';
import { applyTheme, resolveTheme, setThemeOverride } from './theme';
import { getUrlParam } from './urlParams';

type TimelineModule = { buildTimeline?: (iso: ISODate, state: AppData) => TimelineItem[] };
const timelineModules = import.meta.glob<TimelineModule>('../engine/timeline.ts', { eager: true });

function setupClock() {
  const day = getUrlParam('today');
  const time = getUrlParam('now');
  const fixDay = isISODate(day) ? day : null;
  const fixTime = isHHMM(time) ? time : null;
  if (!fixDay && !fixTime) return;
  const startReal = Date.now();
  setNowProvider(() => {
    const real = new Date();
    const d = new Date(real);
    if (fixDay) {
      const [y, m, dd] = fixDay.split('-').map(Number);
      d.setFullYear(y, m - 1, dd);
    }
    if (fixTime) {
      const [h, mi] = fixTime.split(':').map(Number);
      // L'orologio parte dall'ora indicata e scorre normalmente.
      const elapsed = Math.floor((Date.now() - startReal) / 1000);
      d.setHours(h, mi, 0, 0);
      d.setSeconds(elapsed);
    }
    return d;
  });
}

/** Pannello di esempio per ?overlay=, con dati coerenti con la giornata. */
export function sampleOverlay(type: string, state: AppData = useApp.getState()): Overlay {
  const today = todayISO();
  switch (type) {
    case 'recipe': {
      const meals = mealsForDate(today, state);
      // ?recipe=<id> apre quella ricetta (nel pasto di oggi che la prevede, se c'è); senza, il pranzo di oggi.
      const asked = getUrlParam('recipe');
      if (asked && RECIPES[asked]) {
        const slot = meals.meals.find((m) => m.recipeId === asked)?.slot ?? RECIPES[asked].slots[0];
        return { type: 'recipe', recipeId: asked, date: today, slot };
      }
      const entry = meals.bySlot.pranzo ?? meals.meals[0];
      const recipeId = entry?.recipeId ?? Object.keys(RECIPES)[0] ?? '';
      return { type: 'recipe', recipeId, date: today, slot: entry?.slot ?? RECIPES[recipeId]?.slots[0] };
    }
    case 'checkin':
      return { type: 'checkin', date: today };
    case 'session': {
      let sessionId = '';
      for (let i = 0; i < 7 && !sessionId; i++) {
        sessionId = state.plan.week[weekdayOf(addDays(today, i))]?.gymSessionId ?? '';
      }
      if (!SESSIONS[sessionId]) sessionId = Object.keys(SESSIONS)[0] ?? sessionId ?? 'A';
      return { type: 'session', sessionId: sessionId || 'A', date: today };
    }
    case 'football': {
      let date = today;
      let kind: FootballKind = 'partita';
      for (let i = 0; i < 7; i++) {
        const d = addDays(today, -i);
        const f = state.plan.week[weekdayOf(d)]?.football;
        if (f) {
          date = d;
          kind = f.kind;
          break;
        }
      }
      let itemId = `calcio:${kind}`;
      const build = Object.values(timelineModules)[0]?.buildTimeline;
      try {
        const item = build?.(date, state).find((t) => t.kind === 'calcio');
        if (item) itemId = item.id;
      } catch {
        /* timeline non ancora disponibile */
      }
      return { type: 'football', date, kind, itemId };
    }
    case 'barPlanB':
      return { type: 'barPlanB' };
    // Pannelli della fase 2 (docs/FASE2.md § 11.7).
    case 'mealLog':
      return { type: 'mealLog', date: today, slot: 'pranzo', mode: state.dishes?.length ? 'piatti' : 'foto' };
    case 'planProposal': {
      // La proposta aperta più recente dei dati di esempio, se c'è.
      const open = (state.planner?.proposals ?? []).filter((p) => p.status === 'aperta');
      return { type: 'planProposal', id: open[open.length - 1]?.id ?? 'esempio' };
    }
    case 'supplement':
      return { type: 'supplement' };
    default:
      return null;
  }
}

/** Giornata del piano: le approvate in attesa con `effectiveFrom` fino a oggi entrano nel piano. */
export function applyDueApprovals(): number {
  const s = useApp.getState();
  if (!s.planner?.proposals.some(isPendingApproval)) return 0;
  return s.applyDueProposals(planTodayISO(s.plan));
}

function setupPendingApprovals() {
  applyDueApprovals();
  window.setInterval(applyDueApprovals, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') applyDueApprovals();
  });
  // Un backup importato o i dati di esempio possono portare approvate già dovute: quando non c'è niente da far entrare
  // l'azione non scrive, quindi il giro si ferma.
  useApp.subscribe((s, prev) => {
    if (s.planner !== prev.planner) applyDueApprovals();
  });
}

/** Dopo il primo disegno: un fotogramma, poi un giro del ciclo degli eventi (§ 4.10: mai durante il primo disegno). */
function afterFirstPaint(fn: () => void): void {
  const later = () => window.setTimeout(fn, 0);
  if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(later);
  else later();
}

/**
 * Regie delle proposte del piano, caricate a richiesta dopo il primo disegno (il motore del menù e quello dei blocchi sono
 * pesanti): registrano i generatori per il foglio della proposta, il menù ascolta il ritorno in primo piano, il blocco
 * nasce quando serve (fine blocco la domenica, fase, obiettivo, primo blocco) all'avvio, al ritorno in primo piano e dopo
 * dati sostituiti. Niente si applica da solo: nascono proposte da approvare. Si risolve quando le regie sono pronte.
 */
function setupPlanProposals(): Promise<{ proposeMenu: () => void }> {
  return new Promise((resolve) => {
    afterFirstPaint(() => {
      Promise.all([import('../features/settimana/useMenuProposal'), import('../features/allenamento/blocks')])
        .then(([menu, blocks]) => {
          menu.setupMenuProposals();
          const ensureBlock = () => {
            const s = useApp.getState();
            if (s.onboarded) blocks.ensureBlockProposal(planTodayISO(s.plan));
          };
          // Dati di esempio: la proposta del menù della settimana dopo c'è già il venerdì e il sabato (§ 11.7), anche
          // prima di aprire Settimana (la spesa del sabato in Oggi dice di guardarla).
          const demoMenu = () => {
            if (useApp.getState().settings.demoData) menu.proposeMenuIfDue();
          };
          ensureBlock();
          demoMenu();
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') ensureBlock();
          });
          window.addEventListener(DATA_REPLACED_EVENT, () =>
            window.setTimeout(() => {
              ensureBlock();
              demoMenu();
            }, 0),
          );
          resolve({ proposeMenu: () => void menu.proposeMenuIfDue() });
        })
        .catch(() => resolve({ proposeMenu: () => undefined }));
    });
  });
}

let booted = false;

/** Da chiamare una volta prima di render. */
export function boot() {
  if (booted) return;
  booted = true;
  setupClock();
  // Installata sulla schermata Home: serve per la velatura sotto la barra di stato (tema chiaro).
  if (isStandalone()) document.documentElement.dataset.standalone = 'true';

  const q = getUrlParam('theme');
  const theme = q === 'dark' ? 'scuro' : q === 'light' ? 'chiaro' : q;
  if (theme === 'scuro' || theme === 'chiaro') setThemeOverride(theme);
  applyTheme(resolveTheme(useApp.getState().settings.theme));

  if (getUrlParam('demo') === '1') useApp.getState().loadDemo(todayISO());
  if (getUrlParam('onboarding') === '1') useApp.setState({ onboarded: false });
  setupPendingApprovals();
  // «Da comprare in più»: la nota si scrive quando si approva un menù con la spesa già cominciata, da qualunque schermata.
  void import('../features/settimana/extraShopping').then((m) => m.setupExtraShopping()).catch(() => undefined);
  const proposals = setupPlanProposals();

  // Dati protetti dal browser (non si cancellano da soli quando serve spazio), dopo il benvenuto.
  if (useApp.getState().onboarded) void requestPersistentStorage();
  else {
    const off = useApp.subscribe((s) => {
      if (!s.onboarded) return;
      off();
      void requestPersistentStorage();
    });
  }

  const overlay = getUrlParam('overlay');
  if (overlay === 'planProposal') {
    // Il foglio della proposta aspetta le regie: la proposta di blocco e quella del menù nascono dopo il primo disegno.
    void proposals.then(({ proposeMenu }) => {
      proposeMenu();
      const o = sampleOverlay(overlay);
      if (o) useUi.getState().open(o);
    });
  } else if (overlay) {
    const o = sampleOverlay(overlay);
    if (o) useUi.getState().open(o);
  }
}
