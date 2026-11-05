/**
 * Limiti del motore dei blocchi (docs/FASE2.md § 3.2-3.7): contatti e metri, tetti per fase, pavimenti fissi, gambe
 * pesanti e sostituzione sicura degli esercizi. Funzioni pure, senza orologio: i numeri sono scritti una volta sola qui
 * e li leggono il generatore, il validatore della settimana, il giorno adattato e i test.
 *
 * - Contatti (§ 3.6): ogni atterraggio è un contatto; negli esercizi su una gamba si conta per gamba e vale il lato più
 *   carico, quindi serie × ripetizioni × `contactsPerRep` (le ripetizioni sono già per lato). Si contano le ripetizioni
 *   massime della serie, la stima più prudente. La prova del saltello del rientro sta fuori dal conteggio.
 * - Metri: sprint, allunghi, cambi di direzione e ripetute (`distanceM` × ripetizioni × serie).
 * - Tetti per fase (tabella del § 3.6) e livello massimo; R3 (vigilia della vigilia) e lo stadio 1 del rientro hanno i
 *   loro tetti.
 * - Pavimenti (§ 3.5): Nordic, Copenhagen, polpacci e soleo pesanti, tibiale, estensori del polso se il gomito è tra le
 *   zone, forza pesante di gambe in stagione; meno quello che copre il fisioterapista (`physioCoverage`).
 * - `substituteFor` (§ 3.7): sostituzione deterministica, prima la sicurezza (livello d'impatto, gomito, tessuto
 *   frenato), poi lo stesso schema e la stessa qualità, lo spazio, il livello, l'ordine delle alternative del catalogo.
 */
import type { AppData, Exercise, SeasonPhase, SeasonStage, SessionExercise, TrainingQuality, TrainingSpace, WorkoutSession } from '../../domain/types';
import {
  EXERCISES,
  EXERCISE_LIST,
  impactLevelOf,
  patternOf,
  spaceOf,
  type CatalogExercise,
  type ExerciseSpace,
  type ImpactLevel,
  type MovementPattern,
} from '../../data/exercises';
import { DOSE_PRESETS } from '../../data/sessions';

// ───────────────────────── Contatti e metri ─────────────────────────

/** Contatti per seduta e a settimana e livello massimo, per fase e stadio (§ 3.6). */
export interface ContactLimits {
  session: number;
  week: number;
  maxLevel: ImpactLevel;
}

/** Tabella del § 3.6; la transizione è recupero attivo: al massimo un richiamo basso. */
export function contactLimitsFor(phase: SeasonPhase, stage: SeasonStage): ContactLimits {
  if (stage === 'rifinitura') return { session: 25, week: 40, maxLevel: 2 };
  if (phase === 'precampionato') return { session: 50, week: 80, maxLevel: 3 };
  if (phase === 'pausa') return stage === 'transizione' ? { session: 20, week: 30, maxLevel: 1 } : { session: 60, week: 100, maxLevel: 3 };
  return { session: 30, week: 40, maxLevel: 2 };
}

/** Contatti massimi per gamba nel riscaldamento (§ 3.3). */
export const WARMUP_CONTACTS_MAX = 12;
/** Vigilia della vigilia (R3): al massimo 20 contatti di livello 1 e 4 sprint da 20 m al 90%. */
export const MD2_CONTACTS_MAX = 20;
export const MD2_SPRINT_METERS_MAX = 80;
/** Stadio 1 del rientro: al massimo 20 contatti a seduta (§ 3.8). */
export const RETURN_STAGE1_CONTACTS = 20;
/** Metri sopra il 90% a seduta per la velocità (§ 3.4) e metri in tutto per la rapidità. */
export const SPEED_METERS_MAX = 150;
export const AGILITY_METERS_MAX = 200;
/** Aumento massimo tra due settimane di carico (§ 3.4): +20%, oppure +10 contatti sotto i 50. */
export const LOAD_STEP_SHARE = 0.2;
export const LOAD_STEP_SMALL = 10;
export const LOAD_STEP_SMALL_BELOW = 50;

