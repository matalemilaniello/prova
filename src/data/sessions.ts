/**
 * Ritmo · sedute di palestra.
 *
 * Settimana tipo: partita lunedì sera, calcetto mercoledì, allenamento giovedì.
 *   A · martedì, il giorno dopo la partita e prima del calcetto: parte superiore a presa neutra
 *       (gomito laterale sensibile alle spinte: niente bilanciere, solo manubri, cavi e macchine),
 *       gambe solo in prevenzione e a basso costo di fatica.
 *   B · venerdì, circa 72 ore prima della partita: forza di gambe pesante ma lontana dal cedimento
 *       (RIR 2), Nordic a volume basso di mantenimento, polpacci pesanti.
 *   C · sabato, facoltativa, circa 58 ore prima della partita: corpo intero leggero (RIR 3) e mobilità.
 *
 * Prevenzione distribuita nella settimana:
 *   Nordic 1 volta (B, 2 × 4-6: in stagione il volume basso basta a mantenere la forza eccentrica);
 *   Copenhagen 1 volta (A, dalla leva corta, poi leva lunga); polpacci pesanti 2 volte (A seduto per il
 *   soleo, B in piedi); tibiale posteriore 1 volta (A, salita sulle punte con la pallina tra i talloni: con
 *   soleo e flessore lungo delle dita origina dalla faccia posteriore della tibia, la zona tipica dei
 *   sovraccarichi da corsa); tibiale anteriore 2 volte (B e C); estensori del polso 2 volte, con isometria
 *   prima delle spinte (A) ed eccentrico con Tyler twist a fine seduta (A e B); core anti-estensione (dead bug, B),
 *   anti-rotazione (Pallof, B e C) e piano frontale (Copenhagen, plank laterale).
 *
 * Riscaldamento di 6-8 minuti. In B e C riprende il FIFA 11+ (parti 1 e 2) adattato alla palestra:
 * cyclette al posto della corsa, apertura e chiusura dell'anca, affondi, equilibrio su una gamba, balzi con
 * atterraggio stabile o mobilità della caviglia. In A, seduta di parte superiore il giorno dopo la partita,
 * scioglie le gambe e prepara spalle e gomito alle spinte.
 *
 * Fase di ingresso (engine/training.ts, introLevel): nelle prime 2 esecuzioni di ogni seduta il lettore
 * propone una serie in meno e una ripetizione di riserva in più. Chi arriva da allenamenti senza programma
 * evita così l'indolenzimento dei primi Nordic e affondi bulgari, che ha il picco a 48-72 ore: proprio il
 * lunedì della partita.
 *
 * Progressione doppia: quando tutte le serie arrivano a `repMax` con lo stesso carico, si aggiunge
 * `incrementKg` e si riparte da `repMin`. Incrementi: manubri 1-2 kg (per manubrio), bilanciere e
 * trap bar 2,5 kg, macchine e cavi 2,5-5 kg.
 *
 * `estMin` è la durata reale attesa; `estimateSessionMin` la ricava da serie, tempo di lavoro e
 * recuperi e serve da controllo di coerenza (vedi sessions.test.ts). `estMin` coincide con la somma dei minuti
 * dei blocchi arrotondati uno per uno, così l'anteprima della seduta torna al minuto con la durata in testa.
 */
import type { SessionExercise, WorkoutSession } from '../domain/types';

// ───────────────────────── Stima della durata ─────────────────────────

/** Secondi medi per ripetizione con le cadenze indicate (discesa 2-3 secondi, pause brevi). */
export const SEC_PER_REP = 4;
/** Secondi per prendere posizione o caricare l'attrezzo a ogni serie. */
export const SETUP_SEC_PER_SET = 10;

/** Tempo di lavoro stimato di una serie, in secondi (entrambi i lati se l'esercizio è per lato). */
export function estimateWorkSec(item: SessionExercise): number {
  const mid = (item.repMin + item.repMax) / 2;
  const perSide = item.unit === 'secondi' ? mid : mid * SEC_PER_REP;
  return SETUP_SEC_PER_SET + perSide * (item.perSide ? 2 : 1);
}

