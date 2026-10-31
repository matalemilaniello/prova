/**
 * Composizione dell'illustrazione del piatto: funzioni pure che, data una ricetta, restituiscono
 * gli elementi SVG del cibo in coordinate del piatto (centro 0,0, raggio 1).
 *
 * Tre impostazioni: piatto (settori organici: base, proteine, verdure, con le fette disposte a ventaglio),
 * ciotola (yogurt, skyr, porridge: guarnizioni in strisce parallele) e zuppa (vellutate e minestroni).
 * Tutto è deterministico: il seme dipende dall'id della ricetta.
 */
import type { ReactNode } from 'react';
import type { DayType, PortionUnit, Recipe } from '../../../domain/types';
import { FOODS } from '../../../data/foods';
import { lineGrams } from '../../../engine/nutrition';
import { hashString } from '../../../lib/id';
import { artFor, type FoodArt } from './foodArt';

// ───────────────────────── Utilità ─────────────────────────

export type Rng = () => number;

export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => Math.round(n * 1000) / 1000;
const deg = (rad: number) => f((rad * 180) / Math.PI);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const TAU = Math.PI * 2;

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `#${[c(r1, r2), c(g1, g2), c(b1, b2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
export const lighten = (c: string, t: number) => mix(c, '#ffffff', t);
export const darken = (c: string, t: number) => mix(c, '#000000', t);

/** Variazione leggera del colore, per non avere pezzi tutti uguali. */
function vary(c: string, rng: Rng, amt = 0.1): string {
  const t = rng() * amt;
  return rng() < 0.5 ? lighten(c, t) : darken(c, t);
}

function pick<T>(list: T[], rng: Rng): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

/** Contorno morbido e irregolare (macchia) intorno a un centro. */
function blobPath(cx: number, cy: number, r: number, rng: Rng, n = 8, noise = 0.22, sx = 1, sy = 1): string {
  const pts: [number, number][] = [];
  const off = rng() * TAU;
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * TAU;
    const rr = r * (1 - noise / 2 + rng() * noise);
    pts.push([cx + Math.cos(a) * rr * sx, cy + Math.sin(a) * rr * sy]);
  }
  const mid = (p: [number, number], q: [number, number]): [number, number] => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  let d = '';
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    const m = mid(p, q);
    if (i === 0) {
      const m0 = mid(pts[n - 1], p);
      d += `M${f(m0[0])} ${f(m0[1])}`;
    }
    d += `Q${f(p[0])} ${f(p[1])} ${f(m[0])} ${f(m[1])}`;
  }
  return `${d}Z`;
}

/** Onda morbida (filo d'olio, miele, crema di arachidi). */
function wavePath(len: number, amp: number, waves: number, rng: Rng): string {
  const n = Math.max(6, Math.round(waves * 6));
  const pts: [number, number][] = [];
  const phase = rng() * TAU;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([-len / 2 + len * t, Math.sin(phase + t * waves * TAU) * amp * (0.7 + rng() * 0.5)]);
  }
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1];
    const q = pts[i];
    d += `Q${f(p[0])} ${f(p[1])} ${f((p[0] + q[0]) / 2)} ${f((p[1] + q[1]) / 2)}`;
  }
  return d;
}

// ───────────────────────── Ingredienti ─────────────────────────

export interface ArtEntry {
  id: string;
  grams: number;
  qty: number;
  unit: PortionUnit;
  art: FoodArt;
}

/** Righe della ricetta unite per alimento, con i grammi del tipo di giorno. */
export function artEntries(recipe: Recipe, dayType: DayType): ArtEntry[] {
  const map = new Map<string, ArtEntry>();
  for (const line of recipe.ingredients) {
    const grams = lineGrams(line, dayType);
    const cur = map.get(line.foodId);
    if (cur) {
      cur.grams += grams;
      cur.qty += line.qty;
    } else {
      map.set(line.foodId, { id: line.foodId, grams, qty: line.qty, unit: line.unit, art: artFor(line.foodId, FOODS[line.foodId]) });
    }
  }
  return [...map.values()].filter((e) => e.grams > 0 || e.art.shape === 'speck');
}

export type DishKind = 'plate' | 'bowl' | 'soup';

const BOWL_BASES = new Set(['yogurt-greco-0', 'yogurt-greco-2', 'skyr', 'fiocchi-latte']);

export function dishKind(entries: ArtEntry[]): DishKind {
  if (entries.some((e) => e.art.shape === 'soup' && e.art.role !== 'sauce' && e.grams >= 120)) return 'soup';
  if (entries.some((e) => BOWL_BASES.has(e.id) && e.grams >= 120)) return 'bowl';
  const liquid = entries.some((e) => e.id === 'latte' || e.id === 'kefir');
  if (liquid && entries.some((e) => e.art.shape === 'flakes')) return 'bowl';
  return 'plate';
}

// ───────────────────────── Pezzi ─────────────────────────

interface PieceCtx {
  x: number;
  y: number;
  /** Scala dei pezzi (1 = illustrazione grande). */
  s: number;
  rot: number;
  rng: Rng;
  e: ArtEntry;
  k: string;
}

const ROUND_R: Record<string, [number, number]> = {
  piselli: [0.026, 0.026],
  ceci: [0.038, 0.035],
  pomodorini: [0.068, 0.066],
  'frutti-bosco': [0.036, 0.035],
  lenticchie: [0.02, 0.016],
  borlotti: [0.042, 0.028],
  cannellini: [0.044, 0.027],
  edamame: [0.036, 0.026],
};

/** Raggio indicativo del pezzo, per contare quanti ne servono e distanziarli. */
function pieceSize(e: ArtEntry): number {
  switch (e.art.shape) {
    case 'rice':
      return 0.028;
    case 'pasta':
      return 0.048;
    case 'grain':
      return 0.018;
    case 'flakes':
      return 0.03;
    case 'leaf':
      return 0.085;
    case 'floret':
      return 0.08;
    case 'clump':
      return 0.07;
    case 'coin':
      return 0.05;
    case 'cube':
      return e.id === 'soffritto' ? 0.02 : 0.05;
    case 'strip':
      return 0.09;
    case 'pod':
      return 0.09;
    case 'round':
      return (ROUND_R[e.id] ?? [0.034, 0.034])[0];
    case 'ring':
      return 0.05;
    case 'wedge':
      return 0.09;
    case 'nut':
      return 0.035;
    case 'scramble':
      return 0.07;
    case 'flaky':
      return 0.048;
    case 'shrimp':
      return 0.055;
    case 'square':
      return 0.035;
    case 'speck':
      return 0.01;
    default:
      return 0.05;
  }
}

function drawPiece(c: PieceCtx): ReactNode {
  const { x, y, s, rot, rng, e, k } = c;
  const a = e.art;
  const base = a.mix ? pick(a.mix, rng) : a.color;
  const t = `translate(${f(x)} ${f(y)}) rotate(${deg(rot)})`;
  switch (a.shape) {
    case 'rice':
      return <ellipse key={k} cx={f(x)} cy={f(y)} rx={f(0.029 * s)} ry={f(0.012 * s)} transform={`rotate(${deg(rot)} ${f(x)} ${f(y)})`} fill={rng() < 0.3 ? vary(a.color2 ?? base, rng, 0.06) : vary(base, rng, 0.05)} />;
    case 'grain':
      return <ellipse key={k} cx={f(x)} cy={f(y)} rx={f(0.017 * s * (0.85 + rng() * 0.3))} ry={f(0.014 * s)} transform={`rotate(${deg(rot)} ${f(x)} ${f(y)})`} fill={vary(rng() < 0.35 ? (a.color2 ?? base) : base, rng, 0.07)} />;
    case 'pasta': {
      const col = vary(base, rng, 0.06);
      return (
        <g key={k} transform={t}>
          <rect x={f(-0.046 * s)} y={f(-0.017 * s)} width={f(0.092 * s)} height={f(0.034 * s)} rx={f(0.013 * s)} fill={col} />
          <ellipse cx={f(0.04 * s)} cy={0} rx={f(0.007 * s)} ry={f(0.013 * s)} fill={darken(col, 0.22)} />
          <rect x={f(-0.034 * s)} y={f(-0.012 * s)} width={f(0.058 * s)} height={f(0.006 * s)} rx={f(0.003 * s)} fill="#fff" opacity={0.28} />
        </g>
      );
    }
    case 'flakes': {
      const r = 0.03 * s;
      return <path key={k} d={blobPath(x, y, r, rng, 5, 0.5, 1, 0.75)} fill={vary(base, rng, 0.1)} />;
    }
    case 'scramble': {
      const r = 0.068 * s * (0.8 + rng() * 0.4);
      return (
        <g key={k}>
          <path d={blobPath(x, y, r, rng, 9, 0.35)} fill={vary(a.color, rng, 0.05)} />
          {a.color2 && rng() < 0.7 && <path d={blobPath(x + r * 0.25, y - r * 0.2, r * 0.38, rng, 6, 0.4)} fill={a.color2} opacity={0.85} />}
          <ellipse cx={f(x - r * 0.3)} cy={f(y - r * 0.35)} rx={f(r * 0.28)} ry={f(r * 0.14)} fill="#fff" opacity={0.3} />
        </g>
      );
    }
    case 'leaf': {
      const narrow = e.id === 'rucola';
      const l = (narrow ? 0.15 : e.id === 'insalata' ? 0.17 : 0.13) * s * (0.85 + rng() * 0.3);
      const w = (narrow ? 0.034 : e.id === 'insalata' ? 0.075 : 0.06) * s;
      const col = vary(base, rng, 0.1);
      return (
        <g key={k} transform={t}>
          <path d={`M0 ${f(-l / 2)}Q${f(w)} ${f(-l * 0.1)} ${f(w * 0.2)} ${f(l / 2)}Q0 ${f(l * 0.56)} ${f(-w * 0.2)} ${f(l / 2)}Q${f(-w)} ${f(-l * 0.1)} 0 ${f(-l / 2)}Z`} fill={col} />
          <path d={`M0 ${f(-l * 0.42)}Q${f(w * 0.12)} 0 0 ${f(l * 0.5)}`} stroke={darken(col, 0.2)} strokeWidth={f(0.006 * s)} fill="none" opacity={0.7} />
        </g>
      );
    }
    case 'floret': {
      const r = 0.032 * s;
      const col = a.color;
      return (
        <g key={k} transform={t}>
          <rect x={f(-0.012 * s)} y={f(0.005 * s)} width={f(0.024 * s)} height={f(0.06 * s)} rx={f(0.01 * s)} fill={a.color2 ?? lighten(col, 0.4)} />
          {[
            [0, -0.022],
            [-0.028, -0.004],
            [0.028, -0.004],
            [-0.016, 0.018],
            [0.016, 0.018],
            [0, 0.002],
          ].map(([dx, dy], i) => (
            <circle key={i} cx={f(dx * s)} cy={f(dy * s)} r={f(r * (0.85 + rng() * 0.3))} fill={vary(col, rng, 0.12)} />
          ))}
          <circle cx={f(-0.01 * s)} cy={f(-0.02 * s)} r={f(r * 0.35)} fill={lighten(col, 0.35)} opacity={0.6} />
        </g>
      );
    }
    case 'clump': {
      const r = 0.07 * s;
      return (
        <g key={k}>
          <path d={blobPath(x, y, r, rng, 8, 0.4)} fill={vary(a.color, rng, 0.08)} />
          <path d={`M${f(x - r * 0.5)} ${f(y)}q${f(r * 0.4)} ${f(-r * 0.4)} ${f(r)} 0`} stroke={lighten(a.color, 0.18)} strokeWidth={f(0.008 * s)} fill="none" opacity={0.6} />
        </g>
      );
    }
    case 'coin': {
      const r = 0.05 * s * (0.88 + rng() * 0.24);
      if (e.id === 'kiwi') {
        return (
          <g key={k}>
            <circle cx={f(x)} cy={f(y)} r={f(r)} fill={a.color2} stroke="#8A6B3C" strokeWidth={f(0.006 * s)} />
            {Array.from({ length: 10 }, (_, i) => {
              const an = (i / 10) * TAU;
              return <ellipse key={i} cx={f(x + Math.cos(an) * r * 0.5)} cy={f(y + Math.sin(an) * r * 0.5)} rx={f(0.0045 * s)} ry={f(0.0025 * s)} transform={`rotate(${deg(an)} ${f(x + Math.cos(an) * r * 0.5)} ${f(y + Math.sin(an) * r * 0.5)})`} fill="#2B2A1C" />;
            })}
            <circle cx={f(x)} cy={f(y)} r={f(r * 0.28)} fill={lighten(a.color2 ?? a.color, 0.45)} />
          </g>
        );
      }
      if (e.id === 'banana') {
        return (
          <g key={k}>
            <circle cx={f(x)} cy={f(y)} r={f(r)} fill={a.color2} stroke={darken(a.color2 ?? a.color, 0.06)} strokeWidth={f(0.004 * s)} />
            {[0, 1, 2].map((i) => (
              <circle key={i} cx={f(x + Math.cos(rot + (i * TAU) / 3) * r * 0.22)} cy={f(y + Math.sin(rot + (i * TAU) / 3) * r * 0.22)} r={f(0.004 * s)} fill="#9C7A45" opacity={0.7} />
            ))}
          </g>
        );
      }
      if (e.id === 'carote') {
        return (
          <g key={k}>
            <circle cx={f(x)} cy={f(y)} r={f(r * 0.85)} fill={a.color} />
            <circle cx={f(x)} cy={f(y)} r={f(r * 0.45)} fill={a.color2} opacity={0.8} />
          </g>
        );
      }
      return (
        <g key={k}>
          <circle cx={f(x)} cy={f(y)} r={f(r)} fill={a.color2} stroke={a.color} strokeWidth={f(0.012 * s)} />
          {Array.from({ length: 5 }, (_, i) => {
            const an = rot + (i / 5) * TAU;
            return <circle key={i} cx={f(x + Math.cos(an) * r * 0.38)} cy={f(y + Math.sin(an) * r * 0.38)} r={f(0.004 * s)} fill={darken(a.color2 ?? a.color, 0.12)} />;
          })}
        </g>
      );
    }
    case 'cube': {
      const sz = (e.id === 'soffritto' ? 0.022 : e.id === 'feta' ? 0.05 : 0.058) * s * (0.85 + rng() * 0.3);
      const col = vary(base, rng, 0.08);
      return (
        <g key={k} transform={t}>
          <rect x={f(-sz / 2)} y={f(-sz / 2)} width={f(sz)} height={f(sz)} rx={f(sz * 0.22)} fill={col} />
          <path d={`M${f(-sz / 2 + sz * 0.15)} ${f(-sz / 2 + sz * 0.12)}h${f(sz * 0.55)}l${f(-sz * 0.12)} ${f(sz * 0.18)}h${f(-sz * 0.43)}Z`} fill="#fff" opacity={0.25} />
        </g>
      );
    }
    case 'strip': {
      const l = 0.19 * s * (0.8 + rng() * 0.4);
      const w = 0.048 * s;
      const col = vary(base, rng, 0.06);
      return (
        <g key={k} transform={t}>
          <rect x={f(-l / 2)} y={f(-w / 2)} width={f(l)} height={f(w)} rx={f(w / 2)} fill={col} />
          {e.id === 'verdure-grigliate' ? (
            [-0.3, 0, 0.3].map((p, i) => (
              <line key={i} x1={f(l * p - w * 0.3)} y1={f(-w * 0.4)} x2={f(l * p + w * 0.3)} y2={f(w * 0.4)} stroke={a.color2} strokeWidth={f(0.008 * s)} strokeLinecap="round" opacity={0.55} />
            ))
          ) : (
            <rect x={f(-l * 0.38)} y={f(-w * 0.32)} width={f(l * 0.55)} height={f(w * 0.18)} rx={f(w * 0.09)} fill="#fff" opacity={0.3} />
          )}
        </g>
      );
    }
    case 'pod': {
      const l = 0.19 * s * (0.8 + rng() * 0.35);
      const bend = (rng() - 0.5) * 0.06 * s;
      return (
        <g key={k} transform={t}>
          <path d={`M${f(-l / 2)} 0Q0 ${f(bend)} ${f(l / 2)} 0`} stroke={vary(a.color, rng, 0.08)} strokeWidth={f(0.024 * s)} strokeLinecap="round" fill="none" />
          <path d={`M${f(-l * 0.4)} ${f(-0.005 * s)}Q0 ${f(bend - 0.006 * s)} ${f(l * 0.35)} ${f(-0.005 * s)}`} stroke="#fff" strokeWidth={f(0.005 * s)} strokeLinecap="round" fill="none" opacity={0.25} />
        </g>
      );
    }
    case 'round': {
      const [rx, ry] = ROUND_R[e.id] ?? [0.034, 0.034];
      const k2 = 0.88 + rng() * 0.24;
      const col = vary(base, rng, 0.08);
      return (
        <g key={k} transform={t}>
          <ellipse rx={f(rx * s * k2)} ry={f(ry * s * k2)} fill={col} />
          {e.id === 'borlotti' && (
            <>
              <ellipse cx={f(-rx * s * 0.3)} cy={f(-ry * s * 0.1)} rx={f(rx * s * 0.25)} ry={f(ry * s * 0.15)} fill={a.color2} opacity={0.75} />
              <ellipse cx={f(rx * s * 0.35)} cy={f(ry * s * 0.25)} rx={f(rx * s * 0.2)} ry={f(ry * s * 0.12)} fill={a.color2} opacity={0.75} />
            </>
          )}
          {e.id === 'pomodorini' && rng() < 0.45 && (
            <path d={`M0 ${f(-ry * s * 0.15)}l${f(0.012 * s)} ${f(-0.012 * s)}M0 ${f(-ry * s * 0.15)}l${f(-0.013 * s)} ${f(-0.01 * s)}M0 ${f(-ry * s * 0.15)}l0 ${f(-0.018 * s)}`} stroke="#4E7A2E" strokeWidth={f(0.007 * s)} strokeLinecap="round" />
          )}
          <ellipse cx={f(-rx * s * 0.35)} cy={f(-ry * s * 0.38)} rx={f(rx * s * 0.32)} ry={f(ry * s * 0.22)} fill="#fff" opacity={e.id === 'pomodorini' || e.id === 'frutti-bosco' ? 0.38 : 0.22} />
        </g>
      );
    }
    case 'ring': {
      const r = 0.05 * s * (0.8 + rng() * 0.4);
      return (
        <g key={k}>
          <circle cx={f(x)} cy={f(y)} r={f(r)} fill="none" stroke={a.color} strokeWidth={f(0.012 * s)} />
          <circle cx={f(x)} cy={f(y)} r={f(r * 0.68)} fill="none" stroke={a.color2} strokeWidth={f(0.008 * s)} opacity={0.8} />
        </g>
      );
    }
    case 'wedge': {
      const citrus = e.id === 'arancia' || e.id === 'clementine' || e.id === 'limone';
      const r = (e.id === 'clementine' ? 0.085 : e.id === 'limone' ? 0.075 : 0.13) * s;
      const half = citrus ? 0.42 : 0.36;
      const p0 = [Math.cos(-half) * r, Math.sin(-half) * r];
      const p1 = [Math.cos(half) * r, Math.sin(half) * r];
      const d = `M0 0L${f(p0[0])} ${f(p0[1])}A${f(r)} ${f(r)} 0 0 1 ${f(p1[0])} ${f(p1[1])}Z`;
      return (
        <g key={k} transform={t}>
          <path d={d} fill={a.color2} />
          <path d={`M${f(p0[0])} ${f(p0[1])}A${f(r)} ${f(r)} 0 0 1 ${f(p1[0])} ${f(p1[1])}`} fill="none" stroke={a.color} strokeWidth={f((citrus ? 0.018 : 0.014) * s)} strokeLinecap="round" />
          {citrus ? (
            <path d={`M${f(r * 0.15)} 0L${f(r * 0.82)} 0`} stroke={lighten(a.color2 ?? a.color, 0.4)} strokeWidth={f(0.004 * s)} opacity={0.8} />
          ) : (
            <ellipse cx={f(r * 0.28)} cy={0} rx={f(0.01 * s)} ry={f(0.005 * s)} fill="#5A3A22" opacity={0.75} />
          )}
        </g>
      );
    }
    case 'nut': {
      if (e.id === 'mandorle') {
        const l = 0.058 * s;
        return (
          <g key={k} transform={t}>
            <path d={`M${f(-l / 2)} 0Q${f(-l * 0.1)} ${f(-l * 0.36)} ${f(l / 2)} 0Q${f(-l * 0.1)} ${f(l * 0.36)} ${f(-l / 2)} 0Z`} fill={vary(a.color, rng, 0.08)} />
            <path d={`M${f(-l * 0.3)} 0Q0 ${f(-l * 0.08)} ${f(l * 0.32)} 0`} stroke={darken(a.color, 0.2)} strokeWidth={f(0.004 * s)} fill="none" opacity={0.6} />
          </g>
        );
      }
      if (e.id === 'datteri') {
        return (
          <g key={k} transform={t}>
            <ellipse rx={f(0.05 * s)} ry={f(0.024 * s)} fill={vary(a.color, rng, 0.06)} />
            <ellipse cx={f(-0.012 * s)} cy={f(-0.009 * s)} rx={f(0.02 * s)} ry={f(0.006 * s)} fill="#fff" opacity={0.22} />
          </g>
        );
      }
      if (e.id === 'noci') {
        const r = 0.036 * s;
        return (
          <g key={k}>
            <path d={blobPath(x, y, r, rng, 7, 0.35)} fill={vary(a.color, rng, 0.08)} />
            <path d={`M${f(x - r * 0.5)} ${f(y)}q${f(r * 0.25)} ${f(-r * 0.4)} ${f(r * 0.5)} 0t${f(r * 0.5)} 0`} stroke={a.color2} strokeWidth={f(0.006 * s)} fill="none" opacity={0.7} />
          </g>
        );
      }
      const r = 0.032 * s;
      return (
        <g key={k}>
          <circle cx={f(x)} cy={f(y)} r={f(r)} fill={vary(a.color, rng, 0.08)} />
          <circle cx={f(x - r * 0.3)} cy={f(y - r * 0.3)} r={f(r * 0.3)} fill="#fff" opacity={0.25} />
        </g>
      );
    }
    case 'flaky': {
      const r = 0.048 * s;
      return (
        <g key={k}>
          <path d={blobPath(x, y, r, rng, 7, 0.45)} fill={vary(a.color, rng, 0.08)} />
          <path d={`M${f(x - r * 0.4)} ${f(y - r * 0.1)}l${f(r * 0.7)} ${f(r * 0.25)}`} stroke={a.color2} strokeWidth={f(0.006 * s)} strokeLinecap="round" opacity={0.7} />
        </g>
      );
    }
    case 'shrimp': {
      const r = 0.042 * s;
      const col = vary(a.color, rng, 0.06);
      return (
        <g key={k} transform={t}>
          <path d={`M${f(-r)} 0A${f(r)} ${f(r)} 0 1 1 ${f(r * 0.3)} ${f(r * 0.95)}`} fill="none" stroke={col} strokeWidth={f(0.042 * s)} strokeLinecap="round" />
          <path d={`M${f(-r * 0.9)} ${f(-r * 0.25)}A${f(r * 0.85)} ${f(r * 0.85)} 0 0 1 ${f(r * 0.2)} ${f(-r * 0.86)}`} fill="none" stroke={a.color2} strokeWidth={f(0.01 * s)} strokeLinecap="round" opacity={0.85} />
        </g>
      );
    }
    case 'square': {
      const sz = 0.06 * s;
      return (
        <g key={k} transform={t}>
          <rect x={f(-sz / 2)} y={f(-sz / 2)} width={f(sz)} height={f(sz)} rx={f(sz * 0.12)} fill={a.color} />
          <rect x={f(-sz * 0.32)} y={f(-sz * 0.32)} width={f(sz * 0.64)} height={f(sz * 0.64)} rx={f(sz * 0.08)} fill="none" stroke={lighten(a.color, 0.15)} strokeWidth={f(0.004 * s)} />
        </g>
      );
    }
    case 'speck': {
      if (e.id === 'grana') {
        return <path key={k} d={blobPath(x, y, 0.013 * s, rng, 5, 0.6)} fill={vary(a.color, rng, 0.08)} />;
      }
      if (e.id === 'rosmarino') {
        return <line key={k} x1={f(x)} y1={f(y)} x2={f(x + Math.cos(rot) * 0.03 * s)} y2={f(y + Math.sin(rot) * 0.03 * s)} stroke={a.color} strokeWidth={f(0.006 * s)} strokeLinecap="round" />;
      }
      return <circle key={k} cx={f(x)} cy={f(y)} r={f((e.id === 'sale' ? 0.005 : 0.0065) * s * (0.7 + rng() * 0.6))} fill={vary(a.color, rng, 0.1)} opacity={e.id === 'sale' ? 0.8 : 0.9} />;
    }
    default:
      return <circle key={k} cx={f(x)} cy={f(y)} r={f(0.03 * s)} fill={base} />;
  }
}

// Pezzi grandi: fette, filetti, pane.

function slab(e: ArtEntry, x: number, y: number, rot: number, s: number, rng: Rng, k: string): ReactNode {
  const w = 0.27 * s;
  const h = 0.13 * s;
  const a = e.art;
  const beef = e.id === 'manzo';
  const col = vary(a.color, rng, 0.04);
  const d = `M${f(-w / 2)} ${f(-h * 0.32)}Q${f(-w / 2)} ${f(-h / 2)} ${f(-w * 0.36)} ${f(-h / 2)}L${f(w * 0.38)} ${f(-h * 0.46)}Q${f(w / 2)} ${f(-h * 0.42)} ${f(w / 2)} ${f(-h * 0.2)}L${f(w * 0.48)} ${f(h * 0.3)}Q${f(w * 0.46)} ${f(h / 2)} ${f(w * 0.32)} ${f(h / 2)}L${f(-w * 0.38)} ${f(h * 0.46)}Q${f(-w / 2)} ${f(h * 0.44)} ${f(-w / 2)} ${f(h * 0.26)}Z`;
  return (
    <g key={k} transform={`translate(${f(x)} ${f(y)}) rotate(${deg(rot)})`}>
      <path d={d} fill={col} stroke={a.color2} strokeWidth={f(0.008 * s)} strokeOpacity={beef ? 0 : 0.45} />
      {beef ? (
        <path d={d} transform="scale(0.8)" fill={a.color2} opacity={0.9} />
      ) : (
        [-0.3, -0.06, 0.18].map((p, i) => (
          <line key={i} x1={f(w * p - 0.02 * s)} y1={f(-h * 0.32)} x2={f(w * p + 0.03 * s)} y2={f(h * 0.32)} stroke={a.color2} strokeWidth={f(0.012 * s)} strokeLinecap="round" opacity={0.5} />
        ))
      )}
      <path d={`M${f(-w * 0.38)} ${f(-h * 0.34)}L${f(w * 0.25)} ${f(-h * 0.32)}`} stroke="#fff" strokeWidth={f(0.012 * s)} strokeLinecap="round" opacity={0.2} />
    </g>
  );
}

/** Pancake: disco dorato con il bordo più scuro. */
function pancake(x: number, y: number, r: number, rng: Rng, k: string): ReactNode {
  const col = vary('#D9A04E', rng, 0.05);
  return (
    <g key={k}>
      <path d={blobPath(x, y, r, rng, 12, 0.05)} fill={darken(col, 0.18)} />
      <path d={blobPath(x - r * 0.03, y - r * 0.04, r * 0.9, rng, 12, 0.05)} fill={col} />
      <ellipse cx={f(x - r * 0.1)} cy={f(y - r * 0.12)} rx={f(r * 0.5)} ry={f(r * 0.42)} fill={lighten(col, 0.18)} opacity={0.7} />
    </g>
  );
}

/** Frittata: disco giallo con dorature e pezzetti di verdura. */
function frittata(x: number, y: number, r: number, veg: string | undefined, s: number, rng: Rng, k: string): ReactNode {
  const col = '#EBC25A';
  return (
    <g key={k}>
      <path d={blobPath(x, y, r, rng, 12, 0.06)} fill={darken(col, 0.12)} />
      <path d={blobPath(x, y, r * 0.93, rng, 12, 0.06)} fill={col} />
      {Array.from({ length: Math.round(10 * (r / 0.3)) }, (_, i) => {
        const an = rng() * TAU;
        const rr = Math.sqrt(rng()) * r * 0.8;
        return <circle key={`b${i}`} cx={f(x + Math.cos(an) * rr)} cy={f(y + Math.sin(an) * rr)} r={f((0.012 + rng() * 0.014) * s)} fill="#C98E35" opacity={0.45} />;
      })}
      {veg &&
        Array.from({ length: Math.round(9 * (r / 0.3)) }, (_, i) => {
          const an = rng() * TAU;
          const rr = Math.sqrt(rng()) * r * 0.78;
          return <path key={`v${i}`} d={blobPath(x + Math.cos(an) * rr, y + Math.sin(an) * rr, 0.016 * s, rng, 5, 0.5)} fill={veg} opacity={0.9} />;
        })}
    </g>
  );
}

/** Mezzo panino: pane con il ripieno che si vede sul taglio. */
function sandwichHalf(e: ArtEntry, x: number, y: number, rot: number, s: number, rng: Rng, k: string, filling: string[]): ReactNode {
  const a = e.art;
  const w = 0.56 * s;
  const h = 0.38 * s;
  return (
    <g key={k} transform={`translate(${f(x)} ${f(y)}) rotate(${deg(rot)})`}>
      {filling.slice(0, 3).map((c, i) => (
        <path key={i} d={wavePath(w * 0.96, 0.014 * s, 4, rng)} transform={`translate(0 ${f(h / 2 - 0.004 * s + i * 0.02 * s)})`} stroke={c} strokeWidth={f(0.04 * s)} fill="none" strokeLinecap="round" />
      ))}
      <rect x={f(-w / 2)} y={f(-h / 2)} width={f(w)} height={f(h)} rx={f(h * 0.32)} fill={a.color} />
      <rect x={f(-w / 2 + 0.026 * s)} y={f(-h / 2 + 0.026 * s)} width={f(w - 0.052 * s)} height={f(h - 0.052 * s)} rx={f(h * 0.24)} fill={a.color2 ?? lighten(a.color, 0.2)} />
      {Array.from({ length: 12 }, (_, i) => (
        <ellipse key={i} cx={f((rng() - 0.5) * w * 0.75)} cy={f((rng() - 0.5) * h * 0.6)} rx={f(0.008 * s)} ry={f(0.005 * s)} fill={darken(a.color2 ?? a.color, 0.2)} opacity={0.55} />
      ))}
    </g>
  );
}

/** Barretta di avena con datteri e mandorle. */
function bar(x: number, y: number, rot: number, s: number, rng: Rng, k: string): ReactNode {
  const w = 0.3 * s;
  const h = 0.11 * s;
  return (
    <g key={k} transform={`translate(${f(x)} ${f(y)}) rotate(${deg(rot)})`}>
      <rect x={f(-w / 2)} y={f(-h / 2)} width={f(w)} height={f(h)} rx={f(0.02 * s)} fill="#B88A55" />
      {Array.from({ length: 14 }, (_, i) => (
        <path key={i} d={blobPath((rng() - 0.5) * w * 0.85, (rng() - 0.5) * h * 0.7, 0.012 * s, rng, 5, 0.5)} fill={pick(['#E3CFA2', '#6E4224', '#C99A64', '#E8D3AE'], rng)} />
      ))}
    </g>
  );
}

/** Nido di spaghetti. */
function strands(e: ArtEntry, cx: number, cy: number, r: number, s: number, rng: Rng, k: string): ReactNode {
  const col = e.art.color;
  return (
    <g key={k} fill="none" strokeLinecap="round">
      {Array.from({ length: 48 }, (_, i) => {
        const a0 = rng() * TAU;
        const r0 = r * (0.2 + rng() * 0.75);
        const sweep = 1.2 + rng() * 1.8;
        const p0 = [cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0];
        const p1 = [cx + Math.cos(a0 + sweep / 2) * r0 * (1.2 + rng() * 0.3), cy + Math.sin(a0 + sweep / 2) * r0 * (1.2 + rng() * 0.3)];
        const p2 = [cx + Math.cos(a0 + sweep) * r0 * (0.8 + rng() * 0.3), cy + Math.sin(a0 + sweep) * r0 * (0.8 + rng() * 0.3)];
        return <path key={i} d={`M${f(p0[0])} ${f(p0[1])}Q${f(p1[0])} ${f(p1[1])} ${f(p2[0])} ${f(p2[1])}`} stroke={i % 5 === 0 ? lighten(col, 0.18) : vary(col, rng, 0.1)} strokeWidth={f(0.014 * s)} />;
      })}
    </g>
  );
}

/** Uovo cotto nel pomodoro o in padella: albume e tuorlo. */
function friedEgg(x: number, y: number, s: number, rng: Rng, k: string): ReactNode {
  const r = 0.15 * s;
  return (
    <g key={k}>
      <path d={blobPath(x, y, r, rng, 10, 0.22)} fill="#FBF7EC" />
      <circle cx={f(x + r * 0.08)} cy={f(y - r * 0.05)} r={f(r * 0.38)} fill="#F2B02E" />
      <circle cx={f(x - r * 0.02)} cy={f(y - r * 0.16)} r={f(r * 0.12)} fill="#fff" opacity={0.55} />
    </g>
  );
}

function fillet(e: ArtEntry, x: number, y: number, rot: number, s: number, rng: Rng, k: string): ReactNode {
  const w = 0.6 * s * clamp(Math.sqrt(e.grams / 110), 0.8, 1.2);
  const h = 0.27 * s * clamp(Math.sqrt(e.grams / 110), 0.85, 1.12);
  const a = e.art;
  const d = `M${f(-w / 2)} ${f(-h * 0.3)}Q${f(-w / 2)} ${f(-h / 2)} ${f(-w * 0.3)} ${f(-h / 2)}L${f(w * 0.22)} ${f(-h * 0.44)}Q${f(w / 2)} ${f(-h * 0.32)} ${f(w / 2)} 0Q${f(w / 2)} ${f(h * 0.32)} ${f(w * 0.22)} ${f(h * 0.44)}L${f(-w * 0.3)} ${f(h / 2)}Q${f(-w / 2)} ${f(h / 2)} ${f(-w / 2)} ${f(h * 0.3)}Z`;
  const salmon = e.id === 'salmone';
  return (
    <g key={k} transform={`translate(${f(x)} ${f(y)}) rotate(${deg(rot)})`}>
      <path d={d} fill={vary(a.color, rng, 0.03)} />
      {[-0.28, -0.08, 0.12, 0.3].map((p, i) => (
        <path
          key={i}
          d={`M${f(w * p)} ${f(-h * 0.42)}Q${f(w * p + h * 0.25)} 0 ${f(w * p)} ${f(h * 0.42)}`}
          stroke={a.color2}
          strokeWidth={f((salmon ? 0.012 : 0.008) * s)}
          fill="none"
          strokeLinecap="round"
          opacity={salmon ? 0.75 : 0.6}
        />
      ))}
      <path d={`M${f(-w * 0.36)} ${f(-h * 0.36)}L${f(w * 0.18)} ${f(-h * 0.34)}`} stroke="#fff" strokeWidth={f(0.012 * s)} strokeLinecap="round" opacity={0.22} />
    </g>
  );
}

function folded(e: ArtEntry, x: number, y: number, rot: number, s: number, rng: Rng, k: string): ReactNode {
  const a = e.art;
  const rx = 0.13 * s;
  const ry = 0.09 * s;
  return (
    <g key={k} transform={`translate(${f(x)} ${f(y)}) rotate(${deg(rot)})`}>
      <path d={blobPath(0, 0, rx, rng, 8, 0.15, 1, ry / rx)} fill={vary(a.color, rng, 0.05)} />
      <path d={`M${f(-rx * 0.8)} ${f(ry * 0.1)}Q0 ${f(-ry * 0.9)} ${f(rx * 0.8)} ${f(ry * 0.1)}`} stroke={a.color2} strokeWidth={f(0.012 * s)} fill="none" opacity={0.7} strokeLinecap="round" />
    </g>
  );
}

function bread(e: ArtEntry, x: number, y: number, rot: number, s: number, rng: Rng, k: string): ReactNode {
  const a = e.art;
  const w = 0.46 * s;
  const h = 0.42 * s;
  const shape = (sc: number) =>
    `M${f((-w / 2) * sc)} ${f((h / 2) * sc)}L${f((-w / 2) * sc)} ${f(-h * 0.12 * sc)}Q${f((-w / 2) * sc)} ${f((-h / 2) * sc)} ${f(-w * 0.22 * sc)} ${f((-h / 2) * sc)}Q0 ${f(-h * 0.6 * sc)} ${f(w * 0.22 * sc)} ${f((-h / 2) * sc)}Q${f((w / 2) * sc)} ${f((-h / 2) * sc)} ${f((w / 2) * sc)} ${f(-h * 0.12 * sc)}L${f((w / 2) * sc)} ${f((h / 2) * sc)}Q${f((w / 2) * sc)} ${f(h * 0.56 * sc)} ${f(w * 0.4 * sc)} ${f(h * 0.56 * sc)}L${f(-w * 0.4 * sc)} ${f(h * 0.56 * sc)}Q${f((-w / 2) * sc)} ${f(h * 0.56 * sc)} ${f((-w / 2) * sc)} ${f((h / 2) * sc)}Z`;
  return (
    <g key={k} transform={`translate(${f(x)} ${f(y)}) rotate(${deg(rot)})`}>
      <path d={shape(1)} fill={a.color} />
      <path d={shape(0.84)} fill={a.color2} />
      {Array.from({ length: 9 }, (_, i) => (
        <ellipse key={i} cx={f((rng() - 0.5) * w * 0.65)} cy={f((rng() - 0.5) * h * 0.6)} rx={f(0.008 * s)} ry={f(0.005 * s)} fill={darken(a.color2 ?? a.color, 0.18)} opacity={0.55} />
      ))}
    </g>
  );
}

function cracker(e: ArtEntry, x: number, y: number, rot: number, s: number, rng: Rng, k: string): ReactNode {
  const a = e.art;
  const biscotto = e.id === 'fette-biscottate';
  const w = (biscotto ? 0.34 : 0.3) * s;
  const h = (biscotto ? 0.27 : 0.21) * s;
  return (
    <g key={k} transform={`translate(${f(x)} ${f(y)}) rotate(${deg(rot)})`}>
      <rect x={f(-w / 2)} y={f(-h / 2)} width={f(w)} height={f(h)} rx={f((biscotto ? 0.04 : 0.016) * s)} fill={vary(a.color, rng, 0.04)} />
      <rect x={f(-w / 2 + 0.012 * s)} y={f(-h / 2 + 0.012 * s)} width={f(w - 0.024 * s)} height={f(h - 0.024 * s)} rx={f(0.012 * s)} fill={lighten(a.color, 0.12)} />
      {Array.from({ length: biscotto ? 0 : 6 }, (_, i) => (
        <circle key={i} cx={f(-w * 0.3 + (i % 3) * w * 0.3)} cy={f(i < 3 ? -h * 0.18 : h * 0.18)} r={f(0.006 * s)} fill={a.color2} opacity={0.8} />
      ))}
    </g>
  );
}

function disc(e: ArtEntry, x: number, y: number, s: number, rng: Rng, k: string): ReactNode {
  const a = e.art;
  const r = 0.16 * s;
  return (
    <g key={k}>
      <circle cx={f(x)} cy={f(y)} r={f(r)} fill={vary(a.color, rng, 0.03)} stroke={a.color2} strokeWidth={f(0.006 * s)} />
      {Array.from({ length: 16 }, (_, i) => {
        const an = rng() * TAU;
        const rr = Math.sqrt(rng()) * r * 0.85;
        return <ellipse key={i} cx={f(x + Math.cos(an) * rr)} cy={f(y + Math.sin(an) * rr)} rx={f(0.014 * s)} ry={f(0.008 * s)} transform={`rotate(${deg(an)} ${f(x + Math.cos(an) * rr)} ${f(y + Math.sin(an) * rr)})`} fill={a.color2} opacity={0.45} />;
      })}
    </g>
  );
}

function flatbread(e: ArtEntry, x: number, y: number, rot: number, s: number, rng: Rng, k: string, filling: string[]): ReactNode {
  const a = e.art;
  const r = 0.4 * s;
  return (
    <g key={k} transform={`translate(${f(x)} ${f(y)}) rotate(${deg(rot)})`}>
      {filling.slice(0, 3).map((c, i) => (
        <path key={i} d={wavePath(r * 1.7, 0.012 * s, 5, rng)} transform={`translate(0 ${f(0.012 * s + i * 0.012 * s)})`} stroke={c} strokeWidth={f(0.03 * s)} fill="none" strokeLinecap="round" />
      ))}
      <path d={`M${f(-r)} 0A${f(r)} ${f(r)} 0 0 1 ${f(r)} 0Z`} fill={a.color} />
      {Array.from({ length: 14 }, (_, i) => {
        const an = Math.PI + rng() * Math.PI;
        const rr = Math.sqrt(rng()) * r * 0.85;
        return <circle key={i} cx={f(Math.cos(an) * rr)} cy={f(Math.sin(an) * rr)} r={f((0.008 + rng() * 0.012) * s)} fill={a.color2} opacity={0.45} />;
      })}
    </g>
  );
}

function dollop(e: ArtEntry, x: number, y: number, r: number, rng: Rng, k: string): ReactNode {
  const a = e.art;
  return (
    <g key={k}>
      <path d={blobPath(x, y, r, rng, 9, 0.18)} fill={a.color} />
      <path d={blobPath(x + r * 0.08, y + r * 0.06, r * 0.62, rng, 7, 0.2)} fill={a.color2 ?? darken(a.color, 0.06)} opacity={0.5} />
      <path
        d={`M${f(x - r * 0.45)} ${f(y - r * 0.15)}A${f(r * 0.5)} ${f(r * 0.45)} 0 0 1 ${f(x + r * 0.35)} ${f(y - r * 0.4)}`}
        stroke="#fff"
        strokeWidth={f(r * 0.12)}
        fill="none"
        strokeLinecap="round"
        opacity={a.color === '#B5323C' ? 0.35 : 0.65}
      />
    </g>
  );
}

function drizzle(e: ArtEntry, x: number, y: number, rot: number, len: number, s: number, rng: Rng, k: string): ReactNode {
  const a = e.art;
  if (e.id === 'olio-evo' || e.id === 'salsa-soia' || e.id === 'aceto-balsamico') {
    // Olio, aceto e salsa di soia: riflessi e goccioline, non un filo.
    const n = e.id === 'olio-evo' ? 7 : 5;
    return (
      <g key={k}>
        {Array.from({ length: n }, (_, i) => {
          const an = rng() * TAU;
          const rr = Math.sqrt(rng()) * len * 0.42;
          const px = x + Math.cos(an) * rr;
          const py = y + Math.sin(an) * rr;
          const r = (0.012 + rng() * 0.016) * s;
          return (
            <g key={i}>
              <ellipse cx={f(px)} cy={f(py)} rx={f(r * 1.4)} ry={f(r)} transform={`rotate(${deg(an)} ${f(px)} ${f(py)})`} fill={a.color} opacity={e.id === 'olio-evo' ? 0.38 : 0.7} />
              <circle cx={f(px - r * 0.4)} cy={f(py - r * 0.3)} r={f(r * 0.32)} fill="#fff" opacity={0.45} />
            </g>
          );
        })}
      </g>
    );
  }
  // Miele, crema di arachidi, aceto: un filo sottile che attraversa il piatto avanti e indietro.
  const thick = e.id === 'burro-arachidi' ? 0.014 : e.id === 'miele' ? 0.011 : 0.008;
  const passes = 4 + Math.floor(rng() * 2);
  const step = (len * 0.42) / passes;
  let d = '';
  let px = -len / 2;
  let py = -step * (passes / 2);
  for (let i = 0; i <= passes; i++) {
    const nx = (i % 2 ? len / 2 : -len / 2) * (0.75 + rng() * 0.25);
    const ny = -step * (passes / 2) + i * step + (rng() - 0.5) * step * 0.4;
    if (i === 0) d = `M${f(nx)} ${f(ny)}`;
    else d += `C${f(px + (nx - px) * 0.35)} ${f(py + step * 0.9)} ${f(px + (nx - px) * 0.65)} ${f(ny - step * 0.9)} ${f(nx)} ${f(ny)}`;
    px = nx;
    py = ny;
  }
  return (
    <g key={k} transform={`translate(${f(x)} ${f(y)}) rotate(${deg(rot)})`}>
      <path d={d} stroke={darken(a.color, 0.1)} strokeWidth={f(thick * s)} fill="none" strokeLinecap="round" opacity={0.92} />
      <path d={d} transform={`translate(${f(-0.002 * s)} ${f(-0.002 * s)})`} stroke={lighten(a.color, 0.3)} strokeWidth={f(thick * 0.35 * s)} fill="none" strokeLinecap="round" opacity={0.55} />
    </g>
  );
}

// ───────────────────────── Campionamento ─────────────────────────

interface Region {
  /** True se il punto (coordinate del piatto) appartiene alla regione. */
  has: (x: number, y: number) => boolean;
  /** Punto casuale (anche fuori: viene filtrato da `has`). */
  sample: (rng: Rng) => [number, number];
}

function bandRegion(phi: number, u0: number, u1: number, rMax: number): Region {
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  return {
    has: (x, y) => {
      const u = x * cos + y * sin;
      return u >= u0 && u <= u1 && Math.hypot(x, y) <= rMax;
    },
    sample: (rng) => {
      const u = u0 + rng() * (u1 - u0);
      const v = (rng() * 2 - 1) * rMax;
      return [u * cos - v * sin, u * sin + v * cos];
    },
  };
}

function discRegion(cx: number, cy: number, r: number, rMax = 1): Region {
  return {
    has: (x, y) => Math.hypot(x - cx, y - cy) <= r && Math.hypot(x, y) <= rMax,
    sample: (rng) => {
      const a = rng() * TAU;
      const rr = Math.sqrt(rng()) * r;
      return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    },
  };
}

/** Punti ben distribuiti (lancio di freccette con distanza minima). */
function scatter(region: Region, count: number, minDist: number, rng: Rng): [number, number][] {
  const out: [number, number][] = [];
  const tries = count * 14;
  for (let i = 0; i < tries && out.length < count; i++) {
    const [x, y] = region.sample(rng);
    if (!region.has(x, y)) continue;
    let ok = true;
    for (const p of out) {
      if ((p[0] - x) ** 2 + (p[1] - y) ** 2 < minDist * minDist) {
        ok = false;
        break;
      }
    }
    if (ok) out.push([x, y]);
  }
  return out;
}

/** Quanto coprono i pezzi di ogni forma (sovrapposizioni comprese). */
const COVERAGE: Partial<Record<FoodArt['shape'], number>> = {
  rice: 1.25,
  grain: 1.1,
  pasta: 0.95,
  flakes: 1,
  leaf: 1.05,
  floret: 0.85,
  clump: 0.9,
  coin: 0.75,
  cube: 0.7,
  strip: 0.6,
  pod: 0.55,
  round: 0.8,
  ring: 0.5,
  wedge: 0.55,
  nut: 0.5,
  scramble: 0.95,
  flaky: 0.9,
  shrimp: 0.6,
  square: 0.4,
};

const MAX_PIECES: Partial<Record<FoodArt['shape'], number>> = {
  rice: 200,
  grain: 170,
  pasta: 46,
  flakes: 90,
  leaf: 22,
  floret: 9,
  clump: 9,
  coin: 12,
  cube: 22,
  strip: 9,
  pod: 14,
  round: 40,
  ring: 7,
  wedge: 6,
  nut: 12,
  scramble: 12,
  flaky: 16,
  shrimp: 9,
  square: 4,
};

function fillRegion(e: ArtEntry, region: Region, area: number, s: number, rng: Rng, key: string, density = 1): ReactNode[] {
  const size = pieceSize(e) * s;
  const cov = COVERAGE[e.art.shape] ?? 0.7;
  const max = MAX_PIECES[e.art.shape] ?? 20;
  let n = Math.round((cov * area * density) / (Math.PI * size * size));
  if (e.art.shape === 'wedge' && e.art.role === 'fruit') n = Math.min(n, Math.max(2, Math.round(e.qty * 4)));
  n = clamp(n, 1, max);
  const spacing =
    e.art.shape === 'rice' || e.art.shape === 'grain' ? 0.95 : e.art.shape === 'leaf' || e.art.shape === 'scramble' ? 0.7 : e.art.shape === 'coin' ? 1.05 : 1.15;
  const pts = scatter(region, n, size * spacing, rng);
  return pts.map(([x, y], i) => drawPiece({ x, y, s, rot: rng() * TAU, rng, e, k: `${key}-${i}` }));
}

// ───────────────────────── Composizione ─────────────────────────

export interface Composition {
  kind: DishKind;
  /** Colore del fondo della ciotola o della zuppa. */
  fill?: string;
  /** Elementi del cibo, in coordinate del piatto. */
  food: ReactNode[];
  /** Bevanda accanto al piatto (latte, caffellatte, kefir, frullato). */
  cup?: { color: string; foam?: string };
  /** Frutto intero servito accanto. */
  side?: ArtEntry;
  /** Pane o fette biscottate serviti accanto alla ciotola. */
  sideBread?: ArtEntry;
}

export interface ComposeOptions {
  /** 'hero' per l'illustrazione grande, 'thumb' per le miniature. */
  variant: 'hero' | 'thumb';
}

/** Piatti riconoscibili dal nome, disegnati in modo specifico. */
interface DishStyle {
  pancake: boolean;
  frittata: 'grande' | 'piccole' | null;
  sandwich: boolean;
  bars: boolean;
  spaghetti: boolean;
  eggsInSauce: boolean;
  smoothie: boolean;
}

function dishStyle(recipe: Recipe): DishStyle {
  const n = recipe.name.toLowerCase();
  return {
    pancake: n.includes('pancake'),
    frittata: n.includes('frittatine') ? 'piccole' : n.includes('frittata') ? 'grande' : null,
    sandwich: n.includes('panino'),
    bars: n.includes('barrette'),
    spaghetti: n.includes('spaghetti'),
    eggsInSauce: n.includes('uova al pomodoro'),
    smoothie: n.includes('frullato'),
  };
}

const ROLE_ORDER: FoodArt['role'][] = ['base', 'legume', 'veg', 'fruit', 'dairy', 'bread', 'protein'];
const ROLE_BOOST: Partial<Record<FoodArt['role'], number>> = { base: 1.3, protein: 1.15, bread: 1.1, veg: 1, legume: 0.9, fruit: 0.85, dairy: 0.85 };

const isTopping = (e: ArtEntry) =>
  e.art.role === 'topping' || e.art.shape === 'speck' || e.art.shape === 'drizzle' || e.art.role === 'sauce' || e.art.role === 'liquid';

/** Area approssimata dell'intersezione tra un disco e il piatto. */
function clusterArea(cx: number, cy: number, r: number, R: number): number {
  const d = Math.hypot(cx, cy);
  const inside = d + r <= R ? 1 : clamp((R - (d - r)) / (2 * r), 0.35, 1);
  return Math.PI * r * r * inside;
}

export function composeDish(recipe: Recipe, dayType: DayType, opts: ComposeOptions): Composition {
  const hero = opts.variant === 'hero';
  const rng = seeded(hashString(`${recipe.id}:${opts.variant}`));
  /** Scala dei pezzi piccoli e di quelli grandi (fette, pane): le miniature hanno pezzi più grossi e meno numerosi. */
  const s = hero ? 1.55 : 2.5;
  const bs = hero ? 1.2 : 1.45;
  const density = hero ? 1 : 0.85;
  const style = dishStyle(recipe);
  let entries = artEntries(recipe, dayType);

  // Uova e albume insieme: un solo strapazzato, giallo chiaro.
  const egg = entries.find((e) => e.id === 'uova');
  const white = entries.find((e) => e.id === 'albume');
  if (egg && white) {
    entries = entries.filter((e) => e !== white);
    egg.grams += white.grams;
    egg.art = { ...egg.art, color: mix(egg.art.color, white.art.color, 0.35) };
  }

  const soupByName = /vellutata|minestrone|zuppa|passato/i.test(recipe.name);
  let kind: DishKind = style.pancake || style.frittata || style.sandwich || style.bars ? 'plate' : dishKind(entries);
  if (soupByName && kind === 'plate') kind = 'soup';
  const food: ReactNode[] = [];
  const R = 0.76;

  const liquid = entries.find((e) => e.art.role === 'liquid');
  let cup: Composition['cup'];
  const flakesInBowl = kind === 'bowl' && entries.some((e) => e.art.shape === 'flakes' && e.art.role === 'base');
  if (liquid && kind !== 'soup' && !flakesInBowl) {
    const coffee = /caff|cappuccino/i.test(recipe.name);
    cup = coffee
      ? { color: '#B98A62', foam: '#E9D8C2' }
      : style.smoothie
        ? { color: '#EFDC9C', foam: '#F6EBC4' }
        : { color: liquid.art.color, foam: liquid.art.color2 };
  }

  let side: ArtEntry | undefined;
  let pool = entries.filter((e) => e.art.role !== 'liquid');
  if (style.smoothie) pool = pool.filter((e) => e.id !== 'banana');
  if (hero && kind === 'plate') {
    const fruit = pool.find((e) => e.art.whole && e.unit === 'pezzo' && e.qty >= 1);
    const majors = pool.filter((e) => !isTopping(e));
    if (fruit && majors.length > 1) side = fruit;
  }
  const onDish = pool.filter((e) => e !== side);

  // ── Zuppa ──
  if (kind === 'soup') {
    // Zuppa pronta (minestrone, vellutata) oppure fatta in casa: il colore viene dalla verdura principale.
    let soup = onDish.find((e) => e.art.shape === 'soup' && e.art.role !== 'sauce');
    if (!soup) {
      const veg = onDish.filter((e) => (e.art.role === 'veg' || e.art.role === 'legume') && !isTopping(e)).sort((a, b) => b.grams - a.grams);
      const main = veg[0];
      const second = veg[1];
      const color = main ? (second ? mix(main.art.color, second.art.color, 0.3) : main.art.color) : '#D9A35A';
      soup = { id: 'zuppa', grams: 250, qty: 1, unit: 'g', art: { shape: 'soup', role: 'veg', color, color2: darken(color, 0.15) } };
      onDish.splice(0, onDish.length, ...onDish.filter((e) => !veg.slice(0, 2).includes(e)), soup);
    }
    const rest = onDish.filter((e) => e !== soup);
    const fill = soup.art.color;
    if (soup.art.mix) {
      const veg: ArtEntry = { ...soup, id: 'soffritto', art: { ...soup.art, shape: 'cube', mix: soup.art.mix } };
      food.push(...fillRegion(veg, discRegion(0, 0, R * 0.95), Math.PI * R * R * 0.6, s * 0.9, rng, 'mv', density));
    }
    food.push(
      <path
        key="swirl"
        d="M0.04 -0.02C0.2 -0.14 0.34 0.06 0.2 0.22S-0.26 0.3 -0.32 0.04S-0.1 -0.44 0.28 -0.4"
        stroke={lighten(fill, 0.4)}
        strokeWidth={f(0.022 * s)}
        fill="none"
        strokeLinecap="round"
        opacity={0.5}
      />,
    );
    const solids = rest.filter((e) => !isTopping(e));
    solids.forEach((e, i) => {
      const a = rng() * TAU + i * 2.1;
      const rr = solids.length > 1 ? 0.28 : 0.05;
      if (e.art.shape === 'bread' || e.art.shape === 'cracker') {
        // Crostini sul bordo della ciotola.
        const n = clamp(Math.round(e.grams / 20), 2, 4);
        for (let j = 0; j < n; j++) {
          const an = a + j * 0.55;
          const crostino: ArtEntry = { ...e, id: 'fette-biscottate', art: { ...e.art, color: '#B9844A', color2: '#8E5E2E' } };
          food.push(cracker(crostino, Math.cos(an) * 0.42, Math.sin(an) * 0.42, an, s * 0.42, rng, `cr${i}-${j}`));
        }
        return;
      }
      food.push(...fillRegion(e, discRegion(Math.cos(a) * rr, Math.sin(a) * rr, 0.38, R * 0.92), Math.PI * 0.12, s, rng, `so${i}`, density));
    });
    pushToppings(rest.filter(isTopping), food, R, s, rng, density, null);
    return { kind, fill, food, cup, side };
  }

  // ── Ciotola: guarnizioni in strisce ──
  if (kind === 'bowl') {
    const baseDairy = onDish.filter((e) => BOWL_BASES.has(e.id)).sort((a, b) => b.grams - a.grams)[0];
    const flakes = onDish.find((e) => e.art.shape === 'flakes' && e.art.role === 'base');
    const porridge = !baseDairy && flakes;
    const cereal = porridge && flakes.id === 'fiocchi-mais';
    const cacao = onDish.find((e) => e.id === 'cacao');
    let fill = baseDairy?.art.color ?? (cereal ? '#F3EFE6' : porridge ? '#E0CB9C' : '#F2EEE4');
    if (porridge && !cereal && cacao) fill = mix(fill, cacao.art.color, 0.55);
    else if (baseDairy && cacao) fill = mix(fill, cacao.art.color, 0.4);
    const breads = onDish.filter((e) => e.art.role === 'bread');
    const toppings = onDish.filter(
      (e) => e !== baseDairy && !(porridge && !cereal && e === flakes) && !isTopping(e) && !BOWL_BASES.has(e.id) && !breads.includes(e),
    );
    if (porridge && !cereal && flakes) {
      const ghost: ArtEntry = { ...flakes, art: { ...flakes.art, color: darken(fill, 0.07), mix: undefined } };
      food.push(...fillRegion(ghost, discRegion(0, 0, R), Math.PI * R * R * 0.55, s, rng, 'pf', density));
    } else {
      food.push(
        <path
          key="sw"
          d="M0.04 -0.02C0.2 -0.14 0.34 0.06 0.2 0.22S-0.26 0.3 -0.32 0.04S-0.1 -0.44 0.28 -0.4"
          stroke={darken(fill, 0.08)}
          strokeWidth={f(0.02 * s)}
          fill="none"
          strokeLinecap="round"
          opacity={0.55}
        />,
      );
    }
    if (toppings.length) {
      // Nella ciotola le guarnizioni sono più grandi: sono loro le protagoniste.
      const sb = s * 1.22;
      const phi = -Math.PI / 2 + 0.4 + (rng() - 0.5) * 0.3;
      const ws = toppings.map((e) => Math.sqrt(Math.max(e.grams, 14)));
      const tot = ws.reduce((a, b) => a + b, 0);
      const span = Math.min(1.36, 0.42 * toppings.length + 0.3);
      let u = -span / 2 + 0.08;
      toppings.forEach((e, i) => {
        const w = (ws[i] / tot) * span;
        const region = bandRegion(phi, u, u + w, R * 0.95);
        const chord = 2 * Math.sqrt(Math.max(0, R * R - (u + w / 2) ** 2));
        if (e.art.shape === 'wedge' && e.art.role === 'fruit') {
          // Spicchi di frutta a ventaglio lungo la striscia.
          const m = clamp(Math.round(e.qty * 5), 3, 6);
          const uc = u + w / 2;
          const cos = Math.cos(phi);
          const sin = Math.sin(phi);
          for (let j = 0; j < m; j++) {
            const v = ((j - (m - 1) / 2) * (chord * 0.75)) / m;
            food.push(
              drawPiece({ x: uc * cos - v * sin, y: uc * sin + v * cos, s: s * 1.5, rot: phi + (j % 2 ? Math.PI : 0) + (rng() - 0.5) * 0.3, rng, e, k: `b${i}-${j}` }),
            );
          }
        } else {
          food.push(...fillRegion(e, region, w * chord, sb, rng, `b${i}`, density * 1.35));
        }
        u += w;
      });
    }
    pushToppings(onDish.filter((e) => isTopping(e) && e !== cacao), food, R, s, rng, density, null);
    return { kind, fill, food, cup, side, sideBread: hero ? breads[0] : undefined };
  }

  // ── Piatto: gruppi organici disposti in cerchio ──
  const hasBread = onDish.some((b) => b.art.role === 'bread');
  const sauce = onDish.find((e) => e.art.role === 'sauce');
  let majors = onDish.filter((e) => !isTopping(e));
  let spreads: ArtEntry[] = [];
  if (hasBread && !style.sandwich) {
    spreads = majors.filter((e) => e.art.role === 'dairy' && e.art.shape === 'dollop');
    majors = majors.filter((e) => !spreads.includes(e));
  }
  // Pancake: avena, albume e uova diventano una pila di pancake.
  const pancakeParts = style.pancake ? majors.filter((e) => e.art.shape === 'flakes' || e.art.shape === 'scramble') : [];
  // Frittata: le uova (e le verdure cotte dentro) diventano la frittata.
  const frittataVeg = style.frittata ? majors.find((e) => e.art.role === 'veg' && e.art.shape !== 'leaf') : undefined;
  const frittataEgg = style.frittata ? majors.find((e) => e.art.shape === 'scramble') : undefined;
  // Panino: il pane fa da contenitore, il ripieno si vede sul taglio.
  const sandwichBread = style.sandwich ? majors.find((e) => e.art.role === 'bread') : undefined;
  const sandwichFilling = style.sandwich ? majors.filter((e) => e !== sandwichBread && (e.art.role === 'protein' || e.art.role === 'veg' || e.art.role === 'dairy')) : [];
  const barsParts = style.bars ? majors.filter((e) => e.art.shape === 'flakes') : [];

  type Group = { kind: 'entry'; e: ArtEntry } | { kind: 'pancake'; grams: number } | { kind: 'frittata'; grams: number } | { kind: 'sandwich'; grams: number } | { kind: 'bars'; grams: number };
  const groups: Group[] = [];
  const consumed = new Set<ArtEntry>([...pancakeParts, ...sandwichFilling, ...barsParts]);
  if (frittataEgg) consumed.add(frittataEgg);
  if (frittataVeg && style.frittata === 'grande') consumed.add(frittataVeg);
  if (sandwichBread) consumed.add(sandwichBread);
  if (pancakeParts.length) groups.push({ kind: 'pancake', grams: pancakeParts.reduce((a, e) => a + e.grams, 0) });
  if (frittataEgg) groups.push({ kind: 'frittata', grams: frittataEgg.grams });
  if (sandwichBread) groups.push({ kind: 'sandwich', grams: sandwichBread.grams + sandwichFilling.reduce((a, e) => a + e.grams, 0) });
  if (barsParts.length) groups.push({ kind: 'bars', grams: barsParts.reduce((a, e) => a + e.grams, 0) });
  for (const e of majors) if (!consumed.has(e)) groups.push({ kind: 'entry', e });
  const roleOf = (g: Group): FoodArt['role'] => (g.kind === 'entry' ? g.e.art.role : g.kind === 'bars' ? 'bread' : 'protein');
  const gramsOf = (g: Group) => (g.kind === 'entry' ? g.e.grams : g.grams);
  groups.sort((a, b) => ROLE_ORDER.indexOf(roleOf(a)) - ROLE_ORDER.indexOf(roleOf(b)));

  const weights = groups.map((g) => Math.sqrt(Math.max(gramsOf(g), 15)) * (ROLE_BOOST[roleOf(g)] ?? 1) * (g.kind === 'entry' ? 1 : 1.4));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const shares = weights.map((w) => Math.max(0.1, w / total));
  const shareSum = shares.reduce((a, b) => a + b, 0);
  const heroIdx = Math.max(0, groups.findIndex((g) => roleOf(g) === 'protein'));
  let start = 0;
  for (let i = 0; i < heroIdx; i++) start += (shares[i] / shareSum) * TAU;
  const heroMid = start + ((shares[heroIdx] ?? 0) / shareSum) * Math.PI;
  let a0 = Math.PI * 0.3 + (rng() - 0.5) * 0.3 - heroMid;
  const n = groups.length;
  const spots: [number, number, number][] = [];

  groups.forEach((g, i) => {
    const span = n === 1 ? TAU : (shares[i] / shareSum) * TAU;
    const mid = a0 + span / 2;
    a0 += span;
    const key = `m${i}`;
    const rc = n === 1 ? 0 : n === 2 ? 0.3 : 0.38;
    const cx = Math.cos(mid) * rc;
    const cy = Math.sin(mid) * rc;
    const rr = n === 1 ? 0.66 : clamp(Math.sqrt(shares[i] / shareSum) * 1.05, 0.3, 0.62);
    const tan = mid + Math.PI / 2;

    if (g.kind === 'pancake') {
      const r = 0.3 * bs;
      [-1, 0, 1].forEach((j, k) => food.push(pancake(cx + j * 0.07 * bs, cy + j * 0.05 * bs, r, rng, `${key}-${k}`)));
      spots.push([cx + 0.05, cy + 0.03, 0]);
      return;
    }
    if (g.kind === 'frittata') {
      const vegCol = frittataVeg?.art.color;
      if (style.frittata === 'grande') {
        food.push(frittata(cx, cy, clamp(rr, 0.3, 0.42) * (hero ? 1 : 1.05), vegCol, s, rng, key));
      } else {
        const m = clamp(Math.round(gramsOf(g) / 60), 2, 4);
        for (let j = 0; j < m; j++) {
          const off = (j - (m - 1) / 2) * 0.22 * bs;
          food.push(frittata(cx + Math.cos(tan) * off, cy + Math.sin(tan) * off, 0.13 * bs, vegCol, s, rng, `${key}-${j}`));
        }
      }
      return;
    }
    if (g.kind === 'sandwich' && sandwichBread) {
      const fill = sandwichFilling.map((o) => o.art.color);
      const halves = [-1, 1];
      halves.forEach((j, k) => {
        const off = j * 0.2 * bs;
        food.push(sandwichHalf(sandwichBread, cx + Math.cos(tan) * off, cy + Math.sin(tan) * off, mid + j * 0.35, bs, rng, `${key}-${k}`, fill.length ? fill : ['#7BAF42']));
      });
      return;
    }
    if (g.kind === 'bars') {
      for (let j = 0; j < 3; j++) {
        const off = (j - 1) * 0.15 * bs;
        food.push(bar(cx + Math.cos(tan) * off, cy + Math.sin(tan) * off, mid + (rng() - 0.5) * 0.3, bs, rng, `${key}-${j}`));
      }
      return;
    }
    if (g.kind !== 'entry') return;
    const e = g.e;
    const sh = e.art.shape;
    const region = discRegion(cx, cy, rr, R);
    const area = clusterArea(cx, cy, rr, R);

    if (sh === 'pasta' && style.spaghetti) {
      let ee = e;
      if (sauce) ee = { ...e, art: { ...e.art, color: mix(e.art.color, sauce.art.color, 0.4) } };
      food.push(<path key={`${key}-bed`} d={blobPath(cx, cy, rr * 0.85, rng, 10, 0.15)} fill={darken(ee.art.color, 0.08)} />);
      food.push(strands(ee, cx, cy, rr * 0.85, s, rng, key));
    } else if (sh === 'scramble' && !style.eggsInSauce) {
      food.push(<path key={`${key}-bed`} d={blobPath(cx, cy, rr * 0.7, rng, 10, 0.25)} fill={darken(e.art.color, 0.04)} />);
      food.push(...fillRegion(e, discRegion(cx, cy, rr * 0.72, R), area * 0.6, s, rng, key, density * 1.3));
    } else if (sh === 'rice' || sh === 'grain' || sh === 'flakes' || sh === 'pasta') {
      let ee = e;
      if (sauce && e.art.role === 'base') {
        ee = { ...e, art: { ...e.art, color: mix(e.art.color, sauce.art.color, 0.4), color2: mix(e.art.color2 ?? e.art.color, sauce.art.color, 0.55) } };
      }
      const bedCol = sh === 'pasta' && !sauce ? darken(ee.art.color, 0.05) : (ee.art.color2 ?? ee.art.color);
      food.push(<path key={`${key}-bed`} d={blobPath(cx, cy, rr * 0.9, rng, 11, 0.16)} fill={bedCol} />);
      food.push(...fillRegion(ee, discRegion(cx, cy, rr * 0.92, R), area * 0.92, s, rng, key, density));
    } else if (sh === 'slab' || sh === 'folded') {
      const m = sh === 'slab' ? clamp(Math.round(e.grams / 30), 3, 5) : clamp(e.unit === 'fetta' ? Math.round(e.qty) : Math.round(e.grams / 20), 2, 5);
      const step = (sh === 'slab' ? 0.095 : 0.11) * bs;
      for (let j = 0; j < m; j++) {
        const off = (j - (m - 1) / 2) * step;
        const x = cx + Math.cos(tan) * off;
        const y = cy + Math.sin(tan) * off;
        const rot = mid + (j - (m - 1) / 2) * 0.12 + (rng() - 0.5) * 0.08;
        food.push(sh === 'slab' ? slab(e, x, y, rot, bs, rng, `${key}-${j}`) : folded(e, x, y, rot + Math.PI / 2, bs, rng, `${key}-${j}`));
      }
    } else if (sh === 'fillet') {
      food.push(fillet(e, cx, cy, tan + (rng() - 0.5) * 0.3, bs, rng, key));
    } else if (sh === 'scramble' && style.eggsInSauce) {
      const m = clamp(Math.round(e.qty), 1, 3);
      if (sauce) food.push(<path key={`${key}-bed`} d={blobPath(cx, cy, rr * 0.95, rng, 10, 0.18)} fill={sauce.art.color} />);
      for (let j = 0; j < m; j++) {
        const off = (j - (m - 1) / 2) * 0.24 * bs;
        food.push(friedEgg(cx + Math.cos(tan) * off, cy + Math.sin(tan) * off, bs, rng, `${key}-${j}`));
      }
    } else if (sh === 'bread' || sh === 'cracker' || sh === 'disc' || sh === 'flatbread') {
      const per = sh === 'bread' ? 40 : sh === 'disc' ? 8 : sh === 'cracker' ? 25 : 80;
      const pieces = ['fetta', 'pezzo'].includes(e.unit) ? Math.round(e.qty * (e.id === 'crackers-integrali' ? 3 : 1)) : Math.round(e.grams / per);
      const m = clamp(pieces, 1, sh === 'flatbread' ? 1 : 3);
      for (let j = 0; j < m; j++) {
        const off = (j - (m - 1) / 2) * (sh === 'disc' ? 0.22 : sh === 'bread' ? (n === 1 ? 0.3 : 0.2) : 0.2) * bs;
        const x = cx + Math.cos(tan) * off + (rng() - 0.5) * 0.03;
        const y = cy + Math.sin(tan) * off + (rng() - 0.5) * 0.03;
        const rot = mid + Math.PI / 2 + (rng() - 0.5) * 0.6;
        spots.push([x, y, rot]);
        if (sh === 'bread') food.push(bread(e, x, y, rot, bs, rng, `${key}-${j}`));
        else if (sh === 'cracker') food.push(cracker(e, x, y, rot, bs, rng, `${key}-${j}`));
        else if (sh === 'disc') food.push(disc(e, x, y, bs, rng, `${key}-${j}`));
        else {
          const filling = onDish.filter((o) => o !== e && !isTopping(o)).map((o) => o.art.color2 ?? o.art.color);
          food.push(flatbread(e, x, y, rot, bs, rng, `${key}-${j}`, filling.length ? filling : ['#7BAF42']));
        }
      }
    } else if (sh === 'dollop') {
      const r = clamp(0.11 * Math.sqrt(e.grams / 60), 0.1, 0.22) * (hero ? 1.05 : 1.2);
      food.push(dollop(e, cx, cy, r, rng, key));
    } else if (sh === 'wedge' && e.art.role === 'fruit') {
      const m = clamp(Math.round(e.qty * (e.id === 'clementine' ? 3 : 4)), 2, 6);
      for (let j = 0; j < m; j++) {
        const an = mid + Math.PI + (j - (m - 1) / 2) * 0.5;
        food.push(drawPiece({ x: cx + Math.cos(an) * 0.05, y: cy + Math.sin(an) * 0.05, s: s * 0.95, rot: an + Math.PI, rng, e, k: `${key}-${j}` }));
      }
    } else {
      food.push(...fillRegion(e, region, area, s, rng, key, density));
    }
  });

  // Creme e formaggi spalmati sul pane (o sui pancake).
  spreads.forEach((e, i) => {
    const spot = spots[i % Math.max(1, spots.length)] ?? [0, 0, 0];
    food.push(dollop(e, spot[0] + 0.02, spot[1] - 0.02, 0.1 * (hero ? 1.1 : 1.3), rng, `sp${i}`));
  });

  pushToppings(
    onDish.filter((e) => isTopping(e) && e !== sauce),
    food,
    R,
    s,
    rng,
    density,
    spots.length ? spots : null,
  );
  if (sauce && !majors.some((e) => e.art.role === 'base') && !style.eggsInSauce) {
    food.push(dollop(sauce, 0, 0, 0.12, rng, 'sauce'));
  }
  return { kind, food, cup, side };
}

/** Semi, spezie, formaggio grattugiato, frutta secca, fili d'olio e di miele. */
function pushToppings(
  list: ArtEntry[],
  food: ReactNode[],
  R: number,
  s: number,
  rng: Rng,
  density: number,
  spots: [number, number, number][] | null,
) {
  list.forEach((e, i) => {
    const key = `t${i}`;
    const sh = e.art.shape;
    if (sh === 'speck' && e.id === 'grana' && e.unit === 'pezzo') {
      // Parmigiano a scaglie.
      const n = clamp(Math.round(e.grams / 3), 4, 10);
      const a = rng() * TAU;
      scatter(discRegion(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.32, R * 0.92), n, 0.07 * s, rng).forEach(([x, y], j) =>
        food.push(<path key={`${key}-${j}`} d={blobPath(x, y, 0.035 * s, rng, 5, 0.55, 1.4, 0.8)} fill={vary(e.art.color, rng, 0.08)} />),
      );
    } else if (sh === 'speck') {
      const n = clamp(Math.round((e.id === 'grana' ? e.grams * 2.6 : e.id === 'semi-chia' ? e.grams * 4 : 8 + e.grams * 3) * density), 6, 50);
      const pts = scatter(discRegion(0, 0, R * 0.92), n, 0.024 * s, rng);
      pts.forEach(([x, y], j) => food.push(drawPiece({ x, y, s, rot: rng() * TAU, rng, e, k: `${key}-${j}` })));
    } else if (sh === 'drizzle') {
      if (spots && e.id !== 'olio-evo') {
        spots.forEach(([x, y, rot], j) => food.push(drizzle(e, x, y, rot, 0.3, s, rng, `${key}-${j}`)));
      } else {
        food.push(drizzle(e, (rng() - 0.5) * 0.16, (rng() - 0.5) * 0.16, -0.5 + (rng() - 0.5) * 0.6, R * 1.15, s, rng, key));
      }
    } else if (sh === 'nut' || sh === 'square') {
      const per = e.id === 'mandorle' ? 1.4 : e.id === 'noci' ? 4 : e.id === 'datteri' ? 8 : e.id === 'cioccolato-fondente' ? 5 : 4;
      const n = clamp(Math.round((e.grams / per) * (density < 1 ? 0.55 : 1)), 2, sh === 'square' ? 4 : 10);
      const a = rng() * TAU;
      const region = discRegion(Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0.3, R * 0.92);
      scatter(region, n, pieceSize(e) * s * 1.2, rng).forEach(([x, y], j) =>
        food.push(drawPiece({ x, y, s, rot: rng() * TAU, rng, e, k: `${key}-${j}` })),
      );
    } else if (sh === 'wedge') {
      // Spicchio di limone sul bordo.
      const a = rng() * TAU;
      food.push(drawPiece({ x: Math.cos(a) * R * 0.74, y: Math.sin(a) * R * 0.74, s: s * 0.95, rot: a + Math.PI, rng, e, k: key }));
    } else if (sh === 'dollop') {
      const spot = spots?.[i % spots.length];
      const a = rng() * TAU;
      food.push(dollop(e, spot ? spot[0] : Math.cos(a) * 0.32, spot ? spot[1] : Math.sin(a) * 0.32, 0.085 * (density < 1 ? 1.3 : 1.1), rng, key));
    } else if (sh === 'cube' || sh === 'round') {
      food.push(...fillRegion(e, discRegion(0, 0, R * 0.85), 0.25, s, rng, key, density));
    } else if (sh === 'flakes') {
      food.push(...fillRegion(e, discRegion(0.15, 0.1, 0.35, R), 0.3, s, rng, key, density));
    }
  });
}

/** Pane, fette biscottate o gallette servite accanto: pezzi centrati nell'origine (unità ≈ 60 px). */
export function sideBreadPieces(e: ArtEntry, seed: string): ReactNode[] {
  const rng = seeded(hashString(`${seed}:side`));
  const sh = e.art.shape;
  const n = clamp(['fetta', 'pezzo'].includes(e.unit) ? Math.round(e.qty) : 2, 1, 3);
  const out: ReactNode[] = [];
  for (let j = 0; j < n; j++) {
    const x = (j - (n - 1) / 2) * 0.22;
    const y = (j - (n - 1) / 2) * -0.12;
    const rot = -0.4 + j * 0.35 + (rng() - 0.5) * 0.2;
    if (sh === 'bread') out.push(bread(e, x, y, rot, 1.6, rng, `sb${j}`));
    else if (sh === 'disc') out.push(disc(e, x, y, 1.6, rng, `sb${j}`));
    else if (sh === 'flatbread') out.push(flatbread(e, x, y, rot, 1.4, rng, `sb${j}`, ['#7BAF42']));
    else out.push(cracker(e, x, y, rot, 1.6, rng, `sb${j}`));
  }
  return out;
}
