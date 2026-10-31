/**
 * Ritmo · menù a rotazione di 2 settimane.
 *
 * Ogni giorno segue la settimana tipo del piano predefinito:
 * lunedì calcio (partita), martedì palestra (A), mercoledì calcio (calcetto), giovedì calcio (allenamento),
 * venerdì palestra (B), sabato leggero (C facoltativa), domenica riposo.
 * Le porzioni si adattano al tipo di giorno (vedi `carbFactor`): con i valori di `recipeNutrition` ogni giornata
 * resta entro ±8% delle kcal obiettivo, con proteine ≥ 125 g, fibre ≥ 28 g e almeno 5 porzioni di frutta e verdura
 * (verificato da `menu.test.ts`).
 *
 * Nei giorni di calcio la merenda è un pre-calcio digeribile (verso le 18:30) e la cena è una cena di recupero
 * veloce, quasi sempre pronta dalla domenica. Varietà per settimana: pesce 3 volte, legumi 4 volte come piatto
 * principale, uova 3 volte, carne rossa una volta.
 *
 * `prep` sono le attività della domenica che precede la settimana (60-90 minuti in tutto): servono i pasti
 * da lunedì a sabato. La domenica si cucina sul momento.
 */
import type { MenuWeek } from '../domain/types';

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
          spuntino: 'crackers-grana-pera',
          pranzo: 'pasta-ceci-rosmarino',
          merenda: 'skyr-frutti-bosco-avena',
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
          spuntino: 'panino-tacchino-mela',
          pranzo: 'pasta-ragu-lenticchie',
          merenda: 'pre-frullato-banana',
          cena: 'riso-saltato-uova-piselli',
        },
      },
      // Venerdì · palestra B alle 17:00
      {
        meals: {
          colazione: 'yogurt-greco-muesli-kiwi',
          spuntino: 'ceci-tostati-arancia',
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
          cena: 'tacchino-limone-patate',
        },
      },
    ],
    prep: [
      {
        id: 's1-riso',
        title: 'Cuoci il riso basmati e quello integrale',
        minutes: 30,
        yields: "Riso per la vaschetta di lunedì; quello per l'insalata di mercoledì e il riso saltato di giovedì va in freezer a porzioni",
        recipeIds: ['box-riso-pollo-zucchine', 'riso-pollo-verdure-grigliate', 'riso-saltato-uova-piselli'],
      },
      {
        id: 's1-pollo',
        title: 'Cuoci il petto di pollo in padella',
        minutes: 20,
        yields: "Pollo per la vaschetta di lunedì e l'insalata di riso di mercoledì",
        recipeIds: ['box-riso-pollo-zucchine', 'riso-pollo-verdure-grigliate'],
      },
      {
        id: 's1-ragu',
        title: 'Prepara il ragù di lenticchie',
        minutes: 25,
        yields: 'Ragù per il pranzo di giovedì, più tre porzioni in freezer',
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
        title: 'Porziona gli spuntini da portare',
        minutes: 5,
        yields: 'Sacchetti di ceci tostati, mandorle e noci per tutta la settimana',
        recipeIds: ['ceci-tostati-arancia', 'skyr-mela-mandorle', 'yogurt-greco-noci-clementine', 'panino-tacchino-mela'],
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
          pranzo: 'pasta-lenticchie-zucchine-feta',
          merenda: 'pane-cioccolato-kefir',
          cena: 'merluzzo-pizzaiola-couscous',
        },
      },
      // Mercoledì · calcio, calcetto alle 21:00
      {
        meals: {
          colazione: 'cappuccino-fette-skyr',
          spuntino: 'panino-tacchino-mela',
          pranzo: 'farro-salmone-zucchine',
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
          colazione: 'overnight-oats-frutti-bosco',
          spuntino: 'ceci-tostati-arancia',
          pranzo: 'pasta-ceci-rosmarino',
          merenda: 'yogurt-cacao-pera',
          cena: 'pollo-paprika-peperoni',
        },
      },
      // Sabato · leggero
      {
        meals: {
          colazione: 'porridge-cacao-banana',
          spuntino: 'skyr-mela-mandorle',
          pranzo: 'piadina-tacchino-hummus',
          merenda: 'pane-cioccolato-kefir',
          cena: 'minestrone-ditalini-borlotti',
        },
      },
      // Domenica · riposo
      {
        meals: {
          colazione: 'yogurt-greco-muesli-kiwi',
          spuntino: 'yogurt-greco-noci-clementine',
          pranzo: 'straccetti-manzo-rucola',
          merenda: 'fiocchi-latte-pomodorini',
          cena: 'vellutata-zucca-lenticchie',
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
        id: 's2-patate-farro',
        title: 'Lessa patate e farro, in due pentole',
        minutes: 25,
        yields: 'Patate per la cena di lunedì, farro per il pranzo di mercoledì',
        recipeIds: ['patate-salmone-affumicato', 'farro-salmone-zucchine'],
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
        title: 'Porziona gli spuntini da portare',
        minutes: 5,
        yields: 'Sacchetti di ceci tostati, mandorle e noci per tutta la settimana',
        recipeIds: ['ceci-tostati-arancia', 'skyr-mela-mandorle', 'yogurt-greco-noci-clementine', 'panino-tacchino-mela'],
      },
    ],
  },
];
