/**
 * Fatti degli alimenti dell'archivio (docs/FASE2.md § 4.8): gruppo, equivalente secco dei cereali integrali, prodotti di
 * riso, zuccheri liberi, ultra-trasformati e stagionalità. Dati locali, fuori dal contratto, con un test di copertura:
 * ogni alimento di `FOODS` ha i suoi fatti.
 *
 * `factsOf(foodId)` è l'unico accesso per motori e test: legge questi e quelli degli alimenti di sola stima
 * (`ESTIMATE_FOOD_FACTS` in data/estimateFoods.ts, onda 1A).
 *
 * Fonti e convenzioni:
 * - gruppi come nelle linee guida CREA 2018 e nelle definizioni WCRF e IARC (carne rossa = carne muscolare di mammifero;
 *   carne lavorata = salata, stagionata, affumicata o conservata). Il pesce azzurro e il salmone sono `pesce-grasso`.
 *   Piselli surgelati come verdura amidacea: nel menù accompagnano il piatto e le regole dei legumi intorno al calcio
 *   riguardano i legumi secchi o in barattolo (test del menù) [ipotesi: per i CREA sono legumi freschi];
 * - `wholeGrainDry` (A9, WCRF CUP: RR 0,83 ogni 90 g al giorno): pane e fiocchi come si comprano (1), pasta integrale
 *   cotta 0,45, riso e cous cous integrali 0,4 (resa della cottura, la stessa di `buyFactor`); farro e orzo perlati non
 *   sono integrali;
 * - `freeSugarG` (A10, OMS 2015): zuccheri aggiunti più quelli di miele, sciroppi e succhi; non lo sono quelli del latte
 *   e della frutta intera, anche essiccata. Valori da etichette tipiche dei prodotti in Italia o dalle tabelle CREA;
 * - `upf` (NOVA 4, Monteiro 2019): prodotti confezionati industriali con additivi tipici (cereali da colazione, fette
 *   biscottate, crackers, piadine confezionate) [ipotesi: dipende dalla marca];
 * - `season`: tabella del § 4.10 per il centro-nord [pratica, da far verificare all'utente]. Senza `season` l'alimento
 *   vale tutto l'anno (surgelati, dispensa, mela, banana, limone, carote, cipolla, patate, insalata in busta).
 *   Per gli alimenti `strict` i mesi comprendono anche quelli «fuori stagione ma ammessi» della tabella.
 */
import type { FoodFacts } from './foodFactsTypes';
import { ESTIMATE_FOOD_FACTS } from './estimateFoods';

/** Mesi dell'anno, 1-12. */
const ALL_BUT = (...skip: number[]) => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((m) => !skip.includes(m));

