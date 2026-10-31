/**
 * Illustrazione del piatto generata dagli ingredienti (SVG, niente immagini esterne). Vista pura.
 * - `hero`: il piatto visto dall'alto su un tavolo tinto col colore del tipo di giorno, con tovagliolo,
 *   eventuale tazza (latte, caffellatte) e frutto intero servito accanto.
 * - `thumb`: solo il piatto, per le card dei pasti e le alternative.
 */
import { useId, useMemo } from 'react';
import type { DayType, Recipe } from '../../../domain/types';
import type { ResolvedTheme } from '../../../app/theme';
import { cn } from '../../../ui/cn';
import { composeDish, darken, lighten, mix, seeded, sideBreadPieces, type ArtEntry, type Composition } from './compose';

const DAY_HEX: Record<ResolvedTheme, Record<DayType, string>> = {
  scuro: { calcio: '#F5C04A', palestra: '#6EA8FE', leggero: '#4FD1C5', riposo: '#B39DFF' },
  chiaro: { calcio: '#C98A0E', palestra: '#2F6FE0', leggero: '#138A80', riposo: '#6E56D8' },
};

interface Palette {
  table: string;
  tableEdge: string;
  rim: string;
  rimEdge: string;
  well: string;
  wellEdge: string;
  shadow: string;
  shadowOpacity: number;
  sheen: number;
  napkin: string;
  napkinStripe: string;
}

function palette(theme: ResolvedTheme, dayType: DayType): Palette {
  const day = DAY_HEX[theme][dayType];
  if (theme === 'chiaro') {
    const table = mix('#E7ECF3', day, 0.1);
    return {
      table: lighten(table, 0.25),
      tableEdge: table,
      rim: '#FFFFFF',
      rimEdge: '#E4E9F0',
      well: '#FAFBFC',
      wellEdge: '#E9EDF2',
      shadow: '#0D1A2C',
      shadowOpacity: 0.2,
      sheen: 0.9,
      napkin: mix('#FFFFFF', day, 0.22),
      napkinStripe: mix('#FFFFFF', day, 0.6),
    };
  }
  const table = mix('#16233A', day, dayType === 'calcio' ? 0.08 : 0.11);
  return {
    table: lighten(table, 0.04),
    tableEdge: darken(table, 0.25),
    rim: '#24344F',
    rimEdge: '#1A273D',
    well: '#1D2B44',
    wellEdge: '#16223A',
    shadow: '#000000',
    shadowOpacity: 0.55,
    sheen: 0.1,
    napkin: mix('#1C2A44', day, 0.3),
    napkinStripe: mix('#1C2A44', day, 0.6),
  };
}

export interface DishArtProps {
  recipe: Recipe;
  dayType: DayType;
  variant?: 'hero' | 'thumb';
  className?: string;
}

