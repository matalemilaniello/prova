/**
 * Progressi: numeri chiave degli ultimi 7 giorni, andamento di peso, sonno, dolore e carico,
 * calendario delle giornate riuscite e la revisione della domenica (in evidenza la domenica).
 *
 * ?view=revisione apre subito la revisione della settimana appena chiusa (per gli screenshot).
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Settings } from 'lucide-react';
import type { ISODate } from '../../domain/types';
import { getUrlParam } from '../../app/urlParams';
import { navigate } from '../../app/router';
import { addDays, dateRange, todayISO, weekIndexSince } from '../../engine/dates';
import {
  changesPlan,
  isReviewDay,
  periodStats,
  proposalEffect,
  proposals,
  reviewAvailable,
  reviewFor,
  reviewWeekFor,
  type PeriodStats,
  type ReviewState,
} from '../../engine/review';
import { capitalize, listIt } from '../../lib/format';
import { useToday } from '../../state/hooks';
import { useApp } from '../../state/store';
import { IconButton, Screen, SectionTitle, staggerItem } from '../../ui';
import { LoadChart } from './charts/LoadChart';
import { PainChart, SITE_TONES, type PainSeries } from './charts/PainChart';
import { SleepChart } from './charts/SleepChart';
import { SuccessHeatmap } from './charts/SuccessHeatmap';
import { WeightChart } from './charts/WeightChart';
import { KeyNumbers } from './KeyNumbers';
import { ReviewHistory } from './ReviewHistory';
import { ReviewPrompt } from './ReviewPrompt';
import { ReviewSheet } from './ReviewSheet';
import {
  calendarSummary,
  chartRange,
  loadWeekCount,
  loadWeeks,
  painSeries,
  painSitesIn,
  sleepSeries,
  successCalendar,
  weightSeries,
} from './series';

/** "Peso stabile, sonno in crescita e dolore in calo." */
function pulse(s: PeriodStats): string | null {
  const parts: string[] = [];
  if (s.weightAvg !== null && s.weightPrevAvg !== null) {
    const pct = (s.weightAvg - s.weightPrevAvg) / s.weightPrevAvg;
    parts.push(Math.abs(pct) < 0.003 ? 'peso stabile' : pct < 0 ? 'peso in calo' : 'peso in aumento');
  }
  if (s.sleepAvgH !== null && s.prevSleepAvgH !== null) {
    const d = (s.sleepAvgH - s.prevSleepAvgH) * 60;
    parts.push(d >= 10 ? 'sonno in crescita' : d <= -10 ? 'sonno in calo' : 'sonno stabile');
  }
  const tracked = s.pain.filter((p) => p.trend !== null);
  if (tracked.length) {
    if (tracked.some((p) => p.trend === 'su')) parts.push('dolore in aumento');
    else if (tracked.every((p) => p.trend === 'giu')) parts.push('dolore in calo');
    else if (tracked.some((p) => p.trend === 'giu')) parts.push('dolore in lieve calo');
    else parts.push('dolore stabile');
  }
  return parts.length ? `${capitalize(listIt(parts))}.` : null;
}

function Reveal({ i, children }: { i: number; children: React.ReactNode }) {
  return <motion.div {...staggerItem(i, 0.05, 0.4)}>{children}</motion.div>;
}

