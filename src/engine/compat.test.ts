/**
 * Istantanea di compatibilità (docs/FASE2.md § 13.1, test 1): sui dati di esempio e su un nuovo utente, senza i campi
 * della fase 2, per 28 e 21 giorni, menù, giornata e timeline, valori del giorno, sedute e durate, regola del dolore,
 * carico previsto, spesa, preparazione, revisione con le proposte, calendario e contesto del coach coincidono con il
 * ramo di partenza della fase 2 (2d95033, dopo il passo 0: patch di prevenzione e ragù del seme in freezer già dentro).
 *
 * I valori di prima stanno in `compat.base.json` come impronte: la stessa funzione `collect` di questo file, girata sul
 * ramo di partenza con l'adattatore di allora (`SESSIONS[slot]`, `gymDuration` senza data, nessun cambio da togliere),
 * con il JSON in forma canonica (chiavi in ordine, numeri arrotondati a 1e-6). Si aggiorna solo per un cambio voluto e
 * dichiarato qui sotto, rifacendo il calcolo su quel ramo.
 *
 * Cambi dichiarati e voluti, tolti prima del confronto e controllati a parte:
 * - integratori predefiniti per i nuovi utenti (§ 9.7: creatina 3 g, omega-3 600 mg, vitamina D 15 µg, dal catalogo),
 *   che finiscono anche nei dati di esempio: il confronto usa quelli della fase 1 (`LEGACY_DEFAULT_SUPPLEMENTS`);
 * - `DATA_VERSION` 4 (§ 12.4);
 * - scarico e settimana più leggera della revisione con `apply: weekKind` al posto di `none` (§ 3.9).
 * I limiti dell'energia (§ 2.1) non cambiano niente qui: i dati di esempio e il nuovo utente sono in ricomposizione
 * senza correzioni accettate che portino a un deficit.
 */
import { describe, expect, it } from 'vitest';
import type { AppData, ISODate, Proposal, WorkoutSession } from '../domain/types';
import { buildDemo } from '../demo/seed';
import { DEFAULT_SUPPLEMENTS, LEGACY_DEFAULT_SUPPLEMENTS, defaultAppData, defaultPlan } from '../data/defaults';
import { addDays, weekStart, weekdayOf } from './dates';
import { mealsForDate } from './menu';
import { dayCarbScale, dayNutritionDetail, dayTargetFor } from './nutrition';
import { buildCoachContext, coachDaySummary } from './coachContext';
import { REMINDER_KINDS, reminderEvents } from './ics';
import { sessionFor } from './plan/program';
import { dayIntake, proposals, weekStats } from './review';
import { shoppingList } from './shopping';
import { buildDay, buildTimeline, dayAdherence, gymDuration, nextWeekPrep, shoppingOptionsFor } from './timeline';
import { nextPlannedSession, painGate, plannedLoadRemaining, type SessionDuration } from './training';
import base from './compat.base.json';

// ───────────────────────── Raccolta (uguale nel ramo di partenza) ─────────────────────────

interface CompatAdapter {
  session: (slot: string, iso: ISODate, s: AppData) => WorkoutSession | undefined;
  duration: (slot: string, iso: ISODate, s: AppData) => SessionDuration | null;
  /** Toglie dallo stato i cambi dichiarati (integratori predefiniti, versione). */
  neutral: (s: AppData) => AppData;
  /** Toglie dalle proposte i cambi dichiarati (scarico e settimana più leggera). */
  proposals: (list: Proposal[]) => unknown;
}

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** JSON con le chiavi in ordine e i numeri arrotondati: uguale a parità di contenuto. */
function canon(v: unknown): string {
  if (v === undefined) return 'null';
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') return Number.isFinite(v) ? JSON.stringify(r6(v) === 0 ? 0 : r6(v)) : JSON.stringify(String(v));
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v instanceof Set) return canon([...v].sort());
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined && typeof o[k] !== 'function')
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(String(v));
}

/** Impronta a 53 bit (cyrb53) in esadecimale. */
function hash53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** Giorno dei dati di esempio (giovedì) e giorno del primo avvio del nuovo utente (mercoledì sera). */
const DEMO_TODAY = '2026-11-12';
const NEW_TODAY = '2026-11-11';

function at(iso: ISODate, hh: number, mm = 0): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

function scenarios(): { name: string; today: ISODate; state: AppData; from: ISODate; days: number }[] {
  const demo = buildDemo(DEMO_TODAY, { nowMin: 13 * 60 });
  const fresh = defaultAppData(NEW_TODAY);
  fresh.onboarded = true;
  fresh.profile = { ...fresh.profile, sex: 'M', birthYear: 1990, heightCm: 180, startWeightKg: 75, painSites: ['Tibia'] };
  fresh.plan = { ...defaultPlan(weekStart(NEW_TODAY)), firstUse: { date: NEW_TODAY, time: '18:30' } };
  return [
    { name: 'demo', today: DEMO_TODAY, state: demo, from: weekStart(addDays(DEMO_TODAY, -21)), days: 28 },
    { name: 'nuovo', today: NEW_TODAY, state: fresh, from: weekStart(NEW_TODAY), days: 21 },
  ];
}

