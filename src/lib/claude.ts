/**
 * Client del coach: Claude chiamato direttamente dal browser con la chiave personale dell'utente.
 *
 * Fase 1, scelta temporanea per un'app personale a utente singolo: la chiave resta solo sul dispositivo
 * (`Settings.coachApiKey`) e l'SDK ufficiale gira con `dangerouslyAllowBrowser`. La fase 2 sposterà la
 * chiave su un server.
 *
 * Cosa usa dell'SDK `@anthropic-ai/sdk` (solo API documentate):
 * - `client.beta.messages.stream()` con iterazione degli eventi e `finalMessage()`;
 * - pensiero adattivo (`thinking: { type: 'adaptive' }`) e `output_config.effort` sui modelli che li hanno;
 *   su Claude Opus 5.5 il pensiero è sempre attivo e l'effort è il controllo della profondità;
 * - fallback lato server in caso di rifiuto per policy: `fallbacks: 'default'` con la beta
 *   `server-side-fallback-2026-07-01`, solo sui modelli che li hanno (Opus da 5, Sonnet da 5.5, Fable;
 *   Haiku no: la guida chiede di non mandare il parametro);
 * - `stop_reason: 'refusal'` controllato prima di leggere il testo;
 * - errori tipizzati (`AuthenticationError`, `RateLimitError`, `APIConnectionError`…) e `error.type`;
 * - cache del prompt di sistema (`cache_control: { type: 'ephemeral' }`).
 *
 * L'SDK si carica solo quando serve (import dinamico): chi non usa il coach non lo scarica.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage } from '../domain/types';
import { splitDataUrl } from './image';

type Sdk = typeof import('@anthropic-ai/sdk');
type BetaMessageParam = Anthropic.Beta.BetaMessageParam;
type BetaContentBlockParam = Anthropic.Beta.BetaContentBlockParam;

// ───────────────────────── Costanti ─────────────────────────

export const DEFAULT_MODEL = 'claude-opus-5-5';
/** Il pensiero conta nei max_tokens: c'è spazio per ragionare e per una risposta breve. */
export const COACH_MAX_TOKENS = 8000;
/** Effort esplicito (su Opus 5.5 il predefinito è già medium): buon equilibrio tra qualità e attesa. */
export const COACH_EFFORT = 'medium' as const;
/** Beta dei fallback lato server nella forma `fallbacks: 'default'`. */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01' as const;
/** Messaggi della cronologia inviati come contesto della conversazione. */
export const HISTORY_MAX_MESSAGES = 24;
/** Foto della cronologia reinviate (le più recenti): le altre diventano una nota di testo. */
export const HISTORY_MAX_IMAGES = 2;
/** Testo usato quando l'utente manda solo una foto. */
export const PHOTO_ONLY_PROMPT = "Com'è questo piatto rispetto al piano di oggi?";

export const CONSOLE_URL = 'https://platform.claude.com';
export const CONSOLE_KEYS_URL = 'https://platform.claude.com/settings/keys';
export const CONSOLE_LIMITS_URL = 'https://platform.claude.com/settings/limits';

// ───────────────────────── Chiave e modello ─────────────────────────

/** Pulisce una chiave incollata: spazi, a capo e virgolette attorno. */
export function normalizeKey(raw: string): string {
  return raw.replace(/\s+/g, '').replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');
}

/** Forma plausibile di una chiave API di Anthropic. */
export function isLikelyApiKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(normalizeKey(key));
}

/** "sk-ant-…x9Qa": abbastanza per riconoscerla, non per usarla. */
export function maskKey(key: string | undefined): string {
  const k = normalizeKey(key ?? '');
  if (!k) return '';
  if (k.length <= 12) return '•'.repeat(k.length);
  return `${k.slice(0, 7)}…${k.slice(-4)}`;
}

interface ParsedModel {
  family: string;
  version: number;
}

function parseModel(model: string): ParsedModel | null {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-|$)/.exec(model.trim().toLowerCase());
  if (!m) return null;
  const major = Number(m[2]);
  const minor = m[3] !== undefined ? Number(m[3]) : 0;
  return { family: m[1], version: major + minor / 10 };
}

