import { FlaskConical } from 'lucide-react';
import { useApp } from '../state/store';
import { Pill } from './Pill';

/** Etichetta "Dati di esempio", visibile solo quando sono attivi. */
export function DemoBadge({ className }: { className?: string }) {
  const demo = useApp((s) => s.settings.demoData);
  if (!demo) return null;
  return (
    <Pill tone="riposo" icon={FlaskConical} className={className}>
      Dati di esempio
    </Pill>
  );
}