/** Piatto illustrato con il tema esplicito. Nell'app usa `DishArt`, che segue il tema attivo. */
export function DishArtView({ recipe, dayType, variant = 'thumb', className, theme }: DishArtProps & { theme: ResolvedTheme }) {
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9_-]/g, '');
  const comp = useMemo(() => composeDish(recipe, dayType, { variant }), [recipe, dayType, variant]);
  const p = palette(theme, dayType);

  if (variant === 'thumb') {
    return (
      <svg viewBox="0 0 100 100" className={cn('block', className)} aria-hidden focusable="false">
        <Defs uid={uid} p={p} comp={comp} hero={false} />
        <circle cx="50" cy="52" r="46" fill={p.shadow} opacity={p.shadowOpacity * 0.45} filter={`url(#${uid}-soft)`} />
        <Plate uid={uid} p={p} comp={comp} cx={50} cy={50} R={47} />
      </svg>
    );
  }

  return (
    // data-allow-overflow: tovagliolo e tazza escono dal riquadro di proposito, l'SVG li ritaglia.
    <svg
      viewBox="0 0 360 220"
      className={cn('block', className)}
      role="img"
      aria-label={`Illustrazione del piatto: ${recipe.name}`}
      focusable="false"
      data-allow-overflow
    >
      <Defs uid={uid} p={p} comp={comp} hero />
      <rect width="360" height="220" fill={`url(#${uid}-table)`} />
      <rect width="360" height="220" fill={`url(#${uid}-linen)`} opacity={theme === 'chiaro' ? 0.5 : 0.35} />
      {/* Tovagliolo */}
      <g transform="translate(36 206) rotate(-16)">
        <rect x="-58" y="-36" width="120" height="80" rx="9" fill={p.shadow} opacity={p.shadowOpacity * 0.3} filter={`url(#${uid}-soft)`} />
        <rect x="-60" y="-40" width="120" height="80" rx="9" fill={p.napkin} />
        <rect x="-60" y="-31" width="120" height="2.5" fill={p.napkinStripe} opacity="0.65" />
        <rect x="-60" y="-25" width="120" height="1.2" fill={p.napkinStripe} opacity="0.45" />
      </g>
      {comp.side && <SideFruit e={comp.side} p={p} seed={recipe.id} />}
      {comp.cup && <Cup cup={comp.cup} p={p} uid={uid} />}
      {comp.sideBread && (
        <g transform={`translate(${comp.cup ? 318 : 312} ${comp.cup ? 168 : 60}) scale(62)`}>
          <ellipse cx="0.04" cy="0.08" rx="0.42" ry="0.32" fill={p.shadow} opacity={p.shadowOpacity * 0.45} filter={`url(#${uid}-soft-unit)`} />
          {sideBreadPieces(comp.sideBread, recipe.id)}
        </g>
      )}
      <ellipse cx="182" cy="122" rx="94" ry="90" fill={p.shadow} opacity={p.shadowOpacity} filter={`url(#${uid}-blur)`} />
      <Plate uid={uid} p={p} comp={comp} cx={180} cy={110} R={94} />
      {/* Luce dall'alto a sinistra */}
      <rect width="360" height="220" fill={`url(#${uid}-light)`} pointerEvents="none" />
    </svg>
  );
}

