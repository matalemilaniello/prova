/**
 * Compito strutturato `foto-piatto` (docs/FASE2.md § 7.2, § 10.2, § 10.3): il coach legge la foto di un piatto e
 * risponde con lo schema JSON; il validatore qui sotto controlla tutta la risposta prima di usarla. La lettura è una
 * chiamata a sé (`runStructuredTask` di `lib/claudeTasks.ts`), non un turno della chat: la cronologia non cambia.
 *
 * Il coach riconosce alimenti, grammi, confidenza, cottura, olio probabile, somiglianza al pasto previsto e un nome per
 * il piatto. Non dà valori per gli alimenti dell'archivio: li calcola il motore (`engine/estimate.ts`). Fuori archivio i
 * suoi valori per 100 g passano solo con i controlli di `validPer100g`.
 *
 * Lo schema non ha `minimum`, `maximum` né vincoli sugli array (l'uscita strutturata non li accetta): i limiti li
 * controlla `validatePhotoReading`, che non lancia mai e non accetta mai valori fuori dai limiti.
 */
import type { DayType, MealSlot, OilChoice, Recipe, Settings } from '../../domain/types';
import { ESTIMATE_FOODS } from '../../data/estimateFoods';
import { FOODS } from '../../data/foods';
import { DEFAULT_MODEL, modelSupport } from '../../lib/claude';
import { coachText, runStructuredTask, type StructuredClient, type StructuredTask, type TaskResult, type TaskValidation } from '../../lib/claudeTasks';
import { DAY_TYPE_LABEL, MEAL_SLOT_LABEL } from '../../lib/format';
import type { CoachPhase } from '../../lib/claude';
import {
  ITEM_GRAMS_MAX,
  ITEM_GRAMS_MIN,
  ITEM_LABEL_MAX,
  MAX_MEAL_ITEMS,
  OIL_CHOICES,
  estimateFoodById,
  oneLine,
  validPer100g,
  type PhotoCooking,
  type PhotoMatch,
  type PhotoReading,
  type PhotoReadingItem,
} from '../estimate';
import { lineGrams, roundGrams } from '../nutrition';

/** Tempo massimo della lettura (§ 7.2). */
export const PHOTO_TIMEOUT_MS = 45_000;
/** Il pensiero conta nei `max_tokens` (§ 10.2). */
export const PHOTO_MAX_TOKENS = 8000;
/**
 * Fallback lato server sulla lettura. La combinazione con l'uscita strutturata è da provare con una chiave vera (§ 15.8,
 * § 14.4): se non regge, la raccomandazione è partire senza fallback, cioè mettere qui `false`.
 */
export const PHOTO_FALLBACK = true;
/** Lunghezza della nota del coach (una frase). */
export const PHOTO_NOTE_MAX = 140;

const COOKINGS: readonly PhotoCooking[] = ['crudo', 'bollito', 'vapore', 'forno', 'padella', 'griglia', 'fritto', 'misto', 'non-so'];
const MATCHES: readonly PhotoMatch[] = ['si', 'in-parte', 'no', 'non-so'];
const OUTCOMES: readonly PhotoReading['outcome'][] = ['piatto', 'non-cibo', 'illeggibile'];
const CONFIDENCES = ['bassa', 'media', 'alta'] as const;

/** Id che il coach può usare: quelli dell'archivio e quelli di sola stima, fissi per versione dell'app. */
export function photoFoodIds(): string[] {
  return [...Object.keys(FOODS), ...ESTIMATE_FOODS.map((f) => f.id)];
}

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

/** Schema della risposta (§ 10.3): tutti i campi richiesti, con `null` dove manca il dato. */
export function photoSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['outcome', 'items', 'cooking', 'oil', 'matchesPlanned', 'dishName', 'note'],
    properties: {
      outcome: { type: 'string', enum: [...OUTCOMES] },
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'foodId', 'grams', 'confidence', 'role', 'per100g'],
          properties: {
            label: { type: 'string' },
            foodId: nullable({ type: 'string', enum: photoFoodIds() }),
            grams: { type: 'number' },
            confidence: { type: 'string', enum: [...CONFIDENCES] },
            role: { type: 'string', enum: ['alimento', 'condimento'] },
            per100g: nullable({
              type: 'object',
              additionalProperties: false,
              required: ['kcal', 'proteinG', 'carbG', 'fatG', 'fiberG'],
              properties: {
                kcal: { type: 'number' },
                proteinG: { type: 'number' },
                carbG: { type: 'number' },
                fatG: { type: 'number' },
                fiberG: { type: 'number' },
              },
            }),
          },
        },
      },
      cooking: { type: 'string', enum: [...COOKINGS] },
      oil: { type: 'string', enum: [...OIL_CHOICES, 'non-so'] },
      matchesPlanned: { type: 'string', enum: [...MATCHES] },
      dishName: { type: 'string' },
      note: { type: 'string' },
    },
  };
}

