/** Pezzi comuni del foglio dei pasti: foto, riga «Conta come…», controllo delle kcal. */
import { Camera, UtensilsCrossed } from 'lucide-react';
import type { Nutrients } from '../../domain/types';
import { kcalCheck } from '../../engine/estimate';
import { fmtNumber } from '../../lib/format';
import { Button, cn } from '../../ui';

/** Foto o miniatura del piatto; senza, una tessera con la fotocamera. */
export function Photo({ src, size, alt = 'Foto del piatto', dish }: { src: string | null | undefined; size: number; alt?: string; dish?: boolean }) {
  if (!src) {
    const Icon = dish ? UtensilsCrossed : Camera;
    return (
      <span aria-hidden className="grid shrink-0 place-items-center rounded-[14px] bg-card-2 text-ink-3" style={{ width: size, height: size }}>
        <Icon size={Math.max(16, Math.round(size / 3))} strokeWidth={1.8} />
      </span>
    );
  }
  return <img src={src} alt={alt} className="shrink-0 rounded-[14px] object-cover" style={{ width: size, height: size }} />;
}

/** «Conta come il pranzo previsto · Cambia» oppure «Conta come pasto sostituito · Cambia» (§ 7.5). */
export function PlannedRow({ text, canChange, onChange }: { text: string; canChange: boolean; onChange: () => void }) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-3 px-1">
      <p className="t-callout text-ink">{text}</p>
      {canChange && (
        <Button variant="ghost" size="sm" onClick={onChange}>
          Cambia
        </Button>
      )}
    </div>
  );
}

/** Una riga quando le kcal escono dalla fascia abituale (§ 7.3): oltre 3.000 non si segna. */
export function KcalCheckLine({ kcal }: { kcal: number }) {
  const check = kcalCheck(kcal);
  if (check === 'ok') return null;
  const text =
    check === 'oltre'
      ? 'Oltre 3.000 kcal non si segna: controlla i grammi.'
      : check === 'alto'
        ? 'Più di 1.800 kcal: controlla i grammi prima di segnare.'
        : 'Meno di 100 kcal: controlla i grammi prima di segnare.';
  return <p className={cn('t-footnote px-1', check === 'oltre' ? 'text-warn-ink' : 'text-ink-2')}>{text}</p>;
}

/** Proteine, carboidrati, grassi e fibre in una riga sotto le kcal. */
export function Macros({ nutrients }: { nutrients: Pick<Nutrients, 'proteinG' | 'carbG' | 'fatG' | 'fiberG'> }) {
  const rows: [string, number][] = [
    ['Proteine', nutrients.proteinG],
    ['Carboidrati', nutrients.carbG],
    ['Grassi', nutrients.fatG],
    ['Fibre', nutrients.fiberG],
  ];
  return (
    <dl className="mt-4 grid grid-cols-4 gap-2">
      {rows.map(([label, g]) => (
        <div key={label} className="flex min-w-0 flex-col">
          <dt className="t-caption truncate text-ink-3">{label}</dt>
          <dd className="t-callout tabular font-semibold text-ink">
            {fmtNumber(Math.round(g))}
            <span className="t-unit ml-0.5 text-ink-2">g</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
