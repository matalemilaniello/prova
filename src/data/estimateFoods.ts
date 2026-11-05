/**
 * Alimenti di sola stima (docs/FASE2.md § 7.3): pizza, cornetto, tramezzino, salumi e simili. Non entrano mai nel menù
 * né nella spesa: servono alle stime da foto, ai piatti salvati e alle misure della prevenzione (i salumi hanno gruppo
 * `carne-lavorata`, così la revisione li conta).
 *
 * Valori per 100 g nello stato in cui si mangia, con la convenzione di `foods.ts` (carboidrati disponibili, energia di
 * Atwater con 2 kcal per grammo di fibra). Sono arrotondati sull'ordine di grandezza delle tabelle CREA (Tabelle di
 * composizione degli alimenti) e della banca dati BDA-IEO per la voce indicata nel commento; per i piatti composti
 * (pizza, lasagna, kebab, panini) sono la stima di una ricetta tipica da bar o da asporto. Prima di cambiarli si
 * controllano sulla fonte primaria (§ 14.4): sono stime, come le foto da cui nascono.
 *
 * Un piatto composto ha un solo gruppo, quello dell'ingrediente che decide la regola di prevenzione (il panino al
 * prosciutto cotto è `carne-lavorata`, l'hamburger e la lasagna al ragù `carne-rossa`): i grammi sono quelli del piatto
 * intero e `meatShare` dice quanta parte del peso è carne, così 200 g di hamburger nel panino non contano come 200 g di
 * carne rossa. Le quote sono stime di una ricetta tipica da bar o da asporto [ipotesi, da rivedere con l'utente].
 * `upf` segue la versione più comune al bar o al supermercato (NOVA 4), non quella fatta in casa.
 */
import type { Food } from '../domain/types';
import type { FoodFacts } from './foodFactsTypes';

