import { describe, expect, it } from 'vitest';
import { dataUrlBytes, fitWithin, SEND_MAX_PX, splitDataUrl } from './image';

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
