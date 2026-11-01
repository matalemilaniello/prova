/**
 * Dati di esempio: un'app in uso da 3 settimane.
 *
 * Deterministico: ogni giornata ha il suo generatore con seme, ricavato dal giorno (posizione dall'inizio del
 * piano) e dalla sezione. L'ora passata decide solo quali voci di oggi risultano già segnate: lo storico dei
 * giorni passati (diario, controlli, sedute, calcio) è lo stesso a qualunque ora.
 * Legge a runtime RECIPES, SESSIONS, EXERCISES e MENU_ROTATION: funziona anche se sono vuoti
 * e produce dati più ricchi quando i contenuti ci sono. Nessun dato reale dell'utente.
 */
import type {
  AppData,
  ChatMessage,
  CheckIn,
  DayLog,
  Exercise,
  ExerciseLog,
  FootballLog,
  ISODate,
  ItemStatus,
  MealSlot,
  SessionExercise,
  TimelineItem,
  WeeklyReview,
  WorkoutLog,
} from '../domain/types';
import { EXERCISES } from '../data/exercises';
import { RECIPES } from '../data/recipes';
import { SESSIONS } from '../data/sessions';
import { DATA_VERSION, defaultAppData, defaultPlan } from '../data/defaults';
import {
  addDays,
  addMinutes,
  daysBetween,
  fromISO,
  hhmmToMin,
  minToHHMM,
  weekStart,
  weekdayOf,
} from '../engine/dates';
import { MEAL_SLOTS, menuWeekFor, mealsForDate } from '../engine/menu';
import { shoppingList } from '../engine/shopping';
import { isOnTargetFor, sleepHours } from '../engine/sleep';
import { hashString } from '../lib/id';

// Il motore della timeline appartiene a un altro modulo: se c'è, i suoi id guidano il diario.
// `buildDay` aggiunge i riti del fine settimana (spesa, preparazione, revisione), come in Oggi.
type BuildFn = (iso: ISODate, state: AppData) => TimelineItem[];
type TimelineModule = {
  buildDay?: BuildFn;
  buildTimeline?: BuildFn;
  adherenceSummary?: (iso: ISODate, state: AppData) => { score: number; total: number };
  itemCounts?: (iso: ISODate, item: TimelineItem, state: AppData) => boolean;
};
const timelineModules = import.meta.glob<TimelineModule>('../engine/timeline.ts', { eager: true });
const timelineModule = Object.values(timelineModules)[0];
const buildTimelineExt = timelineModule?.buildDay ?? timelineModule?.buildTimeline;

/** Generatore pseudo-casuale con seme (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generatore della giornata `i` (giorni dall'inizio del piano) per una sezione dei dati. Un flusso per giornata
 * e per sezione: quello che succede oggi (voci saltate perché non ancora arrivate) non sposta i numeri dei
 * giorni passati né delle altre sezioni.
 */
function dayRng(section: string, i: number): () => number {
  return rng(hashString(`ritmo-demo:${section}:${i}`));
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const round1 = (x: number) => Math.round(x * 10) / 10;
const clampInt = (x: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(x)));

const MEAL_NOTES = [
  'Panino al bar con pollo e insalata',
  'Pizza margherita con i colleghi',
  'Piadina con mozzarella al volo',
  'Insalatona al bar, senza pane',
  'Pasta al pomodoro in mensa',
];

