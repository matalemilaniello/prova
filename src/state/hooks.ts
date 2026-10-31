/**
 * Hook condivisi dalle schermate.
 * Usa questi al posto di `new Date()` nelle schermate: rispettano l'orologio sostituito
 * delle anteprime (?today=YYYY-MM-DD, ?now=HH:MM) e si aggiornano da soli.
 */
import { useEffect, useMemo, useState } from 'react';
import type { DayLog, ISODate } from '../domain/types';
import { currentDate, nowHHMM, toISO } from '../engine/dates';
import { emptyDayLog, useApp } from './store';

/** Adesso, aggiornato ogni `intervalMs` (default 30 s) e al ritorno in primo piano. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => currentDate());
  useEffect(() => {
    const tick = () => setNow(currentDate());
    const id = window.setInterval(tick, intervalMs);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [intervalMs]);
  return now;
}

/** La data di oggi; cambia da sola a mezzanotte. */
export function useToday(): ISODate {
  const now = useNow(60_000);
  return toISO(now);
}

/** Orario attuale 'HH:MM', aggiornato ogni 30 s. */
export function useNowHHMM(): string {
  const now = useNow(30_000);
  return nowHHMM(now);
}

/** Diario del giorno (vuoto se non esiste ancora), con riferimento stabile. */
export function useDayLog(date: ISODate): DayLog {
  const log = useApp((s) => s.dayLogs[date]);
  return useMemo(() => log ?? emptyDayLog(date), [log, date]);
}

/** True se sono attivi i dati di esempio. */
export function useDemoData(): boolean {
  return useApp((s) => s.settings.demoData);
}
