/**
 * Compiti strutturati del coach (docs/FASE2.md § 10): una chiamata a sé, fuori dalla chat, con uno schema JSON per la
 * risposta e un validatore nostro che la controlla tutta prima di usarla. È l'unico punto di rete della fase 2: foto
 * dei piatti, etichette degli integratori, rifinitura delle proposte di blocco e di menù.
 *
 * Cosa usa dell'SDK `@anthropic-ai/sdk` 1.3.0 (solo API documentate, come `lib/claude.ts`):
 * - `client.beta.messages.stream()` con iterazione degli eventi e `finalMessage()`;
 * - `output_config` con `effort` e `format: { type: 'json_schema', schema }` nello stesso oggetto (`BetaOutputConfig`);
 * - pensiero adattivo dove c'è (sul modello predefinito non si spegne e conta nei `max_tokens`);
 * - fallback lato server `fallbacks: 'default'` con la beta `server-side-fallback-2026-07-01`, solo sui modelli che li
 *   hanno; la combinazione con l'uscita strutturata è da provare con una chiave vera (§ 15.8): `opts.fallback = false`
 *   la toglie;
 * - `stop_reason` controllato prima del contenuto: `refusal` → rifiuto, `max_tokens` → risposta incompleta;
 * - cache del prompt di sistema stabile (`cache_control: { type: 'ephemeral' }`), il contesto variabile dopo;
 * - `usage` della risposta, anche quando la risposta non si usa (i token sono spesi lo stesso).
 *
 * Niente strumenti forzati (`tool_choice` forzato dà 400 sul modello predefinito) e niente citazioni (incompatibili con
 * l'uscita strutturata). Gli schemi non hanno `minimum`, `maximum`, `minLength`, `maxLength` né vincoli sugli array:
 * i limiti li controlla il validatore del compito (`schemaProblems` li trova).
 *
 * `runStructuredTask` non lancia mai: ogni esito, rete assente e interruzione comprese, è un `TaskResult`.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import {
  classifyError,
  DEFAULT_MODEL,
  errorInfo,
  FALLBACK_BETA,
  imageBlock,
  loadSdk,
  makeClient,
  modelSupport,
  tidyReply,
  usageDelta,
  type CoachErrorKind,
  type CoachPhase,
  type CoachUsageDelta,
} from './claude';

type Sdk = typeof import('@anthropic-ai/sdk');
type StreamParams = BetaMessageStreamParams;
type ContentBlockParam = Anthropic.Beta.BetaContentBlockParam;

// ───────────────────────── Tipi ─────────────────────────

export type TaskEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Esito del validatore di un compito: mai un'eccezione, mai un valore fuori dai limiti. */
export type TaskValidation<T> = { ok: true; value: T; warnings?: string[] } | { ok: false; message: string };

/** Esiti che non vengono dall'API ma dalla risposta. */
export type TaskFailureKind = 'rifiuto' | 'incompleta' | 'non-valida';

/** Un compito strutturato: prompt stabile, schema della risposta, limiti della chiamata e validatore. */
export interface StructuredTask<T> {
  /** 'foto-piatto', 'etichetta', 'blocco', 'menu'. */
  name: string;
  /** Prompt di sistema stabile (va in cache: oltre 512 token conviene). */
  system: string;
  /** Schema JSON della risposta: ogni oggetto con `additionalProperties: false`, nessun vincolo numerico. */
  schema: Record<string, unknown>;
  /** Il pensiero conta nei `max_tokens`. */
  maxTokens: number;
  effort: TaskEffort;
  /** Controlla il JSON della risposta. Se lancia, la risposta vale «non valida». */
  validate: (raw: unknown) => TaskValidation<T>;
  /** Testi per l'interfaccia al posto di quelli generici (per esempio quelli della foto, § 7.6). */
  messages?: Partial<Record<TaskFailureKind, string>>;
}

/** Il pezzo del client dell'SDK che serve qui: nei test si passa un client finto con la stessa forma. */
export interface StructuredClient {
  beta: {
    messages: {
      stream(
        body: StreamParams,
        options?: { signal?: AbortSignal | null },
      ): AsyncIterable<Anthropic.Beta.BetaRawMessageStreamEvent> & { finalMessage(): Promise<Anthropic.Beta.BetaMessage> };
    };
  };
}

export interface TaskOptions {
  apiKey: string;
  /** Predefinito: il modello predefinito del coach. */
  model?: string;
  /** Contesto variabile (pasto, tipo di giorno, candidati…): va dopo il prompt di sistema, fuori dalla cache. */
  context: string;
  /** Richiesta dell'utente o del motore, in fondo al messaggio. */
  request: string;
  /** Foto come data URL (già ridotte da `prepareImage`), prima del testo. */
  images?: readonly string[];
  /** Annullamento dall'esterno (l'utente decide prima della risposta, chiude il foglio). */
  signal?: AbortSignal;
  /** Tempo massimo della chiamata in millisecondi (foto 45 s, § 7.2); predefinito 120 s. */
  timeoutMs?: number;
  /** false = niente fallback lato server, anche dove il modello li ha (§ 15.8). */
  fallback?: boolean;
  onPhase?: (phase: CoachPhase) => void;
  /** Client già pronto: nei test un client finto, così nessuna chiamata va in rete. */
  client?: StructuredClient;
}