const catalog = (id: string): CatalogExercise | undefined => EXERCISES[id];

/** Esercizio d'impatto del catalogo, o degli esercizi del fisioterapista riconosciuti dal nome. */
const IMPACT_RE = /balz|salt|pliometr|hop/i;
export function isImpactItem(exerciseId: string, physio?: Pick<AppData['physio'], 'exercises'>): boolean {
  const ex = catalog(exerciseId);
  if (ex) return typeof ex.impact === 'boolean' ? ex.impact : IMPACT_RE.test(`${ex.id} ${ex.name}`);
  const p = physio?.exercises.find((e) => e.id === exerciseId);
  return p ? IMPACT_RE.test(`${p.id} ${p.name}`) : false;
}

/** Livello d'impatto di un esercizio (fisioterapista compreso: un salto scritto a mano vale 3, il più prudente). */
export function itemLevel(exerciseId: string, physio?: Pick<AppData['physio'], 'exercises'>): ImpactLevel {
  const ex = catalog(exerciseId);
  if (ex) return impactLevelOf(ex);
  return isImpactItem(exerciseId, physio) ? 3 : 0;
}

/** Contatti di un esercizio della seduta (per gamba negli esercizi su una gamba), 0 se non è un salto. */
export function itemContacts(item: SessionExercise): number {
  const ex = catalog(item.exerciseId);
  if (!ex || ex.uncounted || item.unit !== 'reps' || (item.distanceM ?? 0) > 0) return 0;
  const cpr = item.contactsPerRep ?? ex.contactsPerRep ?? 0;
  if (!(cpr > 0)) return 0;
  return item.sets * item.repMax * cpr;
}

/** Metri di un esercizio della seduta (sprint, allunghi, cambi di direzione, ripetute). */
export function itemMeters(item: SessionExercise): number {
  return (item.distanceM ?? 0) > 0 && item.unit === 'reps' ? item.sets * item.repMax * item.distanceM! : 0;
}

const items = (s: Pick<WorkoutSession, 'blocks'>) => s.blocks.flatMap((b) => b.items);

/** Contatti di una seduta, riscaldamento compreso. */
export function sessionContacts(s: Pick<WorkoutSession, 'blocks'>): number {
  return items(s).reduce((t, it) => t + itemContacts(it), 0);
}

/** Contatti del solo riscaldamento. */
export function warmupContacts(s: Pick<WorkoutSession, 'blocks'>): number {
  return s.blocks.filter((b) => /riscaldamento/i.test(b.title)).flatMap((b) => b.items).reduce((t, it) => t + itemContacts(it), 0);
}

/** Metri di una seduta. */
export function sessionMeters(s: Pick<WorkoutSession, 'blocks'>): number {
  return items(s).reduce((t, it) => t + itemMeters(it), 0);
}

/** Livello d'impatto più alto della seduta (la prova del saltello fuori conteggio esclusa con `skipUncounted`). */
export function sessionMaxLevel(s: Pick<WorkoutSession, 'blocks'>, opts: { skipUncounted?: boolean; physio?: Pick<AppData['physio'], 'exercises'> } = {}): ImpactLevel {
  let max: ImpactLevel = 0;
  for (const it of items(s)) {
    if (opts.skipUncounted && catalog(it.exerciseId)?.uncounted) continue;
    const l = itemLevel(it.exerciseId, opts.physio);
    if (l > max) max = l;
  }
  return max;
}

/** Livello della pliometria del blocco: il più alto tra i salti contati (non sprint né corsa). */
export function plyoLevel(s: Pick<WorkoutSession, 'blocks'>): ImpactLevel {
  let max: ImpactLevel = 0;
  for (const it of items(s)) {
    if (itemContacts(it) > 0) {
      const l = itemLevel(it.exerciseId);
      if (l > max) max = l;
    }
  }
  return max;
}

