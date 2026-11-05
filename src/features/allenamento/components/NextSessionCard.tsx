import { motion } from 'motion/react';
import { BatteryMedium, Clock, Layers, ListOrdered, Play, RotateCcw, Sprout, TrendingUp } from 'lucide-react';
import type { ISODate } from '../../../domain/types';
import { sessionFor } from '../../../engine/plan/program';
import type { PainGate, PlannedSession } from '../../../engine/training';
import { capitalize, fmtMinutes, plural } from '../../../lib/format';
import { useApp } from '../../../state/store';
import { useNowHHMM } from '../../../state/hooks';
import { compareHHMM, formatDayLong } from '../../../engine/dates';
import { Button, Callout, Card, Pill, ProgressRing, cn, staggerItem } from '../../../ui';
import type { SessionDraft } from '../draft';
import { buildPlayerPlan, durationLabel, plannedSets, sessionTone, suggestionForItem } from '../lib';
import { dayVariantSession, sessionName, sessionWithArticle } from '../blocks';
import { SessionGlyph } from './SessionGlyph';
import { relativeDayShort } from '../useTraining';

export interface NextSessionCardProps {
  next: PlannedSession;
  after: PlannedSession | null;
  today: ISODate;
  gate: PainGate;
  /** Fase di ingresso della seduta (prima o seconda esecuzione), null dopo. */
  intro?: 1 | 2 | null;
  onStart: () => void;
}

/** La prossima seduta in evidenza: quando, quanto dura, cosa sale di carico, avviso del dolore. */
export function NextSessionCard({ next, after, today, gate, intro = null, onStart }: NextSessionCardProps) {
  const history = useApp((s) => s.workoutLogs);
  const plan = useApp((s) => s.plan);
  const physio = useApp((s) => s.physio);
  const footballLogs = useApp((s) => s.footballLogs);
  const checkIns = useApp((s) => s.checkIns);
  const profile = useApp((s) => s.profile);
  const nowHHMM = useNowHHMM();
  // La seduta del giorno: blocco in vigore, settimana scaricata o leggera (senza, la seduta fissa); oggi anche con la
  // variante del controllo del mattino e i freni di sicurezza (`daySession`).
  const day =
    next.daysAway === 0 ? dayVariantSession(next.sessionId, next.date, { plan, workoutLogs: history, footballLogs, checkIns, profile, physio }) : null;
  const session = day?.session ?? sessionFor(next.sessionId, next.date, plan);
  if (!session) return null;
  // Numeri della seduta senza il blocco del fisioterapista (e senza i suoi doppioni), con la dose di oggi.
  const pplan = buildPlayerPlan(session, physio, plan, next.date, { gate, intro });
  const own = pplan.items.filter((i) => !i.physio);
  const sets = plannedSets(own);
  const increases = own.filter((it) => suggestionForItem(it, { history, gate, intro: Boolean(intro), variant: day?.variant }).kind === 'aumenta').length;
  // Balzi del riscaldamento senza volo: l'unica sostituzione possibile con la regola del dolore a posto.
  const swapped = own.find((i) => i.replacedKind === 'impatto');
  const showGate = gate.level !== 'ok' || Boolean(swapped);
  const when = capitalize(relativeDayShort(next.date, today));
  const late = next.daysAway === 0 && Boolean(next.time) && compareHHMM(nowHHMM, next.time!) >= 0;
  const tone = sessionTone(session.id, plan);

  return (
    <Card variant="highlight" tone={tone} padding="lg" as="section" aria-label="Prossima seduta">
      <div className="relative flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <p className="t-label" style={{ color: `var(--${tone}-ink)` }}>
            Prossima seduta
          </p>
          <div className="flex items-center gap-1.5">
            <Pill tone={tone} icon={Clock}>
              {when}
              {next.time && !late ? ` alle ${next.time}` : ''}
            </Pill>
            {next.optional && <Pill tone={tone === 'leggero' ? 'neutral' : 'leggero'}>Facoltativa</Pill>}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <SessionGlyph letter={session.id} size="lg" tone={tone} solid />
          <div className="min-w-0">
            <h2 className="t-title text-ink">{session.name}</h2>
            <p className="t-callout mt-0.5 text-ink-2">{session.subtitle}</p>
          </div>
        </div>

        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {[
            { icon: Clock, text: durationLabel(pplan.duration) },
            { icon: ListOrdered, text: plural(own.length, 'esercizio', 'esercizi') },
            { icon: Layers, text: plural(sets, 'serie', 'serie') },
            ...(increases > 0 ? [{ icon: TrendingUp, text: `${increases} in aumento`, good: true }] : []),
          ].map((m, i) => (
            <motion.li key={m.text} {...staggerItem(i)} className={cn('t-footnote inline-flex items-center gap-1.5 font-medium', 'good' in m ? 'text-good-ink' : 'text-ink')}>
              <m.icon size={15} strokeWidth={2.3} className={'good' in m ? '' : 'text-ink-3'} aria-hidden />
              {m.text}
            </motion.li>
          ))}
        </ul>

        {day?.text && (
          <p className="t-footnote -mt-1 flex items-start gap-2 text-ink-2">
            <BatteryMedium size={15} strokeWidth={2.3} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
            <span>{day.text}</span>
          </p>
        )}

        {intro && (
          <p className="t-footnote -mt-1 flex items-start gap-2 text-ink-2">
            <Sprout size={15} strokeWidth={2.3} className="mt-0.5 shrink-0 text-good-ink" aria-hidden />
            <span>
              <span className="font-semibold text-ink">{intro === 1 ? 'Prima volta con questa seduta:' : 'Seconda volta con questa seduta:'}</span> una serie in meno e
              una ripetizione di riserva in più.
            </span>
          </p>
        )}

        {showGate && (
          <Callout tone={gate.level === 'riduci' ? 'bad' : 'warn'} title={gate.title}>
            {gate.level === 'ok' ? `Nel riscaldamento i balzi diventano ${swapped?.exercise?.name.toLowerCase() ?? 'un esercizio senza volo'}, il resto come previsto.` : gate.message}
          </Callout>
        )}

        <Button size="lg" fullWidth icon={Play} onClick={onStart}>
          Inizia la seduta
        </Button>

        {next.optional && after && (
          <p className="t-footnote -mt-1 text-balance text-center text-ink-3">
            Se la salti, la prossima è {sessionWithArticle(sessionName(after.sessionId, after.date, plan))} {relativeDayShort(after.date, today)}.
          </p>
        )}
      </div>
    </Card>
  );
}