function Defs({ uid, p, comp, hero }: { uid: string; p: Palette; comp: Composition; hero: boolean }) {
  const fill = comp.fill ?? p.well;
  return (
    <defs>
      <linearGradient id={`${uid}-table`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={p.table} />
        <stop offset="1" stopColor={p.tableEdge} />
      </linearGradient>
      <pattern id={`${uid}-linen`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
        <rect width="6" height="6" fill="none" />
        <line x1="0" y1="0" x2="0" y2="6" stroke={p.shadow} strokeWidth="0.6" opacity="0.08" />
      </pattern>
      <radialGradient id={`${uid}-light`} cx="0.15" cy="0" r="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity={p.sheen > 0.5 ? 0.18 : 0.06} />
        <stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${uid}-rim`} cx="0.42" cy="0.38" r="0.65">
        <stop offset="0.75" stopColor={p.rim} />
        <stop offset="1" stopColor={p.rimEdge} />
      </radialGradient>
      <radialGradient id={`${uid}-well`} cx="0.45" cy="0.42" r="0.6">
        <stop offset="0.55" stopColor={comp.kind === 'plate' ? p.well : lighten(fill, 0.06)} />
        <stop offset="1" stopColor={comp.kind === 'plate' ? p.wellEdge : darken(fill, 0.14)} />
      </radialGradient>
      <linearGradient id={`${uid}-depth`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#000" stopOpacity="0.22" />
        <stop offset="0.35" stopColor="#000" stopOpacity="0" />
      </linearGradient>
      <filter id={`${uid}-blur`} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="7" />
      </filter>
      <filter id={`${uid}-soft`} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation={hero ? 3 : 1.5} />
      </filter>
      {hero && (
        <filter id={`${uid}-soft-unit`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.05" />
        </filter>
      )}
      {hero && (
        <filter id={`${uid}-food`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0.012" stdDeviation="0.01" floodColor="#000" floodOpacity="0.3" />
        </filter>
      )}
    </defs>
  );
}

function Plate({ uid, p, comp, cx, cy, R }: { uid: string; p: Palette; comp: Composition; cx: number; cy: number; R: number }) {
  const bowl = comp.kind !== 'plate';
  const inner = bowl ? 0.86 : 0.8;
  return (
    <g>
      <circle cx={cx} cy={cy} r={R} fill={`url(#${uid}-rim)`} />
      <circle cx={cx} cy={cy} r={R - 0.6} fill="none" stroke={p.rimEdge} strokeWidth="1" opacity="0.8" />
      <circle cx={cx} cy={cy} r={R * inner} fill={`url(#${uid}-well)`} />
      {bowl && <circle cx={cx} cy={cy} r={R * inner} fill={`url(#${uid}-depth)`} />}
      <circle cx={cx} cy={cy} r={R * inner} fill="none" stroke={p.shadow} strokeWidth={R * 0.012} opacity={0.12} />
      <path
        d={`M${cx - R * 0.93} ${cy - R * 0.12}A${R * 0.94} ${R * 0.94} 0 0 1 ${cx - R * 0.2} ${cy - R * 0.92}`}
        stroke="#fff"
        strokeWidth={R * 0.035}
        strokeLinecap="round"
        fill="none"
        opacity={p.sheen > 0.5 ? 0.55 : 0.08}
      />
      <clipPath id={`${uid}-clip`}>
        <circle cx={cx} cy={cy} r={R * (inner - 0.015)} />
      </clipPath>
      <g clipPath={`url(#${uid}-clip)`}>
        <g transform={`translate(${cx} ${cy}) scale(${R})`} filter={R > 60 ? `url(#${uid}-food)` : undefined}>
          {comp.food}
        </g>
      </g>
    </g>
  );
}

function Cup({ cup, p, uid }: { cup: NonNullable<Composition['cup']>; p: Palette; uid: string }) {
  const cx = 314;
  const cy = 48;
  return (
    <g>
      <circle cx={cx + 2} cy={cy + 5} r="36" fill={p.shadow} opacity={p.shadowOpacity * 0.6} filter={`url(#${uid}-soft)`} />
      <circle cx={cx} cy={cy} r="35" fill={p.rim} />
      <circle cx={cx} cy={cy} r="34.4" fill="none" stroke={p.rimEdge} strokeWidth="1" />
      <rect x={cx + 18} y={cy + 12} width="22" height="10" rx="5" transform={`rotate(38 ${cx + 18} ${cy + 12})`} fill={p.rim} stroke={p.rimEdge} strokeWidth="1" />
      <circle cx={cx} cy={cy} r="25" fill={p.rim} stroke={p.rimEdge} strokeWidth="1.2" />
      <circle cx={cx} cy={cy} r="20.5" fill={cup.color} />
      {cup.foam && <ellipse cx={cx - 2} cy={cy - 1} rx="12" ry="10" fill={cup.foam} opacity="0.9" />}
      <ellipse cx={cx - 7} cy={cy - 9} rx="6" ry="2.4" fill="#fff" opacity="0.4" transform={`rotate(-25 ${cx - 7} ${cy - 9})`} />
    </g>
  );
}

function SideFruit({ e, p, seed }: { e: ArtEntry; p: Palette; seed: string }) {
  const rng = seeded(seed.length * 97 + 13);
  const cx = 52;
  const cy = 54;
  const a = e.art;
  const shadow = <ellipse cx={cx + 3} cy={cy + 6} rx="24" ry="22" fill={p.shadow} opacity={p.shadowOpacity * 0.55} />;
  const hi = (x: number, y: number, rx: number, ry: number) => (
    <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="#fff" opacity="0.32" transform={`rotate(-30 ${x} ${y})`} />
  );
  const leaf = (x: number, y: number, r: number) => (
    <path d={`M${x} ${y}q${8 * r} ${-10 * r} ${16 * r} ${-4 * r}q${-6 * r} ${9 * r} ${-16 * r} ${4 * r}Z`} fill="#4E8A3A" />
  );
  switch (e.id) {
    case 'mela':
    case 'pera': {
      const pear = e.id === 'pera';
      return (
        <g>
          {shadow}
          {pear && <circle cx={cx - 4} cy={cy - 12} r="13" fill={a.color} />}
          <circle cx={cx} cy={cy} r={pear ? 19 : 22} fill={a.color} />
          <circle cx={cx + 4} cy={cy + 4} r={pear ? 14 : 17} fill={darken(a.color, 0.1)} opacity="0.35" />
          {hi(cx - 8, cy - 8, 6, 3.5)}
          <path d={`M${cx - (pear ? 5 : 1)} ${cy - (pear ? 22 : 15)}l2 -8`} stroke="#6A4A2A" strokeWidth="2.2" strokeLinecap="round" />
          {leaf(cx + (pear ? -3 : 1), cy - (pear ? 27 : 20), 0.9)}
        </g>
      );
    }
    case 'arancia':
    case 'clementine': {
      const small = e.id === 'clementine';
      const n = small ? Math.min(3, Math.max(1, Math.round(e.qty))) : 1;
      const r = small ? 15 : 22;
      return (
        <g>
          {shadow}
          {Array.from({ length: n }, (_, i) => {
            const x = cx + (i - (n - 1) / 2) * 20;
            const y = cy + (i % 2) * 8 - 4;
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={r} fill={a.color} />
                {Array.from({ length: 14 }, (_, j) => (
                  <circle key={j} cx={x + (rng() - 0.5) * r * 1.4} cy={y + (rng() - 0.5) * r * 1.4} r="0.7" fill={darken(a.color, 0.18)} opacity="0.5" />
                ))}
                {hi(x - r * 0.35, y - r * 0.35, r * 0.28, r * 0.16)}
                <circle cx={x + 1} cy={y - r * 0.05} r="1.6" fill={darken(a.color, 0.3)} opacity="0.6" />
              </g>
            );
          })}
          {small && leaf(cx - 2, cy - 18, 0.8)}
        </g>
      );
    }
    case 'banana':
      return (
        <g>
          <path d={`M${cx - 30} ${cy - 10}Q${cx} ${cy + 34} ${cx + 32} ${cy - 6}Q${cx} ${cy + 18} ${cx - 30} ${cy - 10}Z`} fill={p.shadow} opacity={p.shadowOpacity * 0.5} transform="translate(2 5)" />
          <path d={`M${cx - 30} ${cy - 10}Q${cx} ${cy + 34} ${cx + 32} ${cy - 6}Q${cx} ${cy + 18} ${cx - 30} ${cy - 10}Z`} fill={a.color} />
          <path d={`M${cx - 26} ${cy - 7}Q${cx} ${cy + 24} ${cx + 28} ${cy - 4}`} stroke={darken(a.color, 0.15)} strokeWidth="1.2" fill="none" opacity="0.6" />
          <circle cx={cx - 30} cy={cy - 10} r="2.2" fill="#5A4024" />
          <circle cx={cx + 32} cy={cy - 6} r="1.8" fill="#5A4024" />
        </g>
      );
    case 'kiwi':
      return (
        <g>
          {shadow}
          <ellipse cx={cx - 6} cy={cy - 4} rx="17" ry="14" fill="#8A6B3C" />
          {hi(cx - 12, cy - 9, 5, 2.5)}
          <circle cx={cx + 10} cy={cy + 8} r="14" fill="#8A6B3C" />
          <circle cx={cx + 10} cy={cy + 8} r="12.6" fill={a.color2} />
          {Array.from({ length: 12 }, (_, i) => {
            const an = (i / 12) * Math.PI * 2;
            return <circle key={i} cx={cx + 10 + Math.cos(an) * 6.5} cy={cy + 8 + Math.sin(an) * 6.5} r="0.9" fill="#2B2A1C" />;
          })}
          <circle cx={cx + 10} cy={cy + 8} r="3.6" fill={lighten(a.color2 ?? a.color, 0.5)} />
        </g>
      );
    default:
      return (
        <g>
          {shadow}
          <circle cx={cx} cy={cy} r="20" fill={a.color} />
          {hi(cx - 7, cy - 7, 5, 3)}
        </g>
      );
  }
}
