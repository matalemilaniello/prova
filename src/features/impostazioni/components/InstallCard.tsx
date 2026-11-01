/**
 * Invito a installare Ritmo sulla schermata Home di iPhone, in tre passi.
 * Si mostra solo quando `canSuggestInstall()` (vedi install.ts) è vero.
 * Usato nel benvenuto, in cima alle impostazioni e, una volta a settimana, in Oggi.
 */
import type { ReactNode } from 'react';
import { Share, SquarePlus } from 'lucide-react';
import { Button, Card, cn, renderIcon, type IconLike } from '../../../ui';
import { AppMark } from './Pickers';

export interface InstallCardProps {
  /** Nota sotto i passi (es. i dati di Safari non passano all'app installata). */
  note?: ReactNode;
  /** Mostra "Più tardi". */
  onDismiss?: () => void;
  /** Senza titolo grande, per spazi stretti. */
  compact?: boolean;
  className?: string;
}

const STEPS: { icon: IconLike | 'app'; title: string; text?: string }[] = [
  { icon: Share, title: 'Tocca Condividi in Safari', text: 'Il quadrato con la freccia. Se non lo vedi, tocca prima ···' },
  { icon: SquarePlus, title: 'Scegli Aggiungi alla schermata Home', text: 'Scorri l’elenco se serve, poi tocca Aggiungi.' },
  { icon: 'app', title: 'Apri Ritmo dall’icona', text: 'Da lì in poi usa sempre l’icona, non Safari.' },
];

export function InstallCard({ note, onDismiss, compact, className }: InstallCardProps) {
  return (
    <Card variant="highlight" tone="accent" padding="lg" className={cn('flex flex-col gap-4', className)} aria-labelledby="installa-titolo">
      <div className="flex items-center gap-3.5">
        <span className="relative shrink-0" aria-hidden>
          <AppMark size={compact ? 44 : 52} className="drop-shadow-[0_6px_16px_rgb(0_0_0/0.35)]" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id="installa-titolo" className={cn('text-ink', compact ? 't-headline' : 't-title-2')}>
            Installa Ritmo sull’iPhone
          </h3>
          <p className="t-footnote text-ink-2">A tutto schermo, e i dati restano al sicuro.</p>
        </div>
      </div>
      <ol className="flex flex-col gap-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex items-start gap-3">
            <span aria-hidden className="t-num grid size-8 shrink-0 place-items-center rounded-full bg-control text-[1rem] text-ink-2 shadow-[inset_0_0_0_1px_var(--control-line)]">
              {i + 1}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
              <span className="t-callout font-semibold text-ink">
                {s.title}
                {/* L'icona segue l'ultima parola anche quando il titolo va a capo. */}
                <span aria-hidden className="ml-1.5 inline-block align-[-3px] text-accent-ink">
                  {s.icon === 'app' ? <AppMark size={18} /> : renderIcon(s.icon, 17, 2.2)}
                </span>
              </span>
              {s.text && <span className="t-footnote text-ink-2">{s.text}</span>}
            </span>
          </li>
        ))}
      </ol>
      {note && <p className="t-footnote rounded-[12px] bg-ink-soft px-3 py-2.5 text-ink-2">{note}</p>}
      {onDismiss && (
        <Button variant="ghost" size="sm" className="-mb-1 self-start" onClick={onDismiss}>
          Più tardi
        </Button>
      )}
    </Card>
  );
}