/** Valori da confrontare, per chiave. */
function collect(api: CompatAdapter): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const sc of scenarios()) {
    const s = api.neutral(sc.state);
    const p = sc.name;
    out[`${p}:dati`] = { ...s, version: 0 };
    const mondays = new Set<ISODate>();
    for (let i = 0; i < sc.days; i++) {
      const iso = addDays(sc.from, i);
      mondays.add(weekStart(iso));
      const m = mealsForDate(iso, s);
      out[`${p}:menu:${iso}`] = {
        dayType: m.dayType,
        scheduledDayType: m.scheduledDayType,
        matchEve: m.matchEve,
        rotationIndex: m.rotationIndex,
        starter: m.starter,
        meals: m.meals.map((e) => ({ slot: e.slot, recipeId: e.recipeId, plannedId: e.plannedId, swapped: e.swapped, starterOf: e.starterOf })),
      };
      out[`${p}:giornata:${iso}`] = buildDay(iso, s);
      out[`${p}:timeline:${iso}`] = buildTimeline(iso, s);
      out[`${p}:valori:${iso}`] = {
        planned: dayNutritionDetail(iso, s),
        done: dayNutritionDetail(iso, s, { onlyDone: true }),
        scale: dayCarbScale(iso, s),
        target: dayTargetFor(iso, s),
        intake: dayIntake(iso, s),
        adherence: dayAdherence(iso, s),
      };
      const day = s.plan.week.find((d) => d.weekday === weekdayOf(iso));
      const slot = day?.gymSessionId;
      out[`${p}:seduta:${iso}`] = {
        slot: slot ?? null,
        session: slot ? api.session(slot, iso, s) ?? null : null,
        duration: slot ? api.duration(slot, iso, s) : null,
        gate: painGate(s, iso),
        next: nextPlannedSession(iso, s),
        remaining: plannedLoadRemaining(weekStart(iso), s, iso),
      };
      for (const hh of [8, 13, 21]) {
        const now = at(iso, hh);
        out[`${p}:coach:${iso}:${hh}`] = { context: buildCoachContext(s, now), summary: coachDaySummary(s, now) };
      }
    }
    for (const monday of [...mondays, addDays([...mondays].pop()!, 7)]) {
      out[`${p}:spesa:${monday}`] = shoppingList(monday, s, shoppingOptionsFor(monday, s));
      out[`${p}:preparazione:${monday}`] = nextWeekPrep(addDays(monday, -1), s.plan);
      out[`${p}:revisione:${monday}`] = {
        stats: weekStats(monday, s, { today: sc.today }),
        proposals: api.proposals(proposals(monday, s, { today: sc.today })),
      };
    }
    out[`${p}:calendario`] = reminderEvents(s, REMINDER_KINDS);
  }
  return out;
}

// ───────────────────────── Adattatore di oggi ─────────────────────────

/** Scarico e settimana più leggera con `apply: weekKind`: per il confronto tornano a `none`, com'erano. */
function withoutWeekKind(list: Proposal[]): Proposal[] {
  return list.map((p) => (p.apply?.type === 'weekKind' ? { ...p, apply: { type: 'none' as const } } : p));
}

const CURRENT: CompatAdapter = {
  session: (slot, iso, s) => sessionFor(slot, iso, s.plan),
  duration: (slot, iso, s) => gymDuration(slot, s, iso),
  neutral: (s) => ({ ...s, plan: { ...s.plan, supplements: LEGACY_DEFAULT_SUPPLEMENTS.map((x) => ({ ...x })) } }),
  proposals: withoutWeekKind,
};

const BASE = (base as { valori: Record<string, string> }).valori;

describe('istantanea di compatibilità', () => {
  const values = collect(CURRENT);

  it('raccoglie le stesse voci del ramo di partenza', () => {
    expect(Object.keys(values).sort()).toEqual(Object.keys(BASE).sort());
  });

  it('a campi nuovi vuoti dà gli stessi risultati di prima, voce per voce', () => {
    const changed = Object.keys(BASE).filter((k) => hash53(canon(values[k])) !== BASE[k]);
    expect(changed).toEqual([]);
  });

  it('le sedute senza blocco né settimane della revisione sono quelle fisse, lo stesso oggetto', () => {
    for (const sc of scenarios()) {
      for (let i = 0; i < sc.days; i++) {
        const iso = addDays(sc.from, i);
        const slot = sc.state.plan.week.find((d) => d.weekday === weekdayOf(iso))?.gymSessionId;
        if (slot) expect(sessionFor(slot, iso, sc.state.plan)).toBe(sessionFor(slot, addDays(iso, 7), sc.state.plan));
      }
    }
  });
});

describe('cambi dichiarati', () => {
  it('integratori predefiniti dal catalogo, con gli stessi id e momenti della fase 1', () => {
    const demo = buildDemo(DEMO_TODAY);
    expect(demo.plan.supplements).toEqual(DEFAULT_SUPPLEMENTS);
    expect(demo.plan.supplements.map((x) => [x.id, x.timing, x.active])).toEqual(LEGACY_DEFAULT_SUPPLEMENTS.map((x) => [x.id, x.timing, x.active]));
    expect(demo.plan.supplements.every((x) => typeof x.catalogId === 'string')).toBe(true);
  });

  it('scarico e settimana più leggera, quando ci sono, valgono per la settimana dopo quella rivista', () => {
    for (const sc of scenarios()) {
      for (let w = 0; w < 4; w++) {
        const monday = addDays(sc.from, w * 7);
        for (const p of proposals(monday, sc.state, { today: sc.today })) {
          if (p.area !== 'scarico' && p.area !== 'allenamento') continue;
          expect(p.apply).toEqual({ type: 'weekKind', weekStart: addDays(monday, 7), kind: p.area === 'scarico' ? 'scarico' : 'leggera' });
        }
      }
    }
  });
});
