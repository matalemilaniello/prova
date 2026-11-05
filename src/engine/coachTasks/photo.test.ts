import { afterEach, describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { ESTIMATE_FOODS } from '../../data/estimateFoods';
import { FOODS } from '../../data/foods';
import { RECIPES } from '../../data/recipes';
import { schemaProblems, type StructuredClient } from '../../lib/claudeTasks';
import { ITEM_GRAMS_MAX, ITEM_GRAMS_MIN, MAX_MEAL_ITEMS, resolveEstimate, validPer100g } from '../estimate';
import { mulberry32, type Rng } from '../rng';
import {
  PHOTO_TEXT,
  PHOTO_TIMEOUT_MS,
  photoContext,
  photoFoodIds,
  photoReadable,
  photoSchema,
  photoSystemPrompt,
  photoTask,
  readPhoto,
  validatePhotoReading,
} from './photo';

// Nessuna chiamata di rete: client finto, e `fetch` fallisce se qualcuno ci prova.
const noFetch = vi.fn(async () => {
  throw new Error('rete vietata nei test');
});
afterEach(() => vi.unstubAllGlobals());

const IMAGE = 'data:image/jpeg;base64,QUJD';
const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';

function message(text: string, over: Partial<Anthropic.Beta.BetaMessage> = {}): Anthropic.Beta.BetaMessage {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text, citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 4000, output_tokens: 1500, cache_read_input_tokens: 2500, cache_creation_input_tokens: 0 },
    ...over,
  } as unknown as Anthropic.Beta.BetaMessage;
}

function fakeClient(result: Anthropic.Beta.BetaMessage) {
  const bodies: Record<string, unknown>[] = [];
  const client: StructuredClient = {
    beta: {
      messages: {
        stream(body) {
          bodies.push(body as unknown as Record<string, unknown>);
          return {
            async *[Symbol.asyncIterator]() {
              yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '', citations: null } } as Anthropic.Beta.BetaRawMessageStreamEvent;
            },
            async finalMessage() {
              return result;
            },
          };
        },
      },
    },
  };
  return { client, bodies };
}

const answer = {
  outcome: 'piatto',
  items: [
    { label: 'Pasta', foodId: 'pasta', grams: 220, confidence: 'alta', role: 'alimento', per100g: null },
    { label: 'Ceci', foodId: 'ceci', grams: 80, confidence: 'media', role: 'alimento', per100g: null },
    { label: 'Grana', foodId: 'grana', grams: 10, confidence: 'bassa', role: 'condimento', per100g: null },
  ],
  cooking: 'bollito',
  oil: 'cucchiaio',
  matchesPlanned: 'si',
  dishName: 'Pasta e ceci',
  note: '',
};

describe('schema e prompt (§ 10.3)', () => {
  it('lo schema è accettabile per l’uscita strutturata', () => {
    expect(schemaProblems(photoSchema())).toEqual([]);
  });

  it('gli id ammessi sono tutti quelli dell’archivio e delle sole stime, e il prompt li elenca', () => {
    const ids = photoFoodIds();
    expect(ids).toHaveLength(Object.keys(FOODS).length + ESTIMATE_FOODS.length);
    const schema = photoSchema() as { properties: { items: { items: { properties: { foodId: { anyOf: { enum?: string[] }[] } } } } } };
    expect(schema.properties.items.items.properties.foodId.anyOf[0].enum).toEqual(ids);
    const system = photoSystemPrompt();
    for (const id of ids) expect(system).toContain(`${id} · `);
    // Stabile tra due chiamate (va in cache) e senza i valori degli alimenti.
    expect(photoSystemPrompt()).toBe(system);
    expect(system).not.toMatch(/kcal\s*\d/);
  });

  it('il contesto dice pasto, tipo di giorno e pasto previsto con i grammi, senza dispensa', () => {
    const ctx = photoContext({ slot: 'pranzo', dayType: 'palestra', planned: RECIPES['pasta-ceci-rosmarino'] });
    expect(ctx).toMatch(/^Pasto: pranzo, giorno di palestra\./);
    expect(ctx).toMatch(/pasta \d+ g/);
    expect(ctx).not.toMatch(/olio-evo/);
    expect(photoContext({ slot: 'cena', dayType: 'riposo' })).toContain('Pasto previsto: nessuno.');
  });

  it('la riga compare solo con la chiave e un modello con l’uscita strutturata', () => {
    expect(photoReadable({ coachApiKey: KEY, coachModel: 'claude-opus-5-5' })).toBe(true);
    expect(photoReadable({ coachApiKey: '', coachModel: 'claude-opus-5-5' })).toBe(false);
    expect(photoReadable({ coachApiKey: KEY, coachModel: 'claude-sonnet-4-5' })).toBe(false);
    expect(photoReadable({ coachApiKey: KEY, coachModel: '' })).toBe(true);
  });
});

