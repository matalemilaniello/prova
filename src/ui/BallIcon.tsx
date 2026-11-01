/**
 * Pallone da calcio in stile lucide (tratto, 24×24, currentColor): lucide non ne ha uno, "Goal" sembra un
 * bersaglio e il trofeo va riservato ai record personali. Compatibile con IconLike del design system e con le
 * props delle icone lucide (size, strokeWidth, className, style).
 */
import type { CSSProperties } from 'react';

const C = 12;
const R = 3.4;
const PTS = Array.from({ length: 5 }, (_, i) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
  return [C + Math.cos(a) * R, C + Math.sin(a) * R, a] as const;
});
const fmt = (n: number) => Math.round(n * 100) / 100;
/** Pentagono centrale pieno e cinque cuciture verso il bordo. */
const PENTAGON = `M${PTS.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L')}Z`;
const SEAMS = PTS.map(([x, y, a]) => `M${fmt(x)} ${fmt(y)}L${fmt(C + Math.cos(a) * 9.6)} ${fmt(C + Math.sin(a) * 9.6)}`);

export function BallIcon({
  size = 24,
  strokeWidth = 2,
  className,
  style,
}: {
  size?: number | string;
  strokeWidth?: number | string;
  className?: string;
  style?: CSSProperties;
  'aria-hidden'?: boolean | 'true' | 'false';
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d={PENTAGON} fill="currentColor" />
      {SEAMS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
