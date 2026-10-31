/** Identificativi brevi e univoci sul dispositivo (non crittografici). */

let counter = 0;

/** Id casuale, es. "w_lq2x8f_3k9a". Il prefisso è facoltativo. */
export function uid(prefix = ''): string {
  counter = (counter + 1) % 1296;
  const time = Date.now().toString(36);
  let rand = '';
  try {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    rand = buf[0].toString(36).slice(0, 5);
  } catch {
    rand = Math.floor(Math.random() * 36 ** 5).toString(36);
  }
  const id = `${time}${counter.toString(36).padStart(2, '0')}${rand}`;
  return prefix ? `${prefix}_${id}` : id;
}

/** Hash stabile di una stringa (FNV-1a 32 bit), utile per scelte deterministiche. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Slug leggibile: "Isometria al muro" → "isometria-al-muro". */
export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