describe('validatore (§ 10.7)', () => {
  it('pulisce una risposta valida', () => {
    const res = validatePhotoReading(answer);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.items.map((i) => i.foodId)).toEqual(['pasta', 'ceci', 'grana']);
  });

  it('id sconosciuti fuori archivio, grammi nei limiti, per100g solo fuori archivio e con Atwater', () => {
    const res = validatePhotoReading({
      ...answer,
      items: [
        { label: 'Gnocchi', foodId: 'gnocchi-inventati', grams: 5000, confidence: 'boh', role: 'x', per100g: { kcal: 160, proteinG: 4, carbG: 33, fatG: 0.5, fiberG: 2 } },
        { label: 'Pasta', foodId: 'pasta', grams: 0.2, confidence: 'alta', role: 'alimento', per100g: { kcal: 1, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 } },
        { label: 'Salsa', foodId: null, grams: 30, confidence: 'alta', role: 'condimento', per100g: { kcal: 800, proteinG: 1, carbG: 1, fatG: 10, fiberG: 0 } },
        { label: '', foodId: null, grams: 30, confidence: 'alta', role: 'alimento', per100g: null },
        { label: 'Niente grammi', foodId: 'ceci', grams: 'tanti', confidence: 'alta', role: 'alimento', per100g: null },
      ],
      cooking: 'al-vapore-forse',
      oil: 'litri',
      matchesPlanned: 'boh',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.items).toEqual([
      { label: 'Gnocchi', foodId: null, grams: ITEM_GRAMS_MAX, confidence: 'media', role: 'alimento', per100g: { kcal: 160, proteinG: 4, carbG: 33, fatG: 0.5, fiberG: 2 } },
      { label: 'Pasta', foodId: 'pasta', grams: ITEM_GRAMS_MIN, confidence: 'alta', role: 'alimento', per100g: null },
      { label: 'Salsa', foodId: null, grams: 30, confidence: 'alta', role: 'condimento', per100g: null },
    ]);
    expect(res.value).toMatchObject({ cooking: 'non-so', oil: 'non-so', matchesPlanned: 'non-so' });
  });

  it('al massimo 12 alimenti, con un avviso; un piatto senza alimenti non vale', () => {
    const many = { ...answer, items: Array.from({ length: 15 }, () => answer.items[0]) };
    const res = validatePhotoReading(many);
    expect(res.ok && res.value.items.length).toBe(MAX_MEAL_ITEMS);
    expect(res.ok && res.warnings?.length).toBe(1);
    expect(validatePhotoReading({ ...answer, items: [] })).toEqual({ ok: false, message: PHOTO_TEXT.nonValida });
    expect(validatePhotoReading({ ...answer, outcome: 'sasso' }).ok).toBe(false);
    const notFood = validatePhotoReading({ ...answer, outcome: 'non-cibo' });
    expect(notFood.ok && notFood.value.items).toEqual([]);
  });

  it('con qualunque JSON non lancia mai e non accetta mai valori fuori dai limiti (test 48)', () => {
    const rng = mulberry32(20261105);
    const keys = ['outcome', 'items', 'cooking', 'oil', 'matchesPlanned', 'dishName', 'note', 'label', 'foodId', 'grams', 'confidence', 'role', 'per100g', 'kcal', 'proteinG', 'carbG', 'fatG', 'fiberG'];
    const atoms = (r: Rng): unknown => {
      const k = Math.floor(r() * 12);
      const vals: unknown[] = [null, true, -1, 0, 1e9, Number.NaN, 'piatto', 'pasta', 'non-cibo', '', 250, { kcal: 'x' }];
      return vals[k];
    };
    const gen = (r: Rng, depth: number): unknown => {
      const k = r();
      if (depth > 3 || k < 0.35) return atoms(r);
      if (k < 0.55) return Array.from({ length: Math.floor(r() * 16) }, () => gen(r, depth + 1));
      const o: Record<string, unknown> = {};
      for (const key of keys) if (r() < 0.5) o[key] = gen(r, depth + 1);
      if (r() < 0.6) o.outcome = 'piatto';
      return o;
    };
    for (let i = 0; i < 2000; i++) {
      const raw = gen(rng, 0);
      let res: ReturnType<typeof validatePhotoReading>;
      expect(() => (res = validatePhotoReading(raw))).not.toThrow();
      res = validatePhotoReading(raw);
      if (!res.ok) continue;
      expect(res.value.items.length).toBeLessThanOrEqual(MAX_MEAL_ITEMS);
      for (const it of res.value.items) {
        expect(it.grams).toBeGreaterThanOrEqual(ITEM_GRAMS_MIN);
        expect(it.grams).toBeLessThanOrEqual(ITEM_GRAMS_MAX);
        if (it.foodId) expect(it.per100g).toBeNull();
        if (it.per100g) expect(validPer100g(it.per100g)).toEqual(it.per100g);
        expect(it.label.length).toBeLessThanOrEqual(40);
      }
      // La scheda che ne nasce non lancia nemmeno lei.
      expect(() => resolveEstimate(res.ok ? res.value : (null as never), { origin: 'oggi', slot: 'pranzo' })).not.toThrow();
    }
  });
});

