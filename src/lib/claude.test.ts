import { describe, expect, it } from 'vitest';
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
  tidyReply,
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

  it('pensiero adattivo ed effort solo dove esistono', () => {
    expect(modelSupport('claude-opus-5-5')).toEqual({ adaptiveThinking: true, effort: true });
    expect(modelSupport('claude-opus-4-6')).toEqual({ adaptiveThinking: true, effort: true });
    expect(modelSupport('claude-opus-4-5')).toEqual({ adaptiveThinking: false, effort: true });
    expect(modelSupport('claude-sonnet-4-5-20250929')).toEqual({ adaptiveThinking: false, effort: false });
    expect(modelSupport('claude-haiku-4-5')).toEqual({ adaptiveThinking: false, effort: false });
    expect(modelSupport('claude-haiku-5-5')).toEqual({ adaptiveThinking: true, effort: true });
    expect(modelSupport('qualcosa')).toEqual({ adaptiveThinking: false, effort: false });
  });
});

describe('messaggi per l\'API', () => {
  it('toglie errori e rifiuti, parte e finisce con l\'utente', () => {
    const chat = [
      msg('a0', 'assistant', 'Ciao, sono il coach'),
      msg('u1', 'user', 'Sono al bar'),
      msg('a1', 'assistant', 'Prendi un panino con bresaola'),
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

  it('usa l\'immagine a risoluzione piena per il messaggio appena scritto', () => {
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

  it('classifica gli errori tipizzati dell\'SDK', async () => {
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
