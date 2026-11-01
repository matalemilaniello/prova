/**
 * Settimana: striscia dei 7 giorni e tre schede, Menù, Spesa e Preparazione.
 * Si può scorrere tra le settimane (dall'inizio del piano a due mesi avanti); un giorno toccato nella
 * striscia apre il suo menù. `?tab=menu|spesa|preparazione` sceglie la scheda iniziale (screenshot).
 *
 * Nel fine settimana Spesa e Preparazione aprono da sole la settimana che inizia lunedì: è quella da
 * comprare e preparare. Finché l'utente non sceglie una settimana con le frecce, l'offset è automatico.
 * Parametri nell'hash (li usa Oggi): `settimana=prossima` apre la settimana dopo, `guida=1` con
 * `tab=preparazione` avvia subito il lettore della preparazione.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AppData, ISODate } from '../../domain/types';
import { MENU_ROTATION } from '../../data/menu';
import { useUrlParam } from '../../app/urlParams';
import { addDays, formatWeekRange, weekDates, weekIndexSince, weekStart, weekdayOf } from '../../engine/dates';
import { menuWeekFor, rotationIndexFor } from '../../engine/menu';
import { shoppingList, shoppingProgress } from '../../engine/shopping';
import { haptic } from '../../lib/haptics';
import { useApp } from '../../state/store';
import { usePlanDay } from '../../state/hooks';
import { Button, IconButton, Screen } from '../../ui';
import { MenuTab } from './MenuTab';
import { PrepTab } from './PrepTab';
import { ShoppingTab } from './ShoppingTab';
import { TabSwitch } from './TabSwitch';
import { WeekStrip } from './WeekStrip';
import { daySuccessfulSafe, isWeekend, relativeWeekLabel, shoppingFromDate } from './helpers';

type Tab = 'menu' | 'spesa' | 'preparazione';

const parseTab = (v: string | null): Tab => (v === 'spesa' || v === 'preparazione' ? v : 'menu');
const MAX_AHEAD = 8;
const EMPTY: string[] = [];

export default function SettimanaScreen() {
  const today = usePlanDay();
  const plan = useApp((s) => s.plan);
  const dayLogs = useApp((s) => s.dayLogs);
  const initialTab = useUrlParam('tab');
  const weekParam = useUrlParam('settimana');
  const guideParam = useUrlParam('guida');
  // Il lettore parte da solo una volta sola, non a ogni cambio di settimana o di scheda.
  const [guide, setGuide] = useState(() => guideParam === '1');
  const [tab, setTab] = useState<Tab>(() => parseTab(initialTab));
  // null = automatico: nel weekend Spesa e Preparazione guardano alla settimana che inizia lunedì.
  const [manualOffset, setManualOffset] = useState<number | null>(() => (weekParam === 'prossima' ? 1 : null));
  const weekend = isWeekend(today);
  const offsetFor = (t: Tab) => manualOffset ?? (weekend && t !== 'menu' ? 1 : 0);
  const offset = offsetFor(tab);
  const autoAhead = manualOffset === null && offset === 1;
  const [picked, setPicked] = useState<ISODate>(today);
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = 'settimana-pannello';

  // A mezzanotte la selezione segue il nuovo giorno.
  const lastToday = useRef(today);
  useEffect(() => {
    if (lastToday.current !== today) {
      if (picked === lastToday.current) setPicked(today);
      lastToday.current = today;
    }
  }, [today, picked]);

  const thisMonday = weekStart(today);
  const monday = addDays(thisMonday, offset * 7);
  const dates = useMemo(() => weekDates(monday), [monday]);
  const selected = dates.includes(picked) ? picked : dates[weekdayOf(picked)];
  const minOffset = Math.min(0, -Math.max(0, weekIndexSince(plan.startDate, today)));
  const planWeek = weekIndexSince(plan.startDate, monday) + 1;
  const rotation = rotationIndexFor(monday, plan.startDate);

  // Contatori delle schede: ognuno conta la settimana che la sua scheda apre.
  const shopMonday = addDays(thisMonday, offsetFor('spesa') * 7);
  const shopFrom = shoppingFromDate(plan, shopMonday);
  const list = useMemo(() => shoppingList(shopMonday, { plan, dayLogs }, { fromDate: shopFrom }), [shopMonday, shopFrom, plan, dayLogs]);
  const checked = useApp((s) => s.shoppingChecked[shopMonday] ?? EMPTY);
  const prepMonday = addDays(thisMonday, offsetFor('preparazione') * 7);
  const prepDone = useApp((s) => s.prepDone[prepMonday] ?? EMPTY);
  const progress = shoppingProgress(list, checked);
  const prepTasks = menuWeekFor(prepMonday, plan.startDate)?.prep ?? [];
  const prepLeft = prepTasks.filter((t) => !prepDone.includes(t.id)).length;

  // Giornate passate riuscite (spunta nella striscia).
  const success = useMemo(() => {
    const st = useApp.getState() as unknown as AppData;
    const out: Record<ISODate, boolean | undefined> = {};
    for (const d of dates) if (d < today) out[d] = daySuccessfulSafe(d, { ...st, dayLogs });
    return out;
  }, [dates, today, dayLogs]);

  // La schermata resta montata tra una scheda e l'altra: i parametri che Oggi mette nell'hash
  // (`#settimana?tab=spesa&settimana=prossima`) vanno letti anche dopo, a ogni cambio dell'hash.
  const [guideKey, setGuideKey] = useState(0);
  useEffect(() => {
    const apply = () => {
      const q = location.hash.indexOf('?');
      if (q === -1) return;
      const p = new URLSearchParams(location.hash.slice(q + 1));
      const t = p.get('tab');
      if (t) setTab(parseTab(t));
      if (p.get('settimana') === 'prossima') setManualOffset(1);
      if (p.get('guida') === '1') {
        setGuide(true);
        setGuideKey((n) => n + 1);
      }
      // Tolti dall'indirizzo: ricaricando la pagina il lettore non riparte da solo.
      try {
        history.replaceState(history.state, '', `${location.pathname}${location.search}${location.hash.slice(0, q)}`);
      } catch {
        /* indirizzo non modificabile (anteprima): nessun problema */
      }
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, []);

  const scrollContainer = () => rootRef.current?.closest<HTMLElement>('[data-scroll-container]') ?? null;

  const changeTab = (t: Tab) => {
    setGuide(false);
    setTab(t);
    const sc = scrollContainer();
    if (sc && sc.scrollTop > 160) sc.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  const goWeek = (next: number) => {
    const o = Math.max(minOffset, Math.min(MAX_AHEAD, next));
    if (o === offset) {
      if (manualOffset === null) setManualOffset(o);
      return;
    }
    haptic('selection');
    setGuide(false);
    setManualOffset(o);
    // Lo stesso giorno della settimana; tornando a questa settimana, oggi.
    setPicked(o === 0 ? today : addDays(addDays(thisMonday, o * 7), weekdayOf(selected)));
  };

  const pickDay = (d: ISODate) => {
    // Il giorno toccato resta nella settimana mostrata, anche se la scheda Menù di solito apre questa.
    if (manualOffset === null) setManualOffset(offset);
    setPicked(d);
    if (tab !== 'menu') changeTab('menu');
  };

  const onPanEnd = (_: unknown, info: PanInfo) => {
    if (tab !== 'menu') return;
    const { x, y } = info.offset;
    if (Math.abs(x) < 70 || Math.abs(x) < Math.abs(y) * 1.6) return;
    const i = dates.indexOf(selected);
    const ni = x < 0 ? i + 1 : i - 1;
    if (ni >= 0 && ni < 7) {
      haptic('selection');
      setPicked(dates[ni]);
    } else if (ni >= 7 && offset < MAX_AHEAD) {
      haptic('selection');
      setManualOffset(offset + 1);
      setPicked(addDays(dates[6], 1));
    } else if (ni < 0 && offset > minOffset) {
      haptic('selection');
      setManualOffset(offset - 1);
      setPicked(addDays(dates[0], -1));
    }
  };

  return (
    <Screen
      eyebrow={formatWeekRange(monday)}
      title="Settimana"
      subtitle={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-ink">{relativeWeekLabel(offset)}</span>
          {MENU_ROTATION.length > 1 && (
            <>
              <span aria-hidden className="text-ink-3">·</span>
              <span>
                Menù {rotation + 1} di {MENU_ROTATION.length}
              </span>
            </>
          )}
          {planWeek >= 1 && (
            <>
              <span aria-hidden className="text-ink-3">·</span>
              <span>{planWeek}ª del piano</span>
            </>
          )}
        </span>
      }
      actions={
        <>
          {offset !== 0 && (
            <Button variant="ghost" size="sm" onClick={() => goWeek(0)} className="px-2.5">
              Oggi
            </Button>
          )}
          <IconButton icon={ChevronLeft} label="Settimana precedente" size="sm" onClick={() => goWeek(offset - 1)} disabled={offset <= minOffset} />
          <IconButton icon={ChevronRight} label="Settimana successiva" size="sm" onClick={() => goWeek(offset + 1)} disabled={offset >= MAX_AHEAD} />
        </>
      }
      toolbar={
        <TabSwitch<Tab>
          aria-label="Sezione della settimana"
          value={tab}
          onChange={changeTab}
          panelId={panelId}
          options={[
            { value: 'menu', label: 'Menù' },
            { value: 'spesa', label: 'Spesa', count: progress.total - progress.done, countLabel: 'da prendere' },
            { value: 'preparazione', label: 'Preparazione', count: prepLeft, countLabel: 'da fare' },
          ]}
        />
      }
    >
      <div ref={rootRef} className="flex flex-col gap-6">
        <WeekStrip dates={dates} plan={plan} today={today} selected={tab === 'menu' ? selected : ''} onSelect={pickDay} success={success} />
        <motion.div id={panelId} role="tabpanel" aria-label={tab === 'menu' ? 'Menù' : tab === 'spesa' ? 'Spesa' : 'Preparazione'} onPanEnd={onPanEnd} style={{ touchAction: 'pan-y' }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${tab}:${tab === 'menu' ? selected : monday}`}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              {tab === 'menu' && <MenuTab date={selected} plan={plan} dayLogs={dayLogs} />}
              {tab === 'spesa' && (
                <ShoppingTab
                  weekStart={monday}
                  plan={plan}
                  dayLogs={dayLogs}
                  offset={offset}
                  today={today}
                  fromDate={shoppingFromDate(plan, monday)}
                  autoAhead={autoAhead}
                  onOpenWeek={(o) => goWeek(o)}
                  onGoPrep={() => changeTab('preparazione')}
                />
              )}
              {tab === 'preparazione' && (
                <PrepTab
                  key={guideKey}
                  weekStart={monday}
                  plan={plan}
                  dayLogs={dayLogs}
                  offset={offset}
                  today={today}
                  autoAhead={autoAhead}
                  autoPlay={guide}
                  onOpenWeek={(o) => goWeek(o)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
    </Screen>
  );
}
