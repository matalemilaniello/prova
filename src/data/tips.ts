/**
 * Ritmo · consigli del giorno.
 *
 * Brevi e motivati: una frase che dice cosa fare, una che spiega perché. Il lettore conosce nutrizione e
 * allenamento: niente miti, numeri prudenti, tono da collega che allena.
 * `dayTypes` limita un consiglio ai giorni in cui serve davvero (es. pre-calcio solo nei giorni di calcio).
 */
import type { DayType, ISODate } from '../domain/types';
import { hashString } from '../lib/id';

export type TipTopic = 'sonno' | 'telefono' | 'fibre' | 'proteine' | 'carico' | 'bar' | 'idratazione' | 'dolci';

export interface Tip {
  id: string;
  topic: TipTopic;
  title: string;
  text: string;
  /** Solo in questi tipi di giorno; se manca, sempre. */
  dayTypes?: DayType[];
}

export const TIP_TOPIC_LABEL: Record<TipTopic, string> = {
  sonno: 'Sonno',
  telefono: 'Telefono',
  fibre: 'Fibre',
  proteine: 'Proteine',
  carico: 'Carico',
  bar: 'Al bar',
  idratazione: 'Idratazione',
  dolci: 'Dolci',
};

export const TIPS: Tip[] = [
  // ───────────────────────── Sonno ─────────────────────────
  {
    id: 'sonno-sveglia-fissa',
    topic: 'sonno',
    title: 'Stessa sveglia anche nel fine settimana',
    text: 'Il ritmo circadiano si regola sulla sveglia più che sull’orario a letto. Spostarla di due ore il sabato è un piccolo jet lag che paghi il lunedì.',
  },
  {
    id: 'sonno-luce-mattino',
    topic: 'sonno',
    title: 'Dieci minuti di luce al mattino',
    text: 'La luce naturale entro un’ora dalla sveglia anticipa la melatonina della sera. Andare a letto all’orario del piano diventa più facile.',
  },
  {
    id: 'sonno-camera-fresca',
    topic: 'sonno',
    title: 'Camera fresca e buia',
    text: 'Tra 17 e 19 gradi la temperatura corporea scende meglio e il sonno profondo arriva prima. Tende chiuse e niente lucine di standby.',
  },
  {
    id: 'sonno-caffe',
    topic: 'sonno',
    title: 'Ultimo caffè entro le 14',
    text: 'La caffeina ha un’emivita di 5-6 ore: un caffè alle 17 è ancora per metà in circolo a mezzanotte e accorcia il sonno profondo.',
  },
  {
    id: 'sonno-infortuni',
    topic: 'sonno',
    title: 'Il sonno è il primo integratore',
    text: 'Sotto le 7 ore a notte il rischio di infortunio negli atleti sale in modo netto. Ogni quarto d’ora anticipato vale più di qualsiasi polvere.',
  },
  {
    id: 'sonno-dopo-partita',
    topic: 'sonno',
    title: 'Scendere di giri dopo il calcio',
    text: 'Adrenalina e luci del campo ritardano il sonno. Doccia tiepida, luci basse e cena di recupero veloce ti aiutano a spegnerti prima.',
    dayTypes: ['calcio'],
  },

  // ───────────────────────── Telefono ─────────────────────────
  {
    id: 'telefono-fuori-camera',
    topic: 'telefono',
    title: 'Il telefono dorme in cucina',
    text: 'Non serve forza di volontà se il telefono non è a portata di mano. Una sveglia da comodino costa poco e risolve il problema alla radice.',
  },
  {
    id: 'telefono-feed',
    topic: 'telefono',
    title: 'Lo scorrimento non ha fine',
    text: 'I feed sono progettati senza un punto d’arrivo: il segnale per smettere devi dartelo tu. Il coprifuoco è quel segnale.',
  },
  {
    id: 'telefono-grigi',
    topic: 'telefono',
    title: 'Schermo in bianco e nero la sera',
    text: 'Senza colori le app perdono gran parte del loro richiamo. Imposta la scala di grigi in automatico all’ora del coprifuoco.',
  },
  {
    id: 'telefono-notifiche',
    topic: 'telefono',
    title: 'Notifiche in silenzio dopo cena',
    text: 'Ogni notifica riaccende l’attenzione per minuti. Una modalità riposo dal coprifuoco alla sveglia lavora al posto tuo.',
  },
  {
    id: 'telefono-sostituisci',
    topic: 'telefono',
    title: 'Sostituisci, non togliere',
    text: 'Prepara qualcosa per l’ultima mezz’ora: un libro, la borsa per domani, cinque minuti di mobilità. Un vuoto senza piano si riempie di schermo.',
  },

  // ───────────────────────── Fibre ─────────────────────────
  {
    id: 'fibre-microbiota',
    topic: 'fibre',
    title: 'Trenta grammi di fibre al giorno',
    text: 'Le fibre nutrono il microbiota, che produce acidi grassi a catena corta con effetto antinfiammatorio. La varietà conta quanto la quantità.',
  },
  {
    id: 'fibre-surgelati',
    topic: 'fibre',
    title: 'Verdure surgelate, zero scuse',
    text: 'Hanno valori nutrizionali vicini al fresco e sono pronte in cinque minuti in padella o al microonde. Tienine sempre due buste in freezer.',
  },
  {
    id: 'fibre-legumi',
    topic: 'fibre',
    title: 'Legumi in barattolo',
    text: 'Ceci e lenticchie già cotti: sciacquali per togliere parte del sale e aggiungili a pasta, insalate o vellutate. Fibre e proteine in un gesto.',
  },
  {
    id: 'fibre-trenta-piante',
    topic: 'fibre',
    title: 'Trenta piante a settimana',
    text: 'Conta le piante diverse della settimana: verdure, frutta, legumi, cereali integrali, semi e spezie. È un indice pratico della varietà per il microbiota.',
  },
  {
    id: 'fibre-gradualita',
    topic: 'fibre',
    title: 'Più fibre, a piccoli passi',
    text: 'Aumentarle di colpo porta gonfiore. Cinque grammi in più a settimana e acqua a sufficienza: l’intestino si adatta in poche settimane.',
  },
  {
    id: 'fibre-pre-calcio',
    topic: 'fibre',
    title: 'Poca fibra prima di giocare',
    text: 'Nelle tre ore prima del calcio scegli poca fibra e pochi grassi: lo stomaco si svuota prima. Le fibre di oggi mettile a colazione e a pranzo.',
    dayTypes: ['calcio'],
  },

  // ───────────────────────── Proteine ─────────────────────────
  {
    id: 'proteine-distribuite',
    topic: 'proteine',
    title: 'Proteine a ogni pasto principale',
    text: 'Tre o quattro pasti con 25-40 grammi di proteine stimolano la sintesi muscolare meglio di una sola porzione grande a cena.',
  },
  {
    id: 'proteine-spuntino-scuola',
    topic: 'proteine',
    title: 'Uno spuntino che regge fino a pranzo',
    text: 'Yogurt greco, grana o un panino con bresaola stanno qualche ora senza frigo e ti portano alle 14 senza la fame che spinge verso il bar.',
  },
  {
    id: 'proteine-recupero',
    topic: 'proteine',
    title: 'La cena di recupero lavora di notte',
    text: 'Dopo il calcio punta a 30-40 grammi di proteine con carboidrati: ricostruisci il muscolo e ricarichi il glicogeno mentre dormi.',
    dayTypes: ['calcio'],
  },
  {
    id: 'proteine-leucina',
    topic: 'proteine',
    title: 'La leucina fa la differenza',
    text: 'Latticini, uova, carne e pesce ne hanno più dei vegetali. Con i legumi aumenta un po’ la porzione o abbinali a un latticino.',
  },
  {
    id: 'proteine-palmo',
    topic: 'proteine',
    title: 'Un palmo basta come misura',
    text: 'Un palmo di carne o pesce sono circa 25-30 grammi di proteine. Non serve la bilancia per stare nel piano.',
  },

  // ───────────────────────── Carico ─────────────────────────
  {
    id: 'carico-progressione',
    topic: 'carico',
    title: 'Il carico cresce piano',
    text: 'Aumenti settimanali oltre il 10-20% si associano a più infortuni da sovraccarico. Prima la costanza, poi l’intensità.',
  },
  {
    id: 'carico-dolore-tre',
    topic: 'carico',
    title: 'Dolore fino a 3 su 10',
    text: 'Negli esercizi per un tendine o un osso sotto carico, un dolore fino a 3 che torna come prima entro il mattino dopo è accettabile. Se sale, riduci.',
  },
  {
    id: 'carico-giorno-dopo',
    topic: 'carico',
    title: 'Gambe a riposo, busto al lavoro',
    text: 'Il giorno dopo la partita le gambe recuperano meglio muovendosi senza carico. La seduta A lavora sulla parte superiore e sulla prevenzione.',
    dayTypes: ['palestra'],
  },
  {
    id: 'carico-nordic',
    topic: 'carico',
    title: 'Nordic: poco ma sempre',
    text: 'Bastano due serie a settimana per mantenere la forza eccentrica dei flessori, la difesa principale contro gli stiramenti.',
    dayTypes: ['palestra', 'leggero'],
  },
  {
    id: 'carico-rir',
    topic: 'carico',
    title: 'Fermati a due ripetizioni dal cedimento',
    text: 'Con RIR 2 lo stimolo è quasi lo stesso e la fatica molto minore: arrivi fresco al calcio del giorno dopo.',
    dayTypes: ['palestra', 'leggero'],
  },
  {
    id: 'carico-riposo',
    topic: 'carico',
    title: 'Il riposo fa parte del piano',
    text: 'Il muscolo si adatta nei giorni di recupero, non durante la seduta. Oggi una passeggiata, un po’ di mobilità e una buona notte.',
    dayTypes: ['riposo'],
  },
  {
    id: 'carico-rpe',
    topic: 'carico',
    title: 'Un RPE onesto',
    text: 'Segna la fatica percepita davvero, non quella che avresti voluto. Minuti per RPE danno il carico della settimana e guidano la revisione.',
    dayTypes: ['calcio'],
  },
  {
    id: 'carico-polpacci',
    topic: 'carico',
    title: 'Polpacci forti, tibia protetta',
    text: 'Polpacci e soleo assorbono gran parte dei carichi della corsa. Le serie lente e pesanti sono la miglior prevenzione per la tibia.',
  },

  // ───────────────────────── Al bar ─────────────────────────
  {
    id: 'bar-proteine-prima',
    topic: 'bar',
    title: 'Al bar, parti dalle proteine',
    text: 'Toast con prosciutto cotto, tramezzino con uova o tonno, yogurt: scegli prima la fonte di proteine, poi il resto.',
  },
  {
    id: 'bar-cornetto-succo',
    topic: 'bar',
    title: 'Cornetto e succo, meglio di no',
    text: 'Insieme fanno circa 400 kcal di zuccheri e grassi con pochissime proteine: dopo due ore la fame torna più forte. Meglio un toast e una spremuta.',
  },
  {
    id: 'bar-spremuta',
    topic: 'bar',
    title: 'Spremuta sì, succo confezionato no',
    text: 'La spremuta è frutta appena spremuta; il succo spesso ha zuccheri aggiunti e meno vitamina C. Un frutto intero è ancora meglio.',
  },
  {
    id: 'bar-piano-b',
    topic: 'bar',
    title: 'Il piano B è già deciso',
    text: 'Quando salta il pasto preparato, il piano B al bar ti evita la scelta di fretta. Lo trovi nello spuntino e nel coach, anche senza rete.',
  },

  // ───────────────────────── Idratazione ─────────────────────────
  {
    id: 'acqua-pasti',
    topic: 'idratazione',
    title: 'Un bicchiere a ogni pasto',
    text: 'Legare l’acqua ai pasti è più facile che ricordarsela: cinque bicchieri arrivano così, il resto viene da solo.',
  },
  {
    id: 'acqua-pre-calcio',
    topic: 'idratazione',
    title: 'Bevi prima di giocare',
    text: 'Nelle 2-3 ore prima del calcio bevi 400-600 ml d’acqua: già un 2% di disidratazione riduce sprint e lucidità.',
    dayTypes: ['calcio'],
  },
  {
    id: 'acqua-colore',
    topic: 'idratazione',
    title: 'Guarda il colore delle urine',
    text: 'Giallo paglierino chiaro è il segnale giusto. Più scuro: bevi. Trasparente tutto il giorno: puoi anche rallentare.',
  },
  {
    id: 'acqua-sale',
    topic: 'idratazione',
    title: 'Un pizzico di sale dopo la partita',
    text: 'Se hai sudato molto, un po’ di sale nella cena di recupero aiuta a trattenere l’acqua che bevi e a reidratarti prima.',
    dayTypes: ['calcio'],
  },

  // ───────────────────────── Dolci ─────────────────────────
  {
    id: 'dolci-dopo-cena',
    topic: 'dolci',
    title: 'Il dolce va dopo cena',
    text: 'Dopo un pasto completo lo stesso dolce alza meno la glicemia che da solo a metà pomeriggio, e lascia meno voglia di altro.',
  },
  {
    id: 'dolci-programmati',
    topic: 'dolci',
    title: 'Programmato non è uno sgarro',
    text: 'I dolci previsti fanno parte del piano: gustali senza sensi di colpa. Il problema sono quelli presi senza decidere.',
  },
  {
    id: 'dolci-voglia-17',
    topic: 'dolci',
    title: 'La voglia delle 17 spesso è fame',
    text: 'Una merenda con proteine alle 16:30 spegne la voglia di dolce prima che arrivi. Yogurt greco e frutta funzionano bene.',
  },
  {
    id: 'dolci-fuori-vista',
    topic: 'dolci',
    title: 'Fuori dalla vista',
    text: 'Quello che vedi lo mangi. I dolci in un pensile chiuso, la frutta lavata in vista sul tavolo.',
  },
];

/** Consigli adatti al tipo di giorno. */
export function tipsFor(dayType: DayType): Tip[] {
  return TIPS.filter((t) => !t.dayTypes || t.dayTypes.includes(dayType));
}

/**
 * Consiglio del giorno, deterministico: stessa data e stesso tipo di giorno, stesso consiglio.
 * `offset` scorre agli altri consigli della giornata ("Un altro").
 */
export function tipOfDay(iso: ISODate, dayType: DayType, offset = 0): Tip {
  const pool = tipsFor(dayType);
  const list = pool.length ? pool : TIPS;
  const ordered = list
    .map((t) => ({ t, h: hashString(`${iso}:${t.id}`) }))
    .sort((a, b) => a.h - b.h)
    .map((x) => x.t);
  const n = ordered.length;
  return ordered[(((offset % n) + n) % n)];
}