/** Aumento ammesso tra due settimane di carico (§ 3.4). */
export function stepAllowed(before: number, after: number): boolean {
  if (after <= before) return true;
  if (before < LOAD_STEP_SMALL_BELOW) return after - before <= LOAD_STEP_SMALL;
  return after <= before * (1 + LOAD_STEP_SHARE) + 1e-9;
}

// ───────────────────────── Gambe pesanti, sprint, Nordic ─────────────────────────

const HEAVY_LEG_PATTERNS: ReadonlySet<MovementPattern> = new Set(['squat', 'cerniera', 'affondo']);

/** Forza di gambe: multiarticolare di gambe con 3-6 ripetizioni (il pavimento di forza in stagione, § 3.5). */
export function isStrengthLegs(item: SessionExercise): boolean {
  const ex = catalog(item.exerciseId);
  return Boolean(ex && ex.category === 'gambe' && HEAVY_LEG_PATTERNS.has(ex.pattern as MovementPattern) && item.repMin <= 6 && item.unit === 'reps' && (ex.impactLevel ?? 0) === 0 && !(ex.qualities ?? []).every((q) => q === 'potenza'));
}

/** Gambe pesanti di R2 e R7: forza di gambe a RIR 2 o meno. */
export function isHeavyLegs(item: SessionExercise): boolean {
  return isStrengthLegs(item) && (item.rir ?? 2) <= 2;
}

/** Esercizio di gambe (qualunque carico, prevenzione esclusa): R6 lo vieta nei giorni con il calcio. */
export function isLegsItem(item: SessionExercise): boolean {
  return catalog(item.exerciseId)?.category === 'gambe';
}

/** Nordic (assistito compreso). */
export function isNordic(item: SessionExercise): boolean {
  return /nordic/.test(item.exerciseId);
}

/** Copenhagen (tutte le leve). */
export function isCopenhagen(item: SessionExercise): boolean {
  return /copenhagen/.test(item.exerciseId);
}

/** Sprint sopra il 90% (velocità massima e accelerazioni), contati in metri. */
export function isFastSprint(item: SessionExercise): boolean {
  const p = patternOf(catalog(item.exerciseId));
  return (p === 'velocita-massima' || p === 'accelerazione' || p === 'cambio-direzione' || p === 'decelerazione') && itemMeters(item) > 0 && !/70|80/.test(item.effort ?? '');
}

/** Esercizio di sprint o salto (R9: dopo il riscaldamento e prima della forza). */
export function isSprintOrJump(item: SessionExercise): boolean {
  const ex = catalog(item.exerciseId);
  if (!ex) return false;
  return ex.category === 'pliometria' || ex.category === 'sprint' || (ex.category === 'condizionamento' && ex.pattern === 'intermittente' && (ex.qualities ?? []).includes('potenza'));
}

// ───────────────────────── Pavimenti ─────────────────────────

export type FloorId = 'nordic' | 'copenhagen' | 'polpacci' | 'tibiale' | 'polso' | 'forza-gambe';

export const FLOOR_LABEL: Record<FloorId, string> = {
  nordic: 'Nordic',
  copenhagen: 'Copenhagen',
  polpacci: 'polpacci e soleo pesanti',
  tibiale: 'tibiale',
  polso: 'estensori del polso',
  'forza-gambe': 'forza di gambe',
};

/** Pavimento che l'esercizio copre, se ne copre uno. */
export function floorOf(item: SessionExercise): FloorId | null {
  const ex = catalog(item.exerciseId);
  if (!ex) return null;
  if (isNordic(item) || ex.id === 'leg-curl-scivolando' || ex.id === 'ponte-flessori-isometrico') return 'nordic';
  if (ex.pattern === 'adduttori') return 'copenhagen';
  if ((ex.pattern === 'polpaccio' || ex.pattern === 'soleo') && ex.id !== 'polpacci-esplosivi') return 'polpacci';
  if (ex.pattern === 'tibiale') return 'tibiale';
  if (ex.pattern === 'polso') return 'polso';
  if (isStrengthLegs(item)) return 'forza-gambe';
  return null;
}

