/**
 * Avvio: legge i parametri dell'URL per anteprime e screenshot (§4) prima del primo disegno.
 * ?today=YYYY-MM-DD e ?now=HH:MM fissano l'orologio; ?demo=1 carica i dati di esempio;
 * ?onboarding=1 mostra il benvenuto; ?theme=scuro|chiaro (o dark|light) forza il tema; ?overlay=… apre un pannello.
 */
import type { AppData, FootballKind, ISODate, Overlay, TimelineItem } from '../domain/types';
import { RECIPES } from '../data/recipes';
import { SESSIONS } from '../data/sessions';
import { addDays, isHHMM, isISODate, setNowProvider, todayISO, weekdayOf } from '../engine/dates';
import { mealsForDate } from '../engine/menu';
import { useApp, useUi } from '../state/store';
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
    default:
      return null;
  }
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
  if (overlay) {
    const o = sampleOverlay(overlay);
    if (o) useUi.getState().open(o);
  }
}
