/**
 * La prima settimana, vista dal benvenuto: il piano definitivo che si salva alla fine e le prime volte che
 * contano (stasera, il primo controllo, la spesa di avvio, la prima seduta e la prima partita, la prima
 * preparazione e la prima revisione). Tutto viene dai motori di Oggi e della revisione, così il riepilogo
 * dice esattamente quello che l'utente troverà nelle schermate.
 */
import type { DayType, HHMM, ISODate, MacroTarget, Plan } from '../../domain/types';
import { planStartFor } from '../../data/defaults';
import { addDays, addMinutes, daysBetween, isISODate, nowHHMM, weekdayOf } from '../../engine/dates';
import { isStarterDay, starterEnd } from '../../engine/menu';
import { firstReviewDate } from '../../engine/review';
import { planDayISO } from '../../engine/sleep';
import { STARTER_SHOPPING_ID, buildDay, isBeforeStart, type DayItem } from '../../engine/timeline';

/**
 * Piano da salvare alla fine del benvenuto. Il primo avvio è adesso (la giornata del piano: alle 00:30 è
 * ancora ieri); il piano parte di lunedì, questa settimana se si finisce entro giovedì, la prossima dal
 * venerdì: chi comincia domenica sera vive lunedì la settimana 1, non la seconda. I giorni prima sono di avvio.
 */
export function finalizePlan(plan: Plan, targets: Record<DayType, MacroTarget>, now: Date): Plan {
  const saved = plan.firstUse;
  const firstUse = saved && isISODate(saved.date) ? saved : { date: planDayISO(now, plan), time: nowHHMM(now) };
  return { ...plan, targets, startDate: planStartFor(firstUse.date), firstUse };
}

export type FirstStepKind = 'coprifuoco' | 'letto' | 'controllo' | 'spesa' | 'palestra' | 'calcio' | 'preparazione' | 'revisione';

export interface FirstStep {
  id: string;
  date: ISODate;
  time: HHMM;
  kind: FirstStepKind;
  title: string;
  detail: string;
  /** La voce della giornata da cui nasce (icona e colore come in Oggi). */
  item: DayItem;
}

/** Ultimo giorno guardato: la prima revisione, al massimo due settimane dopo il primo avvio. */
const MAX_DAYS = 15;

/**
 * Le prime volte, in ordine di tempo, dal primo avvio alla prima revisione. Ogni tipo compare una volta sola;
 * per la sera del primo giorno compare il coprifuoco (o, se è già passato, l'ora di andare a letto).
 * Vuoto senza `Plan.firstUse`.
 */
export function firstWeekSteps(plan: Plan, painSites: readonly string[] = []): FirstStep[] {
  const first = plan.firstUse;
  if (!first || !isISODate(first.date)) return [];
  const review = firstReviewDate(plan);
  const last = review && daysBetween(first.date, review) <= MAX_DAYS ? review : addDays(first.date, 7);
  const state = { plan, dayLogs: {} };
  const out: FirstStep[] = [];
  const seen = new Set<FirstStepKind>();
  const add = (date: ISODate, item: DayItem, kind: FirstStepKind, title: string, detail: string) => {
    seen.add(kind);
    out.push({ id: `${date}:${item.id}`, date, time: item.time, kind, title, detail, item });
  };

  for (let d = first.date; daysBetween(d, last) >= 0; d = addDays(d, 1)) {
    const items = buildDay(d, state).filter((it) => !isBeforeStart(d, it, plan));
    const bed = items.find((it) => it.kind === 'letto')?.time;
    for (const it of items) {
      switch (it.kind) {
        case 'coprifuoco':
          if (d === first.date && !seen.has('coprifuoco')) {
            add(d, it, 'coprifuoco', 'Telefono fuori', bed ? `In carica fuori dalla camera, a letto alle ${bed}` : 'In carica fuori dalla camera');
          }
          break;
        case 'letto':
          if (d === first.date && !seen.has('coprifuoco') && !seen.has('letto')) add(d, it, 'letto', 'A letto', `Sveglia alle ${plan.sleep.wake}`);
          break;
        case 'controllo':
          if (!seen.has('controllo')) {
            // Senza zone di dolore lo dice qui, dove si vede cosa chiederà il controllo.
            add(d, it, 'controllo', 'Controllo del mattino', painSites.length ? 'Peso, sonno, dolori ed energia' : 'Peso, sonno ed energia, nessuna zona di dolore');
          }
          break;
        case 'spesa':
          if (!seen.has('spesa')) {
            const starter = it.id === STARTER_SHOPPING_ID;
            add(d, it, 'spesa', starter ? 'Spesa di avvio' : 'Spesa per la settimana', starter ? 'Lista pronta in Settimana: solo ricette veloci' : 'Lista pronta in Settimana');
          }
          break;
        case 'palestra':
          if (!seen.has('palestra')) add(d, it, 'palestra', it.title, glue(it.detail));
          break;
        case 'calcio':
          // La prima sera l'ora di andare a letto la dice già il coprifuoco.
          if (!seen.has('calcio')) add(d, it, 'calcio', it.title, footballDetail(plan, d, items, d === first.date ? undefined : bed) ?? it.detail ?? '');
          break;
        case 'preparazione':
          if (!seen.has('preparazione')) add(d, it, 'preparazione', 'Preparazione', glue(it.detail));
          break;
        case 'revisione':
          // Solo quella vera: prima della prima settimana da rivedere non c'è niente da rivedere.
          if (!seen.has('revisione') && d === review) add(d, it, 'revisione', 'Prima revisione', it.detail ?? 'Voti, numeri e correzioni del piano');
          break;
        default:
          break;
      }
    }
  }
  return out;
}

/** "Parte superiore e prevenzione · 55 min": il punto medio non resta da solo a inizio o fine riga. */
function glue(detail: string | undefined): string {
  return (detail ?? '').replace(/ · /g, '\u00a0·\u00a0');
}

/** "Fine alle 22:30, poi cena di recupero e a letto alle 00:15": la sera della partita già organizzata. */
function footballDetail(plan: Plan, date: ISODate, items: DayItem[], bed: HHMM | undefined): string | null {
  const wd = weekdayOf(date);
  const f = plan.week.find((d) => d.weekday === wd)?.football;
  if (!f) return null;
  const end = addMinutes(f.time, f.durationMin);
  const recovery = items.find((it) => it.kind === 'pasto' && /di recupero/.test(it.title));
  if (!recovery) return `Fine alle ${end}`;
  const meal = recovery.title.split(',')[0].toLowerCase();
  return bed ? `Fine alle ${end}, poi ${meal} e a letto alle ${bed}` : `Fine alle ${end}, poi ${meal}`;
}

export interface StartInfo {
  /** Lunedì da cui parte la settimana 1. */
  startDate: ISODate;
  /** Il piano parte più avanti: i giorni da qui a `startDate` sono di avvio. */
  startsLater: boolean;
  /** Ultimo giorno con le ricette veloci (senza preparazione), o null. */
  starterUntil: ISODate | null;
}

/** Quando parte il piano e fino a quando valgono le ricette veloci dei giorni di avvio. */
export function startInfo(plan: Plan): StartInfo {
  const first = plan.firstUse?.date ?? plan.startDate;
  const end = starterEnd(plan);
  return {
    startDate: plan.startDate,
    startsLater: daysBetween(first, plan.startDate) > 0,
    starterUntil: end && isStarterDay(first, plan) ? addDays(end, -1) : null,
  };
}
