/**
 * Ritmo · catalogo degli esercizi.
 *
 * Nomi come si dicono in una palestra italiana, 2-3 indicazioni tecniche imperative per esercizio.
 * Pensato per un calciatore amatoriale che va in palestra, con i sovraccarichi tipici di chi gioca (flessori,
 * gamba sotto il ginocchio, gomito nelle spinte): la prevenzione segue le evidenze disponibili
 * (Nordic hamstring curl, Copenhagen, polpacci e soleo pesanti, tibiale posteriore e anteriore, carico progressivo
 * degli estensori del polso, core anti-estensione e anti-rotazione) e il riscaldamento riprende la
 * struttura del FIFA 11+ adattata alla palestra.
 *
 * Criterio di `elbowFriendly` (dolore laterale di gomito, cioè estensori del polso):
 *   true  · presa neutra o nessuna presa, poco lavoro degli estensori, carichi in mano moderati;
 *           anche gli esercizi di carico graduale del tendine, dosati sul dolore (isometria, Tyler twist).
 *   false · presa prona sotto carico a gomito teso, presa pesante e prolungata (stacchi, trasporti,
 *           trazioni), bilanciere in spinta. Ognuno di questi ha almeno un'alternativa adatta.
 *
 * Le alternative puntano a esercizi dello stesso schema motorio o con lo stesso scopo preventivo.
 *
 * Campi propri del catalogo (non fanno parte del contratto dei dati, gli esercizi del fisioterapista non li hanno):
 *   impact  · esercizio con fase di volo e atterraggio (balzi, salti): con la tibia oltre la soglia degli
 *             impatti viene sostituito da un'alternativa senza volo;
 *   startKg · tre carichi di partenza tipici per la prima volta (totali per bilanciere, trap bar e macchine,
 *             per manubrio con i manubri), pensati per lasciare 2-3 ripetizioni di riserva a un adulto
 *             allenato ma senza programma. Sono un punto di partenza: il lettore li propone, l'utente sceglie;
 *   elbowSwitch · con il gomito sopra soglia l'esercizio lascia il posto a questa variante, che chiede meno
 *             presa e meno stabilizzazione al polso (la panca con i manubri passa alla macchina o ai cavi).
 *             `incrementKg` è il passo del carico sulla variante, se diverso da quello della seduta.
 */
import type { Exercise, TrainingQuality } from '../domain/types';

/**
 * Schema di movimento (docs/FASE2.md § 3.7): la sostituzione cerca prima lo stesso schema e la stessa qualità. Ogni
 * esercizio del catalogo ne ha uno (test). `laterale` vale sia per il core sul piano frontale sia per i balzi laterali.
 */
export type MovementPattern =
  | 'squat'
  | 'cerniera'
  | 'affondo'
  | 'ponte'
  | 'spinta-orizzontale'
  | 'spinta-verticale'
  | 'tirata-orizzontale'
  | 'tirata-verticale'
  | 'flessori'
  | 'adduttori'
  | 'polpaccio'
  | 'soleo'
  | 'tibiale'
  | 'polso'
  | 'anti-estensione'
  | 'anti-rotazione'
  | 'laterale'
  | 'salto-verticale'
  | 'salto-orizzontale'
  | 'reattivo'
  | 'lancio'
  | 'accelerazione'
  | 'decelerazione'
  | 'cambio-direzione'
  | 'velocita-massima'
  | 'intermittente'
  | 'aerobico'
  | 'mobilita'
  | 'riscaldamento';

/** Spazio che l'esercizio richiede: la palestra c'è sempre; corsia (15-20 m liberi) e campo li sceglie l'utente. */
export type ExerciseSpace = 'palestra' | 'corsia' | 'campo' | 'casa';

/** Livello d'impatto (§ 3.6): 0 senza volo, 1 atterraggio basso, 2 moderato, 3 reattivo. */
export type ImpactLevel = 0 | 1 | 2 | 3;

/** Esercizio del catalogo, con i campi facoltativi propri del catalogo. */
export interface CatalogExercise extends Exercise {
  /** Fase di volo e atterraggio, corsa o sprint: da evitare con la tibia oltre la soglia degli impatti. */
  impact?: boolean;
  /** Carichi di partenza tipici in kg (tre valori crescenti) per la prima volta con l'esercizio. */
  startKg?: readonly number[];
  /** Variante che prende il posto dell'esercizio con il gomito sopra soglia (meno presa sui manubri). */
  elbowSwitch?: { to: string; incrementKg?: number };
  /** Schema di movimento: obbligatorio per ogni esercizio del catalogo (test). */
  pattern?: MovementPattern;
  /** Qualità che l'esercizio allena (§ 2.2). */
  qualities?: TrainingQuality[];
  /** Livello d'impatto; assente = 0 senza `impact`, 3 (il più prudente) con `impact: true`. */
  impactLevel?: ImpactLevel;
  /** Salti e balzi: contatti con il suolo per ripetizione (per gamba negli esercizi su una gamba). */
  contactsPerRep?: number;
  /** Spazio richiesto; assente = palestra. */
  space?: ExerciseSpace;
  /** Fuori dal conteggio dei contatti (la prova del saltello del rientro, § 3.8). */
  uncounted?: boolean;
}

