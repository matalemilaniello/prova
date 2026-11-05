/**
 * Lettura registrata per le anteprime e i flussi automatici (`?coach=finto`, docs/FASE2.md § 11.7): nessuna rete,
 * nessuna chiave. Dati inventati e generici, passati dal validatore vero come una risposta dell'API.
 */
import { validatePhotoReading } from '../../engine/coachTasks/photo';
import type { PhotoReading } from '../../engine/estimate';

const RAW = {
  outcome: 'piatto',
  items: [
    { label: 'Pasta', foodId: 'pasta', grams: 230, confidence: 'alta', role: 'alimento', per100g: null },
    { label: 'Ceci', foodId: 'ceci', grams: 80, confidence: 'media', role: 'alimento', per100g: null },
    { label: 'Passata di pomodoro', foodId: 'passata', grams: 90, confidence: 'media', role: 'alimento', per100g: null },
    { label: 'Grana', foodId: 'grana', grams: 10, confidence: 'bassa', role: 'condimento', per100g: null },
  ],
  cooking: 'bollito',
  oil: 'cucchiaio',
  matchesPlanned: 'in-parte',
  dishName: 'Pasta e ceci',
  note: 'Il condimento sul fondo del piatto non si vede bene.',
};

/** La lettura registrata, già validata. */
export function fakeReading(): PhotoReading {
  const res = validatePhotoReading(RAW);
  if (!res.ok) throw new Error('lettura registrata non valida');
  return res.value;
}

/** Un'anteprima senza rete: `?coach=finto` nell'indirizzo. */
export const FAKE_DELAY_MS = 450;
