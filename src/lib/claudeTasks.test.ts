import { afterEach, describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import * as sdk from '@anthropic-ai/sdk';
import { mulberry32 } from '../engine/rng';
import { FALLBACK_BETA } from './claude';
import {
  COACH_REASON_MAX,
  coachText,
  runStructuredTask,
  schemaProblems,
  structuredRequest,
  type StructuredClient,
  type StructuredTask,
  type TaskOptions,
} from './claudeTasks';

// Nessuna chiamata di rete: ogni test passa un client finto, e `fetch` fallisce se qualcuno ci prova.
const noFetch = vi.fn(async () => {
  throw new Error('rete vietata nei test');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

interface Reading {
  outcome: 'piatto' | 'non-cibo';
  grams: number;
}

/** Compito d'esempio con un validatore che non accetta grammi fuori da 1-1.500. */
const task: StructuredTask<Reading> = {
  name: 'prova',
  system: 'Leggi il piatto. Rispondi solo con lo schema.',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['outcome', 'grams'],
    properties: { outcome: { type: 'string', enum: ['piatto', 'non-cibo'] }, grams: { type: 'number' } },
  },
  maxTokens: 8000,
  effort: 'medium',
  validate: (raw) => {
    if (typeof raw !== 'object' || raw === null) return { ok: false, message: 'Forma sbagliata' };
    const r = raw as Record<string, unknown>;
    if (r.outcome !== 'piatto' && r.outcome !== 'non-cibo') return { ok: false, message: 'Esito sconosciuto' };
    if (typeof r.grams !== 'number' || !Number.isFinite(r.grams) || r.grams < 1 || r.grams > 1500) return { ok: false, message: 'Grammi fuori dai limiti' };
    return { ok: true, value: { outcome: r.outcome, grams: r.grams }, warnings: r.grams > 1000 ? ['Porzione molto grande'] : [] };
  },
  messages: { 'non-valida': 'La lettura non è venuta bene.' },
};

type Final = Omit<Partial<Anthropic.Beta.BetaMessage>, 'usage'> & { usage?: Partial<Anthropic.Beta.BetaUsage> };

/** Messaggio finale dell'API con i campi che servono. */
function message(text: string | null, over: Final = {}): Anthropic.Beta.BetaMessage {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [
      { type: 'thinking', thinking: '', signature: 'x' },
      ...(text === null ? [] : [{ type: 'text', text, citations: null }]),
    ],
    stop_reason: 'end_turn',
    stop_sequence: null,
    ...over,
    usage: { input_tokens: 3200, output_tokens: 900, cache_read_input_tokens: 2500, cache_creation_input_tokens: 0, ...(over.usage ?? {}) },
  } as unknown as Anthropic.Beta.BetaMessage;
}

interface FakeCall {
  body: Record<string, unknown>;
  signal?: AbortSignal | null;
}

/**
 * Client finto: registra la richiesta, emette gli eventi del pensiero e del testo, poi il messaggio finale. Con
 * `hang` aspetta l'interruzione (come lo stream vero, che si chiude con un errore quando il segnale scatta).
 */
function fakeClient(result: Anthropic.Beta.BetaMessage | Error, opts: { hang?: boolean; failAt?: 'iterate' | 'final' } = {}) {
  const calls: FakeCall[] = [];
  const client: StructuredClient = {
    beta: {
      messages: {
        stream(body, options) {
          calls.push({ body: body as unknown as Record<string, unknown>, signal: options?.signal });
          const signal = options?.signal ?? undefined;
          const waitAbort = () =>
            new Promise<never>((_, reject) => {
              if (signal?.aborted) reject(new sdk.APIUserAbortError());
              signal?.addEventListener('abort', () => reject(new sdk.APIUserAbortError()), { once: true });
            });
          return {
            async *[Symbol.asyncIterator]() {
              yield { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } } as Anthropic.Beta.BetaRawMessageStreamEvent;
              if (opts.hang) await waitAbort();
              if (result instanceof Error && opts.failAt !== 'final') throw result;
              yield { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '', citations: null } } as Anthropic.Beta.BetaRawMessageStreamEvent;
            },
            async finalMessage() {
              if (result instanceof Error) throw result;
              return result;
            },
          };
        },
      },
    },
  };
  return { client, calls };
}

const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';
const base = (client: StructuredClient, over: Partial<TaskOptions> = {}): TaskOptions => ({
  apiKey: KEY,
  context: 'Pranzo, giorno di palestra',
  request: 'Che cosa c’è nel piatto?',
  client,
  ...over,
});