/** Catalogo della fase 1, in ordine di categoria (riscaldamento, mobilità, spinte, tirate, gambe, core, prevenzione). */
const BASE_LIST: readonly CatalogExercise[] = [
  // ───────────────────────── Riscaldamento (FIFA 11+ adattato) ─────────────────────────
  {
    id: 'cyclette-ritmo-crescente',
    name: 'Cyclette a ritmo crescente',
    category: 'riscaldamento',
    equipment: 'Cyclette',
    cues: [
      "Sella all’altezza dell’anca, ginocchio appena piegato in fondo alla pedalata",
      'Primo minuto agile, poi aumenta la resistenza ogni minuto',
      'Chiudi respirando più forte ma ancora in grado di parlare',
    ],
    elbowFriendly: true,
    alternatives: ['ellittica-ritmo-crescente'],
    videoQuery: 'riscaldamento cyclette regolazione altezza sella',
  },
  {
    id: 'ellittica-ritmo-crescente',
    name: 'Ellittica a ritmo crescente',
    category: 'riscaldamento',
    equipment: 'Ellittica',
    cues: [
      'Busto dritto, spingi con tutto il piede senza staccare i talloni',
      'Aumenta la resistenza ogni minuto',
      'Chiudi respirando più forte ma ancora in grado di parlare',
    ],
    elbowFriendly: true,
    alternatives: ['cyclette-ritmo-crescente'],
    videoQuery: 'ellittica tecnica corretta riscaldamento',
  },
  {
    id: 'apertura-chiusura-anca-in-marcia',
    name: "Apertura e chiusura dell’anca in marcia",
    category: 'riscaldamento',
    equipment: 'Corpo libero',
    cues: [
      "Solleva il ginocchio all’altezza dell’anca e disegna un cerchio ampio",
      "Alterna: un passo apri verso l’esterno, il successivo chiudi verso l’interno",
      "Bacino fermo e busto alto, senza inclinarti sulla gamba d’appoggio",
    ],
    elbowFriendly: true,
    alternatives: ['rotazioni-anche-90-90', 'dondolo-adduttori-quadrupedia'],
    videoQuery: 'fifa 11+ apertura chiusura anca riscaldamento calcio',
  },
  {
    id: 'affondi-in-camminata-con-rotazione',
    name: 'Affondi in camminata con rotazione del busto',
    category: 'riscaldamento',
    equipment: 'Corpo libero',
    cues: [
      'Passo lungo, ginocchio avanti sopra il piede',
      'In basso ruota il busto verso la gamba avanti',
      "Spingi con il tallone e porta avanti l’altra gamba",
    ],
    elbowFriendly: true,
    alternatives: ['allungamento-corridore-con-rotazione', 'squat-con-sollevamento-punte'],
    videoQuery: 'affondi in camminata con rotazione del busto riscaldamento',
  },
  {
    id: 'squat-con-sollevamento-punte',
    name: 'Squat con sollevamento sulle punte',
    category: 'riscaldamento',
    equipment: 'Corpo libero',
    cues: [
      'Scendi a cosce parallele con le ginocchia in linea con le punte',
      'Risalendo, sali sulle punte in un unico movimento',
      'Riscendi dai talloni lentamente',
    ],
    elbowFriendly: true,
    alternatives: ['affondi-in-camminata-con-rotazione', 'squat-goblet'],
    videoQuery: 'fifa 11+ squat sollevamento punte',
  },
  {
    id: 'equilibrio-su-una-gamba-a-stella',
    name: 'Equilibrio su una gamba con tocchi a stella',
    category: 'riscaldamento',
    equipment: 'Corpo libero',
    cues: [
      "Ginocchio d’appoggio morbido e in linea con il secondo dito",
      "Tocca terra avanti, di lato e dietro con l’altro piede, lontano ma senza caricarlo",
      'Bacino orizzontale per tutta la serie',
    ],
    elbowFriendly: true,
    alternatives: ['stacco-rumeno-una-gamba', 'balzi-del-pattinatore'],
    videoQuery: 'equilibrio su una gamba tocchi a stella esercizio',
  },
  {
    id: 'balzi-del-pattinatore',
    name: 'Balzi laterali del pattinatore',
    category: 'riscaldamento',
    equipment: 'Corpo libero',
    cues: [
      "Salta di lato da una gamba all’altra, senza cercare la distanza",
      "Atterra morbido sull’avampiede e resta fermo un secondo in equilibrio",
      "Ginocchio sopra il piede all’atterraggio, mai verso l’interno",
    ],
    elbowFriendly: true,
    impact: true,
    alternatives: ['passi-laterali-elastico', 'equilibrio-su-una-gamba-a-stella'],
    videoQuery: 'balzi laterali del pattinatore atterraggio stabile calcio',
  },
  {
    id: 'passi-laterali-elastico',
    name: 'Passi laterali con elastico ad anello',
    category: 'riscaldamento',
    equipment: 'Elastico ad anello',
    cues: [
      'Elastico sopra le caviglie, mezzo squat con il busto alto',
      "Passi laterali corti, piedi paralleli che non si toccano mai",
      "Ginocchia sopra i piedi, mai verso l’interno",
    ],
    elbowFriendly: true,
    alternatives: ['equilibrio-su-una-gamba-a-stella', 'apertura-chiusura-anca-in-marcia'],
    videoQuery: 'passi laterali elastico ad anello attivazione glutei',
  },
  {
    id: 'aperture-con-elastico',
    name: 'Aperture con elastico a presa supina',
    category: 'riscaldamento',
    equipment: 'Elastico',
    cues: [
      "Braccia tese davanti al petto, palmi verso l’alto",
      "Apri fino a portare l’elastico sul petto, scapole indietro e in basso",
      'Torna lento senza perdere la tensione',
    ],
    elbowFriendly: true,
    alternatives: ['face-pull-con-corda', 'extrarotazioni-con-elastico'],
    videoQuery: 'aperture con elastico presa supina spalle',
  },
  {
    id: 'extrarotazioni-con-elastico',
    name: 'Extrarotazioni con elastico',
    category: 'riscaldamento',
    equipment: 'Elastico',
    cues: [
      'Gomito a 90° stretto al fianco, un asciugamano arrotolato sotto il braccio',
      "Ruota l’avambraccio verso l’esterno senza staccare il gomito",
      'Torna in 2 secondi',
    ],
    elbowFriendly: true,
    alternatives: ['aperture-con-elastico', 'face-pull-con-corda'],
    videoQuery: 'extrarotazioni spalla con elastico cuffia dei rotatori',
  },

  // ───────────────────────── Mobilità ─────────────────────────
  {
    id: 'mobilita-caviglia-al-muro',
    name: 'Mobilità della caviglia al muro',
    category: 'mobilita',
    equipment: 'Muro',
    cues: [
      'Piede a una spanna dal muro, tallone sempre a terra',
      'Porta il ginocchio a toccare il muro sopra il secondo dito',
      'Tieni 2 secondi e allontana il piede quando diventa facile',
    ],
    elbowFriendly: true,
    alternatives: ['squat-con-sollevamento-punte'],
    videoQuery: 'mobilità caviglia ginocchio al muro dorsiflessione',
  },
  {
    id: 'rotazioni-anche-90-90',
    name: 'Rotazioni delle anche 90-90',
    category: 'mobilita',
    equipment: 'Tappetino',
    cues: [
      'Seduto a terra con entrambe le ginocchia a 90°, una gamba davanti e una di lato',
      "Porta le ginocchia dall’altra parte tenendo il busto alto",
      'Appoggia le mani dietro solo se serve, poi prova senza',
    ],
    elbowFriendly: true,
    alternatives: ['dondolo-adduttori-quadrupedia', 'apertura-chiusura-anca-in-marcia'],
    videoQuery: 'mobilità anche 90 90 rotazioni',
  },
  {
    id: 'allungamento-corridore-con-rotazione',
    name: 'Allungamento del corridore con rotazione',
    category: 'mobilita',
    equipment: 'Corpo libero',
    cues: [
      "Affondo lungo, mani a terra all’interno del piede avanti",
      'Porta il gomito verso la caviglia, poi apri il braccio verso il soffitto',
      'Ginocchio dietro teso e gluteo stretto',
    ],
    elbowFriendly: true,
    alternatives: ['affondi-in-camminata-con-rotazione', 'allungamento-flessori-anca'],
    videoQuery: 'allungamento del corridore con rotazione mobilità anche',
  },
  {
    id: 'allungamento-flessori-anca',
    name: "Allungamento dei flessori dell’anca in ginocchio",
    category: 'mobilita',
    equipment: 'Tappetino',
    cues: [
      'In ginocchio, bacino in retroversione e gluteo della gamba dietro stretto',
      'Sposta il peso avanti di pochi centimetri senza inarcare la schiena',
      'Alza il braccio del lato dietro per allungare di più',
    ],
    elbowFriendly: true,
    alternatives: ['allungamento-corridore-con-rotazione'],
    videoQuery: 'allungamento ileopsoas in ginocchio retroversione bacino',
  },
  {
    id: 'dondolo-adduttori-quadrupedia',
    name: 'Dondolo per gli adduttori in quadrupedia',
    category: 'mobilita',
    equipment: 'Tappetino',
    cues: [
      'In quadrupedia, una gamba tesa di lato con il piede a terra',
      'Porta il bacino indietro verso i talloni con la schiena neutra',
      "Fermati dove senti l’interno coscia, 2 secondi, e torna",
    ],
    elbowFriendly: true,
    alternatives: ['rotazioni-anche-90-90'],
    videoQuery: 'mobilità adduttori in quadrupedia dondolo',
  },

  // ───────────────────────── Spinte (solo manubri, cavi e macchine a presa neutra) ─────────────────────────
  {
    id: 'panca-manubri-presa-neutra',
    name: 'Panca piana con manubri a presa neutra',
    category: 'spinta',
    equipment: 'Manubri e panca',
    cues: [
      'Scapole indietro e in basso, piedi ben piantati',
      'Manubri paralleli, gomiti a 30-45° dal busto',
      'Scendi in 2 secondi fino al petto e spingi senza bloccare i gomiti',
    ],
    elbowFriendly: true,
    startKg: [12, 16, 20],
    elbowSwitch: { to: 'chest-press-presa-neutra', incrementKg: 2.5 },
    alternatives: ['chest-press-presa-neutra', 'distensioni-ai-cavi-presa-neutra', 'piegamenti-su-impugnature'],
    videoQuery: 'panca piana manubri presa neutra tecnica',
  },
  {
    id: 'panca-inclinata-manubri-presa-neutra',
    name: 'Panca inclinata con manubri a presa neutra',
    category: 'spinta',
    equipment: 'Manubri e panca inclinata',
    cues: [
      'Schienale a 30°, non di più',
      'Manubri paralleli, scendi fino al petto alto',
      'Spingi in alto e leggermente indietro, sopra le spalle',
    ],
    elbowFriendly: true,
    startKg: [10, 14, 18],
    // Al posto della panca inclinata i cavi, non una seconda volta la chest press già al posto della panca piana.
    elbowSwitch: { to: 'distensioni-ai-cavi-presa-neutra', incrementKg: 2.5 },
    alternatives: ['distensioni-ai-cavi-presa-neutra', 'lento-manubri-presa-neutra', 'panca-manubri-presa-neutra'],
    videoQuery: 'panca inclinata manubri presa neutra 30 gradi',
  },
  {
    id: 'chest-press-presa-neutra',
    name: 'Chest press a presa neutra',
    category: 'spinta',
    equipment: 'Macchina chest press con maniglie verticali',
    cues: [
      "Regola il sedile: maniglie all’altezza del centro del petto",
      'Schiena e scapole ferme contro lo schienale',
      'Spingi senza bloccare i gomiti e torna in 2 secondi',
    ],
    elbowFriendly: true,
    startKg: [30, 40, 50],
    alternatives: ['panca-manubri-presa-neutra', 'distensioni-ai-cavi-presa-neutra'],
    videoQuery: 'chest press macchina presa neutra regolazione sedile',
  },
  {
    id: 'distensioni-ai-cavi-presa-neutra',
    name: 'Distensioni ai cavi in piedi a presa neutra',
    category: 'spinta',
    equipment: 'Cavi con maniglie singole',
    cues: [
      "Passo sfalsato, addome contratto, cavi all’altezza del petto",
      'Spingi in avanti con i pollici in su fino quasi a unire le mani',
      'Al ritorno non lasciare che i cavi ti tirino indietro le spalle',
    ],
    elbowFriendly: true,
    startKg: [10, 15, 20],
    alternatives: ['chest-press-presa-neutra', 'panca-manubri-presa-neutra'],
    videoQuery: 'distensioni ai cavi in piedi tecnica',
  },
  {
    id: 'lento-manubri-presa-neutra',
    name: 'Lento avanti seduto con manubri a presa neutra',
    category: 'spinta',
    equipment: 'Manubri e panca con schienale',
    cues: [
      'Schienale quasi verticale, glutei e scapole appoggiati',
      "Palmi uno verso l’altro, gomiti avanti al busto",
      'Spingi sopra la testa senza inarcare la schiena',
    ],
    elbowFriendly: true,
    startKg: [8, 12, 16],
    alternatives: ['panca-inclinata-manubri-presa-neutra', 'distensioni-ai-cavi-presa-neutra'],
    videoQuery: 'lento avanti manubri presa neutra seduto',
  },
  {
    id: 'piegamenti-su-impugnature',
    name: 'Piegamenti su impugnature a presa neutra',
    category: 'spinta',
    equipment: 'Corpo libero e impugnature per piegamenti',
    cues: [
      'Corpo in linea dalla testa ai talloni, glutei stretti',
      'Scendi con i gomiti a 45° fino a sfiorare terra con il petto',
      'Polsi dritti sulle impugnature, spingi il pavimento via',
    ],
    elbowFriendly: true,
    alternatives: ['panca-manubri-presa-neutra', 'chest-press-presa-neutra'],
    videoQuery: 'piegamenti sulle maniglie presa neutra polsi dritti',
  },

  // ───────────────────────── Tirate (presa neutra) ─────────────────────────
  {
    id: 'lat-machine-presa-neutra',
    name: 'Lat machine a presa neutra',
    category: 'tirata',
    equipment: 'Lat machine con maniglia a presa neutra',
    cues: [
      'Petto alto e cosce bloccate sotto i cuscinetti',
      'Tira i gomiti verso i fianchi fino a portare la maniglia sotto il mento',
      'Risali in 2 secondi fino a braccia distese',
    ],
    elbowFriendly: true,
    startKg: [35, 45, 55],
    alternatives: ['pulley-basso-presa-neutra', 'trazioni-presa-neutra'],
    videoQuery: 'lat machine presa neutra stretta tecnica',
  },
  {
    id: 'trazioni-presa-neutra',
    name: 'Trazioni alla sbarra a presa neutra',
    category: 'tirata',
    equipment: 'Sbarra con maniglie parallele',
    cues: [
      'Parti da braccia distese con le spalle attive, lontane dalle orecchie',
      'Tira il petto verso le maniglie, gambe ferme',
      'Scendi controllando fino in fondo',
    ],
    elbowFriendly: false,
    alternatives: ['lat-machine-presa-neutra', 'pulley-basso-presa-neutra'],
    videoQuery: 'trazioni presa neutra sbarra tecnica',
  },
  {
    id: 'rematore-manubrio-una-mano',
    name: 'Rematore con manubrio a una mano',
    category: 'tirata',
    equipment: 'Manubrio e panca',
    cues: [
      'Mano e ginocchio sulla panca, schiena piatta',
      "Tira il manubrio verso l’anca, non verso la spalla",
      'Fermati un secondo in alto e scendi fino ad allungare la scapola',
    ],
    elbowFriendly: true,
    startKg: [14, 18, 22],
    alternatives: ['rematore-petto-appoggiato', 'pulley-basso-presa-neutra'],
    videoQuery: 'rematore manubrio una mano panca tecnica',
  },
  {
    id: 'rematore-petto-appoggiato',
    name: 'Rematore con petto appoggiato su panca inclinata',
    category: 'tirata',
    equipment: 'Manubri e panca inclinata',
    cues: [
      'Schienale a 30-45°, petto appoggiato e piedi a terra',
      "Palmi uno verso l’altro, tira i gomiti indietro vicino ai fianchi",
      'Stringi le scapole un secondo e scendi controllando',
    ],
    elbowFriendly: true,
    startKg: [10, 14, 18],
    alternatives: ['rematore-manubrio-una-mano', 'pulley-basso-presa-neutra'],
    videoQuery: 'rematore petto appoggiato panca inclinata manubri',
  },
  {
    id: 'pulley-basso-presa-neutra',
    name: 'Pulley basso a presa neutra',
    category: 'tirata',
    equipment: 'Pulley con maniglia a V',
    cues: [
      'Busto fermo e dritto, ginocchia appena piegate',
      "Tira la maniglia verso l’ombelico portando i gomiti indietro",
      'Allunga le braccia in avanti senza piegare la schiena',
    ],
    elbowFriendly: true,
    startKg: [35, 45, 55],
    alternatives: ['rematore-petto-appoggiato', 'lat-machine-presa-neutra'],
    videoQuery: 'pulley basso maniglia a V tecnica',
  },
  {
    id: 'face-pull-con-corda',
    name: 'Face pull al cavo con corda',
    category: 'tirata',
    equipment: 'Cavo con corda',
    cues: [
      "Cavo all’altezza degli occhi, pollici rivolti verso di te",
      'Tira verso la fronte aprendo la corda, gomiti alti',
      'Chiudi con le mani accanto alle orecchie e torna lento',
    ],
    elbowFriendly: true,
    startKg: [10, 15, 20],
    alternatives: ['aperture-con-elastico', 'extrarotazioni-con-elastico'],
    videoQuery: 'face pull corda cavo tecnica corretta',
  },

  // ───────────────────────── Gambe ─────────────────────────
  {
    id: 'stacco-trap-bar',
    name: 'Stacco con trap bar',
    category: 'gambe',
    equipment: 'Trap bar',
    cues: [
      'Piedi alla larghezza delle anche, impugna al centro delle maniglie',
      'Petto alto e schiena neutra, spingi il pavimento con tutto il piede',
      'Chiudi con i glutei, senza inarcare la schiena in alto',
    ],
    elbowFriendly: false,
    startKg: [40, 60, 80],
    alternatives: ['hip-thrust-bilanciere', 'leg-press', 'stacco-rumeno-manubri'],
    videoQuery: 'stacco trap bar tecnica corretta',
  },
  {
    id: 'squat-goblet',
    name: 'Squat goblet con manubrio',
    category: 'gambe',
    equipment: 'Manubrio',
    cues: [
      'Manubrio verticale al petto, gomiti sotto',
      'Scendi tra le ginocchia con il busto alto, ginocchia verso le punte',
      'Spingi con tutto il piede e risali dritto',
    ],
    elbowFriendly: true,
    startKg: [16, 20, 24],
    alternatives: ['leg-press', 'affondo-bulgaro-manubri', 'squat-con-sollevamento-punte'],
    videoQuery: 'squat goblet manubrio tecnica',
  },
  {
    id: 'affondo-bulgaro-manubri',
    name: 'Affondo bulgaro con manubri',
    category: 'gambe',
    equipment: 'Manubri e panca',
    cues: [
      'Collo del piede dietro sulla panca, passo lungo quanto basta',
      'Scendi in verticale finché il ginocchio dietro sfiora terra',
      "Busto un po’ in avanti, spingi con il tallone della gamba davanti",
    ],
    elbowFriendly: true,
    startKg: [6, 10, 14],
    alternatives: ['affondi-indietro-manubri', 'step-up-manubri', 'leg-press'],
    videoQuery: 'affondo bulgaro manubri tecnica',
  },
  {
    id: 'affondi-indietro-manubri',
    name: 'Affondi indietro con manubri',
    category: 'gambe',
    equipment: 'Manubri',
    cues: [
      'Passo indietro lungo, busto dritto',
      'Scendi finché il ginocchio dietro sfiora terra',
      'Torna spingendo con il tallone della gamba avanti',
    ],
    elbowFriendly: true,
    startKg: [8, 12, 16],
    alternatives: ['affondo-bulgaro-manubri', 'step-up-manubri'],
    videoQuery: 'affondi indietro con manubri tecnica',
  },
  {
    id: 'step-up-manubri',
    name: 'Step-up sulla panca con manubri',
    category: 'gambe',
    equipment: 'Manubri e panca',
    cues: [
      'Piede intero sulla panca, ginocchio sopra le dita',
      'Sali spingendo solo con la gamba sopra, senza slancio da sotto',
      'Scendi lento in 2 secondi',
    ],
    elbowFriendly: true,
    startKg: [8, 12, 16],
    alternatives: ['affondi-indietro-manubri', 'affondo-bulgaro-manubri'],
    videoQuery: 'step up panca manubri tecnica',
  },
  {
    id: 'leg-press',
    name: 'Leg press a 45°',
    category: 'gambe',
    equipment: 'Macchina leg press',
    cues: [
      'Piedi a metà pedana, alla larghezza delle spalle',
      'Scendi finché il bacino resta appoggiato, ginocchia verso le punte',
      'Spingi senza bloccare le ginocchia in alto',
    ],
    elbowFriendly: true,
    startKg: [60, 80, 100],
    alternatives: ['squat-goblet', 'affondo-bulgaro-manubri'],
    videoQuery: 'leg press 45 gradi posizione piedi tecnica',
  },
  {
    id: 'hip-thrust-bilanciere',
    name: 'Hip thrust con bilanciere',
    category: 'gambe',
    equipment: 'Bilanciere, panca e cuscinetto',
    cues: [
      'Bordo della panca sotto le scapole, piedi alla larghezza delle anche',
      'Mento verso il petto, spingi con i talloni fino ad anche estese',
      'Fermati un secondo in alto con i glutei stretti, senza inarcare',
    ],
    elbowFriendly: true,
    startKg: [40, 60, 80],
    alternatives: ['ponte-glutei-una-gamba', 'leg-press'],
    videoQuery: 'hip thrust bilanciere tecnica corretta',
  },
  {
    id: 'ponte-glutei-una-gamba',
    name: 'Ponte glutei su una gamba',
    category: 'gambe',
    equipment: 'Tappetino',
    cues: [
      "Tallone vicino al gluteo, l’altra gamba piegata verso il petto",
      'Spingi con il tallone fino ad allineare spalla, anca e ginocchio',
      'Bacino orizzontale, fermo 2 secondi in alto',
    ],
    elbowFriendly: true,
    alternatives: ['hip-thrust-bilanciere'],
    videoQuery: 'ponte glutei una gamba esecuzione',
  },
  {
    id: 'stacco-rumeno-manubri',
    name: 'Stacco rumeno con manubri',
    category: 'gambe',
    equipment: 'Manubri',
    cues: [
      'Ginocchia morbide e ferme, manubri a contatto con le cosce',
      'Porta il bacino indietro finché senti tirare i flessori, schiena neutra',
      'Risali spingendo le anche in avanti',
    ],
    elbowFriendly: false,
    startKg: [14, 18, 22],
    alternatives: ['stacco-rumeno-una-gamba', 'leg-curl-seduto', 'hip-thrust-bilanciere'],
    videoQuery: 'stacco rumeno manubri tecnica',
  },
  {
    id: 'stacco-rumeno-una-gamba',
    name: 'Stacco rumeno su una gamba con manubrio',
    category: 'gambe',
    equipment: 'Manubrio',
    cues: [
      "Manubrio nella mano opposta alla gamba d’appoggio",
      "Busto e gamba libera scendono insieme come un’asse, bacino orizzontale",
      "Ginocchio d’appoggio morbido, risali stringendo il gluteo",
    ],
    elbowFriendly: true,
    startKg: [8, 12, 16],
    alternatives: ['ponte-glutei-una-gamba', 'stacco-rumeno-manubri', 'equilibrio-su-una-gamba-a-stella'],
    videoQuery: 'stacco rumeno una gamba manubrio equilibrio',
  },
  {
    id: 'leg-curl-seduto',
    name: 'Leg curl da seduto',
    category: 'gambe',
    equipment: 'Macchina leg curl da seduto',
    cues: [
      "Ginocchio allineato al perno della macchina, busto un po’ in avanti",
      'Piega fino in fondo e tieni un secondo',
      'Torna in 3 secondi fino a gamba quasi tesa',
    ],
    elbowFriendly: true,
    startKg: [25, 35, 45],
    alternatives: ['nordic-hamstring-curl', 'stacco-rumeno-una-gamba'],
    videoQuery: 'leg curl seduto tecnica regolazione',
  },

  // ───────────────────────── Core ─────────────────────────
  {
    id: 'dead-bug',
    name: 'Dead bug',
    category: 'core',
    equipment: 'Tappetino',
    cues: [
      'Zona lombare schiacciata a terra per tutta la serie',
      'Allunga braccio e gamba opposti espirando a fondo',
      'Torna lento e cambia lato senza inarcare',
    ],
    elbowFriendly: true,
    alternatives: ['plank-sugli-avambracci', 'bird-dog', 'rollout-ruota'],
    videoQuery: 'dead bug esercizio core anti estensione',
  },
  {
    id: 'plank-sugli-avambracci',
    name: 'Plank sugli avambracci',
    category: 'core',
    equipment: 'Tappetino',
    cues: [
      'Gomiti sotto le spalle, glutei e addome contratti',
      'Bacino in leggera retroversione, linea dritta dalla testa ai talloni',
      'Fermati quando la schiena inizia a cedere',
    ],
    elbowFriendly: true,
    alternatives: ['dead-bug', 'rollout-ruota'],
    videoQuery: 'plank avambracci posizione corretta retroversione',
  },
  {
    id: 'plank-laterale',
    name: 'Plank laterale',
    category: 'core',
    equipment: 'Tappetino',
    cues: [
      "Gomito sotto la spalla, piedi uno sopra l’altro",
      'Anca alta, in linea con spalle e caviglie',
      "Spingi il pavimento con l’avambraccio senza ruotare il busto",
    ],
    elbowFriendly: true,
    alternatives: ['copenhagen-leva-corta', 'pallof-press', 'trasporto-manubrio-un-lato'],
    videoQuery: 'plank laterale esecuzione corretta',
  },
  {
    id: 'pallof-press',
    name: 'Pallof press al cavo',
    category: 'core',
    equipment: 'Cavo o elastico',
    cues: [
      'Di fianco al cavo, maniglia al petto, piedi alla larghezza delle spalle',
      'Spingi le mani in avanti e resisti alla rotazione per 2 secondi',
      'Bacino e spalle fermi, torna al petto lento',
    ],
    elbowFriendly: true,
    startKg: [5, 10, 15],
    alternatives: ['plank-laterale', 'dead-bug'],
    videoQuery: 'pallof press cavo anti rotazione',
  },
  {
    id: 'rollout-ruota',
    name: 'Rollout con ruota addominale',
    category: 'core',
    equipment: 'Ruota addominale',
    cues: [
      'In ginocchio, glutei stretti e bacino in retroversione',
      'Rotola avanti solo finché la schiena resta piatta',
      'Torna tirando con addome e dorsali, non con le anche',
    ],
    elbowFriendly: false,
    alternatives: ['dead-bug', 'plank-sugli-avambracci'],
    videoQuery: 'ruota addominale rollout in ginocchio tecnica',
  },
  {
    id: 'trasporto-manubrio-un-lato',
    name: 'Trasporto con un manubrio da un lato',
    category: 'core',
    equipment: 'Manubrio pesante',
    cues: [
      'Manubrio pesante in una mano, spalle alla stessa altezza',
      'Cammina a passi corti senza piegarti verso il peso',
      'Addome contratto e sguardo avanti',
    ],
    elbowFriendly: false,
    startKg: [16, 20, 24],
    alternatives: ['plank-laterale', 'pallof-press'],
    videoQuery: 'trasporto manubrio da un lato esercizio core',
  },
  {
    id: 'bird-dog',
    name: 'Bird dog',
    category: 'core',
    equipment: 'Tappetino',
    cues: [
      'In quadrupedia, mani sotto le spalle e ginocchia sotto le anche',
      'Allunga braccio e gamba opposti senza ruotare il bacino',
      'Fermati 2 secondi e torna lento',
    ],
    elbowFriendly: true,
    alternatives: ['dead-bug', 'plank-sugli-avambracci'],
    videoQuery: 'bird dog esercizio quadrupedia core',
  },

  // ───────────────────────── Prevenzione ─────────────────────────
  {
    id: 'nordic-hamstring-curl',
    name: 'Nordic hamstring curl',
    category: 'prevenzione',
    equipment: 'Fermo per le caviglie o compagno, tappetino',
    cues: [
      'Anche estese, corpo in linea dalle ginocchia alle spalle',
      "Scendi più lento che puoi e frena fino all’ultimo",
      "Accompagna l’arrivo con le mani e risali spingendo da terra",
    ],
    elbowFriendly: true,
    alternatives: ['nordic-assistito-elastico', 'leg-curl-seduto'],
    videoQuery: 'nordic hamstring curl esecuzione corretta',
  },
  {
    id: 'nordic-assistito-elastico',
    name: 'Nordic assistito con elastico',
    category: 'prevenzione',
    equipment: 'Elastico e fermo per le caviglie',
    cues: [
      "Elastico fissato in alto davanti a te e passato sotto le ascelle",
      "Scendi lento con le anche estese, l’elastico ti aiuta nella parte bassa",
      'Usa un elastico più leggero quando arrivi a terra controllando',
    ],
    elbowFriendly: true,
    alternatives: ['nordic-hamstring-curl', 'leg-curl-seduto'],
    videoQuery: 'nordic assistito con elastico progressione',
  },
  {
    id: 'copenhagen-leva-corta',
    name: 'Copenhagen a leva corta',
    category: 'prevenzione',
    equipment: 'Panca',
    cues: [
      'Su un fianco, ginocchio della gamba sopra appoggiato sulla panca',
      "Solleva il bacino stringendo l’interno coscia, corpo in linea",
      'Porta la gamba sotto a toccare la panca e scendi in 2-3 secondi',
    ],
    elbowFriendly: true,
    alternatives: ['copenhagen-leva-lunga', 'adduttori-alla-macchina', 'plank-laterale'],
    videoQuery: 'copenhagen adduttori leva corta ginocchio panca',
  },
  {
    id: 'copenhagen-leva-lunga',
    name: 'Copenhagen a leva lunga',
    category: 'prevenzione',
    equipment: 'Panca',
    cues: [
      'Su un fianco, caviglia della gamba sopra appoggiata sulla panca',
      'Solleva il bacino e porta la gamba sotto a toccare la panca',
      "Scendi in 3 secondi senza far cadere l’anca",
    ],
    elbowFriendly: true,
    alternatives: ['copenhagen-leva-corta', 'adduttori-alla-macchina'],
    videoQuery: 'copenhagen adduttori leva lunga esercizio',
  },
  {
    id: 'adduttori-alla-macchina',
    name: 'Adduttori alla macchina',
    category: 'prevenzione',
    equipment: 'Macchina adduttori',
    cues: [
      "Parti da un’apertura comoda, senza forzare l’allungamento",
      'Chiudi le gambe in 1 secondo e tieni 1 secondo',
      'Riapri in 3 secondi controllando',
    ],
    elbowFriendly: true,
    startKg: [30, 40, 50],
    alternatives: ['copenhagen-leva-corta'],
    videoQuery: 'macchina adduttori tecnica corretta',
  },
  {
    id: 'polpacci-in-piedi-macchina',
    name: 'Polpacci in piedi alla macchina',
    category: 'prevenzione',
    equipment: 'Macchina polpacci in piedi',
    cues: [
      'Avampiede sul bordo, ginocchia tese ma non bloccate',
      "Sali sull’alluce il più in alto possibile e tieni 1 secondo",
      'Scendi in 2-3 secondi fino al massimo allungamento',
    ],
    elbowFriendly: true,
    startKg: [40, 60, 80],
    alternatives: ['polpacci-una-gamba-manubrio', 'polpacci-seduto'],
    videoQuery: 'polpacci in piedi alla macchina tecnica',
  },
  {
    id: 'polpacci-seduto',
    name: 'Polpacci da seduto (soleo)',
    category: 'prevenzione',
    equipment: 'Macchina polpacci da seduto',
    cues: [
      'Cuscinetto appena sopra le ginocchia, avampiede sul bordo',
      'Sali più in alto che puoi e tieni 1 secondo',
      'Scendi in 3 secondi fino al massimo allungamento',
    ],
    elbowFriendly: true,
    startKg: [20, 30, 40],
    alternatives: ['soleo-una-gamba-ginocchio-piegato', 'polpacci-in-piedi-macchina'],
    videoQuery: 'polpacci da seduto soleo macchina tecnica',
  },
  {
    id: 'polpacci-una-gamba-manubrio',
    name: 'Polpacci su una gamba con manubrio',
    category: 'prevenzione',
    equipment: 'Rialzo e manubrio',
    cues: [
      "Avampiede sul rialzo, manubrio dal lato che lavora, l’altra mano al muro",
      'Ginocchio teso, sali fino in fondo',
      'Scendi in 3 secondi sotto il livello del rialzo',
    ],
    elbowFriendly: true,
    startKg: [8, 12, 16],
    alternatives: ['polpacci-in-piedi-macchina', 'soleo-una-gamba-ginocchio-piegato'],
    videoQuery: 'polpacci su una gamba con manubrio su rialzo',
  },
  {
    id: 'soleo-una-gamba-ginocchio-piegato',
    name: 'Soleo su una gamba a ginocchio piegato',
    category: 'prevenzione',
    equipment: 'Rialzo e manubrio',
    cues: [
      'Ginocchio piegato di circa 30° e fermo per tutta la serie',
      "Sali sull’avampiede fino in fondo e tieni 1 secondo",
      'Scendi in 3 secondi senza raddrizzare il ginocchio',
    ],
    elbowFriendly: true,
    startKg: [8, 12, 16],
    alternatives: ['polpacci-seduto', 'polpacci-una-gamba-manubrio'],
    videoQuery: 'esercizio soleo ginocchio piegato una gamba',
  },
  {
    id: 'tibiale-anteriore-seduto',
    name: 'Tibiale anteriore da seduto con manubrio',
    category: 'prevenzione',
    equipment: 'Manubrio e panca',
    cues: [
      'Seduto sul bordo della panca, talloni a terra e manubrio stretto tra i piedi',
      'Porta le punte verso le tibie fino in fondo e tieni 1 secondo',
      'Scendi in 3 secondi',
    ],
    elbowFriendly: true,
    startKg: [4, 6, 8],
    alternatives: ['tibiale-al-muro'],
    videoQuery: 'rinforzo tibiale anteriore da seduto con manubrio',
  },
  {
    id: 'tibiale-al-muro',
    name: 'Tibiale anteriore al muro',
    category: 'prevenzione',
    equipment: 'Muro',
    cues: [
      'Schiena al muro, talloni a 20-30 cm di distanza',
      'Solleva le punte fino in fondo senza staccare i glutei dal muro',
      'Scendi lento e allontana i talloni per renderlo più duro',
    ],
    elbowFriendly: true,
    alternatives: ['tibiale-anteriore-seduto'],
    videoQuery: 'rinforzo tibiale anteriore al muro',
  },
  {
    id: 'sollevamenti-punte-pallina',
    name: 'Sollevamenti sulle punte con pallina tra i talloni',
    category: 'prevenzione',
    equipment: 'Pallina morbida, manubrio quando diventa facile',
    cues: [
      'Pallina tra i talloni: stringila per tutta la serie',
      "Sali sull’alluce il più in alto possibile, talloni sempre uniti",
      'Scendi in 3 secondi',
    ],
    elbowFriendly: true,
    impact: false,
    alternatives: ['polpacci-una-gamba-manubrio', 'soleo-una-gamba-ginocchio-piegato'],
    videoQuery: 'sollevamento talloni con pallina tibiale posteriore',
  },
  {
    id: 'isometria-estensori-polso',
    name: 'Isometria degli estensori del polso',
    category: 'prevenzione',
    equipment: 'Manubrio leggero o elastico, panca',
    cues: [
      'Avambraccio appoggiato a palmo in giù, polso oltre il bordo',
      'Tieni il polso in linea contro il peso, senza muoverlo',
      'Sforzo intorno a 7 su 10, dolore fino a 3 su 10 e stabile',
    ],
    elbowFriendly: true,
    alternatives: ['tyler-twist', 'eccentrico-estensori-polso'],
    videoQuery: 'isometria estensori polso epicondilite esercizio',
  },
  {
    id: 'tyler-twist',
    name: 'Tyler twist con barra flessibile',
    category: 'prevenzione',
    equipment: 'Barra flessibile (FlexBar)',
    cues: [
      "Barra verticale: mano del lato dolente in basso con il polso esteso, l’altra in alto",
      "Torci la barra con l’altra mano e porta le braccia avanti a gomiti tesi",
      'Lascia srotolare la barra piegando il polso dolente in 4 secondi',
    ],
    elbowFriendly: true,
    alternatives: ['eccentrico-estensori-polso', 'isometria-estensori-polso'],
    videoQuery: 'tyler twist flexbar epicondilite laterale',
  },
  {
    id: 'eccentrico-estensori-polso',
    name: 'Eccentrico degli estensori del polso con manubrio',
    category: 'prevenzione',
    equipment: 'Manubrio leggero e panca',
    cues: [
      'Avambraccio appoggiato a palmo in giù, polso oltre il bordo',
      "Sali aiutandoti con l’altra mano",
      'Scendi da solo in 4 secondi fino a polso piegato',
    ],
    elbowFriendly: true,
    startKg: [2, 3, 4],
    alternatives: ['tyler-twist', 'isometria-estensori-polso'],
    videoQuery: 'eccentrico estensori polso manubrio epicondilite',
  },
];

