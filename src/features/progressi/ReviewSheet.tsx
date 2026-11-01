/**
 * Revisione della domenica, in quattro passi:
 * 1) Numeri: verdetto, le sette giornate come un tabellone, peso, tempo a letto e dolore con la loro linea;
 * 2) Voti: quattro scale da 1 a 10 (l'energia ha la media dei controlli del mattino come tacca);
 * 3) Misure: la vita in evidenza, le pliche a scomparsa, una riga di nota;
 * 4) Proposte: una card per proposta ("Accetta" o "Non ora") e lo scalino della settimana.
 * Alla chiusura i riflettori si accendono e si legge cosa cambia da lunedì.
 *
 * Le proposte accettate cambiano il piano solo alla chiusura, così uscire a metà non lascia il piano a metà
 * e una proposta non si applica due volte. Numeri e proposte si fissano all'apertura.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronDown, Footprints, Moon, Plus, Undo2 } from 'lucide-react';
import type { ISODate, Proposal, WeeklyReview } from '../../domain/types';
import { addMinutes, formatDayLong, formatWeekRange, weekDates } from '../../engine/dates';
import { checkInSleepHours } from '../../engine/sleep';
import {
  changesPlan,
  firstReviewDate,
  isReviewableWeek,
  previousReview,
  proposals as buildProposals,
  proposeWeeklyStep,
  reviewFor,
  reviewScore,
  reviewStep,
  reviewWeekFor,
  skinfoldSum,
  STEP_TARGET_DAYS,
  weeklyStepDef,
  weekStats,
  type StepSuggestion,
  type WeeklyReviewWithStep,
  type WeeklyStepId,
  type WeekStats,
} from '../../engine/review';
import { capitalize, fmtDelta, fmtKcal, fmtNumber, fmtPercent, listIt, plural } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useApp, useUi } from '../../state/store';
import { useCalendarStatus } from '../impostazioni/reminders';
import { Button, Card, Chip, cn, Field, Floodlights, NumberInput, ScaleSlider, Sheet, TextArea, toneColor, toneInk } from '../../ui';
import { SKINFOLD_SITES, VOTE_FIELDS, type VoteKey } from './areas';
import { HoursValue } from './charts/ChartCard';
import { SITE_TONES } from './charts/PainChart';
import { signedKg, weightTone } from './charts/WeightChart';
import { AreaIcon, ProposalCard, type ProposalState } from './ProposalCard';
import { DayBulbs } from './DayBulbs';
import { calendarDay, weekDaily, type CalendarDay } from './series';

export interface ReviewSheetProps {
  weekStart: ISODate;
  today: ISODate;
  onClose: () => void;
}

type Votes = WeeklyReview['votes'];
type Decision = 'accettata' | 'rimandata';
type StepIndex = 0 | 1 | 2 | 3;

const STEPS = ['Numeri', 'Voti', 'Misure', 'Proposte'] as const;

const STEP_SHORT: Record<WeeklyStepId, string> = {
  'frutta-spuntino': 'Frutta allo spuntino',
  'verdura-cena': 'Verdura a cena',
  acqua: 'Acqua',
  dolci: 'Dolci',
  caffe: 'Caffè',
};

// ───────────────────────── Verdetto ─────────────────────────

/** Titolo e riga del primo passo, con la voce del coach. La prima settimana si racconta, non si giudica. */
export function verdict(s: WeekStats): { title: string; line: string } {
  if (s.firstWeek) {
    const parts: string[] = [];
    if (s.itemsMarked) parts.push(plural(s.itemsMarked, 'voce segnata', 'voci segnate'));
    if (s.successfulDays) parts.push(plural(s.successfulDays, 'giornata riuscita', 'giornate riuscite'));
    if (s.gymSessions) parts.push(plural(s.gymSessions, 'seduta di palestra', 'sedute di palestra'));
    if (s.footballSessions) parts.push(`${plural(s.footballSessions, 'uscita', 'uscite')} di calcio`);
    if (s.nightsOnTarget) parts.push(plural(s.nightsOnTarget, 'notte in orario', 'notti in orario'));
    const days = plural(s.daysWithRitmo, 'giorno', 'giorni');
    return {
      title: 'Prima settimana',
      line: parts.length ? `${capitalize(days)} con Ritmo: ${listIt(parts)}. Da qui si parte.` : `${capitalize(days)} con Ritmo. Questa revisione fissa il punto di partenza.`,
    };
  }
  if (s.adherence === null) return { title: 'Settimana senza voci', line: 'Nessuna voce segnata: si parte dai numeri che ci sono, peso, ore a letto e dolore.' };
  const up = s.prevAdherence !== null && s.adherence - s.prevAdherence >= 0.1;
  const title = s.adherence >= 0.8 ? 'Settimana solida' : s.adherence >= 0.6 ? 'Settimana discreta' : up ? 'Settimana in ripresa' : 'Settimana da riprendere';
  const extra: string[] = [];
  if (s.sleepAvgH !== null && s.prevSleepAvgH !== null) {
    const d = Math.round((s.sleepAvgH - s.prevSleepAvgH) * 60);
    if (d >= 10) extra.push(`${d} minuti in più a letto`);
    else if (d <= -10) extra.push(`${-d} minuti in meno a letto`);
  }
  const down = s.pain.filter((p) => p.trend === 'giu').map((p) => p.site.toLowerCase());
  const rising = s.pain.filter((p) => p.trend === 'su').map((p) => p.site.toLowerCase());
  if (rising.length) extra.push(`${listIt(rising)} in aumento`);
  else if (down.length) extra.push(`${listIt(down)} in calo`);
  const days = `${s.successfulDays} ${s.successfulDays === 1 ? 'giornata riuscita' : 'giornate riuscite'} su ${s.adherenceDays}`;
  return { title, line: `${capitalize(days)}${extra.length ? `, ${listIt(extra)}` : ''}.` };
}