describe('richiesta strutturata (§ 10.1)', () => {
  it('output_config con effort e formato, pensiero adattivo, fallback, sistema in cache, foto prima del testo', async () => {
    vi.stubGlobal('fetch', noFetch);
    const { client, calls } = fakeClient(message('{"outcome":"piatto","grams":250}'));
    const phases: string[] = [];
    const res = await runStructuredTask(task, base(client, { images: ['data:image/jpeg;base64,QUJD', 'non un data url'], onPhase: (p) => phases.push(p) }));
    expect(res).toEqual({
      ok: true,
      value: { outcome: 'piatto', grams: 250 },
      warnings: [],
      model: 'claude-opus-5-5',
      fallback: false,
      usage: { calls: 1, input: 3200, output: 900, cacheRead: 2500, cacheWrite: 0 },
    });
    expect(noFetch).not.toHaveBeenCalled();
    expect(phases).toEqual(['attesa', 'ragiona', 'scrive']);
    const body = calls[0].body;
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.max_tokens).toBe(8000);
    expect(body.thinking).toEqual({ type: 'adaptive' });
    expect(body.output_config).toEqual({ effort: 'medium', format: { type: 'json_schema', schema: task.schema } });
    expect(body.fallbacks).toBe('default');
    expect(body.betas).toEqual([FALLBACK_BETA]);
    expect(body.tool_choice).toBeUndefined();
    expect(body.tools).toBeUndefined();
    expect(body.system).toEqual([
      { type: 'text', text: task.system, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'Pranzo, giorno di palestra' },
    ]);
    const content = (body.messages as { content: { type: string }[] }[])[0].content;
    expect(content.map((b) => b.type)).toEqual(['image', 'text']);
    expect(calls[0].signal).toBeInstanceOf(AbortSignal);
  });

  it('niente fallback dove il modello non li ha o quando si tolgono; niente effort né pensiero dove mancano', () => {
    const haiku = structuredRequest(task, { model: 'claude-haiku-5-5', context: 'x', request: 'y' });
    expect(haiku.fallbacks).toBeUndefined();
    expect(haiku.betas).toBeUndefined();
    expect(haiku.output_config?.effort).toBe('medium');
    const off = structuredRequest(task, { model: 'claude-opus-5-5', context: 'x', request: 'y', fallback: false });
    expect(off.fallbacks).toBeUndefined();
    const old = structuredRequest(task, { model: 'claude-opus-4-1', context: '', request: '' });
    expect(old.thinking).toBeUndefined();
    expect(old.output_config).toEqual({ format: { type: 'json_schema', schema: task.schema } });
    // Contesto vuoto: un solo blocco di sistema (un blocco di testo vuoto sarebbe un 400).
    expect(old.system).toHaveLength(1);
    const text = (old.messages[0].content as { type: string; text?: string }[]).at(-1);
    expect(text?.text).toBeTruthy();
  });

  it('un modello senza uscita strutturata non parte', async () => {
    const { client, calls } = fakeClient(message('{}'));
    const res = await runStructuredTask(task, base(client, { model: 'claude-sonnet-4-5' }));
    expect(res).toMatchObject({ ok: false, kind: 'modello', retryable: false });
    expect(calls).toHaveLength(0);
  });

  it('segnala il fallback dalle iterazioni e il modello che ha risposto', async () => {
    const { client } = fakeClient(
      message('{"outcome":"piatto","grams":1200}', {
        model: 'claude-opus-5',
        usage: { iterations: [{ type: 'message' }, { type: 'fallback_message' }] as unknown as Anthropic.Beta.BetaUsage['iterations'] },
      }),
    );
    const res = await runStructuredTask(task, base(client));
    expect(res).toMatchObject({ ok: true, model: 'claude-opus-5', fallback: true, warnings: ['Porzione molto grande'] });
  });
});

