/**
 * Ritmo · piano B al bar.
 *
 * Cosa ordinare in un bar italiano quando lo spuntino o il pranzo saltano. Sempre disponibile, anche offline.
 * Verdetti:
 * - `si`: scelta buona così com'è;
 * - `meglio`: va bene con un accorgimento, scritto nel motivo;
 * - `programmato`: solo come uno dei dolci previsti nella settimana.
 * I valori sono stime indicative per la porzione tipica servita al banco.
 */
import type { BarOption } from '../domain/types';

/** Etichette e spiegazioni dei verdetti, per l'interfaccia. */
export const BAR_VERDICTS: Record<BarOption['verdict'], { label: string; hint: string }> = {
  si: { label: 'Sì', hint: "Scelta buona così com’è" },
  meglio: { label: 'Con un accorgimento', hint: 'Va bene se segui il consiglio' },
  programmato: { label: 'Dolce programmato', hint: 'Solo come uno dei dolci della settimana' },
};

export const BAR_OPTIONS: BarOption[] = [
  // ───────────────────────── Sì ─────────────────────────
  {
    id: 'panino-pollo',
    name: 'Panino con pollo, insalata e pomodoro',
    verdict: 'si',
    why: 'Il panino migliore del banco: carne fresca e non un affettato, tante proteine e pochi grassi. Chiedi un filo d’olio invece delle salse.',
    approx: { kcal: 420, proteinG: 32, carbG: 52, fatG: 8, fiberG: 3.5 },
  },
  {
    id: 'panino-verdure',
    name: 'Panino con verdure grigliate',
    verdict: 'si',
    why: 'Carboidrati digeribili, verdura e pochi grassi. Se lo trovi integrale, ancora meglio.',
    approx: { kcal: 335, proteinG: 9.5, carbG: 55, fatG: 6.5, fiberG: 5 },
  },
  {
    id: 'insalatona',
    name: 'Insalatona con tonno o pollo e uovo',
    verdict: 'si',
    why: "Verdure e circa 30 g di proteine nello stesso piatto: sazia e resta leggero. Chiedi l’olio a parte, niente salse.",
    approx: { kcal: 430, proteinG: 30, carbG: 12, fatG: 28, fiberG: 5 },
  },
  {
    id: 'yogurt-frutta',
    name: 'Yogurt bianco con frutta fresca',
    verdict: 'si',
    why: 'Leggero e con i fermenti, ma con poche proteine: se il bar ce l’ha, scegli lo yogurt greco (circa 15 g), oppure abbinalo a un toast.',
    approx: { kcal: 155, proteinG: 6.5, carbG: 18, fatG: 6, fiberG: 2 },
  },
  {
    id: 'macedonia',
    name: 'Macedonia o frutto fresco',
    verdict: 'si',
    why: 'Una porzione in più verso le cinque porzioni di frutta e verdura del giorno. Senza zucchero e senza panna.',
    approx: { kcal: 105, proteinG: 1.5, carbG: 22, fatG: 0.4, fiberG: 4 },
  },
  {
    id: 'frutta-secca',
    name: 'Bustina di frutta secca al naturale',
    verdict: 'si',
    why: "Mandorle, noci o arachidi non salate: grassi buoni che reggono fino all’ora di pranzo. Una bustina, non due.",
    approx: { kcal: 180, proteinG: 6.5, carbG: 2.5, fatG: 15.5, fiberG: 3.7 },
  },
  {
    id: 'spremuta',
    name: "Spremuta d’arancia",
    verdict: 'si',
    why: 'Vitamina C e nessuno zucchero aggiunto, ma senza la fibra del frutto: un bicchiere basta, e quando puoi scegli il frutto intero.',
    approx: { kcal: 88, proteinG: 1.4, carbG: 19, fatG: 0.4, fiberG: 0.4 },
  },
  {
    id: 'cappuccino',
    name: 'Cappuccino',
    verdict: 'si',
    why: 'Latte e caffè: qualche grammo di proteine. Amaro o con mezza bustina di zucchero.',
    approx: { kcal: 95, proteinG: 5, carbG: 7, fatG: 5, fiberG: 0 },
  },
  {
    id: 'caffe',
    name: 'Caffè espresso',
    verdict: 'si',
    why: 'Praticamente zero calorie. Dopo le 14 scegli il decaffeinato: la caffeina disturba il sonno per ore.',
    approx: { kcal: 2, proteinG: 0.1, carbG: 0.3, fatG: 0, fiberG: 0 },
  },

  // ───────────────────────── Con un accorgimento ─────────────────────────
  {
    id: 'pasta-pomodoro',
    name: 'Piatto di pasta al pomodoro',
    verdict: 'meglio',
    why: 'Amido facile da digerire, ideale nei giorni di calcio, ma solo 16 g di proteine: chiedi di aggiungere tonno, un uovo o del formaggio.',
    approx: { kcal: 510, proteinG: 16, carbG: 81, fatG: 12.5, fiberG: 5 },
  },
  {
    id: 'toast',
    name: 'Toast al formaggio',
    verdict: 'meglio',
    why: 'Pane bianco e formaggio fuso saziano poco e danno poche proteine. Uno solo, con uno yogurt alla frutta.',
    approx: { kcal: 260, proteinG: 12, carbG: 26, fatG: 11, fiberG: 1.5 },
  },
  {
    id: 'tramezzino',
    name: 'Tramezzino tonno e pomodoro',
    verdict: 'meglio',
    why: 'La maionese raddoppia i grassi. Scegli quello con meno salsa e aggiungi uno yogurt per le proteine.',
    approx: { kcal: 300, proteinG: 12, carbG: 26, fatG: 16.5, fiberG: 1.5 },
  },
  {
    id: 'piadina',
    name: 'Piadina con mozzarella, pomodoro e rucola',
    verdict: 'meglio',
    why: 'Piadina e formaggio sono pesanti: va bene come pranzo, non come spuntino. Chiedila senza salse e aggiungi un frutto.',
    approx: { kcal: 525, proteinG: 21.5, carbG: 54, fatG: 24, fiberG: 3 },
  },
  {
    id: 'trancio-pizza',
    name: 'Trancio di pizza margherita',
    verdict: 'meglio',
    why: 'Va bene a pranzo nei giorni di calcio. Un trancio solo, poi un frutto o un’insalata per la fibra.',
    approx: { kcal: 440, proteinG: 16, carbG: 62, fatG: 13, fiberG: 3.5 },
  },
  {
    id: 'focaccia',
    name: 'Focaccia semplice',
    verdict: 'meglio',
    why: 'Pane e olio con pochissime proteine: abbinala a un cappuccino o a uno yogurt, altrimenti dopo un’ora hai di nuovo fame.',
    approx: { kcal: 390, proteinG: 9, carbG: 56, fatG: 14, fiberG: 2.5 },
  },
  {
    id: 'succo-brick',
    name: 'Succo di frutta in brick',
    verdict: 'meglio',
    why: 'È quasi solo zucchero e non sazia. Al suo posto prendi una spremuta o un frutto.',
    approx: { kcal: 100, proteinG: 0.4, carbG: 25, fatG: 0, fiberG: 0.6 },
  },

  // ───────────────────────── Dolce programmato ─────────────────────────
  {
    id: 'cornetto-vuoto',
    name: 'Cornetto vuoto',
    verdict: 'programmato',
    why: 'Burro e zucchero: conta come uno dei dolci della settimana. Con un cappuccino diventa una colazione accettabile.',
    approx: { kcal: 275, proteinG: 5, carbG: 30, fatG: 15, fiberG: 1 },
  },
  {
    id: 'cornetto-farcito',
    name: 'Cornetto alla crema o al cioccolato',
    verdict: 'programmato',
    why: 'Più zucchero e grassi del cornetto vuoto: solo come dolce programmato, meglio se segui con uno spuntino proteico.',
    approx: { kcal: 345, proteinG: 6, carbG: 42, fatG: 17, fiberG: 1.2 },
  },
  {
    id: 'merendina',
    name: 'Merendina confezionata o crostatina',
    verdict: 'programmato',
    why: 'Prodotto ultra-processato che sazia poco: solo come dolce programmato, dopo un pasto e non a stomaco vuoto.',
    approx: { kcal: 180, proteinG: 2.5, carbG: 26, fatG: 7.5, fiberG: 1 },
  },
];
