/**
 * Hook condivisi dalle schermate.
 * Usa questi al posto di `new Date()` nelle schermate: rispettano l'orologio sostituito
 * delle anteprime (?today=YYYY-MM-DD, ?now=HH:MM) e si aggiornano da soli.
 *
 * Quale "oggi" usare:
 * - `usePlanDay()` (alias `useLogicalToday()`): la giornata del piano. Fino a 90 minuti prima della sveglia
 *   è ancora quella di ieri (alle 00:40 di giovedì la giornata è mercoledì). Usalo in tutte le schermate che
 *   mostrano la giornata, il menù, la prossima seduta, i progressi: così Oggi, Settimana, Allenamento,
 *   Coach e Progressi sono sempre d'accordo.
 * - `useToday()`: la data del calendario, solo dove serve davvero (es. nome di un file esportato).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DayLog, ISODate } from '../domain/types';
import { currentDate, nowHHMM, toISO } from '../engine/dates';
import { planDayISO } from '../engine/sleep';
import { emptyDayLog, useApp } from './store';

/**
 * Valore derivato dall'orologio, ricalcolato ogni `intervalMs`, al ritorno in primo piano e quando cambiano
 * le dipendenze. Con un valore uguale React non ridisegna; con la pagina nascosta il conteggio si ferma.
 */
function useClockValue<T extends string | number>(compute: () => T, intervalMs: number, deps: unknown[] = []): T {
  const [value, setValue] = useState<T>(compute);
  const fn = useRef(compute);
  fn.current = compute;
  useEffect(() => {
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      setValue(fn.current());
    };
    tick();
    const id = window.setInterval(tick, intervalMs);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);
  return value;
}

/**
 * Adesso, aggiornato ogni `intervalMs` (default 30 s) e al ritorno in primo piano.
 * Restituisce un Date nuovo a ogni intervallo: preferisci `useNowHHMM`, `usePlanDay` o `useToday`, che
 * ridisegnano solo quando il valore cambia davvero.
 */
export function useNow(intervalMs = 30_000): Date {
  const ms = useClockValue(() => currentDate().getTime(), intervalMs);
  return useMemo(() => new Date(ms), [ms]);
}

/** La data del calendario; cambia da sola a mezzanotte. Per la giornata del piano usa `usePlanDay`. */
export function useToday(): ISODate {
  return useClockValue(() => toISO(currentDate()), 30_000);
}

/** Orario attuale 'HH:MM': ridisegna una volta al minuto, non di più. */
export function useNowHHMM(): string {
  return useClockValue(() => nowHHMM(currentDate()), 15_000);
}

/**
 * La giornata del piano: fino a 90 minuti prima della sveglia (tra le 03:00 e le 10:00) è ancora quella
 * di ieri, perché chi va a letto all'una sta chiudendo la sua giornata, non iniziando la successiva.
 */
export function usePlanDay(): ISODate {
  const wake = useApp((s) => s.plan.sleep.wake);
  return useClockValue(() => planDayISO(currentDate(), { sleep: { wake } }), 15_000, [wake]);
}

/** Alias di `usePlanDay`. */
export const useLogicalToday = usePlanDay;

/** Diario del giorno (vuoto se non esiste ancora), con riferimento stabile. */
export function useDayLog(date: ISODate): DayLog {
  const log = useApp((s) => s.dayLogs[date]);
  return useMemo(() => log ?? emptyDayLog(date), [log, date]);
}

/** True se sono attivi i dati di esempio. */
export function useDemoData(): boolean {
  return useApp((s) => s.settings.demoData);
}
