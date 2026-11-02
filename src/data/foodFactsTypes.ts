/**
 * Tipi dei fatti degli alimenti (docs/FASE2.md § 4.8): solo tipi, dall'onda 0. Li usano `data/estimateFoods.ts`
 * (onda 1A), `data/foodFacts.ts` (onda 1B) e i motori della prevenzione e del menù. Dati locali, fuori dal contratto.
 */

export type FoodGroup =
  | 'carne-rossa'
  | 'carne-lavorata'
  | 'pollame'
  | 'pesce'
  | 'pesce-grasso'
  | 'uova'
  | 'legumi'
  | 'cereale-integrale'
  | 'cereale-raffinato'
  | 'patate'
  | 'verdura'
  | 'frutta'
  | 'frutta-essiccata'
  | 'frutta-guscio'
  | 'latticini'
  | 'condimento'
  | 'dolce';

export interface FoodFacts {
  group: FoodGroup;
  /** Equivalente secco per A9: grammi di cereale integrale per grammo mangiato (pane e fiocchi 1, pasta integrale cotta circa 0,45). */
  wholeGrainDry?: number;
  /** Prodotto di riso (A3, A5). */
  rice?: boolean;
  /** Zuccheri liberi per 100 g (etichetta o CREA, fonte nel commento); assente = 0. */
  freeSugarG?: number;
  /** Ultra-trasformato (NOVA 4). */
  upf?: boolean;
  /** Stagionalità dei freschi (§ 4.10): `months` = mesi di stagione 1-12; `strict` = fuori da quei mesi non entra. */
  season?: { months: number[]; strict: boolean };
}