type Meta = Pick<CatalogExercise, 'pattern' | 'qualities' | 'impactLevel' | 'contactsPerRep' | 'space'>;

/** Schema, qualità e livello d'impatto degli esercizi della fase 1 (§ 3.7: ricevono `pattern` e `qualities`). */
const BASE_META: Record<string, Meta> = {
  'cyclette-ritmo-crescente': { pattern: 'riscaldamento', qualities: [] },
  'ellittica-ritmo-crescente': { pattern: 'riscaldamento', qualities: [] },
  'apertura-chiusura-anca-in-marcia': { pattern: 'riscaldamento', qualities: ['prevenzione'] },
  'affondi-in-camminata-con-rotazione': { pattern: 'riscaldamento', qualities: ['prevenzione'] },
  'squat-con-sollevamento-punte': { pattern: 'riscaldamento', qualities: ['prevenzione'] },
  'equilibrio-su-una-gamba-a-stella': { pattern: 'riscaldamento', qualities: ['prevenzione', 'rientro'] },
  // Balzi laterali del riscaldamento della B: livello 2 e un contatto per gamba, come i balzi laterali con fermata.
  'balzi-del-pattinatore': { pattern: 'laterale', qualities: ['potenza', 'prevenzione'], impactLevel: 2, contactsPerRep: 1 },
  'passi-laterali-elastico': { pattern: 'riscaldamento', qualities: ['prevenzione', 'rientro'] },
  'aperture-con-elastico': { pattern: 'riscaldamento', qualities: ['prevenzione'] },
  'extrarotazioni-con-elastico': { pattern: 'riscaldamento', qualities: ['prevenzione'] },
  'mobilita-caviglia-al-muro': { pattern: 'mobilita', qualities: ['prevenzione', 'rientro'] },
  'rotazioni-anche-90-90': { pattern: 'mobilita', qualities: ['prevenzione'] },
  'allungamento-corridore-con-rotazione': { pattern: 'mobilita', qualities: ['prevenzione'] },
  'allungamento-flessori-anca': { pattern: 'mobilita', qualities: ['prevenzione'] },
  'dondolo-adduttori-quadrupedia': { pattern: 'mobilita', qualities: ['prevenzione', 'rientro'] },
  'panca-manubri-presa-neutra': { pattern: 'spinta-orizzontale', qualities: ['forza', 'ipertrofia'] },
  'panca-inclinata-manubri-presa-neutra': { pattern: 'spinta-orizzontale', qualities: ['forza', 'ipertrofia'] },
  'chest-press-presa-neutra': { pattern: 'spinta-orizzontale', qualities: ['forza', 'ipertrofia', 'rientro'] },
  'distensioni-ai-cavi-presa-neutra': { pattern: 'spinta-orizzontale', qualities: ['ipertrofia', 'rientro'] },
  'lento-manubri-presa-neutra': { pattern: 'spinta-verticale', qualities: ['forza', 'ipertrofia'] },
  'piegamenti-su-impugnature': { pattern: 'spinta-orizzontale', qualities: ['forza', 'ipertrofia'], space: 'casa' },
  'lat-machine-presa-neutra': { pattern: 'tirata-verticale', qualities: ['forza', 'ipertrofia'] },
  'trazioni-presa-neutra': { pattern: 'tirata-verticale', qualities: ['forza', 'ipertrofia'] },
  'rematore-manubrio-una-mano': { pattern: 'tirata-orizzontale', qualities: ['forza', 'ipertrofia'] },
  'rematore-petto-appoggiato': { pattern: 'tirata-orizzontale', qualities: ['forza', 'ipertrofia'] },
  'pulley-basso-presa-neutra': { pattern: 'tirata-orizzontale', qualities: ['forza', 'ipertrofia'] },
  'face-pull-con-corda': { pattern: 'tirata-orizzontale', qualities: ['ipertrofia', 'prevenzione'] },
  'stacco-trap-bar': { pattern: 'cerniera', qualities: ['forza', 'potenza'] },
  'squat-goblet': { pattern: 'squat', qualities: ['forza', 'ipertrofia'] },
  'affondo-bulgaro-manubri': { pattern: 'affondo', qualities: ['forza', 'ipertrofia'] },
  'affondi-indietro-manubri': { pattern: 'affondo', qualities: ['forza', 'ipertrofia', 'rientro'] },
  'step-up-manubri': { pattern: 'affondo', qualities: ['forza', 'ipertrofia'] },
  'leg-press': { pattern: 'squat', qualities: ['forza', 'ipertrofia', 'rientro'] },
  'hip-thrust-bilanciere': { pattern: 'ponte', qualities: ['forza', 'ipertrofia'] },
  'ponte-glutei-una-gamba': { pattern: 'ponte', qualities: ['prevenzione', 'rientro'], space: 'casa' },
  'stacco-rumeno-manubri': { pattern: 'cerniera', qualities: ['forza', 'ipertrofia'] },
  'stacco-rumeno-una-gamba': { pattern: 'cerniera', qualities: ['prevenzione', 'forza'] },
  'leg-curl-seduto': { pattern: 'flessori', qualities: ['ipertrofia', 'prevenzione', 'rientro'] },
  'dead-bug': { pattern: 'anti-estensione', qualities: ['prevenzione'], space: 'casa' },
  'plank-sugli-avambracci': { pattern: 'anti-estensione', qualities: ['prevenzione'], space: 'casa' },
  'plank-laterale': { pattern: 'laterale', qualities: ['prevenzione'], space: 'casa' },
  'pallof-press': { pattern: 'anti-rotazione', qualities: ['prevenzione'] },
  'rollout-ruota': { pattern: 'anti-estensione', qualities: ['prevenzione'] },
  'trasporto-manubrio-un-lato': { pattern: 'laterale', qualities: ['prevenzione'] },
  'bird-dog': { pattern: 'anti-rotazione', qualities: ['prevenzione', 'rientro'], space: 'casa' },
  'nordic-hamstring-curl': { pattern: 'flessori', qualities: ['prevenzione', 'forza'] },
  'nordic-assistito-elastico': { pattern: 'flessori', qualities: ['prevenzione', 'rientro'] },
  'copenhagen-leva-corta': { pattern: 'adduttori', qualities: ['prevenzione', 'rientro'] },
  'copenhagen-leva-lunga': { pattern: 'adduttori', qualities: ['prevenzione'] },
  'adduttori-alla-macchina': { pattern: 'adduttori', qualities: ['prevenzione', 'rientro'] },
  'polpacci-in-piedi-macchina': { pattern: 'polpaccio', qualities: ['prevenzione', 'forza'] },
  'polpacci-seduto': { pattern: 'soleo', qualities: ['prevenzione', 'forza'] },
  'polpacci-una-gamba-manubrio': { pattern: 'polpaccio', qualities: ['prevenzione', 'rientro'] },
  'soleo-una-gamba-ginocchio-piegato': { pattern: 'soleo', qualities: ['prevenzione', 'rientro'] },
  'tibiale-anteriore-seduto': { pattern: 'tibiale', qualities: ['prevenzione', 'rientro'] },
  'tibiale-al-muro': { pattern: 'tibiale', qualities: ['prevenzione', 'rientro'], space: 'casa' },
  'sollevamenti-punte-pallina': { pattern: 'tibiale', qualities: ['prevenzione', 'rientro'], space: 'casa' },
  'isometria-estensori-polso': { pattern: 'polso', qualities: ['prevenzione', 'rientro'] },
  'tyler-twist': { pattern: 'polso', qualities: ['prevenzione', 'rientro'] },
  'eccentrico-estensori-polso': { pattern: 'polso', qualities: ['prevenzione', 'rientro'] },
};