/**
 * Esito di un compito (§ 10.1). Rispetto alla specifica: `usage` c'è anche negli esiti negativi quando la risposta è
 * arrivata (rifiuto, incompleta, non valida: i token sono spesi), e `'annullata'` dice che l'ha interrotta chi chiama.
 */
export type TaskResult<T> =
  | { ok: true; value: T; warnings: string[]; model: string | null; fallback: boolean; usage: CoachUsageDelta }
  | {
      ok: false;
      kind: CoachErrorKind | TaskFailureKind | 'annullata';
      message: string;
      /** Ha senso un «Riprova». */
      retryable: boolean;
      model?: string | null;
      usage?: CoachUsageDelta;
    };

// ───────────────────────── Costanti e testi ─────────────────────────

/** Tempo massimo predefinito di una chiamata strutturata. */
export const TASK_TIMEOUT_MS = 120_000;
/** Lunghezza massima dei testi del coach (§ 10.7): un motivo e una sintesi. */
export const COACH_REASON_MAX = 140;
export const COACH_SUMMARY_MAX = 280;

const FAILURE_TEXT: Record<TaskFailureKind | 'annullata', string> = {
  rifiuto: 'Il coach non ha accettato la richiesta. Riprova con un’altra foto o più tardi.',
  incompleta: 'La risposta del coach si è interrotta prima della fine. Riprova.',
  'non-valida': 'La risposta del coach non è venuta bene. Riprova.',
  annullata: 'Richiesta annullata.',
};

// ───────────────────────── Aiuti per i compiti ─────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Parole chiave che l'uscita strutturata non accetta (§ 10.1): i limiti stanno nel validatore. */
const UNSUPPORTED_KEYWORDS = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'minItems', 'maxItems', 'uniqueItems'];

/**
 * Problemi di uno schema per l'uscita strutturata: oggetti senza `additionalProperties: false`, campi elencati in
 * `required` che non esistono, parole chiave non ammesse. Vuoto = schema accettabile. Serve ai test dei compiti.
 */
export function schemaProblems(schema: unknown, path = '$'): string[] {
  const out: string[] = [];
  if (Array.isArray(schema)) {
    schema.forEach((s, i) => out.push(...schemaProblems(s, `${path}[${i}]`)));
    return out;
  }
  if (!isObj(schema)) return out;
  for (const k of UNSUPPORTED_KEYWORDS) if (k in schema) out.push(`${path}: «${k}» non è ammesso`);
  const isObject = schema.type === 'object' || isObj(schema.properties);
  if (isObject) {
    if (schema.additionalProperties !== false) out.push(`${path}: manca additionalProperties: false`);
    const props = isObj(schema.properties) ? schema.properties : {};
    if (Array.isArray(schema.required)) {
      for (const r of schema.required) if (typeof r !== 'string' || !(r in props)) out.push(`${path}: «${String(r)}» è richiesto ma non esiste`);
    }
    for (const [k, v] of Object.entries(props)) out.push(...schemaProblems(v, `${path}.${k}`));
  }
  if ('items' in schema) out.push(...schemaProblems(schema.items, `${path}[]`));
  for (const k of ['anyOf', 'allOf', 'oneOf'] as const) if (Array.isArray(schema[k])) out.push(...schemaProblems(schema[k], `${path}.${k}`));
  if (isObj(schema.$defs)) for (const [k, v] of Object.entries(schema.$defs)) out.push(...schemaProblems(v, `${path}.$defs.${k}`));
  return out;
}

/**
 * Testo del coach pronto per l'interfaccia (§ 10.7): stessa tipografia della chat (`tidyReply`), su una riga, al massimo
 * `max` caratteri tagliati a parola con i puntini. Una stringa vuota o un valore non testuale danno ''.
 */
export function coachText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  const text = tidyReply(raw).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const room = Math.max(1, max - 1);
  const cut = text.slice(0, room);
  const space = cut.lastIndexOf(' ');
  const base = (space > room * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '');
  return `${base}…`;
}

// ───────────────────────── Chiamata ─────────────────────────

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

function fail<T>(kind: CoachErrorKind | TaskFailureKind | 'annullata', task: StructuredTask<T>, extra: { message?: string; model?: string | null; usage?: CoachUsageDelta } = {}): TaskResult<T> {
  if (kind === 'rifiuto' || kind === 'incompleta' || kind === 'non-valida' || kind === 'annullata') {
    const message = extra.message ?? (kind === 'annullata' ? FAILURE_TEXT.annullata : task.messages?.[kind] ?? FAILURE_TEXT[kind]);
    return { ok: false, kind, message, retryable: kind !== 'annullata', model: extra.model, usage: extra.usage };
  }
  const info = errorInfo(kind);
  return { ok: false, kind, message: extra.message ?? info.message, retryable: info.retryable, model: extra.model, usage: extra.usage };
}

