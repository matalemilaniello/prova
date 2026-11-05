/**
 * Immagini per il coach: riduzione nel browser prima dell'invio.
 * Dalla fase 2 anche le miniature dei piatti salvati (`thumbnail`, 96 px).
 *
 * Una foto dell'iPhone pesa diversi MB: la riduciamo a JPEG con il lato lungo di 1024 px per l'invio
 * (abbastanza per riconoscere piatto e porzioni, circa 1.000 token) e a una copia più leggera da
 * conservare nella cronologia sul telefono, che ha poco spazio.
 */

/** Lato lungo massimo dell'immagine inviata al coach. */
export const SEND_MAX_PX = 1024;
/** Lato lungo della copia salvata nella cronologia. */
export const STORE_MAX_PX = 720;
export const SEND_QUALITY = 0.82;
export const STORE_QUALITY = 0.72;

export interface Size {
  width: number;
  height: number;
}

/** Dimensioni che stanno dentro `max` px sul lato lungo, senza mai ingrandire. */
export function fitWithin(width: number, height: number, max: number): Size {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Separa un data URL nei campi che servono all'API: tipo e base64. */
export function splitDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  return { mediaType: m[1], data: m[2] };
}

/** Byte approssimativi di un data URL base64. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const b64 = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
}

type Drawable = { source: CanvasImageSource; width: number; height: number; close?: () => void };

async function decode(blob: Blob): Promise<Drawable> {
  // createImageBitmap rispetta l'orientamento EXIF (foto in verticale dell'iPhone).
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* formato non supportato da createImageBitmap: si prova con <img> */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    // L'immagine è già decodificata: l'URL temporaneo si può liberare.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function render(d: Drawable, max: number, quality: number): string {
  const { width, height } = fitWithin(d.width, d.height, max);
  if (!width || !height) throw new Error('immagine vuota');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas non disponibile');
  // Fondo bianco: i PNG trasparenti in JPEG diventerebbero neri.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(d.source, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

export interface PreparedImage {
  /** JPEG da inviare al coach (lato lungo ≤ 1024 px). */
  send: string;
  /** Copia leggera da salvare nella cronologia (lato lungo ≤ 720 px). */
  store: string;
  width: number;
  height: number;
}

/** Riduce una foto scelta o scattata: una versione da inviare e una da conservare. */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  if (file.type && !file.type.startsWith('image/')) throw new Error('non è un’immagine');
  const d = await decode(file);
  try {
    const send = render(d, SEND_MAX_PX, SEND_QUALITY);
    const store = render(d, STORE_MAX_PX, STORE_QUALITY);
    const size = fitWithin(d.width, d.height, SEND_MAX_PX);
    return { send, store, width: size.width, height: size.height };
  } finally {
    d.close?.();
  }
}

/** Riduce un data URL già esistente (per esempio una foto vecchia della cronologia). */
export async function downscaleDataUrl(dataUrl: string, max = STORE_MAX_PX, quality = STORE_QUALITY): Promise<string> {
  const res = await fetch(dataUrl);
  const d = await decode(await res.blob());
  try {
    return render(d, max, quality);
  } finally {
    d.close?.();
  }
}

// ───────────────────────── Miniature dei piatti (fase 2, § 8.1) ─────────────────────────

/** Lato della miniatura di un piatto salvato: ritaglio quadrato al centro. */
export const THUMB_PX = 96;
/** Qualità JPEG della miniatura; se il risultato è troppo pesante si prova più bassa. */
export const THUMB_QUALITIES = [0.6, 0.45, 0.3] as const;
/** Tetto della miniatura in caratteri del data URL: lo stesso di `isValidThumb` in state/store.ts (12 KB). */
export const THUMB_MAX_CHARS = 12 * 1024;

/** Ritaglio quadrato al centro di un'immagine: lato e angolo in alto a sinistra, in pixel della sorgente. */
export function centerSquare(width: number, height: number): { sx: number; sy: number; side: number } {
  if (!(width > 0) || !(height > 0)) return { sx: 0, sy: 0, side: 0 };
  const side = Math.min(width, height);
  return { sx: Math.floor((width - side) / 2), sy: Math.floor((height - side) / 2), side };
}

/**
 * Miniatura di un piatto (§ 8.1): ritaglio quadrato al centro, `size` × `size` px, JPEG qualità 0,6 (più bassa se
 * serve per stare sotto i 12 KB). Null se la foto non si legge o se nemmeno alla qualità più bassa sta nel tetto.
 */
export async function thumbnail(dataUrl: string, size = THUMB_PX): Promise<string | null> {
  try {
    const res = await fetch(dataUrl);
    const d = await decode(await res.blob());
    try {
      const { sx, sy, side } = centerSquare(d.width, d.height);
      if (!side) return null;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(d.source, sx, sy, side, side, 0, 0, size, size);
      for (const q of THUMB_QUALITIES) {
        const out = canvas.toDataURL('image/jpeg', q);
        if (out.startsWith('data:image/jpeg;base64,') && out.length <= THUMB_MAX_CHARS) return out;
      }
      return null;
    } finally {
      d.close?.();
    }
  } catch {
    return null;
  }
}