describe('esiti negativi, mai un’eccezione (§ 13.9, test 50)', () => {
  it('rifiuto prima del contenuto, con i token registrati', async () => {
    const { client } = fakeClient(message('{"outcome":"piatto","grams":250}', { stop_reason: 'refusal' }));
    const res = await runStructuredTask(task, base(client));
    expect(res).toMatchObject({ ok: false, kind: 'rifiuto', retryable: true, usage: { calls: 1, input: 3200 } });
  });

  it('max_tokens → incompleta', async () => {
    const { client } = fakeClient(message('{"outcome":"pia', { stop_reason: 'max_tokens' }));
    expect(await runStructuredTask(task, base(client))).toMatchObject({ ok: false, kind: 'incompleta', usage: { output: 900 } });
  });

  it('JSON non valido, testo vuoto, validatore che rifiuta o che lancia → non valida, con il testo del compito', async () => {
    for (const text of ['non è json', '', null, '{"outcome":"piatto","grams":0}', '{"outcome":"sasso","grams":10}', '[1,2]']) {
      const { client } = fakeClient(message(text));
      const res = await runStructuredTask(task, base(client));
      expect(res, String(text)).toMatchObject({ ok: false, kind: 'non-valida', message: 'La lettura non è venuta bene.', usage: { calls: 1 } });
    }
    const throwing: StructuredTask<Reading> = { ...task, messages: undefined, validate: () => { throw new Error('boom'); } };
    const { client } = fakeClient(message('{"outcome":"piatto","grams":10}'));
    const res = await runStructuredTask(throwing, base(client));
    expect(res).toMatchObject({ ok: false, kind: 'non-valida' });
    if (!res.ok) expect(res.message).toMatch(/non è venuta bene/);
  });

  it('errori tipizzati dell’SDK con i testi di lib/claude.ts', async () => {
    const h = new Headers();
    const cases: [Error, string][] = [
      [new sdk.APIConnectionError({}), 'rete'],
      [new sdk.AuthenticationError(401, {}, 'x', h), 'chiave'],
      [new sdk.RateLimitError(429, {}, 'x', h), 'limite'],
      [new sdk.BadRequestError(400, {}, 'x', h, 'billing_error'), 'credito'],
      [new sdk.InternalServerError(529, {}, 'x', h, 'overloaded_error'), 'occupato'],
      [new sdk.APIConnectionTimeoutError(), 'tempo'],
      [new Error('stream chiuso'), 'sconosciuto'],
    ];
    for (const [err, kind] of cases) {
      const { client } = fakeClient(err);
      const res = await runStructuredTask(task, base(client));
      expect(res, kind).toMatchObject({ ok: false, kind });
      if (!res.ok) expect(res.message.length).toBeGreaterThan(10);
      const late = fakeClient(err, { failAt: 'final' });
      expect(await runStructuredTask(task, base(late.client)), `${kind} alla fine`).toMatchObject({ ok: false, kind });
    }
  });

  it('senza rete il client vero non si crea nemmeno', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    vi.stubGlobal('fetch', noFetch);
    const res = await runStructuredTask(task, { apiKey: KEY, context: 'x', request: 'y' });
    expect(res).toMatchObject({ ok: false, kind: 'offline', retryable: true });
    expect(noFetch).not.toHaveBeenCalled();
  });

  it('interruzione di chi chiama → annullata; segnale già interrotto → la chiamata non parte', async () => {
    const ctrl = new AbortController();
    const { client, calls } = fakeClient(message('{"outcome":"piatto","grams":10}'), { hang: true });
    const pending = runStructuredTask(task, base(client, { signal: ctrl.signal }));
    await Promise.resolve();
    ctrl.abort();
    expect(await pending).toMatchObject({ ok: false, kind: 'annullata', retryable: false });
    expect(calls).toHaveLength(1);

    const again = fakeClient(message('{}'));
    expect(await runStructuredTask(task, base(again.client, { signal: ctrl.signal }))).toMatchObject({ ok: false, kind: 'annullata' });
    expect(again.calls).toHaveLength(0);
  });

  it('tempo scaduto → tempo', async () => {
    const { client } = fakeClient(message('{"outcome":"piatto","grams":10}'), { hang: true });
    const res = await runStructuredTask(task, base(client, { timeoutMs: 20 }));
    expect(res).toMatchObject({ ok: false, kind: 'tempo', retryable: true });
  });

  it('a prova di caso: testi e JSON casuali non lanciano mai e non passano mai fuori dai limiti', async () => {
    const r = mulberry32(2026);
    const pieces = ['{', '}', '[', ']', '"outcome"', '"piatto"', '"non-cibo"', '"grams"', ':', ',', '1e9', '-5', '250', 'null', 'true', '"x"', ' '];
    for (let i = 0; i < 200; i++) {
      const n = 1 + Math.floor(r() * 12);
      let text = '';
      for (let k = 0; k < n; k++) text += pieces[Math.floor(r() * pieces.length)];
      if (i % 5 === 0) text = JSON.stringify({ outcome: r() > 0.5 ? 'piatto' : 'non-cibo', grams: Math.round((r() - 0.2) * 3000) });
      const stop = (['end_turn', 'end_turn', 'refusal', 'max_tokens'] as const)[Math.floor(r() * 4)];
      const { client } = fakeClient(message(text, { stop_reason: stop }));
      const res = await runStructuredTask(task, base(client));
      if (res.ok) {
        expect(stop).toBe('end_turn');
        expect(res.value.grams).toBeGreaterThanOrEqual(1);
        expect(res.value.grams).toBeLessThanOrEqual(1500);
      } else {
        expect(['rifiuto', 'incompleta', 'non-valida']).toContain(res.kind);
      }
    }
  });
});