/** Riga dell'elenco nel prompt: «id · nome» (il nome dice già lo stato in cui si pesa: «Riso basmati, cotto»). */
const foodLine = (id: string, name: string) => `${id} · ${name}`;

/** Prompt di sistema stabile (va in cache): regole e i due elenchi degli alimenti. */
export function photoSystemPrompt(): string {
  const archive = Object.values(FOODS).map((f) => foodLine(f.id, f.name));
  const estimates = ESTIMATE_FOODS.map((f) => foodLine(f.id, f.name));
  return [
    'Leggi la foto di un pasto per Ritmo, un’app che segna quello che mangia una persona attiva. Rispondi solo con il JSON dello schema: nessun altro testo.',
    '',
    'Regole:',
    '- outcome: «piatto» se nella foto c’è cibo da stimare; «non-cibo» se non c’è cibo; «illeggibile» se la foto è troppo buia, mossa o tagliata per stimare. Con «non-cibo» o «illeggibile» lascia items vuoto.',
    `- items: un elemento per alimento visibile, al massimo ${MAX_MEAL_ITEMS}. Scegli foodId dall’elenco quando corrisponde, anche in modo approssimato (penne e spaghetti sono «pasta»); null solo se nessuna voce va bene, e allora scrivi un label breve in italiano.`,
    '- Preferisci l’archivio: usa le voci di sola stima solo per piatti e prodotti interi che l’archivio non descrive (pizza, cornetto, panino, salumi).',
    `- grams: grammi nello stato in cui si mangia, come dice il nome della voce (riso e pasta cotti, legumi sgocciolati, carne e pesce cotti), da ${ITEM_GRAMS_MIN} a ${ITEM_GRAMS_MAX}. Stima dalle dimensioni del piatto, delle posate e del contenitore.`,
    '- confidence: «alta», «media» o «bassa» per ogni alimento; «bassa» quando è coperto, mescolato o di dimensioni incerte.',
    '- role: «condimento» per salse, formaggio grattugiato, burro, maionese, pesto visibili; «alimento» per il resto.',
    '- per100g: null per ogni voce dell’elenco; solo con foodId null i valori per 100 g (kcal, proteine, carboidrati disponibili senza la fibra, grassi, fibre), coerenti con 4 kcal per grammo di proteine e carboidrati, 9 per i grassi e 2 per la fibra.',
    '- L’olio che non si vede va solo in oil: «niente», «filo» (5 g), «cucchiaio» (10 g), «due-cucchiai» (20 g) o «non-so». Non metterlo tra gli alimenti.',
    '- cooking: la cottura prevalente del piatto.',
    '- matchesPlanned: confronta con il pasto previsto del contesto: «si» se è quel pasto, «in-parte», «no», «non-so» se non c’è un pasto previsto.',
    '- dishName: due-quattro parole italiane, solo la prima maiuscola, senza marchi.',
    '- note: al massimo una frase su cosa era difficile da stimare, oppure una stringa vuota.',
    '- Non dare consigli e non giudicare la scelta: chi usa l’app segna quello che ha mangiato.',
    '',
    'Archivio degli alimenti (id · nome e stato in cui si pesa):',
    ...archive,
    '',
    'Voci di sola stima (piatti e prodotti interi):',
    ...estimates,
  ].join('\n');
}

/** Ingressi del contesto variabile: il pasto, il tipo di giorno, la ricetta prevista con le sue grammature. */
export interface PhotoContextInput {
  slot: MealSlot;
  dayType: DayType;
  planned?: Recipe;
  /** Scala dei carboidrati del giorno, per le grammature della ricetta prevista. */
  carbScale?: number;
}

/** Contesto variabile (fuori dalla cache): pasto, tipo di giorno, pasto previsto con gli alimenti e i grammi. */
export function photoContext(input: PhotoContextInput): string {
  const lines = [`Pasto: ${MEAL_SLOT_LABEL[input.slot].toLowerCase()}, giorno di ${DAY_TYPE_LABEL[input.dayType].toLowerCase()}.`];
  const r = input.planned;
  if (r) {
    const parts = r.ingredients
      .filter((l) => FOODS[l.foodId] && !FOODS[l.foodId].pantry)
      .map((l) => `${l.foodId} ${roundGrams(lineGrams(l, input.dayType, FOODS, input.carbScale))} g`);
    lines.push(`Pasto previsto: ${r.name}${parts.length ? ` (${parts.join(', ')})` : ''}.`);
  } else lines.push('Pasto previsto: nessuno.');
  return lines.join('\n');
}

export const PHOTO_REQUEST = 'Leggi il piatto della foto e compila lo schema.';

/** Testi della foto per gli esiti della risposta (§ 7.6). */
export const PHOTO_TEXT = {
  rifiuto: 'Il coach non può leggere questa foto. Prova con un’altra inquadratura.',
  nonValida: 'La lettura non è venuta bene.',
} as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback);