/** Volte a settimana di ogni pavimento (§ 3.5) per fase, zone di dolore e fisioterapista. */
export function requiredFloors(
  phase: SeasonPhase,
  opts: { elbow?: boolean; physio?: Pick<AppData['physio'], 'exercises' | 'prescriptions'>; inSeasonStrength?: boolean } = {},
): Partial<Record<FloorId, number>> {
  const out: Partial<Record<FloorId, number>> = {
    nordic: phase === 'stagione' ? 1 : 2,
    copenhagen: 1,
    polpacci: 2,
    tibiale: 1,
  };
  if (opts.elbow) out.polso = 2;
  if (phase === 'stagione' && opts.inSeasonStrength !== false) out['forza-gambe'] = 1;
  for (const id of physioFloors(opts.physio)) delete out[id];
  return out;
}

const PHYSIO_TISSUE_FLOOR: [RegExp, FloorId][] = [
  [/nordic|leg curl|flessori della coscia|ischiocrural/i, 'nordic'],
  [/copenhagen|addutt/i, 'copenhagen'],
  [/polpacc|gastrocnem|soleo/i, 'polpacci'],
  [/tibiale|solleva\w*\s+(?:delle|le)\s+punte|dorsiflession|pallina tra i talloni/i, 'tibiale'],
  [/estensor\w*\s+(?:del|dei)\s+pols|tyler|epicondil|gomit/i, 'polso'],
];

/** Pavimenti coperti dal fisioterapista (stessi tessuti di `physioCoverage`; gli allungamenti non contano). */
export function physioFloors(physio: Pick<AppData['physio'], 'exercises' | 'prescriptions'> | undefined): Set<FloorId> {
  const out = new Set<FloorId>();
  for (const p of physio?.prescriptions ?? []) {
    const ex = catalog(p.exerciseId) ?? physio?.exercises.find((e) => e.id === p.exerciseId);
    if (!ex || /allungament|stretch|mobilit|massagg|rullo|foam/i.test(ex.name)) continue;
    const hit = PHYSIO_TISSUE_FLOOR.find(([re]) => re.test(`${ex.id} ${ex.name}`));
    if (hit) out.add(hit[1]);
  }
  return out;
}

/** Volte a settimana in cui le sedute coprono ogni pavimento. */
export function floorsDone(sessions: readonly Pick<WorkoutSession, 'blocks'>[]): Partial<Record<FloorId, number>> {
  const out: Partial<Record<FloorId, number>> = {};
  for (const s of sessions) {
    const seen = new Set<FloorId>();
    for (const it of items(s)) {
      const f = floorOf(it);
      if (f) seen.add(f);
    }
    for (const f of seen) out[f] = (out[f] ?? 0) + 1;
  }
  return out;
}

/** Pavimenti mancanti nella settimana (volte che mancano per ciascuno). */
export function missingFloors(
  required: Partial<Record<FloorId, number>>,
  sessions: readonly Pick<WorkoutSession, 'blocks'>[],
): Partial<Record<FloorId, number>> {
  const done = floorsDone(sessions);
  const out: Partial<Record<FloorId, number>> = {};
  for (const [k, n] of Object.entries(required) as [FloorId, number][]) {
    const miss = n - (done[k] ?? 0);
    if (miss > 0) out[k] = miss;
  }
  return out;
}

// ───────────────────────── Spazi ─────────────────────────

/** Spazi disponibili: la palestra c'è sempre, e gli esercizi a corpo libero di «casa» si fanno anche lì. */
export function availableSpaces(spaces: readonly TrainingSpace[] | undefined): Set<ExerciseSpace> {
  return new Set<ExerciseSpace>(['palestra', 'casa', ...(spaces ?? [])]);
}