/**
 * Esercitazioni della fase 2 (§ 3.7): pliometria contata in contatti, sprint e cambi di direzione contati in metri,
 * condizionamento e qualche variante per la prevenzione e il rientro. Ogni esercizio di corsa, sprint o salto ha
 * `impact: true` e un livello da 1 in su: allunghi e accelerazioni non si riconoscono dal nome, e senza il campo
 * sfuggirebbero al freno della tibia. Le alternative, nell'ordine in cui la sostituzione le prova, finiscono sempre
 * con una variante senza impatto (la prova del saltello no: se non si può fare, si rimanda).
 */
const PHASE2_LIST: readonly CatalogExercise[] = [
  // ───────────────────────── Pliometria ─────────────────────────
  {
    id: 'salto-sul-box',
    name: 'Salto sul box',
    category: 'pliometria',
    equipment: 'Box da 30-50 cm',
    cues: [
      'Carica le anche e salta sul box, atterrando morbido con tutti e due i piedi',
      'Scendi a piedi, uno alla volta: mai saltando giù',
      'Box basso: conta il gesto veloce, non l’altezza',
    ],
    elbowFriendly: true,
    impact: true,
    impactLevel: 1,
    contactsPerRep: 1,
    pattern: 'salto-verticale',
    qualities: ['potenza'],
    alternatives: ['salto-verticale-fermo', 'lancio-palla-medica-dal-basso'],
    videoQuery: 'box jump tecnica atterraggio scendere a piedi',
  },
  {
    id: 'salto-verticale-fermo',
    name: 'Salto verticale con atterraggio fermo',
    category: 'pliometria',
    equipment: 'Corpo libero',
    cues: [
      'Salta in alto con le braccia, poi atterra e resta fermo due secondi',
      'Ginocchia sopra i piedi all’atterraggio, mai verso l’interno',
      'Riparti solo da fermo: ogni salto è a sé',
    ],
    elbowFriendly: true,
    impact: true,
    impactLevel: 1,
    contactsPerRep: 1,
    pattern: 'salto-verticale',
    qualities: ['potenza'],
    alternatives: ['salto-sul-box', 'sprint-cyclette'],
    videoQuery: 'salto verticale atterraggio stabile tenuta',
  },
  {
    id: 'salti-corda',
    name: 'Salti con la corda',
    category: 'pliometria',
    equipment: 'Corda per saltare',
    cues: [
      'Salti bassi sull’avampiede, talloni che non toccano terra',
      'Polsi che girano la corda, gomiti vicini al corpo',
      'Ritmo regolare e silenzioso: se fai rumore, sei troppo alto',
    ],
    elbowFriendly: true,
    impact: true,
    impactLevel: 1,
    contactsPerRep: 1,
    pattern: 'reattivo',
    qualities: ['potenza', 'rientro'],
    space: 'casa',
    alternatives: ['pogo-bilaterali', 'polpacci-esplosivi'],
    videoQuery: 'salti con la corda tecnica base avampiede',
  },
  {
    id: 'pogo-bilaterali',
    name: 'Saltelli elastici a piedi pari',
    category: 'pliometria',
    equipment: 'Corpo libero',
    cues: [
      'Gambe quasi tese, rimbalza sull’avampiede come una molla',
      'Contatto con il suolo il più breve possibile',
      'Busto alto e braccia che accompagnano',
    ],
    elbowFriendly: true,
    impact: true,
    impactLevel: 2,
    contactsPerRep: 1,
    pattern: 'reattivo',
    qualities: ['potenza'],
    alternatives: ['salti-corda', 'polpacci-esplosivi'],
    videoQuery: 'pogo jumps saltelli caviglia rigida tecnica',
  },
  {
    id: 'salto-in-lungo-fermo',
    name: 'Salto in lungo da fermo con atterraggio stabile',
    category: 'pliometria',
    equipment: 'Corpo libero, 4-5 m liberi',
    cues: [
      'Carica le anche con le braccia indietro e salta in avanti',
      'Atterra con le ginocchia morbide e resta fermo due secondi',
      'Torna camminando: ogni salto è a sé',
    ],
    elbowFriendly: true,
    impact: true,
    impactLevel: 2,
    contactsPerRep: 1,
    pattern: 'salto-orizzontale',
    qualities: ['potenza'],
    space: 'corsia',
    alternatives: ['salto-verticale-fermo', 'lancio-palla-medica-dal-basso'],
    videoQuery: 'salto in lungo da fermo atterraggio stabile',
  },
  {
    id: 'balzi-laterali-fermata',
    name: 'Balzi laterali con fermata',
    category: 'pliometria',
    equipment: 'Corpo libero',
    cues: [
      'Balza di lato su una gamba e resta fermo due secondi',
      'Ginocchio sopra il piede, bacino orizzontale',
      'Riparti dall’altro lato solo quando sei stabile',
    ],
    elbowFriendly: true,
    impact: true,
    impactLevel: 2,
    contactsPerRep: 1,
    pattern: 'laterale',
    qualities: ['potenza', 'prevenzione'],
    alternatives: ['passi-laterali-elastico'],
    videoQuery: 'balzi laterali una gamba atterraggio stabile',
  },
  {
    id: 'salti-ostacolini',
    name: 'Salti in serie sugli ostacolini',
    category: 'pliometria',
    equipment: 'Ostacolini da 15-30 cm',
    cues: [
      'Salta gli ostacolini uno dopo l’altro, senza pause in mezzo',
      'Contatti brevi sull’avampiede, ginocchia che restano sopra i piedi',
      'Ostacolini bassi: la qualità del rimbalzo conta più dell’altezza',
    ],
    elbowFriendly: true,
    impact: true,
    impactLevel: 3,
    contactsPerRep: 1,
    pattern: 'reattivo',
    qualities: ['potenza'],
    space: 'corsia',
    alternatives: ['pogo-bilaterali', 'polpacci-esplosivi'],
    videoQuery: 'hurdle hops ostacolini salti in serie tecnica',
  },
  {
    id: 'saltelli-una-gamba',
    name: 'Saltelli su una gamba sul posto',
    category: 'pliometria',
    equipment: 'Corpo libero',
    cues: [
      'Saltelli bassi e rapidi sull’avampiede di una gamba',
      'Ginocchio appena piegato, bacino fermo',
      'Fermati se il dolore sale: è un esercizio da tibia guarita',
    ],
    elbowFriendly: true,
    impact: true,
    impactLevel: 3,
    contactsPerRep: 1,
    pattern: 'reattivo',
    qualities: ['potenza'],
    alternatives: ['pogo-bilaterali', 'polpacci-esplosivi'],
    videoQuery: 'saltelli su una gamba pogo monopodalici',
  },
  {
    id: 'prova-saltello',
    name: 'Prova del saltello: 10 saltelli su una gamba, poi sull’altra',
    category: 'pliometria',
    equipment: 'Corpo libero',
    cues: [
      'Dieci saltelli bassi su una gamba, poi dieci sull’altra',
      'Fermati al primo dolore e segnalalo a fine seduta',
      'Solo con il via libera del fisioterapista',
    ],
    elbowFriendly: true,
    impact: true,
    impactLevel: 3,
    contactsPerRep: 1,
    uncounted: true,
    pattern: 'reattivo',
    qualities: ['rientro'],
    videoQuery: 'hop test saltelli su una gamba rientro corsa',
  },
  {
    id: 'balzi-alternati',
    name: 'Balzi alternati',
    category: 'pliometria',
    equipment: 'Corpo libero, 20-30 m liberi',
    cues: [
      'Spingi da una gamba all’altra cercando l’ampiezza, non la velocità',
      'Ginocchio della gamba libera alto, braccia alternate',
      'Atterra sotto il bacino, mai con il piede troppo avanti',
    ],
    elbowFriendly: true,
    impact: true,
    impactLevel: 3,
    contactsPerRep: 1,
    pattern: 'salto-orizzontale',
    qualities: ['potenza'],
    space: 'campo',
    alternatives: ['salto-in-lungo-fermo', 'lancio-palla-medica-dal-basso'],
    videoQuery: 'balzi alternati bounding tecnica',
  },
  {
    id: 'drop-jump-basso',
    name: 'Drop jump da 30 cm',
    category: 'pliometria',
    equipment: 'Box da 30 cm',
    cues: [
      'Scendi dal box con un passo, non saltando',
      'Appena tocchi terra rimbalza in alto, contatto brevissimo',
      'Se il rimbalzo diventa lento, la serie è finita',
    ],
    elbowFriendly: true,
    impact: true,
    impactLevel: 3,
    contactsPerRep: 1,
    pattern: 'reattivo',
    qualities: ['potenza'],
    alternatives: ['salti-ostacolini', 'polpacci-esplosivi'],
    videoQuery: 'drop jump 30 cm tecnica contatto breve',
  },
  {
    id: 'lancio-palla-medica-dal-basso',
    name: 'Lancio della palla medica dal basso, avanti e indietro',
    category: 'pliometria',
    equipment: 'Palla medica da 3-5 kg',
    cues: [
      'Palla tra le gambe, carica le anche come in uno stacco',
      'Lancia con un’esplosione di anche, braccia tese',
      'Recupera la palla camminando: ogni lancio è al massimo',
    ],
    elbowFriendly: true,
    impactLevel: 0,
    pattern: 'lancio',
    qualities: ['potenza'],
    alternatives: ['sprint-cyclette'],
    videoQuery: 'lancio palla medica dal basso avanti e indietro',
  },
  {
    id: 'lancio-palla-medica-rotazionale',
    name: 'Lancio rotazionale della palla medica alla parete',
    category: 'pliometria',
    equipment: 'Palla medica da 3-4 kg e parete',
    cues: [
      'Di fianco alla parete, ruota anche e busto e lancia con forza',
      'Spinta dalle gambe, braccia quasi tese',
      'Riprendi la palla al rimbalzo e cambia lato a fine serie',
    ],
    elbowFriendly: true,
    impactLevel: 0,
    pattern: 'lancio',
    qualities: ['potenza'],
    alternatives: ['pallof-press'],
    videoQuery: 'lancio rotazionale palla medica parete',
  },
  {
    id: 'sprint-cyclette',
    name: 'Sprint in cyclette da 6-8 secondi',
    category: 'condizionamento',
    equipment: 'Cyclette',
    cues: [
      'Resistenza alta e pedalata al massimo per 6-8 secondi',
      'Recupero completo pedalando piano: ogni sprint è al massimo',
      'Busto fermo, la forza viene dalle gambe',
    ],
    elbowFriendly: true,
    impactLevel: 0,
    pattern: 'intermittente',
    qualities: ['potenza', 'resistenza'],
    alternatives: ['cyclette-intervalli'],
    videoQuery: 'sprint cyclette 6 secondi resistenza alta',
  },
  {
    id: 'trap-bar-veloce',
    name: 'Trap bar veloce al 50-60%',
    category: 'gambe',
    equipment: 'Trap bar',
    cues: [
      'Carico al 50-60% del solito: ogni ripetizione il più veloce possibile',
      'Spingi il pavimento e arriva in punta di piedi senza staccarli',
      'Fermati quando la velocità cala',
    ],
    elbowFriendly: false,
    startKg: [30, 40, 50],
    impactLevel: 0,
    pattern: 'cerniera',
    qualities: ['potenza'],
    alternatives: ['hip-thrust-bilanciere'],
    videoQuery: 'trap bar jump squat veloce potenza',
  },
  {
    id: 'polpacci-esplosivi',
    name: 'Salite sulle punte veloci alla macchina',
    category: 'prevenzione',
    equipment: 'Macchina polpacci in piedi',
    cues: [
      'Carico medio: sali sulle punte il più veloce possibile',
      'Scendi controllato in 2 secondi, talloni sotto il gradino',
      'Ginocchia quasi tese per tutta la serie',
    ],
    elbowFriendly: true,
    startKg: [30, 50, 70],
    impactLevel: 0,
    pattern: 'polpaccio',
    qualities: ['prevenzione', 'potenza'],
    alternatives: ['polpacci-in-piedi-macchina'],
    videoQuery: 'calf raise esplosivo macchina polpacci',
  },

  // ───────────────────────── Sprint, frenate e cambi di direzione ─────────────────────────
  {
    id: 'accelerazioni-10m',
    name: 'Accelerazioni da 10 m da partenze diverse',
    category: 'sprint',
    equipment: 'Corsia di 15-20 m',
    cues: [
      'Parti da fermo, in piedi, a terra o di spalle, e spingi forte per 10 m',
      'Busto inclinato in avanti nei primi passi, braccia ampie',
      'Torna camminando: il recupero è completo',
    ],
    elbowFriendly: true,
    impact: true,
    impactLevel: 2,
    pattern: 'accelerazione',
    qualities: ['rapidita'],
    space: 'corsia',
    alternatives: ['sprint-salita', 'sprint-cyclette'],
    videoQuery: 'accelerazioni 10 metri partenze diverse calcio',
  },
  {
    id: 'frenate-tre-passi',
    name: 'Frenate in tre passi',
    category: 'sprint',
    equipment: 'Corsia di 15-20 m',
    cues: [
      'Corri a ritmo sostenuto per 10 m e fermati in tre passi',
      'Abbassa il bacino e accorcia i passi, busto sopra i piedi',
      'Ultimo appoggio stabile, ginocchio sopra il piede',
    ],
    elbowFriendly: true,
    impact: true,
    impactLevel: 2,
    pattern: 'decelerazione',
    qualities: ['rapidita'],
    space: 'corsia',
    alternatives: ['affondi-indietro-manubri'],
    videoQuery: 'frenata in tre passi deceleration drill calcio',
  },
  {
    id: 'cambi-direzione-45-90',
    name: 'Cambi di direzione a 45° e 90°',
    category: 'sprint',
    equipment: 'Corsia di 15-20 m e coni',
    cues: [
      'Corri al cono, abbassa il bacino e cambia direzione spingendo dal piede esterno',
      'Prima a 45°, poi a 90°: una progressione alla volta',
      'Esci dal cambio accelerando per 5 m',
    ],
    elbowFriendly: true,
    impact: true,
    impactLevel: 2,
    pattern: 'cambio-direzione',
    qualities: ['rapidita'],
    space: 'corsia',
    alternatives: ['frenate-tre-passi', 'passi-laterali-elastico'],
    videoQuery: 'cambi di direzione 45 90 gradi coni calcio',
  },
  {
    id: 'navetta-5-0-5',
    name: 'Navetta 5-0-5',
    category: 'sprint',
    equipment: 'Corsia di 15-20 m e coni',
    cues: [
      'Lancio di 10 m, poi 5 m forti fino alla linea',
      'Giro di 180° con il bacino basso e riparti per 5 m',
      'Alterna il piede del giro da una ripetizione all’altra',
    ],
    elbowFriendly: true,
    impact: true,
    impactLevel: 2,
    pattern: 'cambio-direzione',
    qualities: ['rapidita'],
    space: 'corsia',
    alternatives: ['cambi-direzione-45-90', 'sprint-cyclette'],
    videoQuery: 'test 505 navetta cambio di direzione 180 gradi',
  },
  {
    id: 'skip-tecnica',
    name: 'Skip A e B',
    category: 'riscaldamento',
    equipment: 'Corsia di 15-20 m',
    cues: [
      'Skip A: ginocchia alte, appoggio sotto il bacino sull’avampiede',
      'Skip B: stessa base, poi la gamba si distende e graffia il terreno',
      'Braccia alternate, busto alto',
    ],
    elbowFriendly: true,
    impact: true,
    impactLevel: 1,
    pattern: 'riscaldamento',
    qualities: ['rapidita'],
    space: 'corsia',
    alternatives: ['apertura-chiusura-anca-in-marcia'],
    videoQuery: 'skip A skip B tecnica di corsa',
  },
  {
    id: 'allunghi',
    name: 'Allunghi progressivi da 60-80 m',
    category: 'sprint',
    equipment: 'Campo o parco',
    cues: [
      'Accelera piano piano e arriva in fondo all’intensità indicata',
      'Corsa sciolta: spalle basse, mani rilassate',
      'Torna camminando, il recupero è completo',
    ],
    elbowFriendly: true,
    impact: true,
    impactLevel: 2,
    pattern: 'velocita-massima',
    qualities: ['velocita'],
    space: 'campo',
    alternatives: ['sprint-salita', 'sprint-cyclette'],
    videoQuery: 'allunghi progressivi 80 metri tecnica',
  },
  {
    id: 'sprint-lanciati-20m',
    name: 'Sprint lanciati da 20 m',
    category: 'sprint',
    equipment: 'Campo o parco, 50 m liberi',
    cues: [
      'Lancio di 20-30 m in progressione, poi 20 m forte ma sciolto',
      'Appoggi sotto il bacino, ginocchia alte',
      'Recupero di 2-4 minuti camminando: ogni sprint è di qualità',
    ],
    elbowFriendly: true,
    impact: true,
    impactLevel: 2,
    pattern: 'velocita-massima',
    qualities: ['velocita'],
    space: 'campo',
    alternatives: ['allunghi', 'sprint-cyclette'],
    videoQuery: 'sprint lanciati 20 metri flying sprint',
  },
  {
    id: 'sprint-salita',
    name: 'Sprint in salita da 10-20 m',
    category: 'sprint',
    equipment: 'Salita leggera',
    cues: [
      'Salita leggera, spingi forte per 10-20 m',
      'Busto inclinato con la salita, braccia ampie',
      'Scendi camminando: la discesa è il recupero',
    ],
    elbowFriendly: true,
    impact: true,
    impactLevel: 2,
    pattern: 'accelerazione',
    qualities: ['rapidita', 'rientro'],
    space: 'campo',
    alternatives: ['accelerazioni-10m', 'sprint-cyclette'],
    videoQuery: 'sprint in salita 20 metri tecnica',
  },

  // ───────────────────────── Corsa e condizionamento ─────────────────────────
  {
    id: 'corsa-facile',
    name: 'Corsa continua facile',
    category: 'condizionamento',
    equipment: 'Campo o parco',
    cues: [
      'Ritmo con cui riesci a parlare, RPE 4-5',
      'Passi corti e leggeri, appoggio sotto il bacino',
      'Su terreno morbido quando puoi',
    ],
    elbowFriendly: true,
    impact: true,
    impactLevel: 2,
    pattern: 'aerobico',
    qualities: ['resistenza'],
    space: 'campo',
    alternatives: ['cyclette-facile', 'ellittica-intervalli'],
    videoQuery: 'corsa lenta aerobica tecnica passi corti',
  },
  {
    id: 'intermittente-15-15',
    name: 'Corsa intermittente 15-15',
    category: 'condizionamento',
    equipment: 'Campo o parco',
    cues: [
      'Quindici secondi forti e quindici di recupero camminando o corricchiando',
      'Ritmo che tieni uguale fino all’ultima ripetizione',
      'Fra una serie e l’altra 3 minuti di recupero',
    ],
    elbowFriendly: true,
    impact: true,
    impactLevel: 2,
    pattern: 'intermittente',
    qualities: ['resistenza'],
    space: 'campo',
    alternatives: ['cyclette-intervalli'],
    videoQuery: 'corsa intermittente 15 15 calcio',
  },
  {
    id: 'ripetute-sprint',
    name: 'Ripetute di sprint 6 × 20-30 m',
    category: 'sprint',
    equipment: 'Campo o parco',
    cues: [
      'Sei sprint da 20-30 m con 20-25 secondi di recupero',
      'Tra una serie e l’altra 3-4 minuti camminando',
      'Se la velocità cala molto, la serie finisce lì',
    ],
    elbowFriendly: true,
    impact: true,
    impactLevel: 2,
    pattern: 'intermittente',
    qualities: ['resistenza'],
    space: 'campo',
    alternatives: ['sprint-cyclette'],
    videoQuery: 'repeated sprint ability 6 x 30 metri',
  },
  {
    id: 'cammino-corsa',
    name: 'Cammino e corsa alternati',
    category: 'condizionamento',
    equipment: 'Campo o parco',
    cues: [
      'Un minuto di corsa facile e un minuto di cammino, per dieci volte',
      'Terreno piano e morbido, scarpe da corsa',
      'Il giorno dopo il dolore non deve salire',
    ],
    elbowFriendly: true,
    impact: true,
    impactLevel: 2,
    pattern: 'aerobico',
    qualities: ['rientro'],
    space: 'campo',
    alternatives: ['cyclette-facile'],
    videoQuery: 'programma cammino corsa ritorno alla corsa',
  },
  {
    id: 'cyclette-facile',
    name: 'Cyclette facile',
    category: 'condizionamento',
    equipment: 'Cyclette',
    cues: [
      'Resistenza bassa, pedalata agile: devi riuscire a parlare',
      'Sella all’altezza dell’anca',
      'Ritmo costante dall’inizio alla fine',
    ],
    elbowFriendly: true,
    impactLevel: 0,
    pattern: 'aerobico',
    qualities: ['resistenza', 'rientro'],
    alternatives: ['ellittica-intervalli'],
    videoQuery: 'cyclette facile recupero attivo',
  },
  {
    id: 'cyclette-intervalli',
    name: 'Intervalli in cyclette',
    category: 'condizionamento',
    equipment: 'Cyclette',
    cues: [
      'Tratti forti alla resistenza indicata, poi pedalata leggera',
      'Ritmo che tieni uguale fino all’ultimo intervallo',
      'Busto fermo, spalle rilassate',
    ],
    elbowFriendly: true,
    impactLevel: 0,
    pattern: 'intermittente',
    qualities: ['resistenza'],
    alternatives: ['ellittica-intervalli'],
    videoQuery: 'intervalli in cyclette 4 x 4 minuti',
  },
  {
    id: 'ellittica-intervalli',
    name: 'Intervalli in ellittica',
    category: 'condizionamento',
    equipment: 'Ellittica',
    cues: [
      'Tratti forti alla resistenza indicata, poi ritmo leggero',
      'Spingi con le gambe, le braccia accompagnano',
      'Ritmo che tieni uguale fino all’ultimo intervallo',
    ],
    elbowFriendly: true,
    impactLevel: 0,
    pattern: 'intermittente',
    qualities: ['resistenza'],
    alternatives: ['cyclette-intervalli'],
    videoQuery: 'intervalli ellittica allenamento',
  },

  // ───────────────────────── Prevenzione, rientro e gambe ─────────────────────────
  {
    id: 'copenhagen-isometrico',
    name: 'Copenhagen in tenuta, leva corta',
    category: 'prevenzione',
    equipment: 'Panca',
    cues: [
      'Ginocchio della gamba sopra appoggiato sulla panca, l’altra gamba sotto',
      'Solleva il bacino e tieni il corpo in linea',
      'Tieni senza dolore all’inguine: la durata cresce di settimana in settimana',
    ],
    elbowFriendly: true,
    impactLevel: 0,
    pattern: 'adduttori',
    qualities: ['prevenzione', 'rientro'],
    space: 'casa',
    alternatives: ['adduttori-pallone'],
    videoQuery: 'copenhagen plank isometrico leva corta ginocchio',
  },
  {
    id: 'adduttori-pallone',
    name: 'Pallone stretto tra le ginocchia',
    category: 'prevenzione',
    equipment: 'Pallone',
    cues: [
      'Supino con le ginocchia piegate, pallone tra le ginocchia',
      'Stringi forte e tieni, respirando',
      'Dolore all’inguine sotto 3 su 10',
    ],
    elbowFriendly: true,
    impactLevel: 0,
    pattern: 'adduttori',
    qualities: ['rientro'],
    space: 'casa',
    alternatives: ['copenhagen-isometrico'],
    videoQuery: 'isometria adduttori pallone tra le ginocchia',
  },
  {
    id: 'ponte-flessori-isometrico',
    name: 'Ponte sui talloni in tenuta',
    category: 'prevenzione',
    equipment: 'Tappetino',
    cues: [
      'Supino con i talloni a terra, ginocchia appena piegate',
      'Solleva il bacino spingendo con i talloni e tieni',
      'Senti il lavoro dietro la coscia, senza crampi',
    ],
    elbowFriendly: true,
    impactLevel: 0,
    pattern: 'flessori',
    qualities: ['rientro'],
    space: 'casa',
    alternatives: ['ponte-glutei-una-gamba'],
    videoQuery: 'ponte sui talloni isometria flessori coscia',
  },
  {
    id: 'leg-curl-scivolando',
    name: 'Leg curl scivolando a terra',
    category: 'prevenzione',
    equipment: 'Dischi scorrevoli o asciugamano',
    cues: [
      'Supino con i talloni sui dischi, bacino sollevato',
      'Porta i talloni verso i glutei e allontanali lentamente',
      'Bacino alto per tutta la serie',
    ],
    elbowFriendly: true,
    impactLevel: 0,
    pattern: 'flessori',
    qualities: ['prevenzione', 'rientro'],
    space: 'casa',
    alternatives: ['leg-curl-seduto'],
    videoQuery: 'slider leg curl flessori a terra',
  },
  {
    id: 'soleo-isometria',
    name: 'Isometria del soleo a ginocchio piegato',
    category: 'prevenzione',
    equipment: 'Macchina polpacci da seduto o multipower',
    cues: [
      'Ginocchio piegato, sali a metà sulle punte e tieni',
      'Carico pesante ma senza dolore oltre 3 su 10',
      'Respira e tieni il tallone fermo',
    ],
    elbowFriendly: true,
    impactLevel: 0,
    pattern: 'soleo',
    qualities: ['prevenzione', 'rientro'],
    alternatives: ['polpacci-seduto'],
    videoQuery: 'isometria soleo ginocchio piegato',
  },
  {
    id: 'squat-macchina',
    name: 'Squat alla macchina (hack o pendolo)',
    category: 'gambe',
    equipment: 'Macchina hack squat o pendolo',
    cues: [
      'Schiena appoggiata, piedi a metà pedana alla larghezza delle anche',
      'Scendi controllato fino a cosce parallele, ginocchia verso le punte',
      'Spingi con tutto il piede senza bloccare le ginocchia in alto',
    ],
    elbowFriendly: true,
    startKg: [40, 60, 80],
    impactLevel: 0,
    pattern: 'squat',
    qualities: ['forza', 'ipertrofia'],
    alternatives: ['leg-press'],
    videoQuery: 'hack squat pendulum squat tecnica',
  },
];