/**
 * Validatore della risposta (§ 10.3, § 10.7). Non lancia mai. Esito sconosciuto o un piatto senza nessun alimento
 * leggibile → non valida. Per ogni alimento: id solo tra quelli noti (altrimenti fuori archivio con il suo nome);
 * grammi tra 1 e 1.500 (un alimento senza grammi si scarta); `per100g` solo fuori archivio e solo con i controlli di
 * Atwater; al massimo 12 alimenti. I campi a scelta fuori elenco diventano «non so»; nome e nota su una riga.
 */
export function validatePhotoReading(raw: unknown): TaskValidation<PhotoReading> {
  if (!isObj(raw)) return { ok: false, message: PHOTO_TEXT.nonValida };
  const outcome = typeof raw.outcome === 'string' && (OUTCOMES as readonly string[]).includes(raw.outcome) ? (raw.outcome as PhotoReading['outcome']) : null;
  if (!outcome) return { ok: false, message: PHOTO_TEXT.nonValida };
  const warnings: string[] = [];
  const items: PhotoReadingItem[] = [];
  if (outcome === 'piatto') {
    const list = Array.isArray(raw.items) ? raw.items : [];
    for (const r of list) {
      if (!isObj(r)) continue;
      const g = typeof r.grams === 'number' && Number.isFinite(r.grams) ? r.grams : NaN;
      if (!(g > 0)) continue;
      const grams = Math.min(ITEM_GRAMS_MAX, Math.max(ITEM_GRAMS_MIN, g));
      const foodId = typeof r.foodId === 'string' && estimateFoodById(r.foodId) ? r.foodId : null;
      const label = oneLine(r.label, ITEM_LABEL_MAX) || (foodId ? (estimateFoodById(foodId)?.name ?? '') : '');
      if (!foodId && !label) continue;
      if (items.length >= MAX_MEAL_ITEMS) {
        if (!warnings.length) warnings.push(`Più di ${MAX_MEAL_ITEMS} alimenti: restano i primi ${MAX_MEAL_ITEMS}.`);
        continue;
      }
      items.push({
        label,
        foodId,
        grams,
        confidence: pick(CONFIDENCES, r.confidence, 'media'),
        role: r.role === 'condimento' ? 'condimento' : 'alimento',
        per100g: foodId ? null : validPer100g(r.per100g),
      });
    }
    if (!items.length) return { ok: false, message: PHOTO_TEXT.nonValida };
  }
  return {
    ok: true,
    value: {
      outcome,
      items,
      cooking: pick(COOKINGS, raw.cooking, 'non-so'),
      oil: pick<OilChoice | 'non-so'>([...OIL_CHOICES, 'non-so'], raw.oil, 'non-so'),
      matchesPlanned: pick(MATCHES, raw.matchesPlanned, 'non-so'),
      dishName: oneLine(raw.dishName, ITEM_LABEL_MAX),
      note: coachText(raw.note, PHOTO_NOTE_MAX),
    },
    warnings,
  };
}

let cachedTask: StructuredTask<PhotoReading> | null = null;

/** Il compito `foto-piatto`: prompt e schema si costruiscono una volta (sono fissi per versione: restano in cache). */
export function photoTask(): StructuredTask<PhotoReading> {
  if (!cachedTask) {
    cachedTask = {
      name: 'foto-piatto',
      system: photoSystemPrompt(),
      schema: photoSchema(),
      maxTokens: PHOTO_MAX_TOKENS,
      effort: 'medium',
      validate: validatePhotoReading,
      messages: { rifiuto: PHOTO_TEXT.rifiuto, incompleta: PHOTO_TEXT.nonValida, 'non-valida': PHOTO_TEXT.nonValida },
    };
  }
  return cachedTask;
}

/** La lettura si può chiedere: c'è la chiave e il modello scelto ha l'uscita strutturata (§ 7.6). */
export function photoReadable(settings: Pick<Settings, 'coachApiKey' | 'coachModel'>): boolean {
  if (!settings.coachApiKey?.trim()) return false;
  return modelSupport((settings.coachModel || DEFAULT_MODEL).trim()).structuredOutputs;
}

export interface PhotoRequest {
  apiKey: string;
  model?: string;
  /** Foto da 1.024 px (o quella conservata da 720 px), data URL JPEG. */
  image: string;
  context: PhotoContextInput;
  signal?: AbortSignal;
  onPhase?: (phase: CoachPhase) => void;
  /** Client finto nei test: nessuna chiamata di rete. */
  client?: StructuredClient;
}

/** Legge la foto di un piatto: timeout 45 s, nessuna eccezione (ogni esito è un `TaskResult`). */
export function readPhoto(req: PhotoRequest): Promise<TaskResult<PhotoReading>> {
  return runStructuredTask(photoTask(), {
    apiKey: req.apiKey,
    model: req.model,
    context: photoContext(req.context),
    request: PHOTO_REQUEST,
    images: [req.image],
    signal: req.signal,
    timeoutMs: PHOTO_TIMEOUT_MS,
    fallback: PHOTO_FALLBACK,
    onPhase: req.onPhase,
    client: req.client,
  });
}
