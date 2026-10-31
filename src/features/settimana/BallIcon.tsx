/**
 * Pallone da calcio in stile lucide (tratto, 24×24, currentColor): lucide non ne ha uno e "Goal"
 * sembra un bersaglio. Compatibile con IconLike del design system.
 */
export function BallIcon({ size = 24, strokeWidth = 2, className }: { size?: number | string; strokeWidth?: number | string; className?: string }) {
  // Pentagono centrale e cinque cuciture verso il bordo.
  const c = 12;
  const r = 3.4;
  const pts = Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return [c + Math.cos(a) * r, c + Math.sin(a) * r, a] as const;
  });
  const fmt = (n: number) => Math.round(n * 100) / 100;
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
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d={`M${pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L')}Z`} fill="currentColor" />
      {pts.map(([x, y, a], i) => (
        <path key={i} d={`M${fmt(x)} ${fmt(y)}L${fmt(c + Math.cos(a) * 9.6)} ${fmt(c + Math.sin(a) * 9.6)}`} />
      ))}
    </svg>
  );
}