// ───────────────────────── Linee dei 7 giorni ─────────────────────────

function Spark({ values, color, width = 92, height = 34, domain }: { values: (number | null)[]; color: string; width?: number; height?: number; domain?: [number, number] }) {
  const pts = values.map((v, i) => (v === null ? null : { i, v }));
  const nums = pts.filter((p): p is { i: number; v: number } => p !== null);
  if (!nums.length) return <svg width={width} height={height} aria-hidden />;
  const lo = domain ? domain[0] : Math.min(...nums.map((p) => p.v));
  const hi = domain ? domain[1] : Math.max(...nums.map((p) => p.v));
  const pad = (hi - lo) * 0.15 || 0.5;
  const x = (i: number) => 4 + (i * (width - 8)) / 6;
  const y = (v: number) => height - 4 - ((v - (lo - pad)) / (hi + pad - (lo - pad))) * (height - 8);
  // Una sola linea: tra giorni consecutivi è piena, sopra i giorni senza dato è tratteggiata.
  const links = nums.slice(1).map((p, k) => ({ a: nums[k], b: p, gap: p.i - nums[k].i > 1 }));
  const last = nums[nums.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="shrink-0 overflow-visible">
      <line x1={4} x2={width - 4} y1={height - 1} y2={height - 1} style={{ stroke: 'var(--line)', strokeWidth: 1 }} />
      {links.map(({ a, b, gap }) => (
        <line
          key={`${a.i}-${b.i}`}
          x1={x(a.i)}
          y1={y(a.v)}
          x2={x(b.i)}
          y2={y(b.v)}
          style={{ stroke: color, strokeWidth: gap ? 1.5 : 2, strokeLinecap: 'round', strokeDasharray: gap ? '1.5 3.5' : undefined }}
        />
      ))}
      {nums.map((p) => (
        <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={p === last ? 3 : 1.6} style={{ fill: p === last ? color : 'var(--ink-3)' }} />
      ))}
    </svg>
  );
}

type DeltaTone = 'good' | 'bad' | 'warn' | 'neutral';

function DeltaMark({ text, tone, dir }: { text: string; tone: DeltaTone; dir: 'su' | 'giu' | 'stabile' }) {
  const Icon = dir === 'su' ? ArrowUpRight : dir === 'giu' ? ArrowDownRight : ArrowRight;
  const color = tone === 'neutral' ? 'var(--ink-2)' : toneInk(tone);
  return (
    <span className="t-footnote inline-flex items-center gap-0.5 whitespace-nowrap font-semibold tabular-nums" style={{ color }}>
      <Icon size={14} strokeWidth={2.6} aria-hidden />
      {text}
    </span>
  );
}

function DeltaRow({
  label,
  value,
  unit,
  delta,
  caption,
  spark,
  color,
  domain,
  divider,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: ReactNode;
  caption: ReactNode;
  spark: (number | null)[];
  color: string;
  domain?: [number, number];
  divider?: boolean;
}) {
  return (
    <div className={cn('flex items-end gap-3 py-3.5', divider && 'border-t border-line')}>
      <div className="min-w-0 flex-1">
        <p className="t-label text-ink-3">{label}</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="inline-flex items-baseline gap-1">
            {typeof value === 'string' ? <span className="t-num text-[2rem] leading-none text-ink">{value}</span> : value}
            {unit && <span className="t-mono text-[0.75rem] text-ink-2">{unit}</span>}
          </span>
          {delta}
        </p>
        <p className="t-caption mt-1 text-ink-3">{caption}</p>
      </div>
      <Spark values={spark} color={color} domain={domain} />
    </div>
  );
}

// ───────────────────────── Passo 1: numeri ─────────────────────────