/** "claude-opus-5-5" → "Claude Opus 5.5". */
export function modelLabel(model: string | undefined): string {
  const id = (model || DEFAULT_MODEL).trim();
  const p = parseModel(id);
  if (!p) return id;
  const v = Number.isInteger(p.version) ? String(p.version) : p.version.toFixed(1);
  return `Claude ${p.family.charAt(0).toUpperCase()}${p.family.slice(1)} ${v}`;
}

export interface ModelSupport {
  /** Accetta `thinking: { type: 'adaptive' }`. */
  adaptiveThinking: boolean;
  /** Accetta `output_config.effort`. */
  effort: boolean;
  /** Ha i fallback lato server (`fallbacks: 'default'`): sui modelli che non li hanno il parametro non si manda. */
  fallback: boolean;
}

/**
 * Parametri supportati dal modello scelto. Per i modelli sconosciuti o vecchi si manda una richiesta
 * semplice: meglio una risposta senza pensiero adattivo che un errore 400.
 */
export function modelSupport(model: string): ModelSupport {
  const p = parseModel(model);
  if (!p) return { adaptiveThinking: false, effort: false, fallback: false };
  const v = p.version + 1e-9;
  switch (p.family) {
    case 'opus':
      return { adaptiveThinking: v >= 4.6, effort: v >= 4.5, fallback: v >= 5 };
    case 'sonnet':
      return { adaptiveThinking: v >= 4.6, effort: v >= 4.6, fallback: v >= 5.5 };
    case 'haiku':
      // Nessun fallback lato server per Haiku: con il parametro un rifiuto resta un rifiuto o diventa un 400.
      return { adaptiveThinking: v >= 5.5, effort: v >= 5.5, fallback: false };
    case 'fable':
    case 'mythos':
      return { adaptiveThinking: v >= 5, effort: v >= 5, fallback: v >= 5 };
    default:
      return { adaptiveThinking: false, effort: false, fallback: false };
  }
}

// ───────────────────────── Messaggi per l'API ─────────────────────────

export interface BuildMessagesOptions {
  maxMessages?: number;
  maxImages?: number;
  /** Immagine a risoluzione piena per un messaggio (di solito quello appena scritto). */
  imageOverride?: { id: string; dataUrl: string };
}

/** Il messaggio entra nella conversazione inviata? Errori e rifiuti no. */
export function isConversational(m: ChatMessage): boolean {
  if (m.error) return false;
  if (m.role === 'assistant' && (m.stop === 'rifiuto' || !m.text.trim())) return false;
  if (m.role === 'user' && !m.text.trim() && !m.image) return false;
  return true;
}

function imageBlock(dataUrl: string): BetaContentBlockParam | null {
  const parts = splitDataUrl(dataUrl);
  if (!parts) return null;
  const mediaType = parts.mediaType === 'image/png' || parts.mediaType === 'image/webp' || parts.mediaType === 'image/gif' ? parts.mediaType : 'image/jpeg';
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data: parts.data } };
}

/**
 * Cronologia della chat → messaggi dell'API: solo gli ultimi, senza errori né rifiuti, che iniziano
 * dall'utente e finiscono con l'utente. Le foto oltre le più recenti diventano una nota di testo
 * (costano token a ogni domanda). I turni consecutivi dello stesso ruolo si uniscono.
 */