describe('aiuti per i compiti', () => {
  it('schemaProblems accetta gli schemi della specifica e trova quelli sbagliati', () => {
    // Schema della foto (§ 10.3), con un elenco d'esempio al posto degli id dell'archivio.
    const photo = {
      type: 'object',
      additionalProperties: false,
      required: ['outcome', 'items', 'cooking', 'oil', 'matchesPlanned', 'dishName', 'note'],
      properties: {
        outcome: { type: 'string', enum: ['piatto', 'non-cibo', 'illeggibile'] },
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'foodId', 'grams', 'confidence', 'role', 'per100g'],
            properties: {
              label: { type: 'string' },
              foodId: { anyOf: [{ type: 'string', enum: ['pasta', 'pollo'] }, { type: 'null' }] },
              grams: { type: 'number' },
              confidence: { type: 'string', enum: ['bassa', 'media', 'alta'] },
              role: { type: 'string', enum: ['alimento', 'condimento'] },
              per100g: {
                anyOf: [
                  { type: 'null' },
                  {
                    type: 'object',
                    additionalProperties: false,
                    required: ['kcal', 'proteinG', 'carbG', 'fatG', 'fiberG'],
                    properties: { kcal: { type: 'number' }, proteinG: { type: 'number' }, carbG: { type: 'number' }, fatG: { type: 'number' }, fiberG: { type: 'number' } },
                  },
                ],
              },
            },
          },
        },
        cooking: { type: 'string', enum: ['crudo', 'bollito', 'vapore', 'forno', 'padella', 'griglia', 'fritto', 'misto', 'non-so'] },
        oil: { type: 'string', enum: ['niente', 'filo', 'cucchiaio', 'due-cucchiai', 'non-so'] },
        matchesPlanned: { type: 'string', enum: ['si', 'in-parte', 'no', 'non-so'] },
        dishName: { type: 'string' },
        note: { type: 'string' },
      },
    };
    expect(schemaProblems(photo)).toEqual([]);
    expect(schemaProblems(task.schema)).toEqual([]);
    const bad = {
      type: 'object',
      required: ['a', 'z'],
      properties: {
        a: { type: 'number', minimum: 1, maximum: 1500 },
        b: { type: 'array', maxItems: 12, items: { type: 'object', properties: { c: { type: 'string', maxLength: 40 } } } },
      },
    };
    const problems = schemaProblems(bad);
    expect(problems).toEqual(
      expect.arrayContaining([
        '$: manca additionalProperties: false',
        '$: «z» è richiesto ma non esiste',
        '$.a: «minimum» non è ammesso',
        '$.a: «maximum» non è ammesso',
        '$.b: «maxItems» non è ammesso',
        '$.b[]: manca additionalProperties: false',
        '$.b[].c: «maxLength» non è ammesso',
      ]),
    );
  });

  it('coachText: tipografia della chat, una riga, tagliato a parola', () => {
    expect(coachText('Carichi in salita — tibia stabile', 140)).toBe('Carichi in salita, tibia stabile');
    expect(coachText('  due\n righe  ', 140)).toBe('due righe');
    expect(coachText(42, 140)).toBe('');
    const long = 'Tengo il Nordic in fondo alla seduta B perché dopo la forza pesante le gambe sono già stanche e conviene chiudere con il lavoro dei flessori e poi il resto.';
    const cut = coachText(long, COACH_REASON_MAX);
    expect(cut.length).toBeLessThanOrEqual(COACH_REASON_MAX);
    expect(cut.endsWith('…')).toBe(true);
    expect(long.startsWith(cut.slice(0, -1))).toBe(true);
    expect(cut.slice(0, -1)).not.toMatch(/\s$/);
  });
});
