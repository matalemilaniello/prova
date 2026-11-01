/** Icona e colore di ogni promemoria del calendario: gli stessi in Impostazioni > Promemoria e nel benvenuto. */
import { CalendarCheck2, ClipboardCheck, Coffee, Dumbbell, HeartPulse, Smartphone, UtensilsCrossed } from 'lucide-react';
import type { ReminderKind } from '../../../engine/ics';
import type { AnyTone } from '../../../ui';

export const KIND_ICON: Record<ReminderKind, { icon: typeof Coffee; tone: AnyTone }> = {
  controllo: { icon: ClipboardCheck, tone: 'good' },
  colazione: { icon: Coffee, tone: 'accent' },
  pranzo: { icon: UtensilsCrossed, tone: 'palestra' },
  palestra: { icon: Dumbbell, tone: 'palestra' },
  fisio: { icon: HeartPulse, tone: 'leggero' },
  coprifuoco: { icon: Smartphone, tone: 'riposo' },
  revisione: { icon: CalendarCheck2, tone: 'good' },
};
