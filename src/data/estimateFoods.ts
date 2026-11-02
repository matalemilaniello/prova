/**
 * Alimenti di sola stima (docs/FASE2.md § 7.3): pizza, cornetto, tramezzino, salumi e simili, con i valori per 100 g da
 * tabelle CREA o BDA-IEO e la fonte nel commento. Non entrano mai nel menù né nella spesa: servono alle stime da foto e
 * ai piatti salvati, e alle misure della prevenzione (i salumi hanno gruppo `carne-lavorata`).
 *
 * Onda 0: solo le esportazioni, vuote. L'onda 1A riempie entrambi gli elenchi, con il test di copertura (ogni voce di
 * `ESTIMATE_FOODS` ha i suoi fatti in `ESTIMATE_FOOD_FACTS`).
 */
import type { Food } from '../domain/types';
import type { FoodFacts } from './foodFactsTypes';

export const ESTIMATE_FOODS: Food[] = [];

/** Fatti di tutti gli alimenti di `ESTIMATE_FOODS`. */
export const ESTIMATE_FOOD_FACTS: Record<string, FoodFacts> = {};
