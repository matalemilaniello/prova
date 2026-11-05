/**
 * Fatti delle ricette (docs/FASE2.md § 4.5, § 4.8, § 4.11): le cotture di ogni ricetta, il metodo del riso e i
 * componenti della preparazione della domenica usati dalle ricette da preparazione (`batch`). Dati locali, fuori dal
 * contratto, con un test di copertura: ogni ricetta ha i suoi fatti, ogni ricetta con un prodotto di riso dichiara il
 * metodo (mai l'assorbimento, A5) e ogni ricetta `batch` i suoi componenti.
 *
 * Cotture dai passaggi delle ricette: il pane tostato conta come `forno` (D1, amidacei dorati e non bruni); il cous cous
 * rinvenuto in acqua bollente non è una cottura. I componenti (`prep`) sono gli id dei componenti della preparazione
 * (`PrepComponentId`), descritti in data/prepComponents.ts con minuti, resa e giorni in frigo; la guida passo passo sta in
 * `PREP_GUIDE` (data/menu.ts). `carry` dice quali ricette si portano via, per i pasti che cadono nel lavoro.
 */

export type Cooking = 'crudo' | 'lesso' | 'vapore' | 'umido' | 'forno' | 'padella' | 'griglia' | 'microonde';

/** Componenti della preparazione della domenica (§ 4.11). */
export type PrepComponentId =
  | 'riso-cotto'
  | 'pollo-cotto'
  | 'ragu-lenticchie'
  | 'frittatine'
  | 'barrette'
  | 'farro-cotto'
  | 'orzo-cotto'
  | 'vellutata-zucca'
  | 'patate-lesse'
  | 'vaschetta-recupero'
  | 'zuppa-cavolo-nero'
  | 'salmone-forno'
  | 'sacchetti-frutta-secca';

export interface RecipeFacts {
  cooking: Cooking[];
  /** Riso lessato in almeno 6 parti d'acqua e scolato, oppure in due acque (A5). */
  riceMethod?: 'scolato' | 'due-acque';
  /** Componenti della preparazione della domenica usati dalla ricetta (solo per le ricette `batch`). */
  prep?: PrepComponentId[];
  /**
   * Si porta via (§ 4.10, pasti «da portare» quando il pasto cade nel lavoro): si mangia freddo o a temperatura ambiente,
   * senza fornelli né microonde al momento. `ambiente` regge fuori frigo tutta la mattina (pane, formaggio stagionato,
   * frutta, frutta secca); `borsa-termica` contiene alimenti deperibili (yogurt, latticini freschi, carne, pesce, uova,
   * cereali cotti) e viaggia nella borsa termica con un siberino, per le poche ore fino al pasto [pratica: USDA, gli
   * alimenti deperibili non stanno oltre 2 ore fuori dal freddo].
   */
  carry?: 'ambiente' | 'borsa-termica';
}