export const FOOD_FACTS: Record<string, FoodFacts> = {
  // ───────────────────────── Pane e cereali ─────────────────────────
  'riso-basmati': { group: 'cereale-raffinato', rice: true },
  // Vietato (A3): più arsenico inorganico del riso bianco (limite UE 0,25 mg/kg contro 0,15, Reg. UE 2023/915).
  'riso-integrale': { group: 'cereale-integrale', rice: true, wholeGrainDry: 0.4 },
  pasta: { group: 'cereale-raffinato' },
  'pasta-integrale': { group: 'cereale-integrale', wholeGrainDry: 0.45 },
  // Pasta di sola farina di lenticchie: per il menù è un legume (test del menù), non un cereale.
  'pasta-lenticchie': { group: 'legumi' },
  farro: { group: 'cereale-raffinato' },
  orzo: { group: 'cereale-raffinato' },
  couscous: { group: 'cereale-raffinato' },
  'couscous-integrale': { group: 'cereale-integrale', wholeGrainDry: 0.4 },
  'pane-integrale': { group: 'cereale-integrale', wholeGrainDry: 1 },
  'pane-bianco': { group: 'cereale-raffinato' },
  'piadina-integrale': { group: 'cereale-integrale', wholeGrainDry: 1, upf: true },
  // Etichette tipiche: 5-7 g di zuccheri aggiunti per 100 g.
  'fette-biscottate': { group: 'cereale-integrale', wholeGrainDry: 1, freeSugarG: 5, upf: true },
  // Vietate (A3): limite UE dell'arsenico inorganico 0,30 mg/kg per gallette e riso soffiato.
  'gallette-riso': { group: 'cereale-raffinato', rice: true },
  avena: { group: 'cereale-integrale', wholeGrainDry: 1 },
  muesli: { group: 'cereale-integrale', wholeGrainDry: 1 },
  // Etichetta tipica dei fiocchi di mais classici: circa 8 g di zuccheri aggiunti per 100 g.
  'fiocchi-mais': { group: 'cereale-raffinato', freeSugarG: 8, upf: true },
  // Etichette tipiche: 1-3 g di zuccheri aggiunti (anche come estratto di malto).
  'crackers-integrali': { group: 'cereale-integrale', wholeGrainDry: 1, freeSugarG: 2, upf: true },

  // ───────────────────────── Legumi ─────────────────────────
  ceci: { group: 'legumi' },
  cannellini: { group: 'legumi' },
  borlotti: { group: 'legumi' },
  lenticchie: { group: 'legumi' },
  'lenticchie-rosse': { group: 'legumi' },
  piselli: { group: 'verdura' },
  edamame: { group: 'legumi' },
  hummus: { group: 'legumi' },
  'ceci-tostati': { group: 'legumi' },

  // ───────────────────────── Carne e pesce ─────────────────────────
  pollo: { group: 'pollame' },
  tacchino: { group: 'pollame' },
  manzo: { group: 'carne-rossa' },
  salmone: { group: 'pesce-grasso' },
  'salmone-affumicato': { group: 'pesce-grasso' },
  merluzzo: { group: 'pesce' },
  gamberi: { group: 'pesce' },
  tonno: { group: 'pesce' },
  sgombro: { group: 'pesce-grasso' },

  // ───────────────────────── Latticini e uova ─────────────────────────
  uova: { group: 'uova' },
  albume: { group: 'uova' },
  'yogurt-greco-0': { group: 'latticini' },
  'yogurt-greco-2': { group: 'latticini' },
  skyr: { group: 'latticini' },
  latte: { group: 'latticini' },
  kefir: { group: 'latticini' },
  'fiocchi-latte': { group: 'latticini' },
  ricotta: { group: 'latticini' },
  grana: { group: 'latticini' },
  feta: { group: 'latticini' },

  // ───────────────────────── Frutta ─────────────────────────
  mela: { group: 'frutta' },
  pera: { group: 'frutta', season: { months: ALL_BUT(5, 6), strict: false } },
  banana: { group: 'frutta' },
  arancia: { group: 'frutta', season: { months: [1, 2, 3, 4, 5, 11, 12], strict: true } },
  clementine: { group: 'frutta', season: { months: [1, 2, 3, 11, 12], strict: true } },
  kiwi: { group: 'frutta', season: { months: [1, 2, 3, 4, 11, 12], strict: false } },
  'frutti-bosco': { group: 'frutta' },
  datteri: { group: 'frutta-essiccata' },

  // ───────────────────────── Verdura ─────────────────────────
  insalata: { group: 'verdura' },
  rucola: { group: 'verdura', season: { months: [4, 5, 6, 7, 8, 9, 10], strict: false } },
  'spinaci-novelli': { group: 'verdura', season: { months: [1, 2, 3, 4, 5, 10, 11, 12], strict: false } },
  spinaci: { group: 'verdura' },
  zucchine: { group: 'verdura', season: { months: [5, 6, 7, 8, 9], strict: false } },
  broccoli: { group: 'verdura' },
  fagiolini: { group: 'verdura' },
  minestrone: { group: 'verdura' },
  'verdure-grigliate': { group: 'verdura' },
  soffritto: { group: 'verdura' },
  'vellutata-pronta': { group: 'verdura' },
  passata: { group: 'verdura' },
  pomodorini: { group: 'verdura', season: { months: [6, 7, 8, 9], strict: false } },
  carote: { group: 'verdura' },
  // In tabella: ● gennaio e settembre-dicembre, ○ febbraio, fuori da marzo ad agosto.
  zucca: { group: 'verdura', season: { months: [1, 2, 9, 10, 11, 12], strict: true } },
  'cipolla-rossa': { group: 'verdura' },
  cetriolo: { group: 'verdura', season: { months: [5, 6, 7, 8, 9], strict: false } },
  peperoni: { group: 'verdura', season: { months: [6, 7, 8, 9], strict: false } },
  patate: { group: 'patate' },
  limone: { group: 'condimento' },

  // ───────────────────────── Frutta secca, semi, dolci ─────────────────────────
  mandorle: { group: 'frutta-guscio' },
  noci: { group: 'frutta-guscio' },
  'burro-arachidi': { group: 'frutta-guscio' },
  'semi-chia': { group: 'frutta-guscio' },
  // Etichette tipiche dell'85%: 11-15 g di zucchero aggiunto per 100 g.
  'cioccolato-fondente': { group: 'dolce', freeSugarG: 14 },
  cacao: { group: 'condimento' },
  // CREA: zuccheri solubili 80,3 g per 100 g, tutti liberi (OMS 2015).
  miele: { group: 'dolce', freeSugarG: 80 },
  // Etichette tipiche: circa 58 g di zuccheri, di cui circa 5 della frutta (SACN 2015 conta liberi anche quelli della
  // frutta cotta in purea: stima prudente).
  confettura: { group: 'dolce', freeSugarG: 55 },

  // ───────────────────────── Condimenti e spezie (dispensa) ─────────────────────────
  'olio-evo': { group: 'condimento' },
  // Mosto d'uva cotto concentrato: zuccheri liberi, circa 15-20 g per 100 g nelle etichette tipiche.
  'aceto-balsamico': { group: 'condimento', freeSugarG: 15 },
  'salsa-soia': { group: 'condimento' },
  sale: { group: 'condimento' },
  pepe: { group: 'condimento' },
  origano: { group: 'condimento' },
  rosmarino: { group: 'condimento' },
  cannella: { group: 'condimento' },
  curcuma: { group: 'condimento' },
  paprika: { group: 'condimento' },
  aglio: { group: 'condimento' },
};

/** Fatti di un alimento di FOODS o di ESTIMATE_FOODS: l'unico accesso per motori e test. */
export function factsOf(foodId: string): FoodFacts | undefined {
  if (own(FOOD_FACTS, foodId)) return FOOD_FACTS[foodId];
  if (own(ESTIMATE_FOOD_FACTS, foodId)) return ESTIMATE_FOOD_FACTS[foodId];
  return undefined;
}

const own = (o: object, k: string) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

/** Il fresco è di stagione nel mese (1-12): senza `season` sempre; con `season` se il mese è tra i suoi. */
export function inSeason(facts: FoodFacts | undefined, month: number): boolean {
  if (!facts?.season) return true;
  return facts.season.months.includes(month);
}

/** Il fresco può entrare nel menù nel mese: fuori stagione solo se non è `strict` (paga un costo nel generatore). */
export function seasonAllows(facts: FoodFacts | undefined, month: number): boolean {
  return !facts?.season?.strict || facts.season.months.includes(month);
}
