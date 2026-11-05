import { describe, expect, it } from 'vitest';
import { THUMB_MAX_CHARS as STORE_THUMB_MAX, isValidThumb } from '../state/store';
import { centerSquare, dataUrlBytes, fitWithin, SEND_MAX_PX, splitDataUrl, THUMB_MAX_CHARS, THUMB_PX, THUMB_QUALITIES } from './image';

describe('riduzione delle foto', () => {
  it('il lato lungo non supera il massimo', () => {
    expect(fitWithin(4032, 3024, SEND_MAX_PX)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin(3024, 4032, SEND_MAX_PX)).toEqual({ width: 768, height: 1024 });
  });

  it('non ingrandisce le immagini piccole', () => {
    expect(fitWithin(640, 480, SEND_MAX_PX)).toEqual({ width: 640, height: 480 });
  });

  it('gestisce dimensioni assurde', () => {
    expect(fitWithin(0, 100, 1024)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(10000, 1, 1024)).toEqual({ width: 1024, height: 1 });
  });

  it('separa i data URL', () => {
    expect(splitDataUrl('data:image/jpeg;base64,QUJD')).toEqual({ mediaType: 'image/jpeg', data: 'QUJD' });
    expect(splitDataUrl('non un data url')).toBeNull();
  });

  it('stima i byte', () => {
    expect(dataUrlBytes('data:image/jpeg;base64,QUJD')).toBe(3);
    expect(dataUrlBytes('data:image/jpeg;base64,QUI=')).toBe(2);
  });
});

describe('miniature dei piatti (§ 8.1, test 28)', () => {
  it('ritaglio quadrato al centro', () => {
    expect(centerSquare(4032, 3024)).toEqual({ sx: 504, sy: 0, side: 3024 });
    expect(centerSquare(3024, 4032)).toEqual({ sx: 0, sy: 504, side: 3024 });
    expect(centerSquare(500, 500)).toEqual({ sx: 0, sy: 0, side: 500 });
    expect(centerSquare(0, 10)).toEqual({ sx: 0, sy: 0, side: 0 });
  });

  it('96 px, qualità 0,6 per prima e lo stesso tetto di 12 KB dello stato', () => {
    expect(THUMB_PX).toBe(96);
    expect(THUMB_QUALITIES[0]).toBe(0.6);
    expect(THUMB_MAX_CHARS).toBe(STORE_THUMB_MAX);
    expect(isValidThumb('data:image/jpeg;base64,QUJD')).toBe(true);
    expect(isValidThumb('data:image/png;base64,QUJD')).toBe(false);
    expect(isValidThumb(`data:image/jpeg;base64,${'A'.repeat(THUMB_MAX_CHARS)}`)).toBe(false);
  });
});
