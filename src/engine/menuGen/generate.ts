/**
 * Generatore del menù della settimana (docs/FASE2.md § 4.10). Sincrono, una sola strada, deterministico: stesso ingresso,
 * stesso menù. Niente orologio e niente `Math.random`: il caso viene da `mulberry32` con un seme che dipende solo dagli
 * ingressi (lunedì, giorni e obiettivi, esclusioni, tentativo); il limite di calcolo è un numero di valutazioni.
 *
 * Algoritmo:
 * 1. bacini: per ogni casella (giorno, pasto) le ricette di quel pasto che passano H0, H1 statico e H5 (le ricette da
 *    preparazione solo dal lunedì al sabato, i pasti da portare solo con ricette che si portano via);
 * 2. cache dei valori per tipo di giorno (`recipeStats`) e dei riepiloghi dei giorni già visti;
 * 3. partenza: il seme; le caselle con una ricetta fuori bacino prendono il candidato a costo minore (seme adattato);
 * 4. ricerca locale con l'ordine dei vicini mescolato: (a) una casella cambia ricetta tra quelle del suo bacino, prima le
 *    caselle coinvolte in una violazione; (b) due giorni si scambiano lo stesso pasto. Si accetta la prima mossa che
 *    abbassa il costo, a parità con probabilità 0,1; stop dopo un giro senza miglioramenti o a `maxEvaluations`;
 * 5. valutazione incrementale: una mossa ricalcola uno o due giorni, la settimana si somma dai riepiloghi;
 * 6. controllo finale con `validateMenuWeek`;
 * 7. ripiego: risultato valido, poi seme adattato valido (`seme-adattato`), poi seme puro (`seme`), poi il migliore con
 *    le violazioni (`fuori-limiti`). Una casella senza candidati resta vuota: H0 non si viola mai;
 * 8. preparazione (§ 4.11: i compiti del seme se le ricette da preparazione sono le stesse negli stessi giorni,
 *    altrimenti quelli dei componenti) e differenze rispetto al menù che varrebbe senza approvazione.
 */
import type { MealSlot, MenuWeek, PrepTask, Weekday } from '../../domain/types';
import { RECIPES } from '../../data/recipes';
import { MEAL_SLOTS } from '../menu';
import { chance, mulberry32, seedOf, shuffled, type Rng } from '../rng';
import { FOOTBALL_LUNCH_MAX_FIBER_G } from '../similar';
import type { MenuGenInput, MenuGenResult, MenuGenStatus } from './context';
import { prepTasksFor, sameBatchLayout } from './prep';
import {
  batchLayout,
  componentPrepSummary,
  daySummary,
  gridOf,
  prepSummaryOf,
  recipeComponents,
  recipeStats,
  Sink,
  SLOT_COUNT,
  staticCellIssues,
  weekOf,
  weekPurchasesAtScale1,
  weekResult,
  type DayRules,
  type DaySummary,
  type PrepSummary,
  type WeekCtx,
} from './stats';
import { validateMenuWeek } from './validate';

/** Probabilità di accettare una mossa a parità di costo (§ 4.10). */
export const TIE_ACCEPT = 0.1;
/** Mosse a caso con cui si riparte dal migliore quando restano violazioni (ricerca locale iterata). */
export const KICK_MOVES = 2;
const EPS = 1e-9;
const CELLS = 7 * SLOT_COUNT;

interface Evaluated {
  cost: number;
  hard: number;
  days: DaySummary[];
  products: number;
}

/**
 * Mosse della ricerca: una casella cambia ricetta; due giorni si scambiano lo stesso pasto; una ricetta ripetuta nello
 * stesso pasto cambia in tutti i giorni insieme (altrimenti un doppione si toglie solo in due passi, e il primo non conviene).
 */
type Move = { kind: 'cambia'; cell: number; id: string } | { kind: 'scambia'; a: number; b: number } | { kind: 'tutte'; cells: number[]; id: string };