/** Voci della giornata quando il motore della timeline non è disponibile. */
function fallbackItems(iso: ISODate, data: AppData): TimelineItem[] {
  const day = data.plan.week[weekdayOf(iso)];
  const minimal = data.dayLogs[iso]?.minimal;
  const t = data.plan.mealTimes;
  if (minimal) {
    return [
      { id: 'minima:proteine', time: t.colazione, kind: 'minima', title: 'Proteine a ogni pasto' },
      { id: 'minima:frutto', time: t.spuntino, kind: 'minima', title: 'Almeno un frutto' },
      { id: 'minima:integratori', time: t.colazione, kind: 'minima', title: 'Integratori' },
      { id: 'minima:telefono', time: data.plan.sleep.current, kind: 'minima', title: 'Telefono fuori dalla camera' },
    ];
  }
  const items: TimelineItem[] = [
    { id: 'controllo', time: addMinutes(data.plan.sleep.wake, 5), kind: 'controllo', title: 'Controllo del mattino' },
    { id: 'integratori', time: t.colazione, kind: 'integratori', title: 'Integratori' },
    ...MEAL_SLOTS.map((slot) => ({ id: `pasto:${slot}`, time: t[slot], kind: 'pasto' as const, title: slot, slot })),
  ];
  if (day?.gymSessionId) {
    items.push({ id: `palestra:${day.gymSessionId}`, time: day.gymTime ?? '17:00', kind: 'palestra', title: 'Palestra', ref: day.gymSessionId });
  }
  if (day?.football) {
    items.push({ id: `calcio:${day.football.kind}`, time: day.football.time, kind: 'calcio', title: day.football.kind, ref: day.football.kind });
  }
  if (day?.physio) items.push({ id: 'fisio', time: '15:30', kind: 'fisio', title: 'Esercizi del fisioterapista' });
  items.push({ id: 'coprifuoco', time: addMinutes(data.plan.sleep.current, -data.plan.sleep.curfewLeadMin), kind: 'coprifuoco', title: 'Coprifuoco' });
  items.push({ id: 'letto', time: data.plan.sleep.current, kind: 'letto', title: 'A letto' });
  return items.sort((a, b) => hhmmToMin(a.time) - hhmmToMin(b.time));
}

function itemsFor(iso: ISODate, data: AppData): TimelineItem[] {
  if (buildTimelineExt) {
    try {
      const items = buildTimelineExt(iso, data);
      if (Array.isArray(items) && items.length) return items;
    } catch {
      /* il modulo è in lavorazione: si usano le voci di riserva */
    }
  }
  return fallbackItems(iso, data);
}

/** Carico di partenza plausibile (kg) per un esercizio, dal nome e dalla categoria. */
function baseLoad(ex: Exercise | undefined): number {
  if (!ex) return 0;
  const n = ex.name.toLowerCase();
  const eq = (ex.equipment || '').toLowerCase();
  if (/corpo libero|nessuna|elastico|tappetino|muro/.test(eq) && !/manubr|bilanc|trap|cavo|macchin/.test(eq)) return 0;
  // Ordine importante: le regole più specifiche prima (es. "split squat" prima di "squat").
  const rules: [RegExp, number][] = [
    [/piegament|push-up|push up|trazion/, 0],
    [/una gamba|monopodal|single leg/, 18],
    [/rumeno/, 50],
    [/trap bar|stacco/, 80],
    [/split|bulgar|affond|step-up|step up/, 14],
    [/goblet/, 22],
    [/squat/, 60],
    [/hip thrust|ponte/, 70],
    [/leg press/, 120],
    [/inclinat/, 16],
    [/panca|distensi|spinta|chest press/, 20],
    [/military|lento|overhead|sopra la testa/, 14],
    [/rematore|row/, 24],
    [/lat|pulldown|tirata al petto/, 50],
    [/nordic|copenhagen|plank|dead bug|bird/, 0],
    [/polpacci in piedi|calf in piedi/, 60],
    [/polpacc|calf|soleo/, 40],
    [/face pull|alzate|croci|cavo/, 12],
    [/pallof|anti-rotaz/, 10],
    [/curl/, 12],
    [/tibial/, 6],
    [/polso|tyler|estensori/, 0],
    [/farmer|carry|trasport/, 20],
  ];
  for (const [re, kg] of rules) if (re.test(n)) return kg;
  switch (ex.category) {
    case 'gambe':
      return 40;
    case 'spinta':
      return 18;
    case 'tirata':
      return 25;
    default:
      return 0;
  }
}

function exerciseLogFor(item: SessionExercise, weekNo: number, r: () => number): ExerciseLog {
  const ex = EXERCISES[item.exerciseId];
  const light = ex && ['riscaldamento', 'mobilita'].includes(ex.category);
  const base = light ? 0 : baseLoad(ex);
  const inc = item.incrementKg ?? (base >= 40 ? 5 : 2);
  const progressing = item.progression === 'doppia' && base > 0;
  // Doppia progressione: le ripetizioni salgono di settimana in settimana, poi sale il carico.
  const span = Math.max(1, item.repMax - item.repMin);
  const steps = progressing ? weekNo : 0;
  const loadSteps = Math.floor(steps / (span + 1));
  const weight = base + loadSteps * inc;
  const repTarget = item.repMin + (steps % (span + 1));
  const sets = Array.from({ length: item.sets }, (_, i) => {
    let reps: number;
    if (item.unit === 'secondi') reps = item.repMax;
    else if (light || !progressing) reps = item.repMax;
    else reps = Math.min(item.repMax, repTarget + (i === item.sets - 1 && r() < 0.35 ? -1 : 0));
    return { weightKg: weight, reps: Math.max(1, reps), done: true };
  });
  return { exerciseId: item.exerciseId, sets };
}

