/**
 * Ritmo · menù a rotazione di 2 settimane.
 *
 * Ogni giorno segue la settimana tipo del piano predefinito:
 * lunedì calcio (partita), martedì palestra (A), mercoledì calcio (calcetto), giovedì calcio (allenamento),
 * venerdì palestra (B), sabato leggero (C facoltativa), domenica riposo. La domenica è anche la vigilia della
 * partita: porzioni e obiettivo sono quelli di un giorno di calcio (vedi `effectiveDayType`).
 *
 * Con i valori di `recipeNutrition` ogni giornata resta entro ±8% delle kcal obiettivo, con proteine ≥ 125 g,
 * carboidrati e grassi entro il 15% dell'obiettivo, grassi ≥ 20% dell'energia, fibre tra 28 e 45 g (40 g quando
 * la sera c'è il calcio), almeno 5 porzioni di frutta e verdura e al massimo una porzione di legumi
 * (verificato da `menu.test.ts`): chi mangiava poche fibre non passa a 50 g da un giorno all'altro.
 *
 * Nei giorni di calcio la merenda è un pre-calcio digeribile (verso le 18:30) e la cena è una cena di recupero
 * veloce, quasi sempre pronta dalla domenica. Varietà per settimana: pesce 3 volte, legumi 4 volte come piatto
 * principale (nei giorni di calcio solo le lenticchie rosse decorticate, a pranzo), uova 3 volte,
 * carne rossa una volta. Gli spuntini si ripetono di proposito: meno prodotti da comprare.
 *
 * `prep` sono le attività della domenica che precede la settimana (60-90 minuti in tutto): servono i pasti
 * da lunedì a sabato. La domenica si cucina sul momento, oppure si usa una porzione dal freezer.
 *
 * Prima della rotazione c'è la settimana di avvio (`STARTER_WEEK`, più sotto): i giorni che vanno dal primo
 * avvio dell'app al lunedì che trova fatte spesa e preparazione.
 */
import type { MenuWeek } from '../domain/types';

/** Timer di una pentola, del forno o della padella durante la preparazione della domenica. */
export interface PrepTimer {
  label: string;
  minutes: number;
}

/** Guida passo per passo di un'attività della preparazione (lettore a schermo intero). */
export interface PrepGuide {
  steps: string[];
  /** Cotture da cronometrare, anche in parallelo. */
  timers?: PrepTimer[];
}