export default function ProgressiScreen() {
  const today = useToday();
  const plan = useApp((s) => s.plan);
  const profile = useApp((s) => s.profile);
  const checkIns = useApp((s) => s.checkIns);
  const dayLogs = useApp((s) => s.dayLogs);
  const workoutLogs = useApp((s) => s.workoutLogs);
  const footballLogs = useApp((s) => s.footballLogs);
  const reviews = useApp((s) => s.reviews);
  const physio = useApp((s) => s.physio);

  const state: ReviewState = useMemo(
    () => ({ plan, profile, checkIns, dayLogs, workoutLogs, footballLogs, reviews, physio }),
    [plan, profile, checkIns, dayLogs, workoutLogs, footballLogs, reviews, physio],
  );

  const [sheetWeek, setSheetWeek] = useState<ISODate | null>(() => (getUrlParam('view') === 'revisione' ? reviewWeekFor(todayISO()) : null));

  // ── Revisione ──
  const reviewWeek = reviewWeekFor(today);
  const sunday = isReviewDay(today);
  const available = reviewAvailable(today, plan);
  const savedReview = reviewFor(reviewWeek, reviews);
  const preview = useMemo(() => {
    if (!available || savedReview) return { changes: [] as string[], count: 0 };
    const list = proposals(reviewWeek, state, { today });
    return {
      changes: list.filter(changesPlan).map(proposalEffect).filter((e): e is string => Boolean(e)),
      count: list.filter((p) => p.apply !== undefined).length,
    };
  }, [available, savedReview, reviewWeek, state, today]);

  // ── Numeri e serie ──
  const rolling = useMemo(
    () => periodStats(dateRange(addDays(today, -6), today), dateRange(addDays(today, -13), addDays(today, -7)), state, { today }),
    [state, today],
  );
  const range = useMemo(() => chartRange(today, state), [today, state]);
  const weight = useMemo(() => weightSeries(state, range.from, range.to), [state, range]);
  const sleep = useMemo(() => sleepSeries(state, range.from, range.to), [state, range]);
  const pain: PainSeries[] = useMemo(
    () =>
      painSitesIn(state, range.from, range.to).map((site, i) => {
        const st = rolling.pain.find((p) => p.site === site);
        return { site, points: painSeries(state, site, range.from, range.to), tone: SITE_TONES[i % SITE_TONES.length], avg: st?.avg ?? null, trend: st?.trend ?? null };
      }),
    [state, range, rolling],
  );
  const calendar = useMemo(() => successCalendar(state, today, 12), [state, today]);
  const calSummary = useMemo(() => calendarSummary(calendar), [calendar]);
  const load = useMemo(() => loadWeeks(state, today, loadWeekCount(state, today)), [state, today]);

  const weekNo = Math.max(1, weekIndexSince(plan.startDate || today, today) + 1);
  // La revisione appena salvata ha la sua card: lo storico mostra le altre.
  const pastReviews = savedReview ? reviews.filter((r) => r.weekStart !== savedReview.weekStart) : reviews;
  const promptOnTop = available && !savedReview;

  const prompt = (
    <ReviewPrompt
      weekStart={reviewWeek}
      sunday={sunday}
      available={available}
      saved={savedReview}
      changes={preview.changes}
      count={preview.count}
      onOpen={() => setSheetWeek(reviewWeek)}
    />
  );

  let i = 0;
  return (
    <Screen
      eyebrow={`Settimana ${weekNo} del piano`}
      title="Progressi"
      subtitle={pulse(rolling) ?? undefined}
      actions={<IconButton icon={Settings} label="Impostazioni" variant="tinted" onClick={() => navigate('impostazioni')} />}
    >
      {(promptOnTop || !available) && <Reveal i={i++}>{prompt}</Reveal>}

      <Reveal i={i++}>
        <KeyNumbers stats={rolling} goal={profile.goal} />
      </Reveal>

      <section className="flex flex-col gap-3" aria-label="Andamento">
        <SectionTitle>Andamento</SectionTitle>
        <Reveal i={i++}>
          <WeightChart points={weight} today={today} />
        </Reveal>
        <Reveal i={i++}>
          <SleepChart points={sleep} sleep={plan.sleep} />
        </Reveal>
        <Reveal i={i++}>
          <PainChart series={pain} threshold={plan.painThreshold} />
        </Reveal>
      </section>

      <section className="flex flex-col gap-3" aria-label="Allenamento">
        <SectionTitle>Allenamento</SectionTitle>
        <Reveal i={i++}>
          <LoadChart weeks={load} />
        </Reveal>
      </section>

      <section className="flex flex-col gap-3" aria-label="Costanza">
        <SectionTitle>Costanza</SectionTitle>
        <Reveal i={i++}>
          <SuccessHeatmap days={calendar} summary={calSummary} weeks={12} />
        </Reveal>
      </section>

      {(savedReview || pastReviews.length > 0) && (
        <section className="flex flex-col gap-3">
          {savedReview && available && <Reveal i={i++}>{prompt}</Reveal>}
          {pastReviews.length > 0 && (
            <Reveal i={i++}>
              <ReviewHistory reviews={pastReviews} onOpen={(ws) => setSheetWeek(ws)} />
            </Reveal>
          )}
        </section>
      )}

      <AnimatePresence>
        {sheetWeek && <ReviewSheet key={sheetWeek} weekStart={sheetWeek} today={today} onClose={() => setSheetWeek(null)} />}
      </AnimatePresence>
    </Screen>
  );
}