export const RECIPE_FACTS: Record<string, RecipeFacts> = {
  // ───────────────────────── Colazioni ─────────────────────────
  'porridge-cacao-banana': { cooking: ['microonde', 'crudo'] },
  'overnight-oats-frutti-bosco': { cooking: ['crudo'], carry: 'borsa-termica' },
  'yogurt-greco-muesli-kiwi': { cooking: ['crudo'], carry: 'borsa-termica' },
  'pane-ricotta-miele': { cooking: ['forno', 'crudo'] },
  'uova-strapazzate-spinaci': { cooking: ['padella', 'forno', 'crudo'] },
  'cappuccino-fette-skyr': { cooking: ['forno', 'microonde', 'crudo'] },
  'pancake-avena-albumi': { cooking: ['padella', 'crudo'] },
  'pane-arachidi-banana': { cooking: ['forno', 'crudo'], carry: 'borsa-termica' },
  'pane-comune-arachidi-banana': { cooking: ['forno', 'crudo'], carry: 'borsa-termica' },

  // ───────────────────────── Spuntini e merende ─────────────────────────
  'panino-tonno-mela': { cooking: ['crudo'], carry: 'borsa-termica' },
  'crackers-grana-pera': { cooking: ['crudo'], carry: 'ambiente' },
  'yogurt-greco-noci-clementine': { cooking: ['crudo'], carry: 'borsa-termica' },
  'skyr-mela-mandorle': { cooking: ['crudo'], carry: 'borsa-termica' },
  'frittatine-spinaci': { cooking: ['forno'], prep: ['frittatine'], carry: 'borsa-termica' },
  'barrette-avena-datteri': { cooking: ['forno'], prep: ['barrette'], carry: 'ambiente' },
  'ceci-tostati-arancia': { cooking: ['crudo'], carry: 'ambiente' },
  'gallette-grana-clementine': { cooking: ['crudo'], carry: 'ambiente' },
  'pre-pane-banana': { cooking: ['forno', 'crudo'], carry: 'ambiente' },
  'pre-fiocchi-mais-latte': { cooking: ['crudo'] },
  'pre-pane-ricotta-miele': { cooking: ['crudo'], carry: 'borsa-termica' },
  'pre-frullato-banana': { cooking: ['crudo', 'forno'] },
  'yogurt-cacao-pera': { cooking: ['crudo'] },
  'skyr-frutti-bosco-avena': { cooking: ['microonde', 'crudo'] },
  'fiocchi-latte-pomodorini': { cooking: ['crudo'] },
  'pane-cioccolato-kefir': { cooking: ['crudo'] },
  'yogurt-banana': { cooking: ['crudo'], carry: 'borsa-termica' },

  // ───────────────────────── Pranzi e cene ─────────────────────────
  // Oggi un'insalata di pasta con il pollo della domenica (l'id è rimasto quello del riso).
  'riso-pollo-verdure-grigliate': { cooking: ['lesso', 'padella', 'crudo'], prep: ['pollo-cotto'], carry: 'borsa-termica' },
  'pasta-ceci-rosmarino': { cooking: ['lesso', 'padella'] },
  'insalata-ceci-tonno': { cooking: ['crudo', 'forno'], carry: 'borsa-termica' },
  'farro-salmone-zucchine': { cooking: ['lesso', 'padella'], prep: ['farro-cotto'] },
  'pasta-lenticchie-zucchine-feta': { cooking: ['lesso', 'padella'] },
  'pasta-tonno-pomodoro': { cooking: ['lesso', 'umido', 'crudo'] },
  'pasta-pollo-spinaci': { cooking: ['lesso', 'padella'] },
  'orzo-sgombro-cannellini': { cooking: ['lesso', 'microonde', 'crudo'], prep: ['orzo-cotto'], carry: 'borsa-termica' },
  'pasta-ragu-lenticchie': { cooking: ['lesso', 'umido'], prep: ['ragu-lenticchie'] },
  'riso-pollo-curcuma': { cooking: ['lesso', 'padella'], riceMethod: 'scolato' },
  'pasta-ricotta-spinaci': { cooking: ['lesso'] },
  'bowl-riso-salmone-edamame': { cooking: ['lesso', 'padella', 'crudo'], riceMethod: 'scolato' },
  'piadina-tacchino-hummus': { cooking: ['padella', 'microonde', 'crudo'] },
  'tacchino-limone-patate': { cooking: ['padella', 'microonde', 'crudo'] },
  'tacchino-riso-carote': { cooking: ['lesso', 'padella', 'crudo'], riceMethod: 'scolato' },
  'salmone-patate-broccoli': { cooking: ['microonde', 'padella'] },
  'merluzzo-pizzaiola-couscous': { cooking: ['umido', 'crudo'] },
  'merluzzo-ceci-couscous': { cooking: ['umido'] },
  'frittata-zucchine': { cooking: ['padella', 'crudo'] },
  'straccetti-manzo-rucola': { cooking: ['microonde', 'padella', 'crudo'] },
  'pollo-paprika-peperoni': { cooking: ['lesso', 'padella'], riceMethod: 'scolato' },
  'vellutata-zucca-lenticchie': { cooking: ['lesso', 'forno'], prep: ['vellutata-zucca'] },
  'vellutata-pronta-lenticchie': { cooking: ['umido', 'forno'] },
  'fagioli-tonno-cipolla': { cooking: ['crudo', 'forno'], carry: 'borsa-termica' },
  'uova-pomodoro-spinaci': { cooking: ['umido'] },
  'uova-spinaci-pane': { cooking: ['padella', 'forno'] },
  'minestrone-ditalini-borlotti': { cooking: ['lesso'] },
  'spaghetti-gamberi-zucchine': { cooking: ['lesso', 'padella'] },
  'box-riso-pollo-zucchine': {
    cooking: ['lesso', 'padella', 'microonde'],
    riceMethod: 'scolato',
    prep: ['riso-cotto', 'pollo-cotto', 'vaschetta-recupero'],
  },
  'couscous-pollo-spinaci': { cooking: ['padella'] },
  'pasta-fredda-tonno': { cooking: ['lesso', 'crudo'], carry: 'borsa-termica' },
  'couscous-gamberi-piselli': { cooking: ['padella'] },
  'riso-saltato-uova-piselli': { cooking: ['padella', 'microonde'], riceMethod: 'scolato', prep: ['riso-cotto'] },
  'patate-salmone-affumicato': { cooking: ['lesso', 'microonde', 'crudo'], prep: ['patate-lesse'] },

  // ───────────────────────── Ricette di stagione del menù generato (§ 4.10) ─────────────────────────
  'yogurt-mandarini-noci': { cooking: ['crudo'], carry: 'borsa-termica' },
  'pane-grana-arancia': { cooking: ['crudo'], carry: 'ambiente' },
  'yogurt-cachi-mandorle': { cooking: ['crudo'], carry: 'borsa-termica' },
  'yogurt-pesca-mandorle': { cooking: ['crudo'], carry: 'borsa-termica' },
  'yogurt-fragole-noci': { cooking: ['crudo'], carry: 'borsa-termica' },
  'porridge-pera-cannella': { cooking: ['microonde', 'crudo'] },
  'yogurt-avena-pesche': { cooking: ['crudo'], carry: 'borsa-termica' },
  'pasta-cavolfiore-ceci': { cooking: ['lesso', 'padella'] },
  'pollo-finocchi-arance': { cooking: ['padella', 'crudo'], carry: 'borsa-termica' },
  'zuppa-cavolo-nero-cannellini': { cooking: ['umido', 'forno'], prep: ['zuppa-cavolo-nero'] },
  // Il cous cous rinvenuto in acqua bollente non è una cottura; le zucchine sono crude, a nastri.
  'couscous-integrale-ceci-feta': { cooking: ['crudo'], carry: 'borsa-termica' },
  'couscous-lenticchie-carote': { cooking: ['lesso', 'crudo'], carry: 'borsa-termica' },
  'pasta-fredda-lenticchie-zucchine': { cooking: ['lesso', 'crudo'], carry: 'borsa-termica' },
  'pasta-integrale-pollo-peperoni': { cooking: ['lesso', 'padella'] },
  'salmone-couscous-fagiolini': { cooking: ['forno', 'microonde'], prep: ['salmone-forno'], carry: 'borsa-termica' },
  'pasta-integrale-sgombro-spinaci': { cooking: ['lesso', 'padella'] },
  'pre-pane-confettura-mela': { cooking: ['crudo'], carry: 'ambiente' },
  'pre-pane-ricotta-datteri': { cooking: ['crudo'], carry: 'borsa-termica' },
};

/** Fatti di una ricetta, o undefined se la ricetta non li ha. */
export function recipeFactsOf(recipeId: string): RecipeFacts | undefined {
  return typeof recipeId === 'string' && Object.prototype.hasOwnProperty.call(RECIPE_FACTS, recipeId) ? RECIPE_FACTS[recipeId] : undefined;
}