export interface ResumeCardProps {
  draft: SessionDraft;
  today: ISODate;
  now: number;
  doneSets: number;
  totalSets: number;
  onResume: () => void;
  onDiscard: () => void;
}

/** Seduta lasciata a metà: si riprende da dove eri. */
export function ResumeCard({ draft, today, now, doneSets, totalSets, onResume, onDiscard }: ResumeCardProps) {
  const plan = useApp((s) => s.plan);
  const session = sessionFor(draft.sessionId, draft.date, plan);
  const sameDay = draft.date === today;
  const started = new Date(draft.startedAt);
  const startedAt = `${String(started.getHours()).padStart(2, '0')}:${String(started.getMinutes()).padStart(2, '0')}`;
  const elapsed = (now - draft.startedAt) / 1000;
  return (
    <Card variant="highlight" tone="accent" padding="lg" as="section" aria-label="Seduta in corso">
      <div className="relative flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <p className="t-label flex items-center gap-2 text-accent-ink">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-accent" />
            </span>
            Seduta in corso
          </p>
          <span className="t-footnote text-ink-2 tabular">
            {sameDay ? (elapsed < 6 * 3600 ? `da ${fmtMinutes(Math.max(1, Math.round(elapsed / 60)))}` : `dalle ${startedAt}`) : formatDayLong(draft.date)}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <ProgressRing value={totalSets ? doneSets / totalSets : 0} size={68} stroke={6} tone="accent" label={`${doneSets} serie su ${totalSets}`} celebrate={false}>
            <span className="t-num text-[1.375rem] text-ink">{doneSets}</span>
          </ProgressRing>
          <div className="min-w-0">
            <h2 className="t-title text-ink">{session?.name ?? sessionName(draft.sessionId, draft.date, plan)}</h2>
            <p className="t-callout mt-0.5 text-ink-2">
              {doneSets} serie su {totalSets}, iniziata alle {startedAt}
            </p>
          </div>
        </div>
        <div className="flex gap-2.5">
          <Button size="lg" className="flex-1" icon={Play} onClick={onResume}>
            Riprendi
          </Button>
          <Button size="lg" variant="secondary" icon={RotateCcw} onClick={onDiscard}>
            Annulla
          </Button>
        </div>
      </div>
    </Card>
  );
}