export const MENU_ROTATION: MenuWeek[] = [
  // ───────────────────────── Settimana 1 ─────────────────────────
  {
    days: [
      // Lunedì · calcio, partita alle 21:00
      {
        meals: {
          colazione: 'pane-arachidi-banana',
          spuntino: 'panino-tacchino-mela',
          pranzo: 'pasta-tonno-pomodoro',
          merenda: 'pre-gallette-banana',
          cena: 'box-riso-pollo-zucchine',
        },
      },
      // Martedì · palestra A alle 17:00
      {
        meals: {
          colazione: 'porridge-cacao-banana',
          spuntino: 'yogurt-greco-noci-clementine',
          pranzo: 'pasta-ceci-rosmarino',
          merenda: 'fiocchi-latte-pomodorini',
          cena: 'salmone-patate-broccoli',
        },
      },
      // Mercoledì · calcio, calcetto alle 21:00
      {
        meals: {
          colazione: 'uova-strapazzate-spinaci',
          spuntino: 'yogurt-greco-noci-clementine',
          pranzo: 'riso-pollo-verdure-grigliate',
          merenda: 'pre-fiocchi-mais-latte',
          cena: 'couscous-gamberi-piselli',
        },
      },
      // Giovedì · calcio, allenamento alle 20:30
      {
        meals: {
          colazione: 'cappuccino-fette-skyr',
          spuntino: 'skyr-mela-mandorle',
          pranzo: 'pasta-ragu-lenticchie',
          merenda: 'pre-frullato-banana',
          cena: 'riso-saltato-uova-piselli',
        },
      },
      // Venerdì · palestra B alle 17:00
      {
        meals: {
          colazione: 'yogurt-greco-muesli-kiwi',
          spuntino: 'crackers-grana-pera',
          pranzo: 'pasta-lenticchie-zucchine-feta',
          merenda: 'yogurt-cacao-pera',
          cena: 'pollo-paprika-peperoni',
        },
      },
      // Sabato · leggero
      {
        meals: {
          colazione: 'pancake-avena-albumi',
          spuntino: 'skyr-mela-mandorle',
          pranzo: 'straccetti-manzo-rucola',
          merenda: 'fiocchi-latte-pomodorini',
          cena: 'minestrone-ditalini-borlotti',
        },
      },
      // Domenica · riposo
      {
        meals: {
          colazione: 'pane-ricotta-miele',
          spuntino: 'yogurt-greco-noci-clementine',
          pranzo: 'pasta-ricotta-spinaci',
          merenda: 'yogurt-cacao-pera',
          cena: 'tacchino-riso-carote',
        },
      },
    ],
    prep: [
      {
        id: 's1-riso',
        title: 'Cuoci il riso basmati e quello integrale',
        minutes: 30,
        yields: "Riso per la vaschetta di lunedì; quello per l'insalata di mercoledì e per il riso saltato di giovedì va in freezer a porzioni",
        recipeIds: ['box-riso-pollo-zucchine', 'riso-pollo-verdure-grigliate', 'riso-saltato-uova-piselli'],
      },
      {
        id: 's1-pollo',
        title: 'Cuoci il petto di pollo in padella',
        minutes: 20,
        yields: "Pollo per la vaschetta di lunedì; quello per l'insalata di riso di mercoledì va in freezer",
        recipeIds: ['box-riso-pollo-zucchine', 'riso-pollo-verdure-grigliate'],
      },
      {
        id: 's1-ragu',
        title: 'Prepara il ragù di lenticchie',
        minutes: 25,
        yields: 'Quattro porzioni in freezer: giovedì a pranzo, la domenica dopo a cena e due di scorta',
        recipeIds: ['pasta-ragu-lenticchie'],
      },
      {
        id: 's1-box',
        title: 'Prepara la vaschetta di recupero per lunedì sera',
        minutes: 5,
        yields: 'Riso, pollo e zucchine in frigo: dopo la partita bastano 3 minuti di microonde',
        recipeIds: ['box-riso-pollo-zucchine'],
      },
      {
        id: 's1-sacchetti',
        title: 'Porziona la frutta secca degli spuntini',
        minutes: 5,
        yields: 'Sacchetti di mandorle e noci per gli spuntini da portare di tutta la settimana',
        recipeIds: ['skyr-mela-mandorle', 'yogurt-greco-noci-clementine', 'panino-tacchino-mela'],
      },
    ],
  },

  // ───────────────────────── Settimana 2 ─────────────────────────
  {
    days: [
      // Lunedì · calcio, partita alle 21:00
      {
        meals: {
          colazione: 'porridge-cacao-banana',
          spuntino: 'frittatine-spinaci',
          pranzo: 'riso-pollo-curcuma',
          merenda: 'pre-pane-ricotta-miele',
          cena: 'patate-salmone-affumicato',
        },
      },
      // Martedì · palestra A alle 17:00
      {
        meals: {
          colazione: 'pane-ricotta-miele',
          spuntino: 'frittatine-spinaci',
          pranzo: 'pasta-ceci-rosmarino',
          merenda: 'skyr-frutti-bosco-avena',
          cena: 'merluzzo-pizzaiola-couscous',
        },
      },
      // Mercoledì · calcio, calcetto alle 21:00
      {
        meals: {
          colazione: 'cappuccino-fette-skyr',
          spuntino: 'panino-tacchino-mela',
          pranzo: 'bowl-riso-salmone-edamame',
          merenda: 'pre-gallette-banana',
          cena: 'box-riso-pollo-zucchine',
        },
      },
      // Giovedì · calcio, allenamento alle 20:30
      {
        meals: {
          colazione: 'pane-arachidi-banana',
          spuntino: 'yogurt-greco-noci-clementine',
          pranzo: 'pasta-ricotta-spinaci',
          merenda: 'pre-fiocchi-mais-latte',
          cena: 'riso-saltato-uova-piselli',
        },
      },
      // Venerdì · palestra B alle 17:00
      {
        meals: {
          colazione: 'porridge-cacao-banana',
          spuntino: 'yogurt-greco-noci-clementine',
          pranzo: 'pasta-lenticchie-zucchine-feta',
          merenda: 'pane-cioccolato-kefir',
          cena: 'pollo-paprika-peperoni',
        },
      },
      // Sabato · leggero
      {
        meals: {
          colazione: 'yogurt-greco-muesli-kiwi',
          spuntino: 'skyr-mela-mandorle',
          pranzo: 'tacchino-riso-carote',
          merenda: 'pane-cioccolato-kefir',
          cena: 'minestrone-ditalini-borlotti',
        },
      },
      // Domenica · riposo
      {
        meals: {
          colazione: 'pane-ricotta-miele',
          spuntino: 'yogurt-greco-noci-clementine',
          pranzo: 'straccetti-manzo-rucola',
          merenda: 'fiocchi-latte-pomodorini',
          cena: 'pasta-ragu-lenticchie',
        },
      },
    ],
    prep: [
      {
        id: 's2-frittatine',
        title: 'Inforna le frittatine con spinaci',
        minutes: 25,
        yields: 'Quattro frittatine per gli spuntini di lunedì e martedì',
        recipeIds: ['frittatine-spinaci'],
      },
      {
        id: 's2-patate',
        title: 'Lessa le patate',
        minutes: 20,
        yields: 'Patate per la cena di recupero di lunedì: in frigo, dopo la partita si scaldano in 2 minuti',
        recipeIds: ['patate-salmone-affumicato'],
      },
      {
        id: 's2-pollo-riso',
        title: 'Cuoci pollo e riso basmati',
        minutes: 25,
        yields: 'Pollo e riso per il pranzo di lunedì, la vaschetta di mercoledì e il riso saltato di giovedì (in freezer)',
        recipeIds: ['riso-pollo-curcuma', 'box-riso-pollo-zucchine', 'riso-saltato-uova-piselli'],
      },
      {
        id: 's2-box',
        title: 'Prepara la vaschetta di recupero per mercoledì sera',
        minutes: 5,
        yields: 'Riso, pollo e zucchine in freezer: mercoledì mattina la vaschetta passa in frigo',
        recipeIds: ['box-riso-pollo-zucchine'],
      },
      {
        id: 's2-sacchetti',
        title: 'Porziona la frutta secca degli spuntini',
        minutes: 5,
        yields: 'Sacchetti di mandorle e noci per gli spuntini da portare di tutta la settimana',
        recipeIds: ['skyr-mela-mandorle', 'yogurt-greco-noci-clementine', 'panino-tacchino-mela'],
      },
    ],
  },
];