export function buildApiMessages(chat: readonly ChatMessage[], opts: BuildMessagesOptions = {}): BetaMessageParam[] {
  const maxMessages = opts.maxMessages ?? HISTORY_MAX_MESSAGES;
  const maxImages = opts.maxImages ?? HISTORY_MAX_IMAGES;
  let list = chat.filter(isConversational).slice(-maxMessages);
  while (list.length && list[0].role !== 'user') list = list.slice(1);
  while (list.length && list[list.length - 1].role !== 'user') list = list.slice(0, -1);

  // Le foto da reinviare: le più recenti.
  const withImage = new Set<string>();
  for (let i = list.length - 1; i >= 0 && withImage.size < maxImages; i--) {
    if (list[i].role === 'user' && list[i].image) withImage.add(list[i].id);
  }

  const out: BetaMessageParam[] = [];
  for (const m of list) {
    let blocks: BetaContentBlockParam[];
    if (m.role === 'user') {
      blocks = [];
      const text = m.text.trim();
      if (m.image) {
        const src = opts.imageOverride?.id === m.id ? opts.imageOverride.dataUrl : m.image;
        const img = withImage.has(m.id) ? imageBlock(src) : null;
        if (img) blocks.push(img);
        else blocks.push({ type: 'text', text: '(Qui avevo allegato una foto del piatto.)' });
      }
      blocks.push({ type: 'text', text: text || PHOTO_ONLY_PROMPT });
    } else {
      blocks = [{ type: 'text', text: m.text.trim() }];
    }
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role && Array.isArray(prev.content)) {
      prev.content = [...prev.content, ...blocks];
    } else {
      out.push({ role: m.role, content: blocks });
    }
  }
  // Una sola parte di testo: stringa semplice (più leggibile nei log).
  for (const m of out) {
    if (Array.isArray(m.content) && m.content.length === 1 && m.content[0].type === 'text') {
      m.content = (m.content[0] as Anthropic.Beta.BetaTextBlockParam).text;
    }
  }
  return out;
}

/** Ritocchi di forma alla risposta: niente trattino lungo nell'interfaccia. */
export function tidyReply(text: string): string {
  return text
    .replace(/\s+—\s+/g, ', ')
    .replace(/—/g, '-')
    .replace(/[ \t]+\n/g, '\n');
}

// ───────────────────────── Errori ─────────────────────────

export type CoachErrorKind =
  | 'chiave'
  | 'permesso'
  | 'modello'
  | 'limite'
  | 'credito'
  | 'occupato'
  | 'servizio'
  | 'offline'
  | 'rete'
  | 'tempo'
  | 'richiesta'
  | 'vuota'
  | 'interrotta-rete'
  | 'sconosciuto';

export interface CoachErrorInfo {
  kind: CoachErrorKind;
  /** Cosa è successo e come rimediare, in italiano, senza scuse. */
  message: string;
  /** Ha senso riprovare la stessa domanda. */
  retryable: boolean;
}

const ERRORS: Record<CoachErrorKind, Omit<CoachErrorInfo, 'kind'>> = {
  chiave: {
    message: 'La chiave non è valida o è stata revocata. Creane una nuova nella console di Claude e incollala nelle opzioni del coach.',
    retryable: false,
  },
  permesso: {
    message: 'La chiave non può usare questo modello. Controlla i permessi nella console di Claude o scegli un altro modello nelle impostazioni.',
    retryable: false,
  },
  modello: {
    message: 'Il modello scelto non risulta disponibile per questa chiave. Scegli un altro modello nelle impostazioni.',
    retryable: false,
  },
  limite: {
    message: 'Troppe richieste in poco tempo o limite di spesa raggiunto. Riprova tra un minuto; se continua, controlla i limiti nella console di Claude.',
    retryable: true,
  },
  credito: {
    message: 'Il credito della console di Claude è finito. Aggiungi credito e riprova.',
    retryable: true,
  },
  occupato: { message: 'Claude è molto richiesto in questo momento. Riprova tra qualche secondo.', retryable: true },
  servizio: { message: 'Il servizio di Claude non ha risposto correttamente. Riprova tra poco.', retryable: true },
  offline: {
    message: 'Sei offline. Il coach torna appena c’è rete; intanto il piano B al bar funziona anche così.',
    retryable: true,
  },
  rete: { message: 'Claude non è raggiungibile. Controlla la connessione e riprova.', retryable: true },
  tempo: { message: 'La risposta ci sta mettendo troppo. Controlla la connessione e riprova.', retryable: true },
  richiesta: {
    message: 'La richiesta è stata respinta. Se hai allegato una foto, riprova senza o con un’altra; altrimenti controlla credito e limiti nella console.',
    retryable: true,
  },
  vuota: { message: 'Il coach non ha scritto niente. Riprova, magari aggiungendo un dettaglio.', retryable: true },
  'interrotta-rete': {
    message: 'La connessione si è interrotta durante la risposta. Il testo arrivato resta qui sopra.',
    retryable: true,
  },
  sconosciuto: { message: 'Qualcosa non ha funzionato. Riprova tra poco.', retryable: true },
};