/** Catalogo in ordine di categoria: gli esercizi della fase 1 (con schema e qualità), poi quelli della fase 2. */
export const EXERCISE_LIST: readonly CatalogExercise[] = [
  ...BASE_LIST.map((e): CatalogExercise => ({ ...e, ...BASE_META[e.id] })),
  ...PHASE2_LIST,
];

/** Catalogo degli esercizi per id. */
export const EXERCISES: Record<string, CatalogExercise> = Object.fromEntries(EXERCISE_LIST.map((e) => [e.id, e]));

/** Carichi di partenza tipici di un esercizio del catalogo (vuoto se non previsti). */
export function startLoads(exercise: Exercise | undefined): readonly number[] {
  return (exercise as CatalogExercise | undefined)?.startKg ?? [];
}

/** Variante per il gomito sopra soglia (`elbowSwitch`), se l'esercizio del catalogo ne ha una. */
export function elbowSwitchOf(exercise: Exercise | undefined): CatalogExercise['elbowSwitch'] {
  return (exercise as CatalogExercise | undefined)?.elbowSwitch;
}

/** Livello d'impatto di un esercizio del catalogo (§ 3.7): con `impact` e senza livello vale 3, il più prudente. */
export function impactLevelOf(exercise: Exercise | undefined): ImpactLevel {
  const ex = exercise as CatalogExercise | undefined;
  if (!ex) return 0;
  if (typeof ex.impactLevel === 'number') return ex.impactLevel;
  return ex.impact ? 3 : 0;
}

/** Spazio richiesto da un esercizio (assente = palestra). */
export function spaceOf(exercise: Exercise | undefined): ExerciseSpace {
  return (exercise as CatalogExercise | undefined)?.space ?? 'palestra';
}

/** Schema di movimento di un esercizio del catalogo, se c'è. */
export function patternOf(exercise: Exercise | undefined): MovementPattern | undefined {
  return (exercise as CatalogExercise | undefined)?.pattern;
}