function iso2Date(iso: ISODate, hh: number, mm: number): string {
  const d = fromISO(iso);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

export interface DemoOptions {
  /** Minuti dalla mezzanotte "adesso": le voci di oggi già passate risultano segnate. Default 13:00. */
  nowMin?: number;
}

/** Costruisce i dati di esempio per la data di oggi. */
export function buildDemo(todayIso: ISODate, opts: DemoOptions = {}): AppData {
  const nowMin = opts.nowMin ?? 13 * 60;
  const start = weekStart(addDays(todayIso, -21));
  const year = fromISO(todayIso).getFullYear();

  const data: AppData = defaultAppData(todayIso);
  data.version = DATA_VERSION;
  data.onboarded = true;
  data.profile = {
    sex: 'M',
    birthYear: year - 33,
    heightCm: 178,
    startWeightKg: 70.8,
    goal: 'ricomposizione',
    painSites: ['Tibia', 'Gomito'],
    waterTargetL: 2.5,
  };
  data.plan = defaultPlan(start);
  // Due revisioni accettate: l'orario a letto è già avanzato di due passi (00:45 → 00:15).
  data.plan.sleep = { ...data.plan.sleep, current: '00:15' };
  data.settings = { ...data.settings, demoData: true };
  data.physio = demoPhysio();

  const histDays = daysBetween(start, todayIso);
  // Una settimana credibile, non perfetta (aderenza 65-88%): ogni settimana una o due giornate minime e una o
  // due giornate non riuscite. Il jolly guadagnato con 5 giornate riuscite salva la serie alla prima giornata
  // storta della settimana dopo; la seconda la spezza. L'ultima settimana va meglio delle prime.
  // Indici dal lunedì di inizio: i % 7 è il giorno della settimana (0 = lunedì).
  const minimalDays = new Set([5, 9, 16, 19, 24].filter((i) => i < histDays));
  const failDays = new Set([1, 3, 11, 15, 17, 23].filter((i) => i < histDays));
  const recipeIds = Object.keys(RECIPES);

  // ── Controlli del mattino ──
  // Il controllo di un giorno racconta la notte prima. Si fa tardi (00:40-01:10) dopo la partita del lunedì,
  // quando l'adrenalina tiene svegli, e il venerdì sera; il sabato e la domenica la sveglia è verso le 8.
  // 4-5 notti in orario su 7, con le notti in orario che anticipano piano piano.
  // `sleepHours` è il tempo a letto calcolato dagli orari, lo stesso numero che mostrano tutte le schermate.
  const skipCheckIn = new Set([3, 12].filter((i) => i < histDays));
  const lateNight = (i: number) => i % 7 === 1 || i % 7 === 5 || i === 2;
  for (let i = 0; i <= histDays; i++) {
    const iso = addDays(start, i);
    if (skipCheckIn.has(i)) continue;
    const r = dayRng('controllo', i);
    const p = histDays ? i / histDays : 1;
    const wd = weekdayOf(iso);
    const late = lateNight(i);
    const weekend = wd === 5 || wd === 6;
    const wake = minToHHMM(hhmmToMin(weekend ? '08:00' : '07:15') + Math.round((r() - 0.5) * 16));
    // In orario: dalle 00:25 delle prime notti verso le 23:55 (fase attuale 00:15, tolleranza 15 minuti).
    const bed = late
      ? minToHHMM(hhmmToMin('00:40') + Math.round(r() * 30))
      : minToHHMM(hhmmToMin('00:25') - Math.round(30 * p) + Math.round((r() - 0.5) * 12));
    const afterMatch = wd === 1 || wd === 3; // il giorno dopo partita e calcetto
    const tibia = clampInt(lerp(3, 1, p) + (afterMatch ? 0.7 : 0) + (r() - 0.5) * 0.8, 0, 10);
    const gomito = clampInt(lerp(3, 2, p) + (wd === 2 || wd === 5 ? 0.5 : 0) + (r() - 0.5) * 0.8, 0, 10);
    const withWeight = r() < 0.88 || i === histDays;
    const c: CheckIn = {
      date: iso,
      bedTime: bed,
      wakeTime: wake,
      sleepHours: sleepHours(bed, wake),
      sleepQuality: clampInt(lerp(3, 4.2, p) + (late ? -0.8 : 0) + (r() - 0.5) * 1.2, 1, 5),
      pain: { Tibia: tibia, Gomito: gomito },
      energy: clampInt(lerp(6, 8, p) + (late ? -0.7 : 0) + (r() - 0.5) * 1.6, 1, 10),
    };
    if (withWeight) c.weightKg = round1(lerp(70.6, 69.8, p) + (r() - 0.5) * 0.5 + (wd === 0 ? 0.2 : 0));
    data.checkIns[iso] = c;
  }

  // ── Diario di ogni giornata ──
  const sweetsByWeek = new Map<ISODate, number>();
  for (let i = 0; i <= histDays; i++) {
    const iso = addDays(start, i);
    const isToday = i === histDays;
    const r = dayRng('diario', i);
    const p = histDays ? i / histDays : 1;
    const log: DayLog = {
      date: iso,
      status: {},
      notes: {},
      minimal: minimalDays.has(i),
      waterGlasses: 0,
      sweets: 0,
      recipeSwaps: {},
    };
    data.dayLogs[iso] = log;

    // Qualche sostituzione di ricetta dalle alternative previste.
    if (!isToday && recipeIds.length && i % 6 === 4) {
      const meals = mealsForDate(iso, data);
      const target = meals.bySlot.cena ?? meals.bySlot.pranzo;
      const alt = target?.recipe?.swaps?.find((id) => RECIPES[id]);
      if (target && alt) log.recipeSwaps[target.slot as MealSlot] = alt;
    }

    const adherence = lerp(0.55, 0.78, p);
    const items = itemsFor(iso, data);
    for (const it of items) {
      if (isToday && hhmmToMin(it.time) > nowMin - 20) continue;
      if (it.kind === 'controllo') {
        if (data.checkIns[iso]) log.status[it.id] = 'fatto';
        continue;
      }
      // La revisione si ricava dalle revisioni salvate più sotto.
      if ((it.kind as string) === 'revisione') continue;
      if (it.kind === 'letto' || it.kind === 'coprifuoco') {
        // Letto e coprifuoco seguono la notte vera, raccontata dal controllo del giorno dopo.
        const next = data.checkIns[addDays(iso, 1)];
        if (!next?.bedTime) continue;
        const onTarget = isOnTargetFor(next.bedTime, addDays(iso, 1), data.plan);
        if (it.kind === 'letto') {
          if (onTarget) log.status[it.id] = 'fatto';
        } else if (!log.minimal) {
          log.status[it.id] = onTarget ? 'fatto' : 'saltato';
        }
        continue;
      }
      const x = r();
      let st: ItemStatus | undefined;
      if (log.minimal) st = x < 0.85 ? 'fatto' : undefined;
      else if (x < adherence) st = 'fatto';
      else if (x < adherence + 0.13) st = 'sostituito';
      else if (x < adherence + 0.2) st = 'saltato';
      if (!st) continue;
      log.status[it.id] = st;
      if (st === 'sostituito') {
        log.notes[it.id] = it.kind === 'pasto' ? MEAL_NOTES[Math.floor(r() * MEAL_NOTES.length)] : 'Fatto più tardi del previsto';
      }
    }

    log.waterGlasses = isToday ? Math.min(4, Math.floor(nowMin / 180)) : clampInt(lerp(5, 9, p) + (r() - 0.5) * 3, 2, 12);
    const ws = weekStart(iso);
    const weekSweets = sweetsByWeek.get(ws) ?? 0;
    // Circa 3 dolci a settimana, uno in più nell'ultima settimana chiusa.
    const lastClosed = daysBetween(ws, weekStart(todayIso)) === 7;
    const wantSweet = weekdayOf(iso) === 2 || weekdayOf(iso) === 5 || weekdayOf(iso) === 6 || (lastClosed && weekdayOf(iso) === 3);
    if (!isToday && wantSweet && r() < 0.92) {
      log.sweets = 1;
      sweetsByWeek.set(ws, weekSweets + 1);
    }
  }

  // ── Sedute di palestra ──
  const workouts: WorkoutLog[] = [];
  let doneC = false;
  for (let i = 0; i < histDays; i++) {
    const iso = addDays(start, i);
    const day = data.plan.week[weekdayOf(iso)];
    const sid = day?.gymSessionId;
    if (!sid) continue;
    const weekNo = Math.floor(i / 7);
    if (day.gymOptional) {
      if (doneC || weekNo !== 1) continue;
      doneC = true;
    }
    if (minimalDays.has(i)) continue;
    const r = dayRng('palestra', i);
    const session = SESSIONS[sid];
    const exercises: ExerciseLog[] = session
      ? session.blocks.flatMap((b) => b.items).map((it) => exerciseLogFor(it, weekNo, r))
      : [];
    const pain = data.checkIns[iso]?.pain ?? { Tibia: 1, Gomito: 2 };
    workouts.push({
      id: `demo-w-${iso}`,
      date: iso,
      sessionId: sid,
      durationMin: Math.round((session?.estMin ?? (sid === 'C' ? 38 : 55)) + (r() - 0.5) * 8),
      rpe: clampInt(lerp(7, 7.5, r()) + (r() - 0.5), 6, 9),
      pain: { ...pain },
      exercises,
      notes: weekNo === 0 && sid === 'A' ? 'Prima seduta: carichi prudenti, tecnica pulita.' : undefined,
    });
    const status = data.dayLogs[iso]?.status;
    if (status) {
      const key = Object.keys(status).find((k) => k.startsWith('palestra')) ?? `palestra:${sid}`;
      status[key] = 'fatto';
    }
  }
  data.workoutLogs = workouts;

  // ── Calcio ──
  const football: FootballLog[] = [];
  for (let i = 0; i < histDays; i++) {
    const iso = addDays(start, i);
    const f = data.plan.week[weekdayOf(iso)]?.football;
    if (!f) continue;
    if (i === 9) continue; // un calcetto saltato
    const r = dayRng('calcio', i);
    const rpe = f.kind === 'partita' ? clampInt(7.4 + (r() - 0.5) * 1.6, 6, 9) : clampInt(6.4 + (r() - 0.5) * 1.6, 5, 8);
    football.push({
      id: `demo-f-${iso}`,
      date: iso,
      kind: f.kind,
      durationMin: f.durationMin + (f.kind === 'partita' ? 0 : Math.round((r() - 0.5) * 10)),
      rpe,
    });
    const status = data.dayLogs[iso]?.status;
    if (status) {
      const key = Object.keys(status).find((k) => k.startsWith('calcio')) ?? `calcio:${f.kind}`;
      status[key] = 'fatto';
    }
  }
  data.footballLogs = football;

  // ── Esito delle giornate ──
  // Il caso da solo non garantisce la forma della settimana: si ritoccano poche voci del diario (pasti,
  // integratori, fisio, spesa, preparazione) finché ogni giornata riuscita sta tra il 72 e l'88% e ogni
  // giornata storta sotto il 60%. Le voci che vengono dai registri (controllo, palestra, calcio) e la notte non
  // si toccano.
  balanceDays(data, start, histDays, failDays);

  // ── Revisioni della domenica ──
  // Le ultime due settimane chiuse (la prima è rimasta senza revisione): l'ultima ha scelto lo scalino
  // della settimana in corso.
  const reviews: WeeklyReview[] = [];
  const current = Math.max(0, Math.floor(daysBetween(start, weekStart(todayIso)) / 7));
  for (let w = Math.max(0, current - 2); w < current; w++) {
    const ws = addDays(start, w * 7);
    const last = w === current - 1;
    reviews.push({
      weekStart: ws,
      votes: { energia: last ? 7 : 6, digestione: 7, umore: 7, campo: last ? 7 : 6 },
      waistCm: last ? 84 : 84.5,
      skinfolds: last ? undefined : { Addome: 18, Sovrailiaca: 14, Coscia: 12 },
      acceptedProposals: ['sonno'],
      note: last ? 'Meglio con la cena preparata la domenica.' : 'Il coprifuoco è la parte più difficile.',
      ...(last ? { step: { id: 'frutta-spuntino' as const, title: 'Un frutto allo spuntino' } } : {}),
    });
  }
  data.reviews = reviews;

  // Scalino della settimana in corso: segnato quasi tutti i giorni passati.
  if (reviews.length) {
    const from = weekStart(todayIso);
    for (let d = from, i = 0; daysBetween(d, todayIso) > 0; d = addDays(d, 1), i++) {
      const log = data.dayLogs[d];
      if (log && i % 4 !== 2) log.status.scalino = 'fatto';
    }
  }

  // ── Spesa e preparazione: le spunte seguono le voci del diario ──
  // La spesa del sabato segnata ha la lista della settimana dopo spuntata (quasi tutta se sostituita), la
  // preparazione della domenica segnata ha le attività fatte (una in meno se sostituita). Così Settimana dice
  // la stessa cosa di Oggi.
  data.shoppingChecked = {};
  data.prepDone = {};
  for (let d = start; daysBetween(d, todayIso) >= 0; d = addDays(d, 1)) {
    const status = data.dayLogs[d]?.status;
    if (!status) continue;
    const nextMonday = addDays(weekStart(d), 7);
    const shop = status['rito:spesa'];
    if (shop === 'fatto' || shop === 'sostituito') {
      const keys = shoppingList(nextMonday, data).items.map((i) => i.key);
      data.shoppingChecked[nextMonday] = shop === 'fatto' ? keys : keys.filter((_, i) => i % 6 !== 5);
    }
    const prepStatus = status['rito:preparazione'];
    if (prepStatus === 'fatto' || prepStatus === 'sostituito') {
      const tasks = (menuWeekFor(nextMonday, data.plan.startDate)?.prep ?? []).map((t) => t.id);
      data.prepDone[nextMonday] = prepStatus === 'fatto' ? tasks : tasks.slice(0, Math.max(0, tasks.length - 1));
    }
  }

  // ── Qualche messaggio con il coach ──
  data.chat = demoChat(todayIso);

  return data;
}

/** Voci del diario che il bilanciamento può cambiare. */
const BALANCE_KINDS = new Set<string>(['pasto', 'integratori', 'fisio', 'spesa', 'preparazione']);

function balanceDays(data: AppData, start: ISODate, histDays: number, failDays: Set<number>) {
  const summary = timelineModule?.adherenceSummary;
  const counts = timelineModule?.itemCounts;
  if (!summary || !counts) return;
  for (let i = 0; i < histDays; i++) {
    const iso = addDays(start, i);
    const log = data.dayLogs[iso];
    if (!log) continue;
    const r = dayRng('bilancio', i);
    const items = itemsFor(iso, data);
    if (log.minimal) {
      // Giornata minima: le quattro voci fatte, la giornata vale.
      for (const it of items) if (it.kind === 'minima') log.status[it.id] = 'fatto';
      continue;
    }
    const p = histDays ? i / histDays : 1;
    const editable = items.filter((it) => BALANCE_KINDS.has(it.kind) && counts(iso, it, data));
    // Ordine stabile ma diverso ogni giorno.
    const order = editable.map((it) => ({ it, k: r() })).sort((a, b) => a.k - b.k).map((x) => x.it);
    const score = () => summary(iso, data).score;
    if (failDays.has(i)) {
      const goal = 0.42 + 0.12 * r();
      for (const it of order) {
        if (score() < goal) break;
        if (log.status[it.id] !== 'fatto' && log.status[it.id] !== 'sostituito') continue;
        if (r() < 0.5) log.status[it.id] = 'saltato';
        else delete log.status[it.id];
        delete log.notes[it.id];
      }
      continue;
    }
    const low = Math.min(0.8, 0.72 + 0.05 * p + 0.03 * r());
    const high = Math.min(0.88, low + 0.07);
    for (const it of order) {
      if (score() >= low) break;
      const st = log.status[it.id];
      if (st === 'fatto') continue;
      if (st === undefined && it.kind === 'pasto' && r() < 0.35) {
        log.status[it.id] = 'sostituito';
        log.notes[it.id] = MEAL_NOTES[Math.floor(r() * MEAL_NOTES.length)];
      } else {
        log.status[it.id] = 'fatto';
        delete log.notes[it.id];
      }
    }
    for (const it of [...order].reverse()) {
      if (score() <= high) break;
      if (log.status[it.id] !== 'fatto') continue;
      if (it.kind === 'pasto') {
        log.status[it.id] = 'sostituito';
        log.notes[it.id] = MEAL_NOTES[Math.floor(r() * MEAL_NOTES.length)];
      } else delete log.status[it.id];
    }
  }
}

function demoPhysio(): AppData['physio'] {
  const exercises: Exercise[] = [
    {
      id: 'fisio-soleo-iso',
      name: 'Isometria del soleo al muro',
      category: 'fisio',
      equipment: 'Muro',
      cues: ['Ginocchio piegato sopra le dita', 'Tallone appena staccato da terra', 'Spingi forte senza muoverti'],
      elbowFriendly: true,
    },
    {
      id: 'fisio-tibiale-muro',
      name: 'Sollevamento delle punte con la schiena al muro',
      category: 'fisio',
      equipment: 'Muro',
      cues: ['Talloni a 20 cm dal muro', 'Solleva le punte fino in fondo', 'Scendi in 3 secondi'],
      elbowFriendly: true,
    },
    {
      id: 'fisio-polso-eccentrico',
      name: 'Eccentrico degli estensori del polso',
      category: 'fisio',
      equipment: 'Manubrio leggero',
      cues: ['Avambraccio appoggiato sulla coscia', 'Sali aiutandoti con l’altra mano', 'Scendi lento in 4 secondi'],
      elbowFriendly: true,
    },
  ];
  const prescriptions: SessionExercise[] = [
    { exerciseId: 'fisio-soleo-iso', sets: 4, repMin: 30, repMax: 45, unit: 'secondi', restSec: 60, progression: 'nessuna', perSide: true },
    { exerciseId: 'fisio-tibiale-muro', sets: 3, repMin: 12, repMax: 15, unit: 'reps', restSec: 45, progression: 'nessuna' },
    { exerciseId: 'fisio-polso-eccentrico', sets: 3, repMin: 12, repMax: 15, unit: 'reps', restSec: 60, progression: 'nessuna', perSide: true, note: 'Dolore fino a 3 su 10 accettabile' },
  ];
  return { exercises, prescriptions };
}

/** Ultimo giorno prima di oggi (fino a 7 giorni fa) con uno dei giorni della settimana indicati. */
function lastWeekday(todayIso: ISODate, weekdays: number[]): ISODate {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(todayIso, -i);
    if (weekdays.includes(weekdayOf(d))) return d;
  }
  return addDays(todayIso, -1);
}

