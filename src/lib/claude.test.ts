import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../domain/types';
import {
  buildApiMessages,
  classifyError,
  CoachError,
  errorInfo,
  isLikelyApiKey,
  maskKey,
  modelLabel,
  modelSupport,
  normalizeKey,
  PHOTO_ONLY_PROMPT,
  streamCoachReply,
  streamErrorKind,
  tidyReply,
  usageDelta,
  usageMonth,
} from './claude';

const msg = (id: string, role: ChatMessage['role'], text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  role,
  text,
  createdAt: '2026-11-10T10:00:00.000Z',
  ...extra,
});

const IMG = 'data:image/jpeg;base64,QUJD';

describe('chiave', () => {
  it('riconosce la forma di una chiave e la pulisce', () => {
    const k = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';
    expect(isLikelyApiKey(k)).toBe(true);
    expect(isLikelyApiKey(` "${k}"\n`)).toBe(true);
    expect(normalizeKey(` ${k} \n`)).toBe(k);
    expect(isLikelyApiKey('sk-proj-123')).toBe(false);
    expect(isLikelyApiKey('')).toBe(false);
  });

  it('maschera la chiave', () => {
    expect(maskKey('sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789')).toBe('sk-ant-…6789');
    expect(maskKey(undefined)).toBe('');
  });
});

describe('modello', () => {
  it('etichetta leggibile', () => {
    expect(modelLabel('claude-opus-5-5')).toBe('Claude Opus 5.5');
    expect(modelLabel('claude-sonnet-4-5-20250929')).toBe('Claude Sonnet 4.5');
    expect(modelLabel('claude-opus-5')).toBe('Claude Opus 5');
    expect(modelLabel(undefined)).toBe('Claude Opus 5.5');
    expect(modelLabel('modello-strano')).toBe('modello-strano');
  });

  it('pensiero adattivo, effort e fallback solo dove esistono', () => {
    expect(modelSupport('claude-opus-5-5')).toEqual({ adaptiveThinking: true, effort: true, fallback: true, structuredOutputs: true });
    expect(modelSupport('claude-opus-5')).toEqual({ adaptiveThinking: true, effort: true, fallback: true, structuredOutputs: true });
    expect(modelSupport('claude-opus-4-6')).toEqual({ adaptiveThinking: true, effort: true, fallback: false, structuredOutputs: false });
    expect(modelSupport('claude-opus-4-5')).toEqual({ adaptiveThinking: false, effort: true, fallback: false, structuredOutputs: true });
    expect(modelSupport('claude-sonnet-5-5')).toMatchObject({ fallback: true });
    expect(modelSupport('claude-sonnet-5')).toMatchObject({ fallback: false });
    expect(modelSupport('claude-sonnet-4-5-20250929')).toEqual({ adaptiveThinking: false, effort: false, fallback: false, structuredOutputs: false });
    expect(modelSupport('claude-haiku-4-5')).toEqual({ adaptiveThinking: false, effort: false, fallback: false, structuredOutputs: true });
    // Una famiglia senza fallback lato server: il parametro non va mandato.
    expect(modelSupport('claude-haiku-5-5')).toEqual({ adaptiveThinking: true, effort: true, fallback: false, structuredOutputs: true });
    expect(modelSupport('claude-fable-5-1')).toMatchObject({ fallback: true });
    expect(modelSupport('qualcosa')).toEqual({ adaptiveThinking: false, effort: false, fallback: false, structuredOutputs: false });
  });

  it('uscita strutturata: i modelli della documentazione, non quelli sconosciuti', () => {
    const yes = ['claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-sonnet-5-5', 'claude-sonnet-5', 'claude-haiku-5-5', 'claude-haiku-4-5', 'claude-fable-5', 'claude-fable-5-1', 'claude-mythos-5-1', 'claude-opus-4-1'];
    const no = ['claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-haiku-3-5', 'modello-mio', ''];
    for (const m of yes) expect(modelSupport(m).structuredOutputs, m).toBe(true);
    for (const m of no) expect(modelSupport(m).structuredOutputs, m).toBe(false);
  });
});

