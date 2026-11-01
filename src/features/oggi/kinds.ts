/**
 * Aspetto e comportamento delle voci della giornata: icona, colore e azione del tocco sul corpo della voce.
 *
 * Colori: il tipo di giorno veste i pasti (la merenda del giorno di partita è del colore del calcio, non del
 * verde acqua di un giorno leggero); calcio, palestra e notte hanno il loro colore; il resto è neutro.
 */
import type { CSSProperties, ComponentType } from 'react';
import {
  Apple,
  BedDouble,
  ChefHat,
  ClipboardCheck,
  ClipboardList,
  Coffee,
  Dumbbell,
  Drumstick,
  HeartPulse,
  Pill,
  Sandwich,
  ShoppingBasket,
  SmartphoneCharging,
  Soup,
  UtensilsCrossed,
  Zap,
} from 'lucide-react';
import type { DayType } from '../../domain/types';
import type { DayItem } from '../../engine/timeline';
import { BallIcon, type AnyTone } from '../../ui';

export type ItemIcon = ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string; style?: CSSProperties }>;

export function itemIcon(item: DayItem): ItemIcon {
  switch (item.kind) {
    case 'controllo':
      return ClipboardCheck;
    case 'integratori':
      return Pill;
    case 'palestra':
      return Dumbbell;
    case 'calcio':
      return BallIcon;
    case 'fisio':
      return HeartPulse;
    case 'coprifuoco':
      return SmartphoneCharging;
    case 'letto':
      return BedDouble;
    case 'spesa':
      return ShoppingBasket;
    case 'preparazione':
      return ChefHat;
    case 'revisione':
      return ClipboardList;
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

/** Colore della voce: i pasti prendono il tipo di giorno; integratori e fisioterapista restano neutri. */
export function itemTone(item: DayItem, dayType: DayType): AnyTone {
  switch (item.kind) {
    case 'controllo':
    case 'preparazione':
    case 'revisione':
      return 'accent';
    case 'pasto':
      return dayType;
    case 'integratori':
    case 'fisio':
    case 'spesa':
      return 'neutral';
    case 'palestra':
      return 'palestra';
    case 'calcio':
      return 'calcio';
    case 'coprifuoco':
    case 'letto':
      return 'riposo';
    case 'minima':
      if (item.id === 'minima:integratori') return 'neutral';
      if (item.id === 'minima:telefono') return 'riposo';
      return dayType;
  }
}

/** Il tocco sul corpo della voce apre qualcosa (ricetta, seduta, calcio…) invece di segnarla. */
export function opensDetail(item: DayItem): boolean {
  switch (item.kind) {
    case 'pasto':
      // Prima della spesa la ricetta non serve: il tocco segna il pasto, il piano B è sotto la voce.
      return Boolean(item.ref) && !item.preShopping;
    case 'palestra':
    case 'calcio':
    case 'controllo':
    case 'fisio':
    case 'spesa':
    case 'preparazione':
    case 'revisione':
      return true;
    default:
      return false;
  }
}

/** Etichetta dell'azione che apre il dettaglio. */
export function detailLabel(item: DayItem): string {
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
    case 'spesa':
      return 'Apri la lista';
    case 'preparazione':
      return 'Apri la guida';
    case 'revisione':
      return 'Apri la revisione';
    default:
      return 'Apri';
  }
}

/** Suggerimenti rapidi per la nota di "sostituito". */
export function replaceSuggestions(item: DayItem): string[] {
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
    case 'spesa':
      return ['Spesa online', 'Solo una parte', 'Al mercato'];
    case 'preparazione':
      return ['Solo una parte', 'Fatta sabato', 'Piatti pronti di qualità'];
    case 'coprifuoco':
    case 'minima':
      return ['Più tardi del previsto'];
    default:
      return [];
  }
}

/** Etichette da tabellone: Barlow Condensed maiuscolo, spaziato. Il mono resta per orari e dati. */
export const BOARD_LABEL = 'font-display text-[0.8125rem] font-semibold uppercase leading-none tracking-[0.12em]';

/**
 * La voce ammette "Sostituito"? Coprifuoco, letto e telefono fuori no: o si fa o si salta, un'alternativa non ha
 * senso. Le altre voci sì (un pasto diverso, un'altra attività).
 */
export function canReplace(item: Pick<DayItem, 'kind' | 'id'>): boolean {
  return item.kind !== 'coprifuoco' && item.kind !== 'letto' && item.id !== 'minima:telefono';
}
