/**
 * Aspetto e comportamento delle voci della timeline: icona, colore e azione del tocco sul corpo della voce.
 */
import {
  Apple,
  BedDouble,
  ClipboardCheck,
  Coffee,
  Dumbbell,
  Drumstick,
  HeartPulse,
  Pill,
  Sandwich,
  SmartphoneCharging,
  Soup,
  Trophy,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { TimelineItem } from '../../domain/types';
import type { AnyTone } from '../../ui';

export function itemIcon(item: TimelineItem): LucideIcon {
  switch (item.kind) {
    case 'controllo':
      return ClipboardCheck;
    case 'integratori':
      return Pill;
    case 'palestra':
      return Dumbbell;
    case 'calcio':
      return Trophy;
    case 'fisio':
      return HeartPulse;
    case 'coprifuoco':
      return SmartphoneCharging;
    case 'letto':
      return BedDouble;
    case 'minima':
      if (item.id === 'minima:proteine') return Drumstick;
      if (item.id === 'minima:frutto') return Apple;
      if (item.id === 'minima:integratori') return Pill;
      return SmartphoneCharging;
    case 'pasto':
      switch (item.slot) {
        case 'colazione':
          return Coffee;
        case 'spuntino':
          return Apple;
        case 'pranzo':
          return UtensilsCrossed;
        case 'merenda':
          return item.title.startsWith('Merenda pre-') ? Zap : Sandwich;
        default:
          return Soup;
      }
  }
}

export function itemTone(item: TimelineItem): AnyTone {
  switch (item.kind) {
    case 'controllo':
      return 'accent';
    case 'pasto':
      return 'leggero';
    case 'integratori':
      return 'warn';
    case 'palestra':
    case 'fisio':
      return 'palestra';
    case 'calcio':
      return 'calcio';
    case 'coprifuoco':
    case 'letto':
      return 'riposo';
    case 'minima':
      if (item.id === 'minima:integratori') return 'warn';
      if (item.id === 'minima:telefono') return 'riposo';
      return 'leggero';
  }
}

/** Il tocco sul corpo della voce apre qualcosa (ricetta, seduta, calcio…) invece di segnarla. */
export function opensDetail(item: TimelineItem): boolean {
  switch (item.kind) {
    case 'pasto':
      return Boolean(item.ref);
    case 'palestra':
    case 'calcio':
    case 'controllo':
    case 'fisio':
      return true;
    default:
      return false;
  }
}

/** Etichetta dell'azione che apre il dettaglio. */
export function detailLabel(item: TimelineItem): string {
  switch (item.kind) {
    case 'pasto':
      return 'Ricetta';
    case 'palestra':
      return 'Inizia';
    case 'calcio':
      return 'Minuti e RPE';
    case 'controllo':
      return 'Compila';
    case 'fisio':
      return 'Esercizi';
    default:
      return 'Apri';
  }
}

/** Suggerimenti rapidi per la nota di "sostituito". */
export function replaceSuggestions(item: TimelineItem): string[] {
  switch (item.kind) {
    case 'pasto':
      return item.slot === 'spuntino' || item.slot === 'merenda'
        ? ['Preso al bar', 'Yogurt e frutta', 'Panino', 'Barretta']
        : ['Mangiato fuori', 'Panino al bar', 'Pizza', 'Piatto pronto', 'Ho cucinato altro'];
    case 'palestra':
      return ['Seduta più corta', 'Corsa leggera', 'Solo prevenzione', 'Altro allenamento'];
    case 'calcio':
      return ['Ho giocato meno', 'Solo riscaldamento', 'Corsa al posto del calcio'];
    case 'fisio':
      return ['Solo una parte', 'Fatti in palestra'];
    case 'coprifuoco':
    case 'minima':
      return ['Più tardi del previsto'];
    default:
      return [];
  }
}