function Report({ s, days, goal, threshold }: { s: WeekStats; days: CalendarDay[]; goal: Parameters<typeof weightTone>[0]; threshold: number }) {
  const state = useApp.getState();
  const v = verdict(s);
  const ws = s.weekStart;
  const wDelta = s.weighIns >= 4 && s.weightDelta !== null ? s.weightDelta : null;
  const wTone = wDelta !== null && s.weightAvg !== null ? weightTone(goal, wDelta, s.weightAvg) : 'neutral';
  const sleepDelta = s.sleepAvgH !== null && s.prevSleepAvgH !== null ? Math.round((s.sleepAvgH - s.prevSleepAvgH) * 60) : null;
  const pains = s.pain.filter((p) => p.readings > 0);

  // Fibre e proteine sono stime dai pasti segnati: si dice da quanti, una volta sola per le due righe.
  const fromMeals = s.mealsCounted > 0 && s.nutritionDays > 0 ? `Fibre e proteine stimate da ${s.mealsLogged} pasti segnati su ${s.mealsCounted}` : null;
  const menuPart = (g: number | null) => (g !== null ? `, menù ${fmtNumber(Math.round(g))} g` : '');
  const others: { label: string; value: string; unit?: string; detail?: string; warn?: boolean; note?: string }[] = [
    {
      label: 'Aderenza',
      value: s.adherence !== null ? fmtNumber(Math.round(s.adherence * 100)) : '–',
      unit: s.adherence !== null ? '%' : undefined,
      detail: s.adherenceDays ? `${s.successfulDays} ${s.successfulDays === 1 ? 'riuscita' : 'riuscite'} su ${s.adherenceDays}` : 'nessun giorno chiuso',
    },
    {
      label: 'Notti in orario',
      value: `${s.nightsOnTarget}`,
      unit: `su ${s.countedNights}`,
      detail: s.nightsWithBedtime < s.countedNights ? `${s.countedNights - s.nightsWithBedtime} senza orario` : undefined,
    },
    { label: 'Energia al mattino', value: s.energyAvg !== null ? fmtNumber(s.energyAvg, 1, true) : '–', unit: s.energyAvg !== null ? 'su 10' : undefined },
    {
      label: 'Fibre stimate',
      value: s.fiberAvgG !== null ? fmtNumber(Math.round(s.fiberAvgG)) : '–',
      unit: s.fiberAvgG !== null ? 'g' : undefined,
      detail: `obiettivo ${s.fiberTargetG} g${menuPart(s.fiberPlannedG)}`,
      warn: s.fiberLow,
    },
    {
      label: 'Proteine stimate',
      value: s.proteinAvgG !== null ? fmtNumber(s.proteinAvgG) : '–',
      unit: s.proteinAvgG !== null ? 'g' : undefined,
      detail: `obiettivo ${s.proteinTargetG} g${menuPart(s.proteinPlannedG)}`,
      note: fromMeals ?? undefined,
    },
    {
      label: 'Carico',
      value: fmtNumber(s.load),
      unit: 'UA',
      detail: s.loadStatus.ratio !== null ? `${fmtPercent(s.loadStatus.ratio)} della media` : `${s.gymSessions} palestra, ${s.footballSessions} calcio`,
      warn: s.loadStatus.alert,
    },
    { label: 'Dolci', value: `${s.sweets}`, unit: `su ${s.sweetsPlanned}`, detail: s.sweetsExtra > 0 ? `${s.sweetsExtra} fuori programma` : 'dentro il programma', warn: s.sweetsExtra > 0 },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="t-large-title text-[2.5rem] leading-[0.95] text-ink">{v.title}</h3>
        <p className="t-callout mt-2 text-pretty text-ink-2">{v.line}</p>
      </div>

      <DayBulbs days={days} />

      <Card padding="none" className="px-4">
        <DeltaRow
          label="Peso medio"
          value={s.weightAvg !== null ? fmtNumber(s.weightAvg, 1, true) : '–'}
          unit={s.weightAvg !== null ? 'kg' : undefined}
          delta={wDelta !== null ? <DeltaMark text={signedKg(wDelta)} tone={wTone} dir={Math.abs(wDelta) < 0.05 ? 'stabile' : wDelta > 0 ? 'su' : 'giu'} /> : null}
          caption={
            s.weighIns >= 4
              ? `${s.weighIns} pesate, ${s.weightDeltaSource === 'confronto' ? 'rispetto alla settimana prima' : 'andamento della settimana'}`
              : s.weighIns
                ? `${plural(s.weighIns, 'pesata', 'pesate')}: per la variazione ne servono 4`
                : 'Nessuna pesata: ne servono 4 per la variazione'
          }
          spark={weekDaily(state, ws, (c) => c.weightKg)}
          color={toneColor('accent')}
        />
        <DeltaRow
          divider
          label="Ore a letto"
          value={s.sleepAvgH !== null ? <HoursValue hours={s.sleepAvgH} size="text-[2rem]" /> : '–'}
          delta={
            sleepDelta !== null && Math.abs(sleepDelta) >= 1 ? (
              <DeltaMark text={`${sleepDelta > 0 ? '+' : '−'}${Math.abs(sleepDelta)} min`} tone={sleepDelta >= 10 ? 'good' : sleepDelta <= -10 ? 'bad' : 'neutral'} dir={Math.abs(sleepDelta) < 10 ? 'stabile' : sleepDelta > 0 ? 'su' : 'giu'} />
            ) : null
          }
          caption={s.nightsWithBedtime ? `${s.nightsOnTarget} ${s.nightsOnTarget === 1 ? 'notte' : 'notti'} su ${s.countedNights} a letto in orario` : 'Nessun orario a letto segnato'}
          spark={weekDaily(state, ws, (c) => checkInSleepHours(c))}
          color={toneColor('riposo')}
        />
        {pains.map((p, i) => (
          <DeltaRow
            key={p.site}
            divider
            label={`Dolore · ${p.site}`}
            value={p.avg !== null ? fmtNumber(p.avg, 1, true) : '–'}
            unit="su 10"
            delta={
              p.prevAvg !== null && p.delta !== null && p.trend ? (
                <DeltaMark text={fmtDelta(p.delta, '', 1)} tone={p.trend === 'su' ? 'warn' : p.trend === 'giu' ? 'good' : 'neutral'} dir={p.trend} />
              ) : null
            }
            caption={
              p.overThreshold
                ? `Sopra la soglia di ${threshold}`
                : p.prevAvg !== null
                  ? `La settimana prima ${fmtNumber(p.prevAvg, 1, true)}`
                  : `${plural(p.readings, 'lettura', 'letture')}${p.trend ? `, ${p.trend === 'giu' ? 'in calo' : p.trend === 'su' ? 'in aumento' : 'stabile'} nella settimana` : ''}`
            }
            spark={weekDaily(state, ws, (c) => c.pain?.[p.site])}
            color={toneColor(SITE_TONES[i % SITE_TONES.length])}
            domain={[0, Math.max(4, ...(weekDaily(state, ws, (c) => c.pain?.[p.site]).filter((x): x is number => x !== null)))]}
          />
        ))}
      </Card>

      <section aria-labelledby="revisione-altri">
        <h4 id="revisione-altri" className="t-label mb-2 px-1 text-ink-3">
          Gli altri numeri
        </h4>
        <Card padding="none">
          <dl>
            {others.map((o, i) => (
              <div key={o.label} className={cn('flex flex-wrap items-baseline gap-x-3 px-4 py-2.5', i > 0 && 'border-t border-line')}>
                <dt className="t-callout min-w-0 flex-1 text-ink-2">{o.label}</dt>
                <dd className="flex shrink-0 flex-col items-end">
                  <span className="flex items-baseline gap-1">
                    <span className="t-num text-[1.25rem] leading-none" style={{ color: o.warn ? 'var(--warn-ink)' : 'var(--ink)' }}>
                      {o.value}
                    </span>
                    {o.unit && <span className="t-mono text-[0.6875rem] text-ink-3">{o.unit}</span>}
                  </span>
                  {o.detail && <span className="t-caption mt-0.5 text-ink-3">{o.detail}</span>}
                </dd>
                {o.note && <dd className="t-caption mt-1.5 w-full text-pretty text-ink-3">{o.note}</dd>}
              </div>
            ))}
          </dl>
        </Card>
      </section>
    </div>
  );
}

