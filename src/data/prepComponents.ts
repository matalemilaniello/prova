/**
 * Componenti della preparazione della domenica (docs/FASE2.md § 4.11): ciò che si cucina o si porziona la domenica per le
 * ricette da preparazione (`RECIPE_FACTS[id].prep`, data/recipeFacts.ts). Quando un menù generato non ha le stesse ricette
 * da preparazione negli stessi giorni del seme, i compiti della domenica si costruiscono da qui (`prepTasksFor` in
 * engine/menuGen/prep.ts): un compito per componente, con l'id del componente, così le spunte di `prepDone` restano.
 *
 * Ogni componente ha titolo, minuti, il nome con cui la resa lo chiama e i giorni in frigo (`fridgeDays`), contati dalla
 * domenica della preparazione: lunedì è il giorno 1. Le porzioni dei giorni dopo vanno in freezer e la resa lo dice. La
 * guida passo passo e i timer del lettore stanno in `PREP_GUIDE` (data/menu.ts), per id del componente.
 *
 * Giorni in frigo:
 * - riso, cous cous, farro, orzo cotti: 1. Il riso cotto va raffreddato entro un'ora e tenuto in frigo al massimo un giorno,
 *   per il Bacillus cereus [fonte: FSA; NHS]; esteso agli altri cereali cotti per prudenza [pratica];
 * - pesce cotto (salmone, sgombro): 2 [pratica: prudenza];
 * - pollo, ragù e zuppe di legumi, frittatine, vellutate, verdure e patate cotte: 3 (avanzi cotti 3-4 giorni [fonte: USDA
 *   FoodKeeper], si tiene il limite basso);
 * - barrette e preparati secchi: 7 [pratica].
 * La vaschetta di recupero contiene il riso: vale il suo giorno.
 */
import type { PrepComponentId } from './recipeFacts';

export interface PrepComponent {
  id: PrepComponentId;
  /** Titolo del compito della domenica, con il verbo («Cuoci il riso basmati»). */
  title: string;
  /**
   * Minuti di lavoro della domenica, cotture comprese: mentre una cottura va si fa l'attività successiva, quindi i minuti
   * sono quelli che il componente aggiunge alla mattina (almeno il timer più lungo della sua guida).
   */
  minutes: number;
  /** Come la resa chiama ciò che si prepara («Riso basmati», «Ragù di lenticchie»). */
  what: string;
  /** Giorni in frigo dalla domenica (lunedì = 1); oltre, le porzioni vanno in freezer. */
  fridgeDays: number;
  /** Cotto: la guida ha la regola del raffreddamento e quella del freezer. */
  cooked: boolean;
  /**
   * Componente senza ricette da preparazione: vale per le ricette da portare (`RECIPE_FACTS[id].carry`) che contengono uno
   * di questi alimenti. Serve alla frutta secca degli spuntini, che si porziona la domenica.
   */
  portionsOf?: readonly string[];
  /** Ordine nella domenica: prima le cotture lunghe, poi quello che si monta con le cose già pronte. */
  order: number;
}

const LIST: PrepComponent[] = [
  { id: 'vellutata-zucca', title: 'Prepara la vellutata di zucca e lenticchie', minutes: 25, what: 'Vellutata', fridgeDays: 3, cooked: true, order: 1 },
  { id: 'zuppa-cavolo-nero', title: 'Prepara la zuppa di cavolo nero e cannellini', minutes: 25, what: 'Zuppa', fridgeDays: 3, cooked: true, order: 2 },
  { id: 'ragu-lenticchie', title: 'Prepara il ragù di lenticchie', minutes: 25, what: 'Ragù di lenticchie', fridgeDays: 3, cooked: true, order: 3 },
  { id: 'farro-cotto', title: 'Cuoci il farro', minutes: 20, what: 'Farro', fridgeDays: 1, cooked: true, order: 4 },
  { id: 'orzo-cotto', title: 'Cuoci l’orzo', minutes: 20, what: 'Orzo', fridgeDays: 1, cooked: true, order: 5 },
  { id: 'patate-lesse', title: 'Lessa le patate', minutes: 20, what: 'Patate', fridgeDays: 3, cooked: true, order: 6 },
  { id: 'frittatine', title: 'Inforna le frittatine con spinaci', minutes: 20, what: 'Frittatine', fridgeDays: 3, cooked: true, order: 7 },
  { id: 'barrette', title: 'Inforna le barrette di avena e datteri', minutes: 20, what: 'Barrette', fridgeDays: 7, cooked: false, order: 8 },
  { id: 'salmone-forno', title: 'Inforna il salmone', minutes: 20, what: 'Salmone', fridgeDays: 2, cooked: true, order: 9 },
  { id: 'pollo-cotto', title: 'Cuoci il petto di pollo in padella', minutes: 20, what: 'Pollo', fridgeDays: 3, cooked: true, order: 10 },
  { id: 'riso-cotto', title: 'Cuoci il riso basmati', minutes: 15, what: 'Riso basmati', fridgeDays: 1, cooked: true, order: 11 },
  {
    id: 'vaschetta-recupero',
    title: 'Prepara la vaschetta di recupero',
    minutes: 5,
    what: 'Vaschetta di riso, pollo e zucchine',
    fridgeDays: 1,
    cooked: true,
    order: 12,
  },
  {
    id: 'sacchetti-frutta-secca',
    title: 'Porziona la frutta secca degli spuntini',
    minutes: 5,
    what: 'Sacchetti di frutta secca',
    fridgeDays: 7,
    cooked: false,
    portionsOf: ['noci', 'mandorle'],
    order: 13,
  },
];

/** Componenti per id. */
export const PREP_COMPONENTS: Readonly<Record<PrepComponentId, PrepComponent>> = Object.fromEntries(LIST.map((c) => [c.id, c])) as Record<
  PrepComponentId,
  PrepComponent
>;

/** Componente per id, o undefined (anche per chiavi come `constructor`). */
export function prepComponentOf(id: string): PrepComponent | undefined {
  return Object.prototype.hasOwnProperty.call(PREP_COMPONENTS, id) ? PREP_COMPONENTS[id as PrepComponentId] : undefined;
}