export function spaceAvailable(exerciseId: string, spaces: ReadonlySet<ExerciseSpace>): boolean {
  const ex = catalog(exerciseId);
  return !ex || spaces.has(spaceOf(ex));
}

// ───────────────────────── Sostituzione ─────────────────────────

/** Contesto della sostituzione (§ 3.7, regola 1: sicurezza). */
export interface SubstituteCtx {
  /** Livello d'impatto massimo (fermo per i segnali d'allarme, dolore, stadio del rientro, fase). */
  maxLevel: ImpactLevel;
  /** Eccezioni dello stadio del rientro (`allowed`): ammesse anche sopra il livello. */
  allowed?: readonly string[];
  /** Il gomito frena: solo varianti `elbowFriendly`. */
  elbow?: boolean;
  /** Tessuti frenati dalla regola del dolore: l'esercizio non va bene (es. gateForExercise diverso da 'ok'). */
  braked?: (exercise: Exercise) => boolean;
  spaces: ReadonlySet<ExerciseSpace>;
  /** Esercizi da non scegliere (già nella seduta). */
  exclude?: ReadonlySet<string>;
  /** Solo le alternative scritte nel catalogo (riscaldamento: niente ripieghi di un'altra famiglia). */
  alternativesOnly?: boolean;
  /** Categorie ammesse per il sostituto (la qualità resta qualità: uno sprint non diventa un affondo). */
  categories?: ReadonlySet<string>;
}

/** L'esercizio passa la regola 1 (sicurezza) e lo spazio. */
export function safeFor(exerciseId: string, ctx: SubstituteCtx): boolean {
  const ex = catalog(exerciseId);
  if (!ex) return true;
  const level = impactLevelOf(ex);
  if (level > ctx.maxLevel && !(ctx.allowed ?? []).includes(ex.id)) return false;
  if (ctx.elbow && ex.elbowFriendly === false) return false;
  if (ctx.braked?.(ex)) return false;
  return ctx.spaces.has(spaceOf(ex));
}

const sharesQuality = (a: CatalogExercise, b: CatalogExercise) => (a.qualities ?? []).some((q) => (b.qualities ?? []).includes(q));

/**
 * Sostituto di un esercizio, deterministico (§ 3.7): l'esercizio stesso se è sicuro; altrimenti, tra le sue alternative
 * (nel loro ordine) e gli esercizi con lo stesso schema (in ordine di catalogo), il primo sicuro e nello spazio
 * disponibile, preferendo lo stesso schema e la stessa qualità nella stessa famiglia di esercizi, poi le alternative del
 * catalogo, poi lo stesso schema, e a parità un livello non più alto.
 * Null se non resta niente (la prova del saltello non ha sostituti: si rimanda).
 */
export function substituteFor(exerciseId: string, ctx: SubstituteCtx): string | null {
  if (safeFor(exerciseId, ctx) && !ctx.exclude?.has(exerciseId)) return exerciseId;
  const ex = catalog(exerciseId);
  if (!ex || ex.uncounted) return null;
  const level = impactLevelOf(ex);
  const order: string[] = [];
  const push = (id: string) => {
    if (id !== exerciseId && !order.includes(id) && catalog(id)) order.push(id);
  };
  for (const a of ex.alternatives ?? []) push(a);
  if (!ctx.alternativesOnly) {
    for (const a of ex.alternatives ?? []) for (const b of catalog(a)?.alternatives ?? []) push(b);
    for (const e of EXERCISE_LIST) if (e.pattern && e.pattern === ex.pattern) push(e.id);
  }
  const alternatives = new Set(ex.alternatives ?? []);
  // Stesso schema e stessa famiglia (un balzo con un balzo, non con un plank laterale), poi le alternative del catalogo
  // nel loro ordine, poi lo stesso schema; a parità, un livello non più alto.
  const rank = (id: string) => {
    const c = catalog(id)!;
    const same = c.pattern === ex.pattern;
    const r = same && c.category === ex.category && sharesQuality(c, ex) ? 0 : alternatives.has(id) ? 1 : same ? 2 : 3;
    return r * 2 + (impactLevelOf(c) <= level ? 0 : 1);
  };
  const ranked = order
    .map((id, i) => ({ id, i, r: rank(id) }))
    .filter((x) => !catalog(x.id)!.uncounted && !ctx.exclude?.has(x.id) && safeFor(x.id, ctx) && (!ctx.categories || ctx.categories.has(catalog(x.id)!.category)))
    .sort((a, b) => a.r - b.r || a.i - b.i);
  return ranked[0]?.id ?? null;
}

