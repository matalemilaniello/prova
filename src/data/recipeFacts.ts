/**
 * Fatti delle ricette (docs/FASE2.md § 4.5, § 4.8, § 4.11): le cotture di ogni ricetta, il metodo del riso e i
 * componenti della preparazione della domenica usati dalle ricette da preparazione (`batch`). Dati locali, fuori dal
 * contratto, con un test di copertura: ogni ricetta ha i suoi fatti, ogni ricetta con un prodotto di riso dichiara il
 * metodo (mai l'assorbimento, A5) e ogni ricetta `batch` i suoi componenti.
 *
 * Cotture dai passaggi delle ricette: il pane tostato conta come `forno` (D1, amidacei dorati e non bruni); il cous cous
 * rinvenuto in acqua bollente non è una cottura. I componenti (`prep`) sono gli id dei componenti della preparazione
 * (`PrepComponentId`): l'onda 2A li descrive in data/prepComponents.ts con minuti, guida e giorni in frigo.
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
  | 'vaschetta-recupero';

export interface RecipeFacts {
  cooking: Cooking[];
  /** Riso lessato in almeno 6 parti d'acqua e scolato, oppure in due acque (A5). */
  riceMethod?: 'scolato' | 'due-acque';
  /** Componenti della preparazione della domenica usati dalla ricetta (solo per le ricette `batch`). */
  prep?: PrepComponentId[];
}

export const RECIPE_FACTS: Record<string, RecipeFacts> = {
  // ───────────────────────── Colazioni ─────────────────────────
  'porridge-cacao-banana': { cooking: ['microonde', 'crudo'] },
  'overnight-oats-frutti-bosco': { cooking: ['crudo'] },
  'yogurt-greco-muesli-kiwi': { cooking: ['crudo'] },
  'pane-ricotta-miele': { cooking: ['forno', 'crudo'] },
  'uova-strapazzate-spinaci': { cooking: ['padella', 'forno', 'crudo'] },
  'cappuccino-fette-skyr': { cooking: ['forno', 'microonde', 'crudo'] },
  'pancake-avena-albumi': { cooking: ['padella', 'crudo'] },
  'pane-arachidi-banana': { cooking: ['forno', 'crudo'] },
  'pane-comune-arachidi-banana': { cooking: ['forno', 'crudo'] },

  // ───────────────────────── Spuntini e merende ─────────────────────────
  'panino-tonno-mela': { cooking: ['crudo'] },
  'crackers-grana-pera': { cooking: ['crudo'] },
  'yogurt-greco-noci-clementine': { cooking: ['crudo'] },
  'skyr-mela-mandorle': { cooking: ['crudo'] },
  'frittatine-spinaci': { cooking: ['forno'], prep: ['frittatine'] },
  'barrette-avena-datteri': { cooking: ['forno'], prep: ['barrette'] },
  'ceci-tostati-arancia': { cooking: ['crudo'] },
  'gallette-grana-clementine': { cooking: ['crudo'] },
  'pre-pane-banana': { cooking: ['forno', 'crudo'] },
  'pre-fiocchi-mais-latte': { cooking: ['crudo'] },
  'pre-pane-ricotta-miele': { cooking: ['crudo'] },
  'pre-frullato-banana': { cooking: ['crudo', 'forno'] },
  'yogurt-cacao-pera': { cooking: ['crudo'] },
  'skyr-frutti-bosco-avena': { cooking: ['microonde', 'crudo'] },
  'fiocchi-latte-pomodorini': { cooking: ['crudo'] },
  'pane-cioccolato-kefir': { cooking: ['crudo'] },
  'yogurt-banana': { cooking: ['crudo'] },

  // ───────────────────────── Pranzi e cene ─────────────────────────
  // Oggi un'insalata di pasta con il pollo della domenica (l'id è rimasto quello del riso).
  'riso-pollo-verdure-grigliate': { cooking: ['lesso', 'padella', 'crudo'], prep: ['pollo-cotto'] },
  'pasta-ceci-rosmarino': { cooking: ['lesso', 'padella'] },
  'insalata-ceci-tonno': { cooking: ['crudo', 'forno'] },
  'farro-salmone-zucchine': { cooking: ['lesso', 'padella'], prep: ['farro-cotto'] },
  'pasta-lenticchie-zucchine-feta': { cooking: ['lesso', 'padella'] },
  'pasta-tonno-pomodoro': { cooking: ['lesso', 'umido', 'crudo'] },
  'pasta-pollo-spinaci': { cooking: ['lesso', 'padella'] },
  'orzo-sgombro-cannellini': { cooking: ['lesso', 'microonde', 'crudo'], prep: ['orzo-cotto'] },
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
  'fagioli-tonno-cipolla': { cooking: ['crudo', 'forno'] },
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
  'pasta-fredda-tonno': { cooking: ['lesso', 'crudo'] },
  'couscous-gamberi-piselli': { cooking: ['padella'] },
  'riso-saltato-uova-piselli': { cooking: ['padella', 'microonde'], riceMethod: 'scolato', prep: ['riso-cotto'] },
  'patate-salmone-affumicato': { cooking: ['lesso', 'microonde', 'crudo'], prep: ['patate-lesse'] },
};

/** Fatti di una ricetta, o undefined se la ricetta non li ha. */
export function recipeFactsOf(recipeId: string): RecipeFacts | undefined {
  return typeof recipeId === 'string' && Object.prototype.hasOwnProperty.call(RECIPE_FACTS, recipeId) ? RECIPE_FACTS[recipeId] : undefined;
}