/** Le ricette ammesse nella casella senza guardare i valori della settimana: H0, H1 statico, H5. */
export function menuCellPool(input: MenuGenInput, day: number, slot: MealSlot): string[] {
  if (!input.days[day]) return [];
  return poolFor(day, slot, input, { month: input.month, excluded: input.excluded, starter: false });
}

function poolFor(d: number, slot: MealSlot, input: MenuGenInput, rules: DayRules): string[] {
  const day = input.days[d];
  const out: string[] = [];
  for (const r of Object.values(RECIPES)) {
    if (!r.slots.includes(slot)) continue;
    const st = recipeStats(r.id, day.dayType);
    if (!st) continue;
    const sink = new Sink(false);
    staticCellIssues(st, slot, d, day, rules, sink);
    if (sink.count) continue;
    // Pranzo dei giorni di calcio: al massimo 20 g di fibre (alla scala 1; la scala vera la controlla il validatore).
    if (slot === 'pranzo' && (day.footballDay ?? day.eveningFootball) && st.fixed.fiberG + st.scaled.fiberG > FOOTBALL_LUNCH_MAX_FIBER_G + EPS) continue;
    out.push(r.id);
  }
  return out.sort();
}

/** Bacini, cache e valutazione di una ricerca: li usano il generatore e `menuWeekCost`. */
function prepareSearch(input: MenuGenInput) {
  const rules: DayRules = { month: input.month, excluded: input.excluded, starter: false };
  const seedGrid = gridOf(input.seed);
  const seedBatch = batchLayout(seedGrid);
  const dayTypes = input.days.map((d) => d.dayType);
  const previousPurchases = input.previous ? weekPurchasesAtScale1(input.previous, dayTypes) : undefined;
  const wctx: WeekCtx = {
    rules,
    days: input.days,
    ...(input.previous ? { previous: input.previous, previousPurchases } : {}),
    score: { weightKg: input.weightKg, doneRate: input.doneRate, swappedAway: input.swappedAway, seedBatch },
  };
  const scoreCtx = wctx.score;
  const seedPrep = input.seed.prep ?? [];
  const seedPrepSummary = prepSummaryOf(seedGrid, seedPrep);

  // 1. Bacini.
  const pools: string[][] = [];
  const poolSets: Set<string>[] = [];
  for (let d = 0; d < 7; d++) {
    for (const slot of MEAL_SLOTS) {
      const pool = input.days[d] ? poolFor(d, slot, input, rules) : [];
      pools.push(pool);
      poolSets.push(new Set(pool));
    }
  }

  // 2. Cache dei giorni e valutazione.
  const dayCache = new Map<string, DaySummary>();
  const dayOf = (grid: readonly string[], d: number): DaySummary => {
    const ids = grid.slice(d * SLOT_COUNT, (d + 1) * SLOT_COUNT);
    const key = `${d}|${ids.join(',')}`;
    let hit = dayCache.get(key);
    if (!hit) {
      let clean = true;
      for (let k = 0; k < SLOT_COUNT; k++) if (ids[k] && !poolSets[d * SLOT_COUNT + k].has(ids[k])) clean = false;
      hit = daySummary(ids, d, input.days[d], rules, false, scoreCtx, clean);
      if (dayCache.size > 20_000) dayCache.clear();
      dayCache.set(key, hit);
    }
    return hit;
  };
  const seedPrepOk: PrepSummary = { ...seedPrepSummary, uncovered: [] };
  const prepCache = new Map<string, PrepSummary>();
  const prepOf = (grid: readonly string[], layout: readonly number[] = batchLayout(grid)): PrepSummary => {
    const same = layout.length === seedBatch.length && layout.every((v, i) => v === seedBatch[i]);
    if (same) return seedPrepOk;
    // I componenti dipendono dalle ricette da preparazione e dagli spuntini da portare con la frutta secca.
    let nuts = false;
    for (let c = 0; c < 6 * SLOT_COUNT && !nuts; c++) if (grid[c] && !RECIPES[grid[c]]?.batch && recipeComponents(grid[c]).length) nuts = true;
    const key = `${layout.join(',')}|${nuts ? 1 : 0}`;
    let hit = prepCache.get(key);
    if (!hit) {
      hit = componentPrepSummary(grid);
      prepCache.set(key, hit);
    }
    return hit;
  };
  let evaluations = 0;
  const evaluate = (grid: readonly string[], known?: DaySummary[], changedDays?: readonly number[], counted = true): Evaluated => {
    if (counted) evaluations++;
    const days = known ? known.slice() : [];
    if (known && changedDays) for (const d of changedDays) days[d] = dayOf(grid, d);
    else for (let d = 0; d < 7; d++) days[d] = dayOf(grid, d);
    const layout = batchLayout(grid);
    const w = weekResult(days, grid, prepOf(grid, layout), wctx, false, { trackCells: false, layout });
    let cost = w.sink.penalty + w.soft;
    let hard = w.sink.count;
    for (const day of days) {
      cost += day.sink.penalty + day.soft;
      hard += day.sink.count;
    }
    return { cost, hard, days, products: w.products };
  };
  /** Caselle coinvolte in una violazione dello stato accettato (non conta come valutazione). */
  const hotOf = (grid: readonly string[], e: Evaluated): Set<number> => {
    const layout = batchLayout(grid);
    const w = weekResult(e.days, grid, prepOf(grid, layout), wctx, false, { trackCells: true, layout });
    const hot = new Set<number>(w.sink.cells);
    for (const day of e.days) for (const c of day.sink.cells) hot.add(c);
    return hot;
  };

  return {
    rules,
    seedGrid,
    seedPrep,
    pools,
    poolSets,
    evaluate,
    hotOf,
    wctx,
    get evaluations() {
      return evaluations;
    },
  };
}