export const ESTIMATE_FOODS: Food[] = [
  // ───────────────────────── Pizza, pane e panini ─────────────────────────
  {
    // CREA: pizza con pomodoro e mozzarella; BDA-IEO: pizza margherita.
    id: 'pizza-margherita',
    name: 'Pizza margherita',
    category: 'Pane e cereali',
    per100g: { kcal: 265, proteinG: 10.5, carbG: 34, fatG: 9.5, fiberG: 2 },
    unitGrams: {},
  },
  {
    // Stima su pizza margherita con verdure grigliate al posto di parte della mozzarella.
    id: 'pizza-verdure',
    name: 'Pizza alle verdure',
    category: 'Pane e cereali',
    per100g: { kcal: 230, proteinG: 8.5, carbG: 31, fatG: 8, fiberG: 2.5 },
    unitGrams: {},
  },
  {
    // CREA: focaccia (schiacciata) all'olio.
    id: 'focaccia',
    name: 'Focaccia',
    category: 'Pane e cereali',
    per100g: { kcal: 330, proteinG: 7.5, carbG: 46, fatG: 12.5, fiberG: 2.5 },
    unitGrams: {},
  },
  {
    // BDA-IEO: tramezzino (pane in cassetta, farcitura con maionese).
    id: 'tramezzino',
    name: 'Tramezzino',
    category: 'Pane e cereali',
    per100g: { kcal: 260, proteinG: 10, carbG: 24, fatG: 13.5, fiberG: 1.5 },
    unitGrams: {},
  },
  {
    // Stima: pane comune (CREA) e prosciutto cotto (CREA) in parti da bar, circa 2 a 1.
    id: 'panino-prosciutto-cotto',
    name: 'Panino al prosciutto cotto',
    category: 'Pane e cereali',
    per100g: { kcal: 255, proteinG: 13, carbG: 33, fatG: 7.5, fiberG: 1.8 },
    unitGrams: {},
  },
  {
    // Stima: piadina comune (CREA) con salume e formaggio, la farcitura più diffusa.
    id: 'piadina-farcita',
    name: 'Piadina farcita',
    category: 'Pane e cereali',
    per100g: { kcal: 300, proteinG: 12, carbG: 32, fatG: 13.5, fiberG: 1.6 },
    unitGrams: {},
  },
  {
    // BDA-IEO: toast con prosciutto cotto e formaggio.
    id: 'toast-prosciutto-formaggio',
    name: 'Toast prosciutto e formaggio',
    category: 'Pane e cereali',
    per100g: { kcal: 270, proteinG: 13, carbG: 28, fatG: 11.5, fiberG: 1.5 },
    unitGrams: {},
  },
  {
    // Stima su panino con hamburger di manzo da fast food (pane, carne, salse).
    id: 'hamburger',
    name: 'Hamburger nel panino',
    category: 'Carne e pesce',
    per100g: { kcal: 250, proteinG: 13, carbG: 26, fatG: 10, fiberG: 1.5 },
    unitGrams: {},
  },
  {
    // Stima su kebab nella piadina o nella pita, con verdure e salsa.
    id: 'kebab',
    name: 'Kebab',
    category: 'Carne e pesce',
    per100g: { kcal: 215, proteinG: 12, carbG: 20, fatG: 9.5, fiberG: 1.5 },
    unitGrams: {},
  },

  // ───────────────────────── Primi e piatti pronti ─────────────────────────
  {
    // CREA: lasagne al forno (ragù di carne e besciamella).
    id: 'lasagna',
    name: 'Lasagna al ragù',
    category: 'Pane e cereali',
    per100g: { kcal: 160, proteinG: 8.5, carbG: 15, fatG: 7.5, fiberG: 1 },
    unitGrams: {},
  },
  {
    // CREA: pasta al ragù (piatto pronto da mangiare).
    id: 'pasta-ragu',
    name: 'Pasta al ragù',
    category: 'Pane e cereali',
    per100g: { kcal: 165, proteinG: 7, carbG: 23, fatG: 5, fiberG: 1.5 },
    unitGrams: {},
  },
  {
    // BDA-IEO: risotto (riso, burro, grana, brodo).
    id: 'risotto',
    name: 'Risotto',
    category: 'Pane e cereali',
    per100g: { kcal: 150, proteinG: 3.5, carbG: 24, fatG: 4.5, fiberG: 0.5 },
    unitGrams: {},
  },
  {
    // Stima su sushi misto (nigiri e maki): riso condito e pesce crudo.
    id: 'sushi',
    name: 'Sushi misto',
    category: 'Carne e pesce',
    per100g: { kcal: 150, proteinG: 6, carbG: 27, fatG: 2, fiberG: 0.5 },
    unitGrams: {},
  },
  {
    // CREA: petto di pollo impanato e fritto.
    id: 'cotoletta-pollo',
    name: 'Cotoletta di pollo impanata',
    category: 'Carne e pesce',
    per100g: { kcal: 240, proteinG: 18, carbG: 12, fatG: 13, fiberG: 0.6 },
    unitGrams: {},
  },
  {
    // CREA: cotoletta alla milanese (vitello impanato e fritto nel burro).
    id: 'cotoletta-milanese',
    name: 'Cotoletta alla milanese',
    category: 'Carne e pesce',
    per100g: { kcal: 260, proteinG: 19, carbG: 11, fatG: 15.5, fiberG: 0.5 },
    unitGrams: {},
  },
  {
    // CREA: patate fritte (bastoncini da friggitrice).
    id: 'patatine-fritte',
    name: 'Patatine fritte',
    category: 'Surgelati',
    per100g: { kcal: 300, proteinG: 3.5, carbG: 36, fatG: 15.5, fiberG: 3 },
    unitGrams: {},
  },
  {
    // CREA: patatine in sacchetto (chips).
    id: 'patatine-busta',
    name: 'Patatine in busta',
    category: 'Dispensa',
    per100g: { kcal: 540, proteinG: 6, carbG: 50, fatG: 34, fiberG: 4 },
    unitGrams: { manciata: 25 },
  },

  // ───────────────────────── Salumi e formaggi ─────────────────────────
  {
    // CREA: prosciutto crudo (parte magra e grassa).
    id: 'prosciutto-crudo',
    name: 'Prosciutto crudo',
    category: 'Carne e pesce',
    per100g: { kcal: 235, proteinG: 26, carbG: 0.3, fatG: 14.5, fiberG: 0 },
    unitGrams: { fetta: 15 },
  },
  {
    // CREA: prosciutto cotto.
    id: 'prosciutto-cotto',
    name: 'Prosciutto cotto',
    category: 'Carne e pesce',
    per100g: { kcal: 135, proteinG: 19, carbG: 1, fatG: 6, fiberG: 0 },
    unitGrams: { fetta: 20 },
  },
  {
    // CREA: salame (tipo Milano).
    id: 'salame',
    name: 'Salame',
    category: 'Carne e pesce',
    per100g: { kcal: 400, proteinG: 25, carbG: 1, fatG: 33, fiberG: 0 },
    unitGrams: { fetta: 8 },
  },
  {
    // CREA: mortadella.
    id: 'mortadella',
    name: 'Mortadella',
    category: 'Carne e pesce',
    per100g: { kcal: 300, proteinG: 15, carbG: 1, fatG: 26, fiberG: 0 },
    unitGrams: { fetta: 20 },
  },
  {
    // CREA: bresaola.
    id: 'bresaola',
    name: 'Bresaola',
    category: 'Carne e pesce',
    per100g: { kcal: 155, proteinG: 33, carbG: 0.5, fatG: 2.5, fiberG: 0 },
    unitGrams: { fetta: 10 },
  },
  {
    // CREA: würstel (suino e pollo).
    id: 'wurstel',
    name: 'Würstel',
    category: 'Carne e pesce',
    per100g: { kcal: 270, proteinG: 13, carbG: 2, fatG: 23.5, fiberG: 0 },
    unitGrams: {},
  },
  {
    // CREA: mozzarella di vacca.
    id: 'mozzarella',
    name: 'Mozzarella',
    category: 'Latticini e uova',
    per100g: { kcal: 250, proteinG: 18.5, carbG: 1, fatG: 19, fiberG: 0 },
    unitGrams: {},
  },

  // ───────────────────────── Dolci, bar e bevande ─────────────────────────
  {
    // BDA-IEO: cornetto semplice (croissant).
    id: 'cornetto-vuoto',
    name: 'Cornetto vuoto',
    category: 'Dispensa',
    per100g: { kcal: 430, proteinG: 8, carbG: 48, fatG: 22.5, fiberG: 2 },
    unitGrams: {},
  },
  {
    // BDA-IEO: cornetto alla crema o al cioccolato.
    id: 'cornetto-farcito',
    name: 'Cornetto farcito',
    category: 'Dispensa',
    per100g: { kcal: 410, proteinG: 7, carbG: 50, fatG: 20, fiberG: 1.5 },
    unitGrams: {},
  },
  {
    // CREA: merendine tipo pan di Spagna farcito, crostatine.
    id: 'merendina',
    name: 'Merendina confezionata',
    category: 'Dispensa',
    per100g: { kcal: 420, proteinG: 6, carbG: 58, fatG: 18, fiberG: 1.5 },
    unitGrams: {},
  },
  {
    // CREA: biscotti frollini.
    id: 'biscotti-frollini',
    name: 'Biscotti frollini',
    category: 'Dispensa',
    per100g: { kcal: 460, proteinG: 7, carbG: 67, fatG: 18, fiberG: 2.5 },
    unitGrams: {},
  },
  {
    // BDA-IEO: tiramisù.
    id: 'tiramisu',
    name: 'Tiramisù',
    category: 'Latticini e uova',
    per100g: { kcal: 300, proteinG: 6, carbG: 30, fatG: 17, fiberG: 0.5 },
    unitGrams: {},
  },
  {
    // CREA: gelato alla crema (artigianale).
    id: 'gelato',
    name: 'Gelato',
    category: 'Latticini e uova',
    per100g: { kcal: 210, proteinG: 4, carbG: 26, fatG: 10, fiberG: 0.5 },
    unitGrams: {},
  },
  {
    // Stima: latte intero e caffè espresso, circa 4 a 1, senza zucchero.
    id: 'cappuccino',
    name: 'Cappuccino',
    category: 'Latticini e uova',
    per100g: { kcal: 42, proteinG: 2.2, carbG: 3.3, fatG: 2.2, fiberG: 0 },
    unitGrams: { tazza: 150 },
  },
  {
    // Etichette delle bevande gassate zuccherate più diffuse (circa 10,6 g di zuccheri per 100 ml).
    id: 'bibita-zuccherata',
    name: 'Bibita zuccherata',
    category: 'Dispensa',
    per100g: { kcal: 42, proteinG: 0, carbG: 10.6, fatG: 0, fiberG: 0 },
    unitGrams: { bicchiere: 200 },
  },

  // ───────────────────────── Condimenti visibili ─────────────────────────
  {
    // CREA: maionese.
    id: 'maionese',
    name: 'Maionese',
    category: 'Condimenti',
    per100g: { kcal: 680, proteinG: 1, carbG: 1.5, fatG: 75, fiberG: 0 },
    unitGrams: { cucchiaio: 15, cucchiaino: 5 },
  },
  {
    // CREA: pesto alla genovese.
    id: 'pesto',
    name: 'Pesto',
    category: 'Condimenti',
    per100g: { kcal: 480, proteinG: 5, carbG: 4, fatG: 49, fiberG: 1.5 },
    unitGrams: { cucchiaio: 15, cucchiaino: 5 },
  },
  {
    // CREA: burro.
    id: 'burro',
    name: 'Burro',
    category: 'Condimenti',
    per100g: { kcal: 740, proteinG: 0.8, carbG: 0.8, fatG: 82, fiberG: 0 },
    unitGrams: { cucchiaino: 5 },
  },
];

