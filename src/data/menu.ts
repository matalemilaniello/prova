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
 * la sera c'è il calcio e alla vigilia), almeno 5 porzioni di frutta e verdura e al massimo una porzione di legumi
 * (verificato da `menu.test.ts`): chi mangiava poche fibre non passa a 50 g da un giorno all'altro.
 *
 * Nei giorni di calcio la merenda è un pre-calcio digeribile (verso le 18:30) e la cena è una cena di recupero
 * veloce, quasi sempre pronta dalla domenica. Partita e vigilia arrivano a 6 g/kg di carboidrati alzando pasta, riso,
 * e pane: perché le proteine non salgano troppo con loro (restano entro il 20% dell'obiettivo e le kcal entro
 * il 5%, verificato in `engine/nutrition.test.ts`), in quei giorni la merenda è il pre-calcio con pane tostato,
 * miele e banana, anche alla vigilia, e lo spuntino è pane, Parmigiano e un kiwi. Niente gallette né riso soffiato (poco
 * sazianti, e i prodotti di riso soffiato sono tra quelli con più arsenico inorganico) e niente carni lavorate
 * (IARC, gruppo 1). La frutta è quella che si trova tutto l'anno (mela, banana, kiwi, frutti di bosco surgelati).
 * Varietà per settimana: pesce 3 volte, legumi 4 volte come piatto principale (nei giorni di calcio solo le lenticchie
 * rosse decorticate, a pranzo; alla vigilia mai a cena), uova 3 volte, carne rossa una volta.
 *
 * Spesa corta: le due settimane girano sugli stessi 36 prodotti (al massimo 40, spezie e olio a parte), con un
 * solo yogurt, un solo cereale da colazione, un solo pollo e un solo pesce fresco o surgelato per settimana.
 * Ogni confezione che si apre torna in almeno due pasti, oppure se ne usa almeno metà: lo yogurt fa da spuntino,
 * merenda e condimento, gli spinaci surgelati vanno a colazione, nella pasta e nel cous cous, il barattolo di
 * ceci si divide tra la pasta del martedì e l'insalata del venerdì. Gli spuntini girano su cinque ricette, nessuna
 * più di 5 volte su 14: pane e Parmigiano con mela o kiwi, yogurt con noci, frittatine.
 *
 * `prep` sono le attività della domenica che precede la settimana (60-90 minuti in tutto): servono i pasti
 * da lunedì a sabato. La domenica si cucina sul momento, oppure si usa una porzione dal freezer.
 *
 * Prima della rotazione c'è la settimana di avvio (`STARTER_WEEK`, più sotto): i giorni che vanno dal primo
 * avvio dell'app al lunedì che trova fatte spesa e preparazione, con meno fibre (28-31 g) per salire per gradi.
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
          spuntino: 'crackers-grana-pera',
          pranzo: 'pasta-tonno-pomodoro',
          merenda: 'pre-pane-banana',
          cena: 'box-riso-pollo-zucchine',
        },
      },
      // Martedì · palestra A alle 17:00
      {
        meals: {
          colazione: 'porridge-cacao-banana',
          spuntino: 'gallette-grana-clementine',
          pranzo: 'pasta-ceci-rosmarino',
          merenda: 'yogurt-greco-noci-clementine',
          cena: 'salmone-patate-broccoli',
        },
      },
      // Mercoledì · calcio, calcetto alle 21:00
      {
        meals: {
          colazione: 'uova-strapazzate-spinaci',
          spuntino: 'skyr-mela-mandorle',
          pranzo: 'riso-pollo-verdure-grigliate',
          merenda: 'pre-frullato-banana',
          cena: 'couscous-pollo-spinaci',
        },
      },
      // Giovedì · calcio, allenamento alle 20:30
      {
        meals: {
          colazione: 'cappuccino-fette-skyr',
          spuntino: 'yogurt-greco-noci-clementine',
          pranzo: 'pasta-ragu-lenticchie',
          merenda: 'pre-pane-banana',
          cena: 'riso-saltato-uova-piselli',
        },
      },
      // Venerdì · palestra B alle 17:00
      {
        meals: {
          colazione: 'pane-ricotta-miele',
          spuntino: 'crackers-grana-pera',
          pranzo: 'pasta-pollo-spinaci',
          merenda: 'yogurt-cacao-pera',
          cena: 'insalata-ceci-tonno',
        },
      },
      // Sabato · leggero
      {
        meals: {
          colazione: 'pancake-avena-albumi',
          spuntino: 'skyr-mela-mandorle',
          pranzo: 'straccetti-manzo-rucola',
          merenda: 'skyr-frutti-bosco-avena',
          cena: 'pasta-ragu-lenticchie',
        },
      },
      // Domenica · riposo, vigilia della partita
      {
        meals: {
          colazione: 'pane-arachidi-banana',
          spuntino: 'crackers-grana-pera',
          pranzo: 'pasta-ricotta-spinaci',
          merenda: 'pre-pane-banana',
          cena: 'riso-pollo-curcuma',
        },
      },
    ],
    prep: [
      {
        id: 's1-riso',
        title: 'Cuoci il riso basmati',
        minutes: 15,
        yields: "Riso per la vaschetta di lunedì; quello per l’insalata di mercoledì e per il riso saltato di giovedì va in freezer a porzioni",
        recipeIds: ['box-riso-pollo-zucchine', 'riso-pollo-verdure-grigliate', 'riso-saltato-uova-piselli'],
      },
      {
        id: 's1-pollo',
        title: 'Cuoci il petto di pollo in padella',
        minutes: 20,
        yields: "Pollo per la vaschetta di lunedì; quello per l’insalata di riso di mercoledì va in freezer",
        recipeIds: ['box-riso-pollo-zucchine', 'riso-pollo-verdure-grigliate'],
      },
      {
        id: 's1-ragu',
        title: 'Prepara il ragù di lenticchie',
        minutes: 25,
        yields: 'Due porzioni: giovedì a pranzo in frigo, sabato a cena in freezer',
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
        title: 'Porziona le noci degli spuntini',
        minutes: 5,
        yields: 'Un sacchetto per ogni yogurt da portare della settimana',
        recipeIds: ['yogurt-greco-noci-clementine', 'skyr-mela-mandorle'],
      },
    ],
  },

  // ───────────────────────── Settimana 2 ─────────────────────────
  {
    days: [
      // Lunedì · calcio, partita alle 21:00
      {
        meals: {
          colazione: 'pane-ricotta-miele',
          spuntino: 'frittatine-spinaci',
          pranzo: 'pasta-ricotta-spinaci',
          merenda: 'pre-pane-banana',
          cena: 'box-riso-pollo-zucchine',
        },
      },
      // Martedì · palestra A alle 17:00
      {
        meals: {
          colazione: 'cappuccino-fette-skyr',
          spuntino: 'frittatine-spinaci',
          pranzo: 'pasta-ceci-rosmarino',
          merenda: 'yogurt-cacao-pera',
          cena: 'merluzzo-pizzaiola-couscous',
        },
      },
      // Mercoledì · calcio, calcetto alle 21:00
      {
        meals: {
          colazione: 'porridge-cacao-banana',
          spuntino: 'skyr-mela-mandorle',
          pranzo: 'riso-pollo-verdure-grigliate',
          merenda: 'pre-frullato-banana',
          cena: 'couscous-pollo-spinaci',
        },
      },
      // Giovedì · calcio, allenamento alle 20:30
      {
        meals: {
          colazione: 'pane-arachidi-banana',
          spuntino: 'yogurt-greco-noci-clementine',
          pranzo: 'pasta-ragu-lenticchie',
          merenda: 'pre-pane-banana',
          cena: 'riso-saltato-uova-piselli',
        },
      },
      // Venerdì · palestra B alle 17:00
      {
        meals: {
          colazione: 'porridge-cacao-banana',
          spuntino: 'gallette-grana-clementine',
          pranzo: 'pasta-pollo-spinaci',
          merenda: 'yogurt-cacao-pera',
          cena: 'insalata-ceci-tonno',
        },
      },
      // Sabato · leggero
      {
        meals: {
          colazione: 'yogurt-greco-muesli-kiwi',
          spuntino: 'crackers-grana-pera',
          pranzo: 'straccetti-manzo-rucola',
          merenda: 'skyr-frutti-bosco-avena',
          cena: 'pasta-ragu-lenticchie',
        },
      },
      // Domenica · riposo, vigilia della partita
      {
        meals: {
          colazione: 'pane-arachidi-banana',
          spuntino: 'crackers-grana-pera',
          pranzo: 'riso-pollo-curcuma',
          merenda: 'pre-pane-banana',
          cena: 'merluzzo-pizzaiola-couscous',
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
        id: 's2-pollo-riso',
        title: 'Cuoci pollo e riso basmati',
        minutes: 25,
        yields: 'Pollo e riso per la vaschetta di lunedì, l’insalata di riso di mercoledì e il riso saltato di giovedì (in freezer)',
        recipeIds: ['box-riso-pollo-zucchine', 'riso-pollo-verdure-grigliate', 'riso-saltato-uova-piselli'],
      },
      {
        id: 's2-ragu',
        title: 'Prepara il ragù di lenticchie',
        minutes: 25,
        yields: 'Due porzioni: giovedì a pranzo in frigo, sabato a cena in freezer',
        recipeIds: ['pasta-ragu-lenticchie'],
      },
      {
        id: 's2-box',
        title: 'Prepara la vaschetta di recupero per lunedì sera',
        minutes: 5,
        yields: 'Riso, pollo e zucchine in frigo: dopo la partita bastano 3 minuti di microonde',
        recipeIds: ['box-riso-pollo-zucchine'],
      },
      {
        id: 's2-sacchetti',
        title: 'Porziona le noci degli spuntini',
        minutes: 5,
        yields: 'Un sacchetto per ogni yogurt da portare della settimana',
        recipeIds: ['yogurt-greco-noci-clementine', 'skyr-mela-mandorle'],
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
 *   conservazione o surgelati. Il pollo si compra fresco: le porzioni oltre il giorno dopo la spesa vanno in freezer;
 * - poche ricette che si ripetono, di proposito: la colazione è sempre la stessa, lo spuntino da portare
 *   anche (pane, Parmigiano e un kiwi), e dopo il calcio c'è sempre la stessa cena di recupero, pronta in 12 minuti.
 *   il pre-calcio è pane tostato con crema di arachidi, miele e banana;
 * - fibre in salita: 28-31 g al giorno (circa 11 g ogni 1.000 kcal) contro i 34-45 g della rotazione. Chi ne
 *   mangiava poche non le raddoppia dal primo giorno: pane comune al posto dell'integrale e i ceci a piccole
 *   dosi (40 g, due volte), prima del piatto di legumi intero. I legumi sono la fibra che fermenta di più.
 *
 * Stessi vincoli della rotazione (verificati da `menu.test.ts`), tranne le fibre: kcal entro ±8%, proteine
 * ≥ 125 g, grassi e carboidrati vicini all'obiettivo, almeno 5 porzioni di frutta e verdura, pre-calcio e cena
 * di recupero nei giorni di calcio. Pesce 7 volte (tonno 3, merluzzo 4), pollo 5, uova 2, carne rossa mai.
 * I giorni seguono la settimana tipo del piano predefinito, come la rotazione.
 */
/**
 * Quota dell'obiettivo di fibre che il menù di avvio porta, di proposito: circa 28 g su 35 (`menu.test.ts` lo
 * verifica sulla media dei giorni). Il Menù la mostra come riferimento dei giorni di avvio, con la tacca sulla barra.
 */
export const STARTER_FIBER_SHARE = 0.8;

export const STARTER_WEEK: MenuWeek = {
  days: [
    // Lunedì · calcio, partita alle 21:00 (la spesa di avvio è nel primo pomeriggio)
    {
      meals: {
        colazione: 'pane-comune-arachidi-banana',
        spuntino: 'gallette-grana-clementine',
        pranzo: 'pasta-tonno-pomodoro',
        merenda: 'pre-pane-banana',
        cena: 'couscous-pollo-spinaci',
      },
    },
    // Martedì · palestra A alle 17:00
    {
      meals: {
        colazione: 'pane-comune-arachidi-banana',
        spuntino: 'gallette-grana-clementine',
        pranzo: 'uova-spinaci-pane',
        merenda: 'yogurt-banana',
        cena: 'merluzzo-pizzaiola-couscous',
      },
    },
    // Mercoledì · calcio, calcetto alle 21:00
    {
      meals: {
        colazione: 'pane-comune-arachidi-banana',
        spuntino: 'gallette-grana-clementine',
        pranzo: 'pasta-tonno-pomodoro',
        merenda: 'pre-pane-banana',
        cena: 'couscous-pollo-spinaci',
      },
    },
    // Giovedì · calcio, allenamento alle 20:30
    {
      meals: {
        colazione: 'pane-comune-arachidi-banana',
        spuntino: 'gallette-grana-clementine',
        pranzo: 'uova-spinaci-pane',
        merenda: 'pre-pane-banana',
        cena: 'couscous-pollo-spinaci',
      },
    },
    // Venerdì · palestra B alle 17:00 (i ceci, a piccole dosi, venerdì e sabato)
    {
      meals: {
        colazione: 'pane-comune-arachidi-banana',
        spuntino: 'gallette-grana-clementine',
        pranzo: 'pasta-pollo-spinaci',
        merenda: 'yogurt-banana',
        cena: 'merluzzo-ceci-couscous',
      },
    },
    // Sabato · leggero (a casa: lo yogurt la mattina, pane e Parmigiano il pomeriggio; i ceci a cena)
    {
      meals: {
        colazione: 'pane-comune-arachidi-banana',
        spuntino: 'yogurt-banana',
        pranzo: 'pasta-tonno-pomodoro',
        merenda: 'gallette-grana-clementine',
        cena: 'merluzzo-ceci-couscous',
      },
    },
    // Domenica · riposo, vigilia della partita (niente legumi a cena)
    {
      meals: {
        colazione: 'pane-comune-arachidi-banana',
        spuntino: 'gallette-grana-clementine',
        pranzo: 'pasta-pollo-spinaci',
        merenda: 'pre-pane-banana',
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
  'kiwi',
  'insalata',
  'spinaci',
  'pollo',
  'merluzzo',
  'yogurt-greco-2',
  'uova',
  'grana',
  'pane-bianco',
  'pasta',
  'couscous',
  'ceci',
  'tonno',
  'passata',
  'miele',
  'burro-arachidi',
];

/**
 * Guida delle attività della domenica, per id dell'attività: passaggi brevi e timer delle cotture.
 * Le cotture lunghe partono per prime; mentre vanno, il lettore propone l'attività successiva.
 */
export const PREP_GUIDE: Record<string, PrepGuide> = {
  's1-riso': {
    steps: [
      "Metti sul fuoco una pentola d’acqua salata e cuoci il riso basmati.",
      'Scola e allarga il riso su un vassoio: deve raffreddarsi in fretta.',
      "Entro un’ora la porzione di lunedì va in frigo, le altre in freezer in sacchetti piatti.",
    ],
    timers: [{ label: 'Riso basmati', minutes: 11 }],
  },
  's1-pollo': {
    steps: [
      'Taglia il petto di pollo a bocconcini.',
      "Cuocilo in padella antiaderente con un filo d’olio, girandolo, finché dentro non è più rosa.",
      'Fai raffreddare: la parte per lunedì in frigo, quella per mercoledì in freezer.',
    ],
    timers: [{ label: 'Pollo in padella', minutes: 8 }],
  },
  's1-ragu': {
    steps: [
      "Rosola la carota grattugiata con l’olio per 2 minuti.",
      "Aggiungi le lenticchie rosse secche, la passata e due bicchieri d’acqua; cuoci finché le lenticchie si sfaldano.",
      'Dividi in due porzioni: quella di giovedì in frigo, quella di sabato in freezer.',
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
      'Prepara un sacchetto per ogni yogurt da portare: mezza manciata di noci.',
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
  's2-pollo-riso': {
    steps: [
      "Riso basmati in acqua salata.",
      "Intanto il pollo a bocconcini in padella con un filo d’olio, finché dentro non è più rosa.",
      'Raffredda in fretta: pollo e riso per lunedì in frigo, il resto in freezer a porzioni.',
    ],
    timers: [
      { label: 'Riso basmati', minutes: 11 },
      { label: 'Pollo in padella', minutes: 8 },
    ],
  },
  's2-ragu': {
    steps: [
      "Rosola la carota grattugiata con l’olio per 2 minuti.",
      "Aggiungi le lenticchie rosse secche, la passata e due bicchieri d’acqua; cuoci finché le lenticchie si sfaldano.",
      'Dividi in due porzioni: quella di giovedì in frigo, quella di sabato in freezer.',
    ],
    timers: [{ label: 'Ragù di lenticchie', minutes: 15 }],
  },
  's2-box': {
    steps: [
      'Salta le zucchine a rondelle nella padella del pollo.',
      'Componi la vaschetta da microonde con riso, pollo e zucchine, chiudila e mettila in frigo.',
    ],
    timers: [{ label: 'Zucchine', minutes: 4 }],
  },
  's2-sacchetti': {
    steps: [
      'Prepara un sacchetto per ogni yogurt da portare: mezza manciata di noci.',
      'Tienili in un contenitore vicino allo zaino.',
    ],
  },
};