/**
 * Candidati sicuri per un esercizio (per i ritocchi del coach, § 10.2: «candidati per esercizio già filtrati per
 * sicurezza»): le alternative del catalogo e gli esercizi con lo stesso schema che passano la regola 1 e lo spazio,
 * nell'ordine della sostituzione, l'esercizio stesso escluso.
 */
export function candidatesFor(exerciseId: string, ctx: SubstituteCtx, limit = 5): string[] {
  const out: string[] = [];
  const exclude = new Set(ctx.exclude ?? []);
  exclude.add(exerciseId);
  for (let i = 0; i < limit; i++) {
    const id = substituteFor(exerciseId, { ...ctx, exclude });
    if (!id || id === exerciseId) break;
    out.push(id);
    exclude.add(id);
  }
  return out;
}

/** Tipo di dose di un esercizio della seduta: serie per ripetizioni, secondi, metri o intervalli. */
export type DoseKind = 'reps' | 'secondi' | 'metri' | 'intervalli';
export const doseKind = (it: SessionExercise): DoseKind =>
  it.unit === 'secondi' ? 'secondi' : (it.workSec ?? 0) > 0 ? 'intervalli' : (it.distanceM ?? 0) > 0 ? 'metri' : 'reps';

/**
 * Esercizio della seduta sostituito, con una dose adatta: se il sostituto si dosa nello stesso modo tiene serie e
 * ripetizioni (i contatti non superano mai quelli dell'originale, regola 7), altrimenti prende la dose di riferimento
 * del sostituto con al massimo le serie dell'originale. Null se non c'è un sostituto.
 */
export function substituteItem(item: SessionExercise, ctx: SubstituteCtx): SessionExercise | null {
  const id = substituteFor(item.exerciseId, ctx);
  if (!id) return null;
  if (id === item.exerciseId) return item;
  const preset = DOSE_PRESETS[id];
  // Senza una dose di riferimento uno sprint o un intervallo non diventa un esercizio che si dosa in un altro modo.
  if (!preset && doseKind(item) !== 'reps' && doseKind(item) !== 'secondi') return null;
  const sameKind = !preset || doseKind(preset) === doseKind(item);
  let out: SessionExercise = sameKind
    ? { ...item, exerciseId: id, ...(preset?.perSide !== undefined ? { perSide: preset.perSide } : {}) }
    : { ...preset!, sets: Math.max(1, Math.min(item.sets, preset!.sets)) };
  if (!preset && !sameKind) out = { ...item, exerciseId: id };
  delete out.contactsPerRep;
  if (out.progression === 'doppia' && !(catalog(id)?.startKg?.length)) out = { ...out, progression: 'nessuna' };
  // Contatti: verso un esercizio senza impatto vanno a 0; tra due esercizi d'impatto non superano l'originale.
  const before = itemContacts(item);
  let after = itemContacts(out);
  while (after > before && out.repMax > 1) {
    out = { ...out, repMax: out.repMax - 1, repMin: Math.min(out.repMin, out.repMax - 1) };
    after = itemContacts(out);
  }
  return out;
}

/** Qualità di un esercizio del catalogo. */
export function qualitiesOf(exerciseId: string): readonly TrainingQuality[] {
  return catalog(exerciseId)?.qualities ?? [];
}
