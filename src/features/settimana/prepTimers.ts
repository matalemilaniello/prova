/**
 * Timer delle cotture della preparazione della domenica: uno per pentola, anche più di uno insieme.
 * Si basano sull'orario di fine (reggono lo schermo spento) e restano in memoria finché l'app è aperta,
 * anche chiudendo il lettore. A fine cottura vibrano, suonano se il telefono lo consente e mostrano un avviso.
 */
import type { ISODate } from '../../domain/types';
import { haptic } from '../../lib/haptics';
import { useUi } from '../../state/store';

export interface PotTimer {
  id: string;
  taskId: string;
  label: string;
  startedAt: number;
  endsAt: number;
  /** True quando l'avviso di fine cottura è già partito. */
  notified?: boolean;
}

type Listener = () => void;

const EMPTY: PotTimer[] = [];
const listeners = new Set<Listener>();
let byWeek: Record<ISODate, PotTimer[]> = {};
let watcher: number | null = null;
let audio: AudioContext | null = null;
let seq = 0;

function emit() {
  for (const l of listeners) l();
}

function setWeek(week: ISODate, timers: PotTimer[]) {
  byWeek = { ...byWeek, [week]: timers };
  emit();
}

/** Prepara l'audio dentro un tocco dell'utente (Safari lo sblocca solo così). */
function unlockAudio() {
  try {
    if (typeof window === 'undefined') return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audio ??= new AC();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

/** Tre note brevi e morbide. */
function chime() {
  try {
    if (!audio) return;
    const t0 = audio.currentTime + 0.02;
    [880, 1175, 880].forEach((f, i) => {
      const o = audio!.createOscillator();
      const g = audio!.createGain();
      const t = t0 + i * 0.28;
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      o.connect(g).connect(audio!.destination);
      o.start(t);
      o.stop(t + 0.26);
    });
  } catch {
    /* niente suono: resta la vibrazione */
  }
}

function buzz() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([180, 90, 180, 90, 320]);
      return;
    }
  } catch {
    /* ignora */
  }
  haptic('success');
}

function tick() {
  const now = Date.now();
  let running = false;
  for (const [week, timers] of Object.entries(byWeek)) {
    let changed = false;
    const next = timers.map((t) => {
      if (t.endsAt > now) {
        running = true;
        return t;
      }
      if (t.notified) return t;
      changed = true;
      buzz();
      chime();
      useUi.getState().toast(`${t.label}: pronto`, 'good');
      return { ...t, notified: true };
    });
    if (changed) setWeek(week, next);
  }
  if (!running && watcher !== null) {
    window.clearInterval(watcher);
    watcher = null;
  }
}

function ensureWatcher() {
  if (watcher !== null || typeof window === 'undefined') return;
  watcher = window.setInterval(tick, 1000);
}

export const prepTimers = {
  get(week: ISODate): PotTimer[] {
    return byWeek[week] ?? EMPTY;
  },
  /** Avvia (o riavvia) il timer di una cottura. Va chiamato dentro un tocco. */
  start(week: ISODate, taskId: string, label: string, minutes: number) {
    unlockAudio();
    const now = Date.now();
    const rest = (byWeek[week] ?? EMPTY).filter((t) => !(t.taskId === taskId && t.label === label));
    setWeek(week, [...rest, { id: `pt${++seq}`, taskId, label, startedAt: now, endsAt: now + minutes * 60_000 }]);
    ensureWatcher();
  },
  /** Aggiunge o toglie minuti a un timer in corso (minimo 0). */
  adjust(week: ISODate, id: string, deltaMin: number) {
    const now = Date.now();
    setWeek(
      week,
      (byWeek[week] ?? EMPTY).map((t) =>
        t.id === id ? { ...t, endsAt: Math.max(now, t.endsAt + deltaMin * 60_000), notified: deltaMin > 0 ? false : t.notified } : t,
      ),
    );
    ensureWatcher();
  },
  remove(week: ISODate, id: string) {
    setWeek(
      week,
      (byWeek[week] ?? EMPTY).filter((t) => t.id !== id),
    );
  },
  /** Toglie i timer di un'attività (quando la segni fatta). */
  clearTask(week: ISODate, taskId: string) {
    const cur = byWeek[week] ?? EMPTY;
    if (cur.some((t) => t.taskId === taskId)) setWeek(week, cur.filter((t) => t.taskId !== taskId));
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

/** "12:04", oltre l'ora "1:02:04". */
export function clockLabel(totalSec: number): string {
  const s = Math.max(0, Math.ceil(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