/** Corpo della richiesta (§ 10.1), esportato per i test. */
export function structuredRequest<T>(task: StructuredTask<T>, opts: Pick<TaskOptions, 'model' | 'context' | 'request' | 'images' | 'fallback'>): StreamParams {
  const model = (opts.model || DEFAULT_MODEL).trim();
  const support = modelSupport(model);
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: 'text', text: task.system, cache_control: { type: 'ephemeral' } }];
  // Un blocco di testo vuoto è un errore 400: senza contesto il blocco non si manda.
  if (opts.context.trim()) system.push({ type: 'text', text: opts.context });
  const images = (opts.images ?? []).map(imageBlock).filter((b): b is ContentBlockParam => b !== null);
  const content: ContentBlockParam[] = [...images, { type: 'text', text: opts.request.trim() || 'Rispondi con lo schema richiesto.' }];
  const useFallback = support.fallback && opts.fallback !== false;
  return {
    model,
    max_tokens: task.maxTokens,
    ...(useFallback ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
    system,
    messages: [{ role: 'user', content }],
    ...(support.adaptiveThinking ? { thinking: { type: 'adaptive' as const } } : {}),
    output_config: {
      ...(support.effort ? { effort: task.effort } : {}),
      format: { type: 'json_schema', schema: task.schema },
    },
  };
}

/**
 * Esegue un compito strutturato. Ordine dei controlli sulla risposta: rifiuto, troncata, JSON, validatore. Errori
 * dell'API e della rete con i testi di `ERRORS` di `lib/claude.ts`; tempo scaduto → 'tempo'; `opts.signal` interrotto →
 * 'annullata'. Senza uscita strutturata sul modello scelto la chiamata non parte ('modello'): chi chiama di solito non
 * mostra nemmeno la riga (`modelSupport(model).structuredOutputs`).
 */
export async function runStructuredTask<T>(task: StructuredTask<T>, opts: TaskOptions): Promise<TaskResult<T>> {
  if (opts.signal?.aborted) return fail('annullata', task);
  const model = (opts.model || DEFAULT_MODEL).trim();
  if (!modelSupport(model).structuredOutputs) {
    return fail('modello', task, { message: 'Il modello scelto non legge le risposte strutturate. Scegli un altro modello nelle impostazioni del coach.' });
  }
  if (!opts.client && isOffline()) return fail('offline', task);

  let sdk: Sdk;
  try {
    sdk = await loadSdk();
  } catch {
    return fail(isOffline() ? 'offline' : 'rete', task);
  }

  const timeoutMs = opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : TASK_TIMEOUT_MS;
  const ctrl = new AbortController();
  let timedOut = false;
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);

  try {
    let client: StructuredClient;
    try {
      client = opts.client ?? (makeClient(sdk, opts.apiKey, { maxRetries: 1, timeout: timeoutMs }) as unknown as StructuredClient);
    } catch {
      return fail('chiave', task);
    }
    opts.onPhase?.('attesa');
    const stream = client.beta.messages.stream(structuredRequest(task, { ...opts, model }), { signal: ctrl.signal });
    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        const t = event.content_block.type;
        if (t === 'thinking' || t === 'redacted_thinking') opts.onPhase?.('ragiona');
        else if (t === 'text') opts.onPhase?.('scrive');
      }
    }
    const final = await stream.finalMessage();
    const usage = usageDelta(final.usage);
    const served = final.model ?? null;
    const fallback = (final.usage?.iterations ?? []).some((it) => it.type === 'fallback_message');

    // Il rifiuto si controlla prima del contenuto: un testo parziale non vale come risposta.
    if (final.stop_reason === 'refusal') return fail('rifiuto', task, { model: served, usage });
    if (final.stop_reason === 'max_tokens') return fail('incompleta', task, { model: served, usage });

    const text = (final.content ?? [])
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!text) return fail('non-valida', task, { model: served, usage });
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return fail('non-valida', task, { model: served, usage });
    }
    let checked: TaskValidation<T>;
    try {
      checked = task.validate(raw);
    } catch {
      return fail('non-valida', task, { model: served, usage });
    }
    if (!checked.ok) return fail('non-valida', task, { model: served, usage, message: task.messages?.['non-valida'] ?? checked.message });
    return { ok: true, value: checked.value, warnings: checked.warnings ?? [], model: served, fallback, usage };
  } catch (err) {
    if (timedOut) return fail('tempo', task);
    if (opts.signal?.aborted) return fail('annullata', task);
    if (err instanceof sdk.APIUserAbortError) return fail('annullata', task);
    return fail(classifyError(sdk, err), task);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}