// ───────────────────────── Passo 2: voti ─────────────────────────

function VotesStep({ votes, setVotes, energyAvg }: { votes: Partial<Votes>; setVotes: (fn: (v: Partial<Votes>) => Partial<Votes>) => void; energyAvg: number | null }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="t-callout text-pretty text-ink-2">Da 1 a 10, d’istinto: come è andata, non come doveva andare.</p>
      <Card className="flex flex-col gap-5">
        {VOTE_FIELDS.map((f, i) => (
          <div key={f.key} className={i > 0 ? 'border-t border-line pt-5' : undefined}>
            <ScaleSlider
              label={f.label}
              min={1}
              max={10}
              scheme="energy"
              value={votes[f.key as VoteKey]}
              onChange={(v) => setVotes((o) => ({ ...o, [f.key]: v }))}
              lowLabel={f.low}
              highLabel={f.high}
              ghost={f.key === 'energia' && energyAvg !== null ? energyAvg : undefined}
              ghostLabel="media del mattino"
            />
            {f.key === 'energia' && energyAvg !== null && (
              <p className="t-caption mt-1.5 text-ink-3">Il cerchio vuoto è la media dei controlli del mattino: {fmtNumber(energyAvg, 1, true)}.</p>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

// ───────────────────────── Passo 3: misure ─────────────────────────

function MeasuresStep({
  waist,
  setWaist,
  prev,
  sites,
  setSites,
  folds,
  setFolds,
  allSites,
  note,
  setNote,
}: {
  waist: number | undefined;
  setWaist: (v: number | undefined) => void;
  prev: WeeklyReview | undefined;
  sites: string[];
  setSites: (fn: (s: string[]) => string[]) => void;
  folds: Record<string, number | undefined>;
  setFolds: (fn: (f: Record<string, number | undefined>) => Record<string, number | undefined>) => void;
  allSites: string[];
  note: string;
  setNote: (v: string) => void;
}) {
  const [showFolds, setShowFolds] = useState(sites.length > 0);
  const prevWaist = prev?.waistCm;
  const prevFoldSum = skinfoldSum(prev);
  const foldValues = Object.fromEntries(sites.map((k) => [k, folds[k]]).filter(([, v]) => typeof v === 'number')) as Record<string, number>;
  const foldSum = Object.keys(foldValues).length ? Object.values(foldValues).reduce((a, b) => a + b, 0) : null;
  const sameSites =
    prev?.skinfolds && Object.keys(foldValues).length > 0 && Object.keys(foldValues).every((k) => k in (prev.skinfolds ?? {})) && Object.keys(prev.skinfolds).length === Object.keys(foldValues).length;
  const waistDelta = waist !== undefined && prevWaist !== undefined ? waist - prevWaist : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="t-callout text-pretty text-ink-2">
        Al mattino a digiuno, una volta a settimana: conta la tendenza, non il singolo numero. Se oggi non l’hai misurata, lascia vuoto: la aggiungi domani riaprendo la revisione.
      </p>
      <Card className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="t-label text-ink-3">Vita</p>
            {waist !== undefined ? (
              <p className="mt-1 flex items-baseline gap-1">
                <span className="t-num text-[2.75rem] leading-none text-ink">{fmtNumber(waist, 1, true)}</span>
                <span className="t-mono text-[0.8125rem] text-ink-2">cm</span>
              </p>
            ) : (
              <p className="t-headline mt-1.5 text-ink-2">Da misurare</p>
            )}
          </div>
          {waistDelta !== null ? (
            <DeltaMark text={fmtDelta(waistDelta, 'cm', 1)} tone={waistDelta < -0.05 ? 'good' : waistDelta > 0.45 ? 'warn' : 'neutral'} dir={Math.abs(waistDelta) < 0.05 ? 'stabile' : waistDelta > 0 ? 'su' : 'giu'} />
          ) : prevWaist !== undefined ? (
            <span className="t-caption text-ink-3">la volta scorsa {fmtNumber(prevWaist, 1, true)}{'\u00a0'}cm</span>
          ) : null}
        </div>
        <Field label="Circonferenza vita" hint="All’altezza dell’ombelico, a fine espirazione, metro aderente ma senza stringere.">
          <NumberInput value={waist} onChange={setWaist} decimals={1} min={40} max={200} unit="cm" placeholder={prevWaist !== undefined ? fmtNumber(prevWaist, 1, true) : '84,0'} />
        </Field>
      </Card>

      <Card padding="none">
        <button
          type="button"
          onClick={() => {
            haptic('selection');
            setShowFolds((x) => !x);
          }}
          aria-expanded={showFolds}
          className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink-soft text-ink-2">
            {showFolds ? <ChevronDown size={17} strokeWidth={2.4} aria-hidden /> : <Plus size={17} strokeWidth={2.4} aria-hidden />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="t-callout block font-semibold text-ink">{showFolds ? 'Pliche' : 'Aggiungi pliche'}</span>
            <span className="t-caption block text-ink-3">
              {foldSum !== null ? `Somma ${fmtNumber(foldSum, 1, true)} mm` : 'Facoltative, con il plicometro'}
            </span>
          </span>
        </button>
        <AnimatePresence initial={false}>
          {showFolds && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="flex flex-col gap-3 border-t border-line px-4 pb-4 pt-3.5">
                <p className="t-footnote text-ink-3">Scegli i siti che misuri, sempre gli stessi, con lo stesso plicometro.</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Siti delle pliche">
                  {allSites.map((site) => (
                    <Chip
                      key={site}
                      selected={sites.includes(site)}
                      onChange={(on) => setSites((cur) => (on ? [...cur, site] : cur.filter((x) => x !== site)))}
                      className="h-9 px-3.5 text-[0.875rem]"
                    >
                      {site}
                    </Chip>
                  ))}
                </div>
                {allSites
                  .filter((x) => sites.includes(x))
                  .map((site) => (
                    <div key={site} className="flex items-center gap-3">
                      <label htmlFor={`plica-${site}`} className="t-callout min-w-0 flex-1 text-ink">
                        {site}
                        {prev?.skinfolds?.[site] !== undefined && <span className="t-caption block text-ink-3">la volta scorsa {fmtNumber(prev.skinfolds[site], 1, true)} mm</span>}
                      </label>
                      <NumberInput
                        id={`plica-${site}`}
                        value={folds[site]}
                        onChange={(v) => setFolds((f) => ({ ...f, [site]: v }))}
                        decimals={1}
                        min={2}
                        max={80}
                        unit="mm"
                        className="w-[128px] shrink-0"
                        aria-label={`Plica ${site.toLowerCase()} in millimetri`}
                      />
                    </div>
                  ))}
                {foldSum !== null && (
                  <p className="t-footnote flex items-baseline justify-between rounded-[12px] bg-ink-soft px-3 py-2.5 text-ink-2">
                    <span>Somma delle pliche</span>
                    <span className="t-mono text-ink">
                      {fmtNumber(foldSum, 1, true)} mm
                      {sameSites && prevFoldSum !== null && (
                        <span style={{ color: foldSum - prevFoldSum < 0 ? 'var(--good-ink)' : 'var(--ink-2)' }}> · {fmtDelta(foldSum - prevFoldSum, 'mm', 1)}</span>
                      )}
                    </span>
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      <Field label="Una riga sulla settimana" optional>
        <TextArea value={note} onChange={setNote} rows={3} placeholder="Cosa ha funzionato, cosa cambiare" maxLength={400} />
      </Field>
    </div>
  );
}

// ───────────────────────── Passo 4: proposte e scalino ─────────────────────────

function StepPicker({
  suggestion,
  chosen,
  onChoose,
  readOnly,
}: {
  suggestion: StepSuggestion;
  chosen: WeeklyStepId | null;
  onChoose: (id: WeeklyStepId | null) => void;
  readOnly: boolean;
}) {
  const state = useApp.getState();
  const option = chosen ? (suggestion.options.find((o) => o.id === chosen) ?? null) : null;
  const def = chosen ? weeklyStepDef(chosen, state) : null;
  return (
    <Card padding="none" className="overflow-hidden" style={{ boxShadow: chosen ? 'inset 0 1px 0 0 rgb(var(--light-warm) / 0.35)' : undefined }}>
      <div className="flex gap-3 p-4">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-ink-soft"
          style={{ boxShadow: chosen ? 'inset 0 0 0 1px var(--accent)' : 'inset 0 0 0 1px var(--line-strong)', color: chosen ? 'var(--accent-ink)' : 'var(--ink-3)' }}
        >
          <Footprints size={20} strokeWidth={2.1} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="t-label text-ink-3">{!chosen ? 'Nessuno scalino' : chosen === suggestion.suggested.id ? 'Consigliato' : 'Scelto da te'}</p>
          {def ? (
            <>
              <h4 className="t-headline mt-0.5 text-ink">{def.title}</h4>
              <p className="t-footnote mt-1 text-pretty text-ink-2">{def.how}</p>
              {option && <p className="t-caption mt-2 text-pretty text-ink-3">{option.reason}</p>}
              <p className="t-caption mt-2 font-semibold text-ink-2">
                Obiettivo: {STEP_TARGET_DAYS} giorni su 7, lo trovi ogni giorno in Oggi.
              </p>
            </>
          ) : (
            <p className="t-footnote mt-1 text-ink-2">La settimana va avanti con il menù e il piano, senza un obiettivo in più.</p>
          )}
        </div>
      </div>
      {!readOnly && (
        <div className="border-t border-line px-4 pb-4 pt-3">
          <p className="t-caption mb-2 text-ink-3">Oppure scegli tu:</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Scalino della settimana">
            {suggestion.options.map((o) => (
              <Chip key={o.id} selected={chosen === o.id} onChange={() => onChoose(o.id)} className="h-9 px-3.5 text-[0.875rem]">
                {STEP_SHORT[o.id]}
              </Chip>
            ))}
            <Chip selected={chosen === null} onChange={() => onChoose(null)} className="h-9 px-3.5 text-[0.875rem]">
              Nessuno
            </Chip>
          </div>
        </div>
      )}
    </Card>
  );
}

// ───────────────────────── Settimana chiusa ─────────────────────────

interface Change {
  key: string;
  icon: ReactNode;
  title: string;
  detail: string;
}

function ClosedView({ range, score, changes }: { range: string; score: number; changes: Change[] }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative -mx-5 -mt-1 min-h-full overflow-hidden px-5 pb-6">
      <Floodlights intensity={1} flare={1} height={320} />
      <div className="relative flex flex-col items-center pt-14 text-center">
        <motion.span
          className="grid size-16 place-items-center rounded-full"
          initial={reduce ? false : { scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.1 }}
          style={{ background: 'var(--good)', color: 'var(--bg)', boxShadow: '0 0 28px 4px color-mix(in srgb, var(--good) 45%, transparent)' }}
        >
          <Check size={32} strokeWidth={3} aria-hidden />
        </motion.span>
        <h3 className="t-large-title mt-5 text-[2.75rem] text-ink">Settimana chiusa</h3>
        <p className="t-callout mt-2 text-ink-2">
          {capitalize(range)} · voto medio <span className="t-num text-[1.125rem] text-ink">{fmtNumber(score, 1, true)}</span>
        </p>
      </div>
      <section className="relative mt-8" aria-labelledby="da-lunedi">
        <h4 id="da-lunedi" className="t-label mb-2 px-1 text-ink-3">
          Da lunedì
        </h4>
        <Card padding="none">
          {changes.length ? (
            <ul>
              {changes.map((c, i) => (
                <motion.li
                  key={c.key}
                  className={cn('flex items-start gap-3 px-4 py-3.5', i > 0 && 'border-t border-line')}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 + i * 0.08, type: 'spring', stiffness: 400, damping: 32 }}
                >
                  {c.icon}
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="t-headline text-ink">{c.title}</p>
                    <p className="t-footnote mt-0.5 text-ink-2">{c.detail}</p>
                  </div>
                </motion.li>
              ))}
            </ul>
          ) : (
            <p className="t-callout px-4 py-4 text-ink-2">Il piano resta com’è: si continua così.</p>
          )}
        </Card>
      </section>
    </div>
  );
}

// ───────────────────────── Puntini ─────────────────────────

function StepDots({ step, max, onGo }: { step: number; max: number; onGo: (i: StepIndex) => void }) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={`Passo ${step + 1} di 4: ${STEPS[step]}`}>
      {STEPS.map((name, i) => {
        const reachable = i <= max && i !== step;
        return (
          <button
            key={name}
            type="button"
            disabled={!reachable}
            onClick={() => onGo(i as StepIndex)}
            aria-label={`${name}${i === step ? ', passo attuale' : ''}`}
            aria-current={i === step ? 'step' : undefined}
            className="hit-44 relative grid h-6 place-items-center"
          >
            <motion.span
              className="block h-1.5 rounded-full"
              animate={{ width: i === step ? 22 : 6, opacity: i <= max ? 1 : 0.45 }}
              transition={{ type: 'spring', stiffness: 500, damping: 34 }}
              style={{ background: i === step ? 'var(--accent)' : i < step || i <= max ? 'var(--ink-2)' : 'var(--ink-4)' }}
            />
          </button>
        );
      })}
    </div>
  );
}

// ───────────────────────── Foglio ─────────────────────────

export function ReviewSheet({ weekStart, today, onClose }: ReviewSheetProps) {
  const plan = useApp((s) => s.plan);
  const reviews = useApp((s) => s.reviews);
  const goal = useApp((s) => s.profile.goal);
  const toast = useUi((s) => s.toast);
  const calendar = useCalendarStatus();
  const reduce = useReducedMotion();

  const saved = reviewFor(weekStart, reviews);
  const prev = previousReview(weekStart, reviews);
  const current = weekStart === reviewWeekFor(today);

  // Numeri, proposte e scalino si fissano all'apertura: decidere non deve cambiare la lista sotto le dita.
  const [stats] = useState<WeekStats>(() => weekStats(weekStart, useApp.getState(), { today }));
  const [list] = useState<Proposal[]>(() => saved?.proposals ?? buildProposals(weekStart, useApp.getState(), { today, stats }));
  const [suggestion] = useState<StepSuggestion>(() => proposeWeeklyStep(weekStart, useApp.getState(), { today, stats }));
  const [days] = useState<CalendarDay[]>(() => {
    const st = useApp.getState();
    return weekDates(stats.weekStart).map((d) => calendarDay(d, st, today, stats.startDate));
  });
  const applied = useMemo(() => new Set(saved?.acceptedProposals ?? []), [saved]);

  const [step, setStep] = useState<StepIndex>(0);
  const [maxStep, setMaxStep] = useState<number>(saved ? 3 : 0);
  const [dir, setDir] = useState(1);
  const [closed, setClosed] = useState<{ changes: Change[]; score: number; before: { plan: typeof plan; reviews: typeof reviews } } | null>(null);

  const [votes, setVotes] = useState<Partial<Votes>>(() => ({ ...(saved?.votes ?? {}) }));
  const [waist, setWaist] = useState<number | undefined>(saved?.waistCm);
  const [sites, setSites] = useState<string[]>(() => Object.keys(saved?.skinfolds ?? prev?.skinfolds ?? {}));
  const [folds, setFolds] = useState<Record<string, number | undefined>>(() => ({ ...(saved?.skinfolds ?? {}) }));
  const [note, setNote] = useState(saved?.note ?? '');
  const [decisions, setDecisions] = useState<Record<string, Decision>>(() =>
    Object.fromEntries((saved?.acceptedProposals ?? []).map((id) => [id, 'accettata' as Decision])),
  );
  const savedStep = reviewStep(saved);
  const [chosenStep, setChosenStep] = useState<WeeklyStepId | null>(() => (saved ? (savedStep?.id ?? null) : suggestion.suggested.id));

  const allSites = useMemo(() => {
    const extra = (reviews ?? []).flatMap((r) => Object.keys(r.skinfolds ?? {}));
    return [...new Set<string>([...SKINFOLD_SITES, ...extra])];
  }, [reviews]);

  // Ogni passo riparte dall'alto.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.parentElement?.scrollTo({ top: 0 });
  }, [step, closed]);

  const missing = VOTE_FIELDS.filter((f) => votes[f.key] === undefined);
  const stateOf = (p: Proposal): ProposalState =>
    applied.has(p.id) ? 'applicata' : decisions[p.id] === 'accettata' ? 'accettata' : decisions[p.id] === 'rimandata' ? 'rimandata' : 'da-decidere';
  const actionable = list.filter((p) => p.apply !== undefined);
  const informative = list.filter((p) => p.apply === undefined);
  const pending = actionable.filter((p) => stateOf(p) === 'da-decidere');
  const accepted = actionable.filter((p) => decisions[p.id] === 'accettata' || applied.has(p.id)).map((p) => p.id);
  const toApply = list.filter((p) => decisions[p.id] === 'accettata' && !applied.has(p.id) && changesPlan(p));

  const go = (i: StepIndex) => {
    setDir(i > step ? 1 : -1);
    setStep(i);
    setMaxStep((m) => Math.max(m, i));
  };
  const next = () => {
    if (step === 1 && missing.length) return;
    haptic('light');
    go(Math.min(3, step + 1) as StepIndex);
  };
  const decide = (p: Proposal, d: Decision | null) =>
    setDecisions((cur) => {
      const n = { ...cur };
      if (d) n[p.id] = d;
      else delete n[p.id];
      return n;
    });
  const acceptAll = () => {
    haptic('success');
    setDecisions((cur) => ({ ...cur, ...Object.fromEntries(pending.map((p) => [p.id, 'accettata' as Decision])) }));
  };

  const save = () => {
    if (missing.length) {
      go(1);
      return;
    }
    const s = useApp.getState();
    const before = { plan: s.plan, reviews: s.reviews };
    const planBefore = s.plan;
    for (const p of toApply) s.applyProposal(p);
    const foldValues = Object.fromEntries(sites.map((k) => [k, folds[k]]).filter(([, v]) => typeof v === 'number')) as Record<string, number>;
    const stepDef = chosenStep ? weeklyStepDef(chosenStep, s) : null;
    const review: WeeklyReviewWithStep = {
      weekStart,
      votes: votes as Votes,
      acceptedProposals: accepted,
      proposals: list,
      ...(waist !== undefined ? { waistCm: waist } : {}),
      ...(Object.keys(foldValues).length ? { skinfolds: foldValues } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(stepDef ? { step: { id: stepDef.id, title: stepDef.title } } : {}),
    };
    s.saveReview(review);
    haptic('success');

    // Cosa cambia da lunedì.
    const after = useApp.getState().plan;
    const changes: Change[] = [];
    for (const p of toApply) {
      if (p.apply?.type === 'sleepCurrent') {
        changes.push({
          key: p.id,
          icon: <AreaIcon area="sonno" size={36} />,
          title: `A letto alle ${p.apply.value}`,
          detail: `Prima alle ${planBefore.sleep.current}. Telefono fuori alle ${addMinutes(p.apply.value, -after.sleep.curfewLeadMin)}.`,
        });
      } else if (p.apply?.type === 'kcalDelta') {
        changes.push({
          key: p.id,
          icon: <AreaIcon area="calorie" size={36} />,
          title: `${p.apply.value > 0 ? '+' : '−'}${fmtNumber(Math.abs(p.apply.value))} kcal al giorno`,
          detail: `${fmtKcal(after.targets.palestra.kcal)} nei giorni di palestra, dai carboidrati; proteine invariate.`,
        });
      }
    }
    for (const p of list.filter((x) => decisions[x.id] === 'accettata' && !applied.has(x.id) && x.apply?.type === 'none')) {
      changes.push({ key: p.id, icon: <AreaIcon area={p.area} size={36} />, title: p.title, detail: 'Un impegno per la settimana: il piano non cambia.' });
    }
    if (stepDef && stepDef.id !== savedStep?.id) {
      changes.push({
        key: 'scalino',
        icon: (
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-ink-soft text-accent-ink" style={{ boxShadow: 'inset 0 0 0 1px var(--accent)' }}>
            <Footprints size={18} strokeWidth={2.1} />
          </span>
        ),
        title: `Scalino: ${stepDef.title.toLowerCase()}`,
        detail: `${STEP_TARGET_DAYS} giorni su 7, con il conteggio in Oggi.`,
      });
    }
    setClosed({ changes, score: reviewScore({ votes: votes as Votes }), before });

    // Il coprifuoco nel calendario segue l'orario a letto: con un file già aggiunto va rifatto.
    if (calendar.state !== 'assente' && toApply.some((p) => p.apply?.type === 'sleepCurrent')) {
      toast('Orario a letto cambiato: aggiorna il calendario', 'neutral', {
        actionLabel: 'Apri',
        onAction: () => {
          onClose();
          window.location.hash = 'impostazioni?sezione=promemoria';
        },
      });
    }
  };

  const undo = () => {
    if (!closed) return;
    useApp.setState({ plan: closed.before.plan, reviews: closed.before.reviews });
    toast('Revisione annullata: il piano è tornato com’era', 'neutral');
    onClose();
  };

  // Settimana di avvio troppo corta (aperta da un collegamento vecchio): solo l'appuntamento con la prima.
  if (!saved && !isReviewableWeek(weekStart, plan)) {
    const first = firstReviewDate(plan);
    return (
      <Sheet
        open
        onClose={onClose}
        title="Revisione della settimana"
        footer={
          <Button size="lg" fullWidth onClick={onClose} haptic="light">
            Va bene
          </Button>
        }
      >
        <div className="flex flex-col gap-3 pb-4">
          <h3 className="t-title text-pretty text-ink">{first ? `La prima revisione è ${formatDayLong(first)}` : 'La prima revisione è domenica'}</h3>
          <p className="t-callout text-pretty text-ink-2">
            Ritmo è con te da troppo poco per rivedere questa settimana. La prossima domenica avrai sette giorni di numeri veri: peso, ore a letto, dolore e giornate riuscite, e le correzioni del piano partiranno da lì.
          </p>
        </div>
      </Sheet>
    );
  }

  const range = formatWeekRange(weekStart);
  const closeLabel = saved ? 'Aggiorna la revisione' : current ? 'Chiudi la settimana' : 'Salva la revisione';

  const footer = closed ? (
    <div className="flex flex-col gap-1.5">
      <Button size="lg" fullWidth icon={CheckCheck} onClick={onClose} haptic="light">
        Fatto
      </Button>
      <Button variant="ghost" size="sm" fullWidth icon={Undo2} onClick={undo}>
        Annulla la revisione
      </Button>
    </div>
  ) : (
    <div className="flex flex-col gap-2.5">
      {step === 1 && missing.length > 0 && (
        <p className="t-footnote text-center text-ink-3" aria-live="polite">
          {missing.length === 4 ? 'Dai i quattro voti per andare avanti' : `Manca il voto a ${listIt(missing.map((m) => m.label.toLowerCase()))}`}
        </p>
      )}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <StepDots step={step} max={maxStep} onGo={go} />
        </div>
        {step > 0 && <Button variant="ghost" size="lg" icon={ArrowLeft} aria-label="Passo precedente" onClick={() => go((step - 1) as StepIndex)} className="!px-3" />}
        {step < 3 ? (
          <Button size="lg" iconRight={ArrowRight} disabled={step === 1 && missing.length > 0} onClick={next} haptic={false} className="min-w-[132px]">
            Avanti
          </Button>
        ) : current && pending.length > 0 ? (
          <Button variant="secondary" size="lg" icon={Check} onClick={acceptAll} haptic={false}>
            Accetta tutte
          </Button>
        ) : toApply.length > 0 ? (
          <span className="t-footnote shrink-0 text-good-ink" aria-live="polite">
            {toApply.length === 1 ? '1 proposta cambia il piano' : `${toApply.length} proposte cambiano il piano`}
          </span>
        ) : null}
      </div>
      {step === 3 && (
        <Button size="lg" fullWidth icon={Moon} onClick={save} haptic={false}>
          {closeLabel}
        </Button>
      )}
    </div>
  );

  const slide = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, x: 28 * dir }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -28 * dir } };

  return (
    <Sheet
      open
      onClose={onClose}
      size="full"
      title={closed ? undefined : 'Revisione della settimana'}
      aria-label={closed ? 'Settimana chiusa' : undefined}
      subtitle={closed ? undefined : `${capitalize(range)} · settimana ${stats.weekNumber}${saved ? ' · salvata' : ''}`}
      footer={footer}
      contentClassName="pt-1"
    >
      <div ref={rootRef} className="flex min-h-full flex-col pb-4">
        {closed ? (
          <ClosedView range={range} score={closed.score} changes={closed.changes} />
        ) : (
          <>
            <p className="t-label mb-3 text-ink-3">
              {step + 1} di 4 · {STEPS[step]}
            </p>
            <AnimatePresence mode="wait" initial={false} custom={dir}>
              <motion.div key={step} {...slide} transition={{ type: 'spring', stiffness: 420, damping: 38 }}>
                {step === 0 && <Report s={stats} days={days} goal={goal} threshold={plan.painThreshold} />}
                {step === 1 && <VotesStep votes={votes} setVotes={setVotes} energyAvg={stats.energyAvg} />}
                {step === 2 && (
                  <MeasuresStep
                    waist={waist}
                    setWaist={setWaist}
                    prev={prev}
                    sites={sites}
                    setSites={setSites}
                    folds={folds}
                    setFolds={setFolds}
                    allSites={allSites}
                    note={note}
                    setNote={setNote}
                  />
                )}
                {step === 3 && (
                  <div className="flex flex-col gap-6">
                    {!current && <p className="t-callout text-ink-2">Proposte di una settimana passata: si possono solo rileggere.</p>}
                    {actionable.length > 0 && (
                      <section className="flex flex-col gap-3" aria-labelledby="proposte-decidere">
                        <h4 id="proposte-decidere" className="t-label px-1 text-ink-3">
                          {current ? 'Da decidere' : 'Proposte'}
                        </h4>
                        {actionable.map((p) => (
                          <ProposalCard
                            key={p.id}
                            proposal={p}
                            plan={plan}
                            state={stateOf(p)}
                            actionable={current}
                            onAccept={() => decide(p, 'accettata')}
                            onDecline={() => decide(p, 'rimandata')}
                            onUndo={() => decide(p, null)}
                          />
                        ))}
                      </section>
                    )}
                    {informative.length > 0 && (
                      <section className="flex flex-col gap-3" aria-labelledby="proposte-sapere">
                        <h4 id="proposte-sapere" className="t-label px-1 text-ink-3">
                          Da sapere
                        </h4>
                        {informative.map((p) => (
                          <ProposalCard key={p.id} proposal={p} plan={plan} state="da-decidere" actionable={false} />
                        ))}
                      </section>
                    )}
                    {list.length === 0 && (
                      <Card variant="outline" className="t-callout text-ink-2">
                        Niente da correggere: il piano resta com’è.
                      </Card>
                    )}
                    <section className="flex flex-col gap-3" aria-labelledby="scalino-titolo">
                      <div className="px-1">
                        <h4 id="scalino-titolo" className="t-label text-ink-3">
                          Lo scalino della settimana
                        </h4>
                        <p className="t-footnote mt-1 text-pretty text-ink-3">
                          {suggestion.previous
                            ? suggestion.previous.consolidated
                              ? `${capitalize(suggestion.previous.title.toLowerCase())}: ${suggestion.previous.done} giorni su 7, fatto. Si sale di uno.`
                              : `${capitalize(suggestion.previous.title.toLowerCase())}: ${suggestion.previous.done} ${suggestion.previous.done === 1 ? 'giorno' : 'giorni'} su 7.`
                            : 'Un solo obiettivo piccolo, scelto sul punto più debole della settimana.'}
                        </p>
                      </div>
                      <StepPicker suggestion={suggestion} chosen={chosenStep} onChoose={(id) => setChosenStep(id)} readOnly={!current} />
                    </section>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </div>
    </Sheet>
  );
}