const fact = (group: FoodFacts['group'], extra: Omit<FoodFacts, 'group'> = {}): FoodFacts => ({ group, ...extra });

/**
 * Fatti di tutti gli alimenti di `ESTIMATE_FOODS` (test di copertura in `estimateFoods.test.ts`). Zuccheri liberi per
 * 100 g dalle stesse voci dei valori: per i dolci la quota di zuccheri aggiunti, per la bibita tutti gli zuccheri.
 */
export const ESTIMATE_FOOD_FACTS: Record<string, FoodFacts> = {
  'pizza-margherita': fact('cereale-raffinato'),
  'pizza-verdure': fact('cereale-raffinato'),
  focaccia: fact('cereale-raffinato'),
  tramezzino: fact('cereale-raffinato', { upf: true }),
  // Pane e prosciutto circa 2 a 1 (vedi i valori).
  'panino-prosciutto-cotto': fact('carne-lavorata', { upf: true, meatShare: 0.33 }),
  // Salume circa un quinto del peso, con formaggio e piadina.
  'piadina-farcita': fact('carne-lavorata', { meatShare: 0.2 }),
  'toast-prosciutto-formaggio': fact('carne-lavorata', { upf: true, meatShare: 0.2 }),
  // Carne cotta circa il 40% del panino (pane, salse, verdure).
  hamburger: fact('carne-rossa', { upf: true, meatShare: 0.4 }),
  kebab: fact('carne-rossa', { meatShare: 0.4 }),
  // Ragù di carne: la carne è circa il 15% del peso della lasagna o del piatto di pasta.
  lasagna: fact('carne-rossa', { meatShare: 0.15 }),
  'pasta-ragu': fact('carne-rossa', { meatShare: 0.15 }),
  risotto: fact('cereale-raffinato', { rice: true }),
  sushi: fact('cereale-raffinato', { rice: true, freeSugarG: 2 }),
  'cotoletta-pollo': fact('pollame'),
  // Vitello impanato: la panatura è circa un quarto del peso.
  'cotoletta-milanese': fact('carne-rossa', { meatShare: 0.75 }),
  'patatine-fritte': fact('patate', { upf: true }),
  'patatine-busta': fact('patate', { upf: true }),
  'prosciutto-crudo': fact('carne-lavorata'),
  'prosciutto-cotto': fact('carne-lavorata', { upf: true }),
  salame: fact('carne-lavorata'),
  mortadella: fact('carne-lavorata', { upf: true }),
  bresaola: fact('carne-lavorata'),
  wurstel: fact('carne-lavorata', { upf: true }),
  mozzarella: fact('latticini'),
  'cornetto-vuoto': fact('dolce', { freeSugarG: 10, upf: true }),
  'cornetto-farcito': fact('dolce', { freeSugarG: 18, upf: true }),
  merendina: fact('dolce', { freeSugarG: 25, upf: true }),
  'biscotti-frollini': fact('dolce', { freeSugarG: 22, upf: true }),
  tiramisu: fact('dolce', { freeSugarG: 20 }),
  gelato: fact('dolce', { freeSugarG: 20 }),
  cappuccino: fact('latticini'),
  'bibita-zuccherata': fact('dolce', { freeSugarG: 10.6, upf: true }),
  maionese: fact('condimento', { upf: true }),
  pesto: fact('condimento'),
  burro: fact('condimento'),
};