// ───────────────────────── Settimana di avvio ─────────────────────────

/**
 * Settimana di avvio: i giorni dal primo avvio dell'app al lunedì che trova fatte spesa e preparazione
 * (`isStarterDay` in engine/menu). Chi comincia non ha fatto né la spesa del sabato né la preparazione della
 * domenica: la spesa di avvio è nel primo pomeriggio libero (la voce di Oggi). Per questo:
 *
 * - nessuna ricetta da preparazione: tutto si cucina sul momento, in 15 minuti al massimo;
 * - una spesa piccola: 17 prodotti per tutta la settimana (`STARTER_PRODUCTS`), quasi tutti a lunga
 *   conservazione o surgelati. Il pollo si compra fresco e le porzioni dal mercoledì vanno in freezer;
 * - poche ricette che si ripetono, di proposito: la colazione è sempre la stessa, lo spuntino da portare
 *   anche, e dopo il calcio c'è sempre la stessa cena di recupero, pronta in 12 minuti;
 * - legumi 3 volte e fibre tra 34 e 41 g, la parte bassa del menù: chi ne mangiava poche sale per gradi.
 *
 * Stessi vincoli della rotazione (verificati da `menu.test.ts`): kcal entro ±8%, proteine ≥ 125 g, grassi e
 * carboidrati vicini all'obiettivo, almeno 5 porzioni di frutta e verdura, pre-calcio e cena di recupero nei
 * giorni di calcio. Pesce 6 volte (tonno 3, merluzzo 3), pollo 3, uova 2, carne rossa mai.
 * I giorni seguono la settimana tipo del piano predefinito, come la rotazione.
 */