export function errorInfo(kind: CoachErrorKind): CoachErrorInfo {
  return { kind, ...ERRORS[kind] };
}

/** Errore del coach con testo già pronto per l'interfaccia. */
export class CoachError extends Error {
  readonly kind: CoachErrorKind;
  readonly retryable: boolean;
  /** Testo arrivato prima dell'errore (streaming interrotto). */
  readonly partial: string;
  constructor(info: CoachErrorInfo, partial = '', cause?: unknown) {
    super(info.message);
    this.name = 'CoachError';
    this.kind = info.kind;
    this.retryable = info.retryable;
    this.partial = partial;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** Errore dell'SDK → tipo di errore del coach (classi tipizzate e `error.type`, mai il testo del messaggio). */
export function classifyError(sdk: Pick<Sdk, 'APIError' | 'APIConnectionError' | 'APIConnectionTimeoutError' | 'AuthenticationError' | 'PermissionDeniedError' | 'NotFoundError' | 'RateLimitError' | 'BadRequestError' | 'InternalServerError'>, err: unknown): CoachErrorKind {
  if (err instanceof sdk.APIConnectionTimeoutError) return 'tempo';
  if (err instanceof sdk.APIConnectionError) return isOffline() ? 'offline' : 'rete';
  if (err instanceof sdk.AuthenticationError) return 'chiave';
  if (err instanceof sdk.PermissionDeniedError) return 'permesso';
  if (err instanceof sdk.NotFoundError) return 'modello';
  if (err instanceof sdk.RateLimitError) return 'limite';
  if (err instanceof sdk.APIError) {
    if (err.type === 'billing_error') return 'credito';
    if (err.type === 'overloaded_error' || err.status === 529) return 'occupato';
    if (err.type === 'rate_limit_error') return 'limite';
    if (err.type === 'authentication_error') return 'chiave';
    if (err.type === 'timeout_error') return 'tempo';
    if (err instanceof sdk.BadRequestError) return 'richiesta';
    if (err instanceof sdk.InternalServerError || err.type === 'api_error') return 'servizio';
    return 'sconosciuto';
  }
  if (isOffline()) return 'offline';
  return 'sconosciuto';
}

/**
 * Errore durante lo streaming: se una parte del testo era già arrivata e l'errore non viene dall'API
 * (stream chiuso a metà, connessione caduta), è una risposta interrotta dalla rete, non un errore ignoto.
 */
export function streamErrorKind(
  sdk: Parameters<typeof classifyError>[0],
  err: unknown,
  partial: string,
): CoachErrorKind {
  if (partial.trim() && (err instanceof sdk.APIConnectionError || !(err instanceof sdk.APIError))) return 'interrotta-rete';
  return classifyError(sdk, err);
}

// ───────────────────────── SDK ─────────────────────────

let sdkPromise: Promise<Sdk> | null = null;

/** Carica l'SDK una volta sola, alla prima domanda. */
export function loadSdk(): Promise<Sdk> {
  if (!sdkPromise) {
    sdkPromise = import('@anthropic-ai/sdk').catch((e) => {
      sdkPromise = null;
      throw e;
    });
  }
  return sdkPromise;
}

function makeClient(sdk: Sdk, apiKey: string, opts: { maxRetries?: number; timeout?: number } = {}) {
  return new sdk.default({
    apiKey: normalizeKey(apiKey),
    // Fase 1: chiave personale nel browser, scelta temporanea dichiarata nell'interfaccia.
    dangerouslyAllowBrowser: true,
    maxRetries: opts.maxRetries ?? 2,
    timeout: opts.timeout ?? 120_000,
  });
}

// ───────────────────────── Risposta in streaming ─────────────────────────

export type CoachPhase = 'attesa' | 'ragiona' | 'scrive';
export type CoachStop = NonNullable<ChatMessage['stop']>;

export interface CoachStreamOptions {
  apiKey: string;
  model?: string;
  /** Prompt di sistema stabile (va in cache). */
  system: string;
  /** Contesto della giornata, aggiornato a ogni domanda. */
  context: string;
  messages: BetaMessageParam[];
  signal?: AbortSignal;
  /** Ogni pezzo di testo che arriva, con il testo completo fin qui. */
  onText?: (delta: string, full: string) => void;
  onPhase?: (phase: CoachPhase) => void;
}

export interface CoachReply {
  text: string;
  /** null = risposta completa. */
  stop: CoachStop | null;
  /** Modello che ha risposto (diverso dal richiesto se è intervenuto un fallback). */
  model: string | null;
  fallback: boolean;
}

/**
 * Chiede una risposta al coach in streaming. Restituisce la risposta (anche interrotta dall'utente);
 * per gli errori lancia `CoachError` con il testo già pronto e l'eventuale risposta parziale.
 */
export async function streamCoachReply(o: CoachStreamOptions): Promise<CoachReply> {
  if (isOffline()) throw new CoachError(errorInfo('offline'));
  let sdk: Sdk;
  try {
    sdk = await loadSdk();
  } catch (e) {
    throw new CoachError(errorInfo(isOffline() ? 'offline' : 'rete'), '', e);
  }
  const model = (o.model || DEFAULT_MODEL).trim();
  const support = modelSupport(model);
  const client = makeClient(sdk, o.apiKey);
  o.onPhase?.('attesa');

  let text = '';
  try {
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: COACH_MAX_TOKENS,
        ...(support.fallback ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
        system: [
          { type: 'text', text: o.system, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: o.context },
        ],
        messages: o.messages,
        ...(support.adaptiveThinking ? { thinking: { type: 'adaptive' as const } } : {}),
        ...(support.effort ? { output_config: { effort: COACH_EFFORT } } : {}),
      },
      { signal: o.signal },
    );

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        const t = event.content_block.type;
        if (t === 'thinking' || t === 'redacted_thinking') o.onPhase?.('ragiona');
        else if (t === 'text') o.onPhase?.('scrive');
      } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        text += event.delta.text;
        o.onText?.(event.delta.text, text);
      }
    }

    const final = await stream.finalMessage();
    const fallback = (final.usage.iterations ?? []).some((it) => it.type === 'fallback_message');

    // Rifiuto: si controlla prima del contenuto; l'eventuale parziale non vale come risposta.
    if (final.stop_reason === 'refusal') {
      return { text: '', stop: 'rifiuto', model: final.model ?? null, fallback };
    }
    const joined = final.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const full = (joined || text).trim();
    if (!full) throw new CoachError(errorInfo('vuota'));
    return {
      text: full,
      stop: final.stop_reason === 'max_tokens' ? 'limite' : null,
      model: final.model ?? null,
      fallback,
    };
  } catch (err) {
    if (err instanceof CoachError) throw err;
    if (err instanceof sdk.APIUserAbortError || o.signal?.aborted) {
      return { text: text.trim(), stop: 'interrotta', model: null, fallback: false };
    }
    throw new CoachError(errorInfo(streamErrorKind(sdk, err, text)), text.trim(), err);
  }
}

// ───────────────────────── Verifica della chiave ─────────────────────────

export type KeyCheck = 'ok' | 'modello' | 'chiave' | 'rete' | 'altro';

/**
 * Verifica una chiave senza costi: il conteggio dei token è gratuito e richiede una chiave valida.
 * 'modello' = chiave valida ma modello non disponibile; 'rete' = verifica impossibile adesso.
 */
export async function verifyKey(apiKey: string, model = DEFAULT_MODEL, signal?: AbortSignal): Promise<KeyCheck> {
  if (isOffline()) return 'rete';
  let sdk: Sdk;
  try {
    sdk = await loadSdk();
  } catch {
    return 'rete';
  }
  try {
    const client = makeClient(sdk, apiKey, { maxRetries: 1, timeout: 15_000 });
    await client.messages.countTokens({ model, messages: [{ role: 'user', content: 'Ciao' }] }, { signal });
    return 'ok';
  } catch (err) {
    const kind = classifyError(sdk, err);
    if (kind === 'chiave') return 'chiave';
    if (kind === 'modello' || kind === 'permesso') return 'modello';
    if (kind === 'rete' || kind === 'offline' || kind === 'tempo') return 'rete';
    return 'altro';
  }
}