describe('uso dei token', () => {
  it('usage della risposta → token del mese, con i mancanti a 0', () => {
    expect(usageDelta({ input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 2500, cache_creation_input_tokens: null })).toEqual({
      calls: 1,
      input: 1200,
      output: 300,
      cacheRead: 2500,
      cacheWrite: 0,
    });
    expect(usageDelta(undefined)).toEqual({ calls: 1, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    expect(usageDelta({ input_tokens: -4, output_tokens: Number.NaN })).toMatchObject({ input: 0, output: 0 });
  });

  it('mese nell’ora locale', () => {
    expect(usageMonth(new Date(2026, 10, 30, 23, 50))).toBe('2026-11');
    expect(usageMonth(new Date(2027, 0, 1, 0, 10))).toBe('2027-01');
  });
});

describe('messaggi per l’API', () => {
  it('toglie errori e rifiuti, parte e finisce con l’utente', () => {
    const chat = [
      msg('a0', 'assistant', 'Ciao, sono il coach'),
      msg('u1', 'user', 'Sono al bar'),
      msg('a1', 'assistant', 'Prendi un panino con pollo'),
      msg('u2', 'user', 'E poi?'),
      msg('e2', 'assistant', 'Errore di rete', { error: true }),
      msg('u3', 'user', 'Riprovo'),
      msg('r3', 'assistant', '', { stop: 'rifiuto' }),
    ];
    const out = buildApiMessages(chat);
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(out[0].content).toBe('Sono al bar');
    // I due messaggi dell'utente consecutivi si uniscono.
    expect(Array.isArray(out[2].content)).toBe(true);
    const texts = (out[2].content as { type: string; text?: string }[]).map((b) => b.text);
    expect(texts).toEqual(['E poi?', 'Riprovo']);
  });

  it('reinvia solo le foto più recenti, le altre diventano una nota', () => {
    const chat = [
      msg('u1', 'user', 'Pranzo', { image: IMG }),
      msg('a1', 'assistant', 'Bene'),
      msg('u2', 'user', 'Cena', { image: IMG }),
      msg('a2', 'assistant', 'Ok'),
      msg('u3', 'user', '', { image: IMG }),
    ];
    const out = buildApiMessages(chat, { maxImages: 2 });
    const blocks = (i: number) => out[i].content as { type: string; text?: string }[];
    expect(blocks(0)[0].type).toBe('text');
    expect(blocks(0)[0].text).toMatch(/foto/);
    expect(blocks(2)[0].type).toBe('image');
    expect(blocks(4)[0].type).toBe('image');
    // Solo foto: domanda predefinita.
    expect(blocks(4)[1].text).toBe(PHOTO_ONLY_PROMPT);
  });

  it('usa l’immagine a risoluzione piena per il messaggio appena scritto', () => {
    const full = 'data:image/jpeg;base64,RlVMTA==';
    const out = buildApiMessages([msg('u1', 'user', 'Questo?', { image: IMG })], { imageOverride: { id: 'u1', dataUrl: full } });
    const img = (out[0].content as { type: string; source?: { data: string } }[])[0];
    expect(img.source?.data).toBe('RlVMTA==');
  });

  it('limita la cronologia', () => {
    const chat: ChatMessage[] = [];
    for (let i = 0; i < 40; i++) chat.push(msg(`m${i}`, i % 2 ? 'assistant' : 'user', `testo ${i}`));
    chat.push(msg('last', 'user', 'ultima'));
    const out = buildApiMessages(chat, { maxMessages: 10 });
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out[0].role).toBe('user');
    expect(out[out.length - 1].content).toBe('ultima');
  });

  it('cronologia vuota → nessun messaggio', () => {
    expect(buildApiMessages([])).toEqual([]);
    expect(buildApiMessages([msg('a', 'assistant', 'solo io')])).toEqual([]);
  });
});

describe('testo e errori', () => {
  it('toglie il trattino lungo', () => {
    expect(tidyReply('Prendi il panino — meglio con la spremuta')).toBe('Prendi il panino, meglio con la spremuta');
  });

  it('classifica gli errori tipizzati dell’SDK', async () => {
    const sdk = await import('@anthropic-ai/sdk');
    const h = new Headers();
    expect(classifyError(sdk, new sdk.AuthenticationError(401, {}, 'x', h))).toBe('chiave');
    expect(classifyError(sdk, new sdk.RateLimitError(429, {}, 'x', h))).toBe('limite');
    expect(classifyError(sdk, new sdk.NotFoundError(404, {}, 'x', h))).toBe('modello');
    expect(classifyError(sdk, new sdk.PermissionDeniedError(403, {}, 'x', h))).toBe('permesso');
    expect(classifyError(sdk, new sdk.InternalServerError(529, {}, 'x', h, 'overloaded_error'))).toBe('occupato');
    expect(classifyError(sdk, new sdk.InternalServerError(500, {}, 'x', h, 'api_error'))).toBe('servizio');
    expect(classifyError(sdk, new sdk.BadRequestError(400, {}, 'x', h, 'billing_error'))).toBe('credito');
    expect(classifyError(sdk, new sdk.BadRequestError(400, {}, 'x', h, 'invalid_request_error'))).toBe('richiesta');
    expect(classifyError(sdk, new sdk.APIConnectionTimeoutError())).toBe('tempo');
    expect(classifyError(sdk, new sdk.APIConnectionError({}))).toBe('rete');
    expect(classifyError(sdk, new Error('boh'))).toBe('sconosciuto');
  });

  it('ogni errore ha un testo italiano che dice come rimediare', () => {
    const e = new CoachError(errorInfo('chiave'), 'parziale');
    expect(e.message).toMatch(/chiave/);
    expect(e.partial).toBe('parziale');
    expect(e.retryable).toBe(false);
    expect(errorInfo('limite').retryable).toBe(true);
    expect(errorInfo('offline').message).not.toMatch(/—/);
  });
});

describe('streaming', () => {
  const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';
  const sse = (events: object[]) =>
    events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  const start = (model: string) => ({
    type: 'message_start',
    message: { id: 'msg_1', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } },
  });
  const textEvents = [
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Prendi il toast' } },
  ];
  const end = [
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];

  function mockFetch(body: string) {
    const calls: { body: Record<string, unknown>; headers: Headers }[] = [];
    const fn = vi.fn(async (_url: unknown, init?: RequestInit) => {
      calls.push({ body: JSON.parse(String(init?.body ?? '{}')), headers: new Headers(init?.headers) });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });
    vi.stubGlobal('fetch', fn);
    return calls;
  }

  afterEach(() => vi.unstubAllGlobals());

  const opts = (model: string) => ({ apiKey: KEY, model, system: 'Sistema', context: 'Contesto', messages: [{ role: 'user' as const, content: 'Sono al bar' }] });

  it('manda i fallback solo ai modelli che li hanno', async () => {
    const calls = mockFetch(sse([start('claude-opus-5-5'), ...textEvents, ...end]));
    const reply = await streamCoachReply(opts('claude-opus-5-5'));
    expect(reply.text).toBe('Prendi il toast');
    expect(reply.usage).toEqual({ calls: 1, input: 10, output: 5, cacheRead: 0, cacheWrite: 0 });
    expect(calls[0].body.fallbacks).toBe('default');
    expect(calls[0].headers.get('anthropic-beta') ?? '').toContain('server-side-fallback-2026-07-01');

    const haiku = mockFetch(sse([start('claude-haiku-5-5'), ...textEvents, ...end]));
    await streamCoachReply(opts('claude-haiku-5-5'));
    expect(haiku[0].body.fallbacks).toBeUndefined();
    expect(haiku[0].headers.get('anthropic-beta') ?? '').not.toContain('server-side-fallback');

    const custom = mockFetch(sse([start('modello-mio'), ...textEvents, ...end]));
    await streamCoachReply(opts('modello-mio'));
    expect(custom[0].body.fallbacks).toBeUndefined();
  });

  it('segnala il modello che ha risposto dopo un fallback', async () => {
    const final = [
      { type: 'content_block_stop', index: 0 },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 5, iterations: [{ type: 'message', input_tokens: 10, output_tokens: 0 }, { type: 'fallback_message', input_tokens: 10, output_tokens: 5 }] },
      },
      { type: 'message_stop' },
    ];
    mockFetch(sse([start('claude-opus-5'), ...textEvents, ...final]));
    const reply = await streamCoachReply(opts('claude-opus-5-5'));
    expect(reply.model).toBe('claude-opus-5');
    expect(reply.fallback).toBe(true);
  });

  it('uno stream che si chiude a metà è una risposta interrotta dalla rete, con il testo arrivato', async () => {
    mockFetch(sse([start('claude-opus-5-5'), ...textEvents]));
    const err = await streamCoachReply(opts('claude-opus-5-5')).catch((e) => e);
    expect(err).toBeInstanceOf(CoachError);
    expect(err.kind).toBe('interrotta-rete');
    expect(err.partial).toBe('Prendi il toast');
    expect(err.message).toContain('Il testo arrivato resta qui sopra');
  });

  it('classifica gli errori a metà risposta', async () => {
    const sdk = await import('@anthropic-ai/sdk');
    const h = new Headers();
    expect(streamErrorKind(sdk, new Error('stream chiuso'), 'testo')).toBe('interrotta-rete');
    expect(streamErrorKind(sdk, new sdk.APIConnectionError({}), 'testo')).toBe('interrotta-rete');
    expect(streamErrorKind(sdk, new sdk.InternalServerError(529, {}, 'x', h, 'overloaded_error'), 'testo')).toBe('occupato');
    expect(streamErrorKind(sdk, new Error('boh'), '')).toBe('sconosciuto');
  });
});
