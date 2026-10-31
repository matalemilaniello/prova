/**
 * Strumenti dei grafici SVG disegnati a mano: scale lineari, tacche "tonde", curve monotone
 * (non superano mai i dati, come curveMonotoneX), segmenti interrotti dai giorni senza dato.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Scala lineare dal dominio [d0, d1] all'intervallo [r0, r1]. */
export function linear(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v: number) => r0 + (v - d0) * k;
}

/** Passo "tondo" (1, 2, 2,5, 5 × 10^n) per circa `count` intervalli. */
export function niceStep(span: number, count: number): number {
  if (!(span > 0)) return 1;
  const raw = span / Math.max(1, count);
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * p;
}

/**
 * Dominio arrotondato e tacche: allarga [min, max] ai multipli del passo.
 * `minSpan` evita che pochi decimi di differenza riempiano tutto il grafico.
 */
export function niceDomain(min: number, max: number, count = 4, minSpan = 0): { lo: number; hi: number; ticks: number[]; step: number } {
  let lo = min;
  let hi = max;
  if (hi - lo < minSpan) {
    const mid = (lo + hi) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  if (hi === lo) {
    lo -= 1;
    hi += 1;
  }
  const step = niceStep(hi - lo, count);
  lo = Math.floor(lo / step + 1e-9) * step;
  hi = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(Math.round(v / step) * step);
  return { lo, hi, ticks, step };
}

/** Spezza una serie con buchi in tratti continui di punti. */
export function segments<T>(items: T[], toPt: (item: T, i: number) => Pt | null): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  items.forEach((it, i) => {
    const p = toPt(it, i);
    if (p) cur.push(p);
    else if (cur.length) {
      out.push(cur);
      cur = [];
    }
  });
  if (cur.length) out.push(cur);
  return out;
}

const f = (n: number) => (Math.round(n * 100) / 100).toString();

/** Spezzata. */
export function linePath(pts: Pt[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)},${f(p.y)}`).join('');
}

/** Curva cubica monotona (Fritsch-Carlson): morbida ma senza "pance" oltre i dati. */
export function monotonePath(pts: Pt[]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${f(pts[0].x)},${f(pts[0].y)}`;
  if (n === 2) return linePath(pts);
  const dx: number[] = [];
  const s: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    s.push(dx[i] === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx[i]);
  }
  const t: number[] = [s[0]];
  for (let i = 1; i < n - 1; i++) {
    if (s[i - 1] * s[i] <= 0) t.push(0);
    else {
      const a = dx[i - 1];
      const b = dx[i];
      t.push((3 * (a + b)) / ((2 * b + a) / s[i - 1] + (b + 2 * a) / s[i]));
    }
  }
  t.push(s[n - 2]);
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${f(pts[i].x + h)},${f(pts[i].y + t[i] * h)} ${f(pts[i + 1].x - h)},${f(pts[i + 1].y - t[i + 1] * h)} ${f(pts[i + 1].x)},${f(pts[i + 1].y)}`;
  }
  return d;
}

/** Area sotto una curva monotona fino alla linea di base. */
export function areaPath(pts: Pt[], baseY: number): string {
  if (pts.length < 2) return '';
  const top = monotonePath(pts);
  const last = pts[pts.length - 1];
  return `${top}L${f(last.x)},${f(baseY)}L${f(pts[0].x)},${f(baseY)}Z`;
}

/** Rettangolo con i soli angoli in alto arrotondati (barre). */
export function topRoundedRect(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0 || w <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${f(x)},${f(y + h)}V${f(y + rr)}Q${f(x)},${f(y)} ${f(x + rr)},${f(y)}H${f(x + w - rr)}Q${f(x + w)},${f(y)} ${f(x + w)},${f(y + rr)}V${f(y + h)}Z`;
}

/** Id sicuro per url(#…) a partire da useId. */
export function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
}
