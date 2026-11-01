/**
 * "Cosa vedrai qui": per chi non ha ancora fatto un controllo del mattino, una sola card con le sagome
 * attenuate dei grafici al posto di tre o quattro stati vuoti uguali uno sotto l'altro. Ogni sagoma dice da
 * dove arrivano i suoi numeri; il controllo del mattino si apre da qui.
 */
import type { ISODate } from '../../domain/types';
import { useUi } from '../../state/store';
import { Button, Card } from '../../ui';

export type SilhouetteKind = 'peso' | 'sonno' | 'dolore' | 'carico';

const LABELS: Record<SilhouetteKind, { title: string; caption: string }> = {
  peso: { title: 'Peso', caption: 'media di 7 giorni' },
  sonno: { title: 'Ore a letto', caption: 'contro l’obiettivo' },
  dolore: { title: 'Dolore', caption: 'per zona, da 0 a 10' },
  carico: { title: 'Carico', caption: 'dalla prima seduta' },
};

const W = 120;
const H = 44;
const STROKE = { stroke: 'var(--ink-4)', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
const GUIDE = { stroke: 'var(--line-strong)', strokeWidth: 1, strokeDasharray: '3 4' };

/** Sagoma del grafico: le stesse forme dei grafici veri, senza numeri e in tono spento. */
function Silhouette({ kind }: { kind: SilhouetteKind }) {
  switch (kind) {
    case 'peso': {
      const dots = [30, 26, 31, 24, 27, 21, 24, 19, 22, 17];
      return (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-11 w-full" aria-hidden preserveAspectRatio="none">
          {dots.map((y, i) => (
            <circle key={i} cx={6 + i * 12} cy={y} r={1.8} style={{ fill: 'var(--ink-4)' }} />
          ))}
          <path d="M6 29 C 30 27, 50 25, 66 23 S 100 19, 114 18" style={STROKE} />
        </svg>
      );
    }
    case 'sonno': {
      const bars = [22, 26, 18, 28, 24, 30, 27];
      return (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-11 w-full" aria-hidden preserveAspectRatio="none">
          <line x1={2} x2={W - 2} y1={12} y2={12} style={GUIDE} />
          {bars.map((h, i) => (
            <rect key={i} x={6 + i * 16} y={H - 2 - h} width={9} height={h} rx={3} style={{ fill: 'var(--ink-soft)', stroke: 'var(--ink-4)', strokeWidth: 1 }} />
          ))}
        </svg>
      );
    }
    case 'dolore':
      return (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-11 w-full" aria-hidden preserveAspectRatio="none">
          <line x1={2} x2={W - 2} y1={16} y2={16} style={GUIDE} />
          <path d="M6 12 L 26 16 L 46 15 L 66 22 L 86 26 L 114 31" style={STROKE} />
          <path d="M6 24 L 26 22 L 46 27 L 66 28 L 86 33 L 114 36" style={{ ...STROKE, strokeDasharray: '1 4' }} />
        </svg>
      );
    case 'carico': {
      const bars = [20, 26, 23, 30, 18];
      return (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-11 w-full" aria-hidden preserveAspectRatio="none">
          <line x1={2} x2={W - 2} y1={9} y2={9} style={GUIDE} />
          {bars.map((h, i) => (
            <rect key={i} x={8 + i * 22} y={H - 2 - h} width={14} height={h} rx={3} style={{ fill: 'var(--ink-soft)', stroke: 'var(--ink-4)', strokeWidth: 1 }} />
          ))}
        </svg>
      );
    }
  }
}

export function WhatYouWillSee({ kinds, today, checkInDone }: { kinds: SilhouetteKind[]; today: ISODate; checkInDone: boolean }) {
  return (
    <Card as="section" aria-labelledby="cosa-vedrai" className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="cosa-vedrai" className="t-headline text-ink">
            Cosa vedrai qui
          </h2>
          <p className="t-footnote mt-0.5 text-ink-3">Dal primo controllo del mattino</p>
        </div>
        {!checkInDone && (
          <Button size="sm" variant="secondary" className="shrink-0" onClick={() => useUi.getState().open({ type: 'checkin', date: today })}>
            Fai il controllo
          </Button>
        )}
      </header>
      <ul className={kinds.length === 3 ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-2.5'}>
        {kinds.map((k) => (
          <li key={k} className="rounded-[14px] bg-card-2 px-3 pb-3 pt-2.5">
            <Silhouette kind={k} />
            <p className="t-footnote mt-2 font-semibold text-ink-2">{LABELS[k].title}</p>
            <p className="t-caption text-ink-3">{LABELS[k].caption}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