function demoChat(todayIso: ISODate): ChatMessage[] {
  // Coerente con la settimana predefinita: la domanda sul bar in un giorno di calcetto (mercoledì),
  // quella sulla palestra nell'ultimo giorno di palestra (martedì o venerdì).
  const d2 = lastWeekday(todayIso, [2]);
  const d1 = lastWeekday(todayIso, [1, 4]);
  const chat: ChatMessage[] = [
    { id: 'demo-c1', role: 'user', text: 'Sono al bar, cosa prendo?', createdAt: iso2Date(d2, 10, 41) },
    {
      id: 'demo-c2',
      role: 'assistant',
      text:
        'A metà mattina prendi un toast al formaggio con uno yogurt alla frutta, oppure uno yogurt bianco con un frutto se c’è. ' +
        'Cornetto e succo insieme no: tanti zuccheri, poche proteine e alle 12 hai di nuovo fame. ' +
        'Stasera c’è il calcetto: toast e yogurt danno proteine e un po’ di carboidrati, il pieno arriva a pranzo e con la merenda prima del campo.',
      createdAt: iso2Date(d2, 10, 41),
    },
    { id: 'demo-c3', role: 'user', text: 'Salto la palestra? Ho dormito poco.', createdAt: iso2Date(d1, 16, 12) },
    {
      id: 'demo-c4',
      role: 'assistant',
      text:
        'Non saltarla, accorciala. Riscaldamento completo, blocco principale con una serie in meno e RIR 3. ' +
        'La prevenzione per la tibia tienila tutta: è la parte che conta di più questa settimana. ' +
        'Stasera coprifuoco del telefono alle 23:45.',
      createdAt: iso2Date(d1, 16, 13),
    },
  ];
  return chat.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