/** Tempo totale stimato di un esercizio della seduta: serie × (lavoro + recupero), in secondi. */
export function estimateItemSec(item: SessionExercise): number {
  return item.sets * (estimateWorkSec(item) + item.restSec);
}

/** Durata stimata della seduta in minuti, arrotondata. */
export function estimateSessionMin(session: WorkoutSession): number {
  const sec = session.blocks.reduce((tot, b) => tot + b.items.reduce((s, it) => s + estimateItemSec(it), 0), 0);
  return Math.round(sec / 60);
}

// ───────────────────────── Sedute ─────────────────────────

/** Sedute nell'ordine della settimana tipo. */
export const SESSION_LIST: readonly WorkoutSession[] = [
  {
    id: 'A',
    name: 'Seduta A',
    subtitle: 'Parte superiore e prevenzione',
    estMin: 55,
    focus:
      'Spinte e tirate a presa neutra, poi adduttori, soleo, tibiale posteriore e gomito. ' +
      'Il giorno dopo la partita le gambe fanno solo prevenzione.',
    blocks: [
      {
        title: 'Riscaldamento',
        items: [
          { exerciseId: 'cyclette-ritmo-crescente', sets: 1, repMin: 120, repMax: 120, unit: 'secondi', restSec: 10, progression: 'nessuna', note: 'Resistenza bassa: le gambe vengono dalla partita' },
          { exerciseId: 'extrarotazioni-con-elastico', sets: 1, repMin: 10, repMax: 12, unit: 'reps', restSec: 15, progression: 'nessuna', perSide: true },
          { exerciseId: 'isometria-estensori-polso', sets: 3, repMin: 30, repMax: 40, unit: 'secondi', restSec: 30, progression: 'nessuna', note: 'Prima delle spinte, sul braccio dolente' },
        ],
      },
      {
        title: 'Blocco principale',
        items: [
          { exerciseId: 'panca-manubri-presa-neutra', sets: 3, repMin: 6, repMax: 10, unit: 'reps', rir: 2, restSec: 120, progression: 'doppia', incrementKg: 2, note: 'Prima 1 serie di avvicinamento leggera' },
          { exerciseId: 'lat-machine-presa-neutra', sets: 3, repMin: 8, repMax: 12, unit: 'reps', rir: 2, restSec: 90, progression: 'doppia', incrementKg: 2.5, note: 'Se stringere la maniglia irrita il gomito, usa le fasce' },
          { exerciseId: 'panca-inclinata-manubri-presa-neutra', sets: 2, repMin: 8, repMax: 12, unit: 'reps', rir: 2, restSec: 90, progression: 'doppia', incrementKg: 2 },
          { exerciseId: 'rematore-manubrio-una-mano', sets: 3, repMin: 8, repMax: 12, unit: 'reps', rir: 2, restSec: 45, progression: 'doppia', incrementKg: 2, perSide: true, note: "Un lato dopo l’altro, poi recupera" },
          { exerciseId: 'face-pull-con-corda', sets: 2, repMin: 12, repMax: 15, unit: 'reps', rir: 2, restSec: 30, progression: 'doppia', incrementKg: 2.5 },
        ],
      },
      {
        title: 'Prevenzione',
        items: [
          { exerciseId: 'copenhagen-leva-corta', sets: 2, repMin: 6, repMax: 10, unit: 'reps', rir: 2, restSec: 30, progression: 'nessuna', perSide: true, note: "Quando fai 2 serie da 10 per lato senza fastidio all’inguine, passa alla leva lunga" },
          { exerciseId: 'polpacci-seduto', sets: 3, repMin: 8, repMax: 12, unit: 'reps', rir: 2, restSec: 60, progression: 'doppia', incrementKg: 5, note: 'Pesante e lento: nella corsa il soleo è il muscolo che spinge di più' },
          { exerciseId: 'sollevamenti-punte-pallina', sets: 2, repMin: 12, repMax: 15, unit: 'reps', rir: 2, restSec: 30, progression: 'nessuna', note: "Per il tibiale posteriore, che sostiene l’arco del piede. A corpo libero finché 2 × 15 restano facili, poi con un manubrio in mano" },
          { exerciseId: 'tyler-twist', sets: 3, repMin: 15, repMax: 15, unit: 'reps', restSec: 30, progression: 'nessuna', note: 'Barra più dura quando 3 serie da 15 restano sotto 3 su 10 di dolore' },
        ],
      },
    ],
  },
  {
    id: 'B',
    name: 'Seduta B',
    subtitle: 'Forza gambe, Nordic e polpacci',
    estMin: 59,
    focus:
      'Forza di gambe e catena posteriore a circa 72 ore dalla partita: ' +
      'carichi pesanti ma lontani dal cedimento, Nordic a volume basso.',
    blocks: [
      {
        title: 'Riscaldamento',
        items: [
          { exerciseId: 'cyclette-ritmo-crescente', sets: 1, repMin: 120, repMax: 120, unit: 'secondi', restSec: 10, progression: 'nessuna' },
          { exerciseId: 'apertura-chiusura-anca-in-marcia', sets: 1, repMin: 6, repMax: 8, unit: 'reps', restSec: 15, progression: 'nessuna', perSide: true },
          { exerciseId: 'affondi-in-camminata-con-rotazione', sets: 1, repMin: 6, repMax: 8, unit: 'reps', restSec: 15, progression: 'nessuna', perSide: true },
          { exerciseId: 'equilibrio-su-una-gamba-a-stella', sets: 1, repMin: 20, repMax: 30, unit: 'secondi', restSec: 15, progression: 'nessuna', perSide: true },
          { exerciseId: 'balzi-del-pattinatore', sets: 1, repMin: 6, repMax: 8, unit: 'reps', restSec: 30, progression: 'nessuna', perSide: true, note: 'Atterraggi morbidi e silenziosi' },
        ],
      },
      {
        title: 'Blocco principale',
        items: [
          { exerciseId: 'stacco-trap-bar', sets: 3, repMin: 4, repMax: 6, unit: 'reps', rir: 2, restSec: 150, progression: 'doppia', incrementKg: 2.5, note: 'Prima 2 serie di avvicinamento leggere. Se la presa irrita il gomito, usa le fasce' },
          { exerciseId: 'nordic-hamstring-curl', sets: 2, repMin: 4, repMax: 6, unit: 'reps', restSec: 120, progression: 'nessuna', note: 'Prime 2 settimane: 1 × 4-5, oppure la variante assistita con elastico. Poi in stagione basta poco volume per mantenere la forza eccentrica' },
          { exerciseId: 'affondo-bulgaro-manubri', sets: 3, repMin: 6, repMax: 10, unit: 'reps', rir: 2, restSec: 90, progression: 'doppia', incrementKg: 2, perSide: true },
          { exerciseId: 'hip-thrust-bilanciere', sets: 3, repMin: 8, repMax: 12, unit: 'reps', rir: 2, restSec: 90, progression: 'doppia', incrementKg: 2.5 },
        ],
      },
      {
        title: 'Prevenzione',
        items: [
          { exerciseId: 'polpacci-in-piedi-macchina', sets: 3, repMin: 6, repMax: 10, unit: 'reps', rir: 2, restSec: 90, progression: 'doppia', incrementKg: 5, note: 'Pesante e lento, pausa in alto e in basso' },
          { exerciseId: 'tibiale-anteriore-seduto', sets: 2, repMin: 12, repMax: 15, unit: 'reps', rir: 2, restSec: 30, progression: 'doppia', incrementKg: 1 },
          { exerciseId: 'dead-bug', sets: 2, repMin: 6, repMax: 8, unit: 'reps', restSec: 30, progression: 'nessuna', perSide: true },
          { exerciseId: 'pallof-press', sets: 2, repMin: 8, repMax: 10, unit: 'reps', rir: 2, restSec: 30, progression: 'doppia', incrementKg: 2.5, perSide: true },
          { exerciseId: 'tyler-twist', sets: 3, repMin: 15, repMax: 15, unit: 'reps', restSec: 30, progression: 'nessuna', note: "Nel protocollo originale (Tyler e colleghi, 2010) si fa ogni giorno: se il fisioterapista è d’accordo, aggiungilo tra gli esercizi del fisioterapista" },
        ],
      },
    ],
  },
  {
    id: 'C',
    name: 'Seduta C',
    subtitle: 'Corpo intero leggero e mobilità',
    estMin: 37,
    focus:
      'A due giorni dalla partita: carichi leggeri con 3 ripetizioni di riserva ' +
      'e mobilità per anche e caviglie.',
    blocks: [
      {
        title: 'Riscaldamento',
        items: [
          { exerciseId: 'cyclette-ritmo-crescente', sets: 1, repMin: 120, repMax: 120, unit: 'secondi', restSec: 10, progression: 'nessuna' },
          { exerciseId: 'apertura-chiusura-anca-in-marcia', sets: 1, repMin: 6, repMax: 8, unit: 'reps', restSec: 15, progression: 'nessuna', perSide: true },
          { exerciseId: 'affondi-in-camminata-con-rotazione', sets: 1, repMin: 6, repMax: 8, unit: 'reps', restSec: 15, progression: 'nessuna', perSide: true },
          { exerciseId: 'equilibrio-su-una-gamba-a-stella', sets: 1, repMin: 20, repMax: 30, unit: 'secondi', restSec: 15, progression: 'nessuna', perSide: true },
          { exerciseId: 'mobilita-caviglia-al-muro', sets: 1, repMin: 8, repMax: 10, unit: 'reps', restSec: 15, progression: 'nessuna', perSide: true },
        ],
      },
      {
        title: 'Blocco principale',
        items: [
          { exerciseId: 'squat-goblet', sets: 2, repMin: 8, repMax: 12, unit: 'reps', rir: 3, restSec: 75, progression: 'doppia', incrementKg: 2 },
          { exerciseId: 'piegamenti-su-impugnature', sets: 2, repMin: 8, repMax: 15, unit: 'reps', rir: 3, restSec: 60, progression: 'nessuna' },
          { exerciseId: 'stacco-rumeno-una-gamba', sets: 2, repMin: 6, repMax: 8, unit: 'reps', rir: 3, restSec: 45, progression: 'doppia', incrementKg: 2, perSide: true, note: 'Carico leggero: conta il controllo del bacino' },
          { exerciseId: 'rematore-petto-appoggiato', sets: 2, repMin: 10, repMax: 12, unit: 'reps', rir: 3, restSec: 60, progression: 'doppia', incrementKg: 2 },
        ],
      },
      {
        title: 'Prevenzione e mobilità',
        items: [
          { exerciseId: 'pallof-press', sets: 2, repMin: 8, repMax: 10, unit: 'reps', rir: 3, restSec: 30, progression: 'doppia', incrementKg: 2.5, perSide: true },
          { exerciseId: 'tibiale-al-muro', sets: 2, repMin: 15, repMax: 20, unit: 'reps', restSec: 30, progression: 'nessuna' },
          { exerciseId: 'plank-laterale', sets: 2, repMin: 20, repMax: 30, unit: 'secondi', restSec: 30, progression: 'nessuna', perSide: true },
          { exerciseId: 'rotazioni-anche-90-90', sets: 1, repMin: 6, repMax: 8, unit: 'reps', restSec: 15, progression: 'nessuna', perSide: true },
          { exerciseId: 'allungamento-flessori-anca', sets: 1, repMin: 30, repMax: 45, unit: 'secondi', restSec: 15, progression: 'nessuna', perSide: true },
        ],
      },
    ],
  },
];

/** Sedute di palestra per id ('A' | 'B' | 'C', come in `ScheduleDay.gymSessionId`). */
export const SESSIONS: Record<string, WorkoutSession> = Object.fromEntries(SESSION_LIST.map((s) => [s.id, s]));
