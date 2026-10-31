import { Activity, BatteryCharging, Cookie, Dumbbell, Flame, Moon, Salad, Scale, type LucideIcon } from 'lucide-react';
import type { Proposal } from '../../domain/types';
import type { AnyTone } from '../../ui';

/** Icona, colore ed etichetta di ogni area delle proposte. */
export const AREA_META: Record<Proposal['area'], { icon: LucideIcon; tone: AnyTone; label: string }> = {
  sonno: { icon: Moon, tone: 'riposo', label: 'Sonno' },
  calorie: { icon: Flame, tone: 'accent', label: 'Calorie' },
  peso: { icon: Scale, tone: 'neutral', label: 'Peso' },
  dolore: { icon: Activity, tone: 'bad', label: 'Dolore' },
  allenamento: { icon: Dumbbell, tone: 'palestra', label: 'Carico' },
  scarico: { icon: BatteryCharging, tone: 'leggero', label: 'Scarico' },
  fibre: { icon: Salad, tone: 'good', label: 'Fibre' },
  dolci: { icon: Cookie, tone: 'warn', label: 'Dolci' },
};

/** Siti delle pliche (Jackson e Pollock a 7 siti): l'utente sceglie quali misura. */
export const SKINFOLD_SITES = ['Addome', 'Sovrailiaca', 'Coscia', 'Petto', 'Tricipite', 'Sottoscapolare', 'Ascellare'] as const;

/** Voti della revisione, nell'ordine in cui si chiedono. */
export const VOTE_FIELDS = [
  { key: 'energia', label: 'Energia', low: 'Scarico', high: 'Pieno' },
  { key: 'digestione', label: 'Digestione', low: 'Pesante', high: 'Leggera' },
  { key: 'umore', label: 'Umore', low: 'Giù', high: 'Ottimo' },
  { key: 'campo', label: 'Sensazioni in campo', low: 'Gambe pesanti', high: 'Brillante' },
] as const;

export type VoteKey = (typeof VOTE_FIELDS)[number]['key'];