/**
 * Costo di un menù con il punteggio e i pesi del generatore, negli ingressi dati (per i test: il generatore non peggiora mai
 * il seme, § 13.4 test 15).
 */
export function menuWeekCost(week: MenuWeek, input: MenuGenInput): number {
  const grid = gridOf(week).slice(0, CELLS);
  while (grid.length < CELLS) grid.push('');
  return prepareSearch(input).evaluate(grid).cost;
}

/** Generatore del menù: sincrono, deterministico, con il ripiego del § 4.10. */
export function generateMenuWeek(input: MenuGenInput): MenuGenResult {
  const search = prepareSearch(input);
  const { seedGrid, seedPrep, pools, poolSets, evaluate, hotOf } = search;
  // 3. Partenza: il seme, con le caselle fuori bacino al candidato a costo minore.
  const max = Math.max(0, Math.trunc(input.maxEvaluations) || 0);
  let grid = seedGrid.slice(0, CELLS);
  while (grid.length < CELLS) grid.push('');
  const seedEval = evaluate(grid, undefined, undefined, max > 0);
  let current = seedEval;
  for (let c = 0; c < CELLS; c++) {
    if (grid[c] && poolSets[c].has(grid[c])) continue;
    if (!grid[c] && !pools[c].length) continue;
    const d = Math.floor(c / SLOT_COUNT);
    let bestId = '';
    let bestEval: Evaluated | null = null;
    for (const id of pools[c]) {
      // Finite le valutazioni, la casella prende comunque una ricetta ammessa (la prima del bacino): mai vuota se c'è.
      if (bestEval && search.evaluations >= max) break;
      const next = grid.slice();
      next[c] = id;
      const e = evaluate(next, current.days, [d], search.evaluations < max);
      if (!bestEval || e.cost < bestEval.cost - EPS) {
        bestEval = e;
        bestId = id;
      }
    }
    if (bestEval) {
      grid[c] = bestId;
      current = bestEval;
    } else if (grid[c]) {
      grid[c] = '';
      current = evaluate(grid, current.days, [d], false);
    }
  }
  const adaptedGrid = grid.slice();
  const adaptedEval = current;

  // 4. Ricerca locale.
  const rng: Rng = mulberry32(
    seedOf('menu', input.monday, input.month, input.days.map((d) => [d.dayType, d.target, d.carbFloorG ?? 0, d.carry ?? []]), [...input.excluded].sort(), input.attempt),
  );
  let bestGrid = grid.slice();
  let best = current;
  let kicks = 0;
  while (search.evaluations < max) {
    const moves = movesFor(grid, pools, poolSets, hotOf(grid, current), rng);
    let improved = false;
    for (const mv of moves) {
      if (search.evaluations >= max) break;
      const next = applyMove(grid, mv);
      if (!next) continue;
      const e = evaluate(next, current.days, changedDaysOf(mv));
      if (e.cost < current.cost - EPS) {
        grid = next;
        current = e;
        improved = true;
        if (e.cost < best.cost - EPS) {
          best = e;
          bestGrid = next.slice();
        }
        break;
      }
      if (Math.abs(e.cost - current.cost) <= EPS && chance(rng, TIE_ACCEPT)) {
        grid = next;
        current = e;
      }
    }
    if (improved) continue;
    // Un giro senza miglioramenti: con un menù valido ci si ferma (§ 4.10). Se restano violazioni e valutazioni, si riparte
    // dal migliore con qualche mossa a caso del generatore (ricerca locale iterata): una confezione o un doppione a volte si
    // tolgono solo in due passi, e il primo da solo non conviene.
    if (best.hard === 0 || search.evaluations >= max) break;
    kicks++;
    grid = bestGrid.slice();
    current = best;
    const kick = movesFor(grid, pools, poolSets, hotOf(grid, current), rng).slice(0, KICK_MOVES + (kicks % 2));
    for (const mv of kick) {
      if (search.evaluations >= max) break;
      const next = applyMove(grid, mv);
      if (!next) continue;
      grid = next;
      current = evaluate(next, current.days, changedDaysOf(mv));
    }
  }

  // 6-7. Controllo finale e ripiego.
  const vctx = { days: input.days, month: input.month, excluded: input.excluded, ...(input.previous ? { previous: input.previous } : {}) };
  const withPrep = (g: readonly string[]): MenuWeek => {
    const week = weekOf(g, []);
    const prep: PrepTask[] = sameBatchLayout(week, input.seed) ? clonePrep(seedPrep) : prepTasksFor(week);
    return { ...week, prep };
  };
  const bestWeek = withPrep(bestGrid);
  const bestViolations = validateMenuWeek(bestWeek, vctx);
  let week = bestWeek;
  let violations = bestViolations;
  let status: MenuGenStatus;
  let cost = best.cost;
  let products = best.products;
  if (!bestViolations.length) {
    status = sameGrid(bestGrid, seedGrid) ? 'seme' : 'generato';
  } else {
    const adaptedWeek = withPrep(adaptedGrid);
    const adaptedViolations = validateMenuWeek(adaptedWeek, vctx);
    if (!adaptedViolations.length) {
      week = adaptedWeek;
      violations = [];
      status = 'seme-adattato';
      cost = adaptedEval.cost;
      products = adaptedEval.products;
    } else if (!validateMenuWeek(input.seed, vctx).length) {
      week = { days: input.seed.days.map((d) => ({ meals: { ...d.meals } })), prep: clonePrep(seedPrep) };
      violations = [];
      status = 'seme';
      cost = seedEval.cost;
      products = seedEval.products;
    } else {
      status = 'fuori-limiti';
    }
  }

  // 8. Differenze rispetto al menù che varrebbe senza approvazione.
  const ref = gridOf(input.fallback ?? input.seed);
  const finalGrid = gridOf(week);
  const changed: MenuGenResult['changed'] = [];
  for (let c = 0; c < CELLS; c++) {
    if ((ref[c] ?? '') === (finalGrid[c] ?? '')) continue;
    changed.push({ day: Math.floor(c / SLOT_COUNT) as Weekday, slot: MEAL_SLOTS[c % SLOT_COUNT], from: ref[c] ?? '', to: finalGrid[c] ?? '' });
  }
  return { week, status, violations, changed, products, cost: Math.round(cost * 1000) / 1000, evaluations: search.evaluations };
}