describe('lettura con il client finto (§ 7.2, test 50)', () => {
  it('foto prima del testo, schema nell’output_config, timeout di 45 s', async () => {
    vi.stubGlobal('fetch', noFetch);
    const { client, bodies } = fakeClient(message(JSON.stringify(answer)));
    const res = await readPhoto({ apiKey: KEY, image: IMAGE, context: { slot: 'pranzo', dayType: 'palestra' }, client });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.dishName).toBe('Pasta e ceci');
      expect(res.usage).toMatchObject({ calls: 1, input: 4000 });
    }
    expect(noFetch).not.toHaveBeenCalled();
    const body = bodies[0];
    expect((body.output_config as { format: unknown }).format).toEqual({ type: 'json_schema', schema: photoTask().schema });
    expect((body.output_config as { effort: string }).effort).toBe('medium');
    expect(body.max_tokens).toBe(8000);
    const content = (body.messages as { content: { type: string }[] }[])[0].content;
    expect(content.map((b) => b.type)).toEqual(['image', 'text']);
    expect(PHOTO_TIMEOUT_MS).toBe(45_000);
  });

  it('rifiuto, risposta incompleta o non valida: i testi della foto (§ 7.6)', async () => {
    const refusal = fakeClient(message('{}', { stop_reason: 'refusal' }));
    expect(await readPhoto({ apiKey: KEY, image: IMAGE, context: { slot: 'cena', dayType: 'riposo' }, client: refusal.client })).toMatchObject({
      ok: false,
      kind: 'rifiuto',
      message: PHOTO_TEXT.rifiuto,
    });
    const cut = fakeClient(message('{"outcome":"pia', { stop_reason: 'max_tokens' }));
    expect(await readPhoto({ apiKey: KEY, image: IMAGE, context: { slot: 'cena', dayType: 'riposo' }, client: cut.client })).toMatchObject({
      ok: false,
      kind: 'incompleta',
      message: PHOTO_TEXT.nonValida,
    });
    const bad = fakeClient(message('{"outcome":"piatto","items":[]}'));
    expect(await readPhoto({ apiKey: KEY, image: IMAGE, context: { slot: 'cena', dayType: 'riposo' }, client: bad.client })).toMatchObject({
      ok: false,
      kind: 'non-valida',
      message: PHOTO_TEXT.nonValida,
    });
  });

  it('«non è cibo» e «illeggibile» sono esiti validi, senza alimenti', async () => {
    const { client } = fakeClient(message(JSON.stringify({ ...answer, outcome: 'illeggibile', items: [] })));
    const res = await readPhoto({ apiKey: KEY, image: IMAGE, context: { slot: 'cena', dayType: 'riposo' }, client });
    expect(res).toMatchObject({ ok: true, value: { outcome: 'illeggibile', items: [] } });
  });
});
