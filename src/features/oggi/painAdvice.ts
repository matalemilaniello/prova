/**
 * Avviso del dolore nei giorni di calcio, senza interfaccia: si può verificare nei test.
 *
 * Il calcio è il carico d'impatto più alto della settimana: novanta minuti di corse, cambi di direzione e
 * contrasti caricano l'osso e i tendini sotto il ginocchio molto più dei 6-8 balzi di una seduta. Per questo,
 * se la palestra vieta i balzi, la partita non può essere concessa con una regola più larga:
 *
 * - controllo di oggi oltre la soglia degli impatti per la zona che li blocca: stasera niente calcio;
 * - dolore forte (livello "riduci"): stasera niente calcio e messaggio al fisioterapista;
 * - blocco che viene da giorni prima, dal dolore di fine seduta o dall'aumento dopo un'attività, con la
 *   lettura di oggi entro la soglia (o senza lettura): si rifà il test prima di uscire, con la stessa soglia.
 */
import type { CheckIn, FootballKind } from '../../domain/types';
import type { PainGate } from '../../engine/training';
import { testGesture } from './painTests';

export const FOOTBALL_NOUN: Record<FootballKind, { the: string; bare: string }> = {
  partita: { the: 'la partita', bare: 'partita' },
  calcetto: { the: 'il calcetto', bare: 'calcetto' },
  allenamento: { the: 'l’allenamento', bare: 'allenamento' },
};

export interface FootballPainAdvice {
  /** Testo sul resto della giornata (palestra), già depurato dal rinvio al fisioterapista; vuoto senza palestra. */
  painText: string;
  /** Cosa fare con il calcio di stasera, o null se il calcio non è in gioco. */
  footballText: string | null;
  /** Il calcio va saltato: "Salto la partita" diventa l'azione principale. */
  skip: boolean;
}

/** Rinvii al fisioterapista nel testo della palestra (anche "Tibia a 4 su 10: se domani è ancora sopra soglia…"). */
const PHYSIO_SENTENCES = /\s*(?:[^.:]+: )?(?:Scrivi al fisioterapista oggi\.|[Ss]e domani è ancora sopra soglia, scrivi al fisioterapista\.)/g;

/**
 * Avviso del dolore per Oggi. `kind` è il calcio di oggi ancora da giocare (null se non c'è); `todayPain`
 * sono le letture del controllo di oggi; `impactThreshold` è la soglia degli impatti (min(soglia, 2)).
 * Con `gymToday` falso (giorno di calcio senza palestra) i consigli sui carichi e sui balzi non servono: resta
 * solo il testo del calcio. Il fisioterapista si nomina una volta sola.
 */
export function footballPainAdvice(
  gate: Pick<PainGate, 'level' | 'impact' | 'impactSite' | 'message'>,
  kind: FootballKind | null,
  todayPain: CheckIn['pain'] | undefined,
  impactThreshold: number,
  customTests?: Record<string, string>,
  gymToday = true,
): FootballPainAdvice {
  if (!gate.impact || !kind) return { painText: gate.message, footballText: null, skip: false };
  const noun = FOOTBALL_NOUN[kind];
  const site = gate.impactSite;
  const v = site ? todayPain?.[site] : undefined;
  const testedToday = typeof v === 'number' && Number.isFinite(v) && v > impactThreshold;
  const gymText = !gymToday
    ? ''
    : gate.level === 'ok'
      ? `Negli impatti la soglia è più bassa, ${impactThreshold} su 10: niente balzi in palestra.`
      : gate.message;
  // Quando il calcio rimanda già al fisioterapista, la palestra non lo ripete.
  const withoutPhysio = gymText.replace(PHYSIO_SENTENCES, '').trim();

  if (gate.level === 'riduci') {
    return {
      painText: withoutPhysio,
      footballText: `Stasera niente ${noun.bare}: con questo dolore gli impatti peggiorano le cose. Scrivi al fisioterapista oggi.`,
      skip: true,
    };
  }
  if (testedToday) {
    return {
      painText: withoutPhysio,
      footballText: `Stasera niente ${noun.bare}: in campo gli impatti sono molti di più. Senti il fisioterapista prima di tornare a giocare.`,
      skip: true,
    };
  }
  const gesture = site ? testGesture(site, customTests) : 'il gesto di prova';
  return {
    painText: gymText,
    footballText: `Prima di uscire rifai il test, ${gesture}: se il dolore supera ${impactThreshold}, salta ${noun.the}.`,
    skip: false,
  };
}