export const STARTER_WEEK: MenuWeek = {
  days: [
    // Lunedì · calcio, partita alle 21:00 (la spesa di avvio è nel primo pomeriggio)
    {
      meals: {
        colazione: 'pane-arachidi-banana',
        spuntino: 'gallette-grana-clementine',
        pranzo: 'pasta-tonno-pomodoro',
        merenda: 'pre-gallette-banana',
        cena: 'couscous-pollo-spinaci',
      },
    },
    // Martedì · palestra A alle 17:00
    {
      meals: {
        colazione: 'pane-arachidi-banana',
        spuntino: 'gallette-grana-clementine',
        pranzo: 'pasta-ceci-rosmarino',
        merenda: 'yogurt-clementine-gallette',
        cena: 'merluzzo-pizzaiola-couscous',
      },
    },
    // Mercoledì · calcio, calcetto alle 21:00
    {
      meals: {
        colazione: 'pane-arachidi-banana',
        spuntino: 'gallette-grana-clementine',
        pranzo: 'pasta-tonno-pomodoro',
        merenda: 'pre-gallette-banana',
        cena: 'couscous-pollo-spinaci',
      },
    },
    // Giovedì · calcio, allenamento alle 20:30
    {
      meals: {
        colazione: 'pane-arachidi-banana',
        spuntino: 'gallette-grana-clementine',
        pranzo: 'pasta-ceci-rosmarino',
        merenda: 'pre-gallette-banana',
        cena: 'couscous-pollo-spinaci',
      },
    },
    // Venerdì · palestra B alle 17:00
    {
      meals: {
        colazione: 'pane-arachidi-banana',
        spuntino: 'gallette-grana-clementine',
        pranzo: 'uova-spinaci-pane',
        merenda: 'yogurt-clementine-gallette',
        cena: 'merluzzo-pizzaiola-couscous',
      },
    },
    // Sabato · leggero (a casa: lo yogurt la mattina, le gallette il pomeriggio)
    {
      meals: {
        colazione: 'pane-arachidi-banana',
        spuntino: 'yogurt-clementine-gallette',
        pranzo: 'pasta-tonno-pomodoro',
        merenda: 'gallette-grana-clementine',
        cena: 'uova-pomodoro-spinaci',
      },
    },
    // Domenica · riposo, vigilia della partita
    {
      meals: {
        colazione: 'pane-arachidi-banana',
        spuntino: 'yogurt-clementine-gallette',
        pranzo: 'pasta-ceci-rosmarino',
        merenda: 'gallette-grana-clementine',
        cena: 'merluzzo-pizzaiola-couscous',
      },
    },
  ],
  prep: [],
};

/**
 * I prodotti da comprare per la settimana di avvio (olio, sale, aglio ed erbe esclusi: di solito ci sono già).
 * La spesa vera la calcola `shoppingList` dai pasti; questo elenco serve ai testi e ai test.
 */
export const STARTER_PRODUCTS: readonly string[] = [
  'banana',
  'clementine',
  'insalata',
  'spinaci',
  'pollo',
  'merluzzo',
  'yogurt-greco-2',
  'uova',
  'grana',
  'pane-integrale',
  'pasta',
  'couscous',
  'gallette-riso',
  'ceci',
  'tonno',
  'passata',
  'burro-arachidi',
];