const clonePrep = (prep: readonly PrepTask[]): PrepTask[] => prep.map((t) => ({ ...t, ...(t.recipeIds ? { recipeIds: [...t.recipeIds] } : {}) }));

function sameGrid(a: readonly string[], b: readonly string[]): boolean {
  for (let c = 0; c < CELLS; c++) if ((a[c] ?? '') !== (b[c] ?? '')) return false;
  return true;
}

function changedDaysOf(mv: Move): number[] {
  if (mv.kind === 'cambia') return [Math.floor(mv.cell / SLOT_COUNT)];
  if (mv.kind === 'scambia') return [Math.floor(mv.a / SLOT_COUNT), Math.floor(mv.b / SLOT_COUNT)];
  return [...new Set(mv.cells.map((c) => Math.floor(c / SLOT_COUNT)))];
}

/** Vicini della griglia: prima quelli che toccano una casella in violazione, ciascun gruppo mescolato dal generatore. */
function movesFor(grid: readonly string[], pools: readonly string[][], poolSets: readonly Set<string>[], hot: ReadonlySet<number>, rng: Rng): Move[] {
  const urgent: Move[] = [];
  const rest: Move[] = [];
  for (let c = 0; c < CELLS; c++) {
    for (const id of pools[c]) {
      if (id === grid[c]) continue;
      (hot.has(c) ? urgent : rest).push({ kind: 'cambia', cell: c, id });
    }
  }
  for (let s = 0; s < SLOT_COUNT; s++) {
    const bySlot = new Map<string, number[]>();
    for (let d = 0; d < 7; d++) {
      const c = d * SLOT_COUNT + s;
      if (grid[c]) bySlot.set(grid[c], [...(bySlot.get(grid[c]) ?? []), c]);
    }
    for (const [from, cells] of bySlot) {
      if (cells.length < 2) continue;
      const shared = pools[cells[0]].filter((id) => id !== from && cells.every((c) => poolSets[c].has(id)));
      for (const id of shared) (cells.some((c) => hot.has(c)) ? urgent : rest).push({ kind: 'tutte', cells, id });
    }
  }
  for (let s = 0; s < SLOT_COUNT; s++) {
    for (let d1 = 0; d1 < 7; d1++) {
      for (let d2 = d1 + 1; d2 < 7; d2++) {
        const a = d1 * SLOT_COUNT + s;
        const b = d2 * SLOT_COUNT + s;
        if (!grid[a] || !grid[b] || grid[a] === grid[b]) continue;
        if (!poolSets[b].has(grid[a]) || !poolSets[a].has(grid[b])) continue;
        (hot.has(a) || hot.has(b) ? urgent : rest).push({ kind: 'scambia', a, b });
      }
    }
  }
  return [...shuffled(urgent, rng), ...shuffled(rest, rng)];
}

function applyMove(grid: readonly string[], mv: Move): string[] | null {
  const next = grid.slice();
  if (mv.kind === 'tutte') {
    if (mv.cells.every((c) => next[c] === mv.id)) return null;
    for (const c of mv.cells) next[c] = mv.id;
    return next;
  }
  if (mv.kind === 'cambia') {
    if (next[mv.cell] === mv.id) return null;
    next[mv.cell] = mv.id;
    return next;
  }
  if (!next[mv.a] || !next[mv.b] || next[mv.a] === next[mv.b]) return null;
  next[mv.a] = grid[mv.b];
  next[mv.b] = grid[mv.a];
  return next;
}