/**
 * Guida delle attività della domenica, per id dell'attività: passaggi brevi e timer delle cotture.
 * Le cotture lunghe partono per prime; mentre vanno, il lettore propone l'attività successiva.
 */
export const PREP_GUIDE: Record<string, PrepGuide> = {
  's1-riso': {
    steps: [
      "Metti sul fuoco due pentole d'acqua salata: il riso integrale cuoce circa 30 minuti, il basmati 11.",
      'Scola e allarga il riso su un vassoio: deve raffreddarsi in fretta.',
      "Entro un'ora la porzione di lunedì va in frigo, le altre in freezer in sacchetti piatti.",
    ],
    timers: [
      { label: 'Riso integrale', minutes: 30 },
      { label: 'Riso basmati', minutes: 11 },
    ],
  },
  's1-pollo': {
    steps: [
      'Taglia il petto di pollo a bocconcini.',
      "Cuocilo in padella antiaderente con un filo d'olio, girandolo, finché dentro non è più rosa.",
      'Fai raffreddare: la parte per lunedì in frigo, quella per mercoledì in freezer.',
    ],
    timers: [{ label: 'Pollo in padella', minutes: 8 }],
  },
  's1-ragu': {
    steps: [
      "Rosola il soffritto con l'olio per 2 minuti.",
      "Aggiungi le lenticchie rosse secche, la passata e due bicchieri d'acqua; cuoci finché le lenticchie si sfaldano.",
      'Dividi in 4 porzioni e congelale tutte.',
    ],
    timers: [{ label: 'Ragù di lenticchie', minutes: 15 }],
  },
  's1-box': {
    steps: [
      'Salta le zucchine a rondelle nella padella del pollo.',
      'Componi la vaschetta da microonde con riso, pollo e zucchine, chiudila e mettila in frigo.',
    ],
    timers: [{ label: 'Zucchine', minutes: 4 }],
  },
  's1-sacchetti': {
    steps: [
      'Prepara un sacchetto per ogni spuntino da portare: mezza manciata di mandorle o di noci.',
      'Tienili in un contenitore vicino allo zaino.',
    ],
  },
  's2-frittatine': {
    steps: [
      'Accendi il forno a 180 °C.',
      'Sbatti uova e albumi con gli spinaci scongelati e strizzati, il formaggio grattugiato e un pizzico di sale.',
      'Versa nei pirottini da muffin e inforna.',
      'Fai raffreddare e conserva in frigo, in un contenitore chiuso.',
    ],
    timers: [{ label: 'Frittatine in forno', minutes: 19 }],
  },
  's2-patate': {
    steps: [
      "Patate a pezzi in acqua fredda salata, poi sul fuoco: dal bollore finché la forchetta entra senza sforzo.",
      'Scola, fai raffreddare e metti in frigo in un contenitore.',
    ],
    timers: [{ label: 'Patate', minutes: 18 }],
  },
  's2-pollo-riso': {
    steps: [
      "Riso basmati in acqua salata.",
      "Intanto il pollo a bocconcini in padella con un filo d'olio, finché dentro non è più rosa.",
      'Raffredda in fretta: pollo e riso per lunedì in frigo, il resto in freezer a porzioni.',
    ],
    timers: [
      { label: 'Riso basmati', minutes: 11 },
      { label: 'Pollo in padella', minutes: 8 },
    ],
  },
  's2-box': {
    steps: [
      'Salta le zucchine a rondelle nella padella del pollo.',
      'Componi la vaschetta con riso, pollo e zucchine e mettila in freezer: mercoledì mattina passa in frigo.',
    ],
    timers: [{ label: 'Zucchine', minutes: 4 }],
  },
  's2-sacchetti': {
    steps: [
      'Prepara un sacchetto per ogni spuntino da portare: mezza manciata di mandorle o di noci.',
      'Tienili in un contenitore vicino allo zaino.',
    ],
  },
};
