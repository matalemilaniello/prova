/**
 * Revisione della domenica: numeri della settimana, voti 1-10, vita e pliche, proposte da accettare.
 * Le proposte accettate cambiano il piano solo al salvataggio (con "Annulla" nel messaggio), così
 * chiudere il foglio non lascia mai il piano a metà e una proposta non si applica due volte.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CheckCheck, Save } from 'lucide-react';
import type { ISODate, Proposal, WeeklyReview } from '../../domain/types';
import { formatWeekRange } from '../../engine/dates';
import {
  changesPlan,
  previousReview,
  proposalEffect,
  proposals as buildProposals,
  reviewFor,
  reviewWeekFor,
  skinfoldSum,
  weekStats,
  type WeekStats,
} from '../../engine/review';
import { capitalize, fmtDelta, fmtHours, fmtNumber, fmtPercent, listIt } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useApp, useUi } from '../../state/store';
import { Button, Card, Chip, Field, NumberInput, RatingPicker, SectionTitle, Sheet, TextArea, staggerItem } from '../../ui';
import { SKINFOLD_SITES, VOTE_FIELDS, type VoteKey } from './areas';
import { ProposalCard, type ProposalState } from './ProposalCard';
import { signedKg } from './charts/WeightChart';

export interface ReviewSheetProps {
  weekStart: ISODate;
  today: ISODate;
  onClose: () => void;
}

type Votes = WeeklyReview['votes'];

/** Frase di apertura, con la voce del coach. */
function headline(s: WeekStats): string {
  if (s.adherence === null) return 'Settimana senza voci segnate: parti dai numeri che hai.';
  const head = s.adherence >= 0.8 ? 'Settimana solida' : s.adherence >= 0.6 ? 'Settimana discreta' : 'Settimana in salita';
  const extra: string[] = [];
  if (s.sleepAvgH !== null && s.prevSleepAvgH !== null) {
    const d = Math.round((s.sleepAvgH - s.prevSleepAvgH) * 60);
    if (d >= 10) extra.push(`sonno su di ${d} minuti`);
    else if (d <= -10) extra.push(`sonno giù di ${-d} minuti`);
  }
  const down = s.pain.filter((p) => p.trend === 'giu').map((p) => p.site.toLowerCase());
  const up = s.pain.filter((p) => p.trend === 'su').map((p) => p.site.toLowerCase());
  if (up.length) extra.push(`${listIt(up)} in aumento`);
  else if (down.length) extra.push(`${listIt(down)} in calo`);
  const days = `${s.successfulDays} ${s.successfulDays === 1 ? 'giornata riuscita' : 'giornate riuscite'} su ${s.adherenceDays}`;
  return `${head}: ${days}${extra.length ? `, ${listIt(extra)}` : ''}.`;
}

function Tile({ label, value, unit, detail, wide }: { label: string; value: ReactNode; unit?: string; detail?: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <Card padding="none" className="h-full px-3.5 py-3">
        <p className="t-label text-ink-3">{label}</p>
        <p className="mt-1.5 flex items-baseline gap-1">
          <span className="t-num text-[1.625rem] text-ink">{value}</span>
          {unit && <span className="t-mono text-[0.75rem] text-ink-2">{unit}</span>}
        </p>
        {detail && <p className="t-footnote mt-1 text-ink-2">{detail}</p>}
      </Card>
    </div>
  );
}

function TrendMark({ trend }: { trend: 'su' | 'giu' | 'stabile' | null }) {
  if (!trend) return null;
  const Icon = trend === 'su' ? ArrowUpRight : trend === 'giu' ? ArrowDownRight : ArrowRight;
  const color = trend === 'su' ? 'var(--warn-ink)' : trend === 'giu' ? 'var(--good-ink)' : 'var(--ink-3)';
  return <Icon size={15} strokeWidth={2.6} style={{ color }} aria-label={trend === 'su' ? 'in aumento' : trend === 'giu' ? 'in calo' : 'stabile'} />;
}

function WeekNumbers({ s }: { s: WeekStats }) {
  const wDelta = s.weightDelta;
  const loadRatio = s.loadStatus.ratio;
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Tile
        label="Peso medio"
        value={s.weightAvg !== null ? fmtNumber(s.weightAvg, 1, true) : '–'}
        unit={s.weightAvg !== null ? 'kg' : undefined}
        detail={
          <>
            {wDelta !== null && <span className="tabular text-ink">{signedKg(wDelta)} · </span>}
            {s.weighIns} {s.weighIns === 1 ? 'pesata' : 'pesate'}
          </>
        }
      />
      <Tile
        label="Aderenza"
        value={s.adherence !== null ? fmtNumber(Math.round(s.adherence * 100)) : '–'}
        unit={s.adherence !== null ? '%' : undefined}
        detail={s.adherenceDays ? `${s.successfulDays} giornate riuscite su ${s.adherenceDays}` : 'Nessun giorno chiuso'}
      />
      <Tile
        label="Sonno medio"
        value={s.sleepAvgH !== null ? fmtHours(s.sleepAvgH) : '–'}
        detail={s.nightsWithBedtime ? `${s.nightsOnTarget} ${s.nightsOnTarget === 1 ? 'notte' : 'notti'} su ${s.nightsWithBedtime} in orario` : 'Nessun orario a letto'}
      />
      <Tile
        label="Energia"
        value={s.energyAvg !== null ? fmtNumber(s.energyAvg, 1, true) : '–'}
        unit={s.energyAvg !== null ? 'su 10' : undefined}
        detail="media dei controlli del mattino"
      />
      <Tile
        label="Fibre stimate"
        value={s.fiberAvgG !== null ? fmtNumber(Math.round(s.fiberAvgG)) : '–'}
        unit={s.fiberAvgG !== null ? 'g' : undefined}
        detail={`obiettivo ${s.fiberTargetG} g al giorno`}
      />
      <Tile
        label="Proteine stimate"
        value={s.proteinAvgG !== null ? fmtNumber(s.proteinAvgG) : '–'}
        unit={s.proteinAvgG !== null ? 'g' : undefined}
        detail={`obiettivo ${s.proteinTargetG} g al giorno`}
      />
      <Tile
        label="Carico"
        value={fmtNumber(s.load)}
        unit="UA"
        detail={loadRatio !== null ? `${fmtPercent(loadRatio)} della media${s.loadStatus.alert ? ', oltre la soglia' : ''}` : `${s.gymSessions} palestra · ${s.footballSessions} calcio`}
      />
      <Tile
        label="Dolci"
        value={`${s.sweets}`}
        unit={`su ${s.sweetsPlanned}`}
        detail={s.sweetsExtra > 0 ? `${s.sweetsExtra} fuori programma` : 'Dentro il programma'}
      />
      {s.pain.some((p) => p.readings > 0) && (
        <div className="col-span-2">
          <Card padding="none" className="px-3.5 py-3">
            <p className="t-label text-ink-3">Dolore medio</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {s.pain
                .filter((p) => p.readings > 0)
                .map((p) => (
                  <li key={p.site} className="flex items-center gap-2">
                    <span className="t-callout min-w-0 flex-1 font-medium text-ink">{p.site}</span>
                    {p.prevAvg !== null && <span className="t-mono text-ink-3">da {fmtNumber(p.prevAvg, 1, true)}</span>}
                    <TrendMark trend={p.trend} />
                    <span className="t-num w-9 text-right text-[1.25rem]" style={{ color: p.overThreshold ? 'var(--warn-ink)' : 'var(--ink)' }}>
                      {p.avg !== null ? fmtNumber(p.avg, 1, true) : '–'}
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

function Section({ title, subtitle, action, children, delay = 0 }: { title: string; subtitle?: ReactNode; action?: ReactNode | { label: string; onPress: () => void }; children: ReactNode; delay?: number }) {
  return (
    <motion.section className="flex flex-col gap-3" {...staggerItem(delay, 0.06)}>
      <SectionTitle subtitle={subtitle} action={action}>
        {title}
      </SectionTitle>
      {children}
    </motion.section>
  );
}

export function ReviewSheet({ weekStart, today, onClose }: ReviewSheetProps) {
  const plan = useApp((s) => s.plan);
  const reviews = useApp((s) => s.reviews);
  const toast = useUi((s) => s.toast);

  const saved = reviewFor(weekStart, reviews);
  const prev = previousReview(weekStart, reviews);
  const current = weekStart === reviewWeekFor(today);

  // Numeri e proposte si fissano all'apertura: accettare non deve cambiare la lista sotto le dita.
  const [stats] = useState<WeekStats>(() => weekStats(weekStart, useApp.getState(), { today }));
  const [list] = useState<Proposal[]>(() => saved?.proposals ?? buildProposals(weekStart, useApp.getState(), { today, stats }));
  const applied = useMemo(() => new Set(saved?.acceptedProposals ?? []), [saved]);

  const [votes, setVotes] = useState<Partial<Votes>>(() => ({ ...(saved?.votes ?? {}) }));
  const [waist, setWaist] = useState<number | undefined>(saved?.waistCm);
  const [sites, setSites] = useState<string[]>(() => Object.keys(saved?.skinfolds ?? prev?.skinfolds ?? {}));
  const [folds, setFolds] = useState<Record<string, number | undefined>>(() => ({ ...(saved?.skinfolds ?? {}) }));
  const [note, setNote] = useState(saved?.note ?? '');
  const [accepted, setAccepted] = useState<string[]>(() => saved?.acceptedProposals ?? []);

  const allSites = useMemo(() => {
    const extra = (reviews ?? []).flatMap((r) => Object.keys(r.skinfolds ?? {}));
    return [...new Set<string>([...SKINFOLD_SITES, ...extra])];
  }, [reviews]);

  const missing = VOTE_FIELDS.filter((f) => votes[f.key] === undefined);
  const stateOf = (p: Proposal): ProposalState => (applied.has(p.id) ? 'applicata' : accepted.includes(p.id) ? 'accettata' : 'da-decidere');
  const pending = list.filter((p) => p.apply !== undefined && stateOf(p) === 'da-decidere');
  const toApply = list.filter((p) => accepted.includes(p.id) && !applied.has(p.id) && changesPlan(p));

  const prevWaist = prev?.waistCm;
  const prevFoldSum = skinfoldSum(prev);
  const foldValues = Object.fromEntries(sites.map((k) => [k, folds[k]]).filter(([, v]) => typeof v === 'number')) as Record<string, number>;
  const foldSum = Object.keys(foldValues).length ? Object.values(foldValues).reduce((s, v) => s + v, 0) : null;
  const sameSites = prev?.skinfolds && Object.keys(foldValues).length > 0 && Object.keys(foldValues).every((k) => k in (prev.skinfolds ?? {})) && Object.keys(prev.skinfolds).length === Object.keys(foldValues).length;

  const toggle = (p: Proposal) => setAccepted((a) => (a.includes(p.id) ? a.filter((x) => x !== p.id) : [...a, p.id]));
  const acceptAll = () => {
    haptic('success');
    setAccepted((a) => [...new Set([...a, ...pending.map((p) => p.id)])]);
  };

  const save = () => {
    if (missing.length) return;
    const s = useApp.getState();
    const before = { plan: s.plan, reviews: s.reviews };
    for (const p of toApply) s.applyProposal(p);
    const review: WeeklyReview = {
      weekStart,
      votes: votes as Votes,
      acceptedProposals: accepted,
      proposals: list,
      ...(waist !== undefined ? { waistCm: waist } : {}),
      ...(foldSum !== null ? { skinfolds: foldValues } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    s.saveReview(review);
    haptic('success');
    const effects = toApply.map(proposalEffect).filter((e): e is string => Boolean(e));
    const done = saved ? 'Revisione aggiornata' : 'Revisione salvata';
    toast(effects.length ? `${done}. Piano aggiornato: ${listIt(effects)}` : done, 'good', {
      actionLabel: 'Annulla',
      onAction: () => useApp.setState({ plan: before.plan, reviews: before.reviews }),
    });
    onClose();
  };

  const saveLabel = toApply.length
    ? `${saved ? 'Aggiorna' : 'Salva'} e applica ${toApply.length === 1 ? '1 proposta' : `${toApply.length} proposte`}`
    : saved
      ? 'Aggiorna la revisione'
      : 'Salva la revisione';

  return (
    <Sheet
      open
      onClose={onClose}
      size="full"
      title="Revisione della settimana"
      subtitle={`${capitalize(formatWeekRange(weekStart))} · settimana ${stats.weekNumber} del piano${saved ? ' · salvata' : ''}`}
      footer={
        <div className="flex flex-col gap-2">
          {missing.length > 0 && (
            <p className="t-footnote text-center text-ink-3" aria-live="polite">
              {missing.length === 4 ? 'Dai i quattro voti per salvare' : `Manca il voto a ${listIt(missing.map((m) => m.label.toLowerCase()))}`}
            </p>
          )}
          <Button size="lg" fullWidth icon={Save} disabled={missing.length > 0} onClick={save} haptic={false}>
            {saveLabel}
          </Button>
        </div>
      }
      contentClassName="pt-1"
    >
      <div className="flex flex-col gap-7 pb-4">
        <motion.p className="t-callout text-ink-2" {...staggerItem(0)}>
          {headline(stats)}
        </motion.p>

        <Section title="La settimana in numeri" delay={1}>
          <WeekNumbers s={stats} />
        </Section>

        <Section title="Come ti sei sentito" subtitle="Da 1 a 10, d’istinto." delay={2}>
          <Card className="flex flex-col gap-5">
            {VOTE_FIELDS.map((f, i) => (
              <div key={f.key} className={i > 0 ? 'border-t border-line pt-5' : undefined}>
                <RatingPicker
                  label={f.label}
                  max={10}
                  value={votes[f.key as VoteKey]}
                  onChange={(v) => setVotes((o) => ({ ...o, [f.key]: v }))}
                  lowLabel={f.low}
                  highLabel={f.high}
                />
                {f.key === 'energia' && stats.energyAvg !== null && (
                  <p className="t-caption mt-2 text-ink-3">Nei controlli del mattino la media è stata {fmtNumber(stats.energyAvg, 1, true)}.</p>
                )}
              </div>
            ))}
          </Card>
        </Section>

        <Section title="Misure" subtitle="Una volta a settimana, la domenica mattina a digiuno." delay={3}>
          <Card className="flex flex-col gap-5">
            <Field
              label="Vita"
              hint={
                prevWaist !== undefined
                  ? waist !== undefined
                    ? `${fmtDelta(waist - prevWaist, 'cm', 1)} rispetto alla volta scorsa (${fmtNumber(prevWaist, 1)} cm).`
                    : `La volta scorsa ${fmtNumber(prevWaist, 1)} cm. All’altezza dell’ombelico, a fine espirazione.`
                  : 'All’altezza dell’ombelico, a fine espirazione, metro aderente ma senza stringere.'
              }
            >
              <NumberInput value={waist} onChange={setWaist} decimals={1} min={40} max={200} unit="cm" placeholder={prevWaist !== undefined ? fmtNumber(prevWaist, 1) : '84,0'} />
            </Field>

            <div className="flex flex-col gap-3 border-t border-line pt-5">
              <div className="px-1">
                <p className="t-footnote flex items-baseline gap-1.5 font-semibold text-ink-2">
                  Pliche <span className="font-normal text-ink-3">facoltativo</span>
                </p>
                <p className="t-footnote mt-1 text-ink-3">Scegli i siti che misuri, sempre gli stessi, con lo stesso plicometro.</p>
              </div>
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
              {sites.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  {allSites
                    .filter((s) => sites.includes(s))
                    .map((site) => (
                      <div key={site} className="flex items-center gap-3">
                        <label htmlFor={`plica-${site}`} className="t-callout min-w-0 flex-1 text-ink">
                          {site}
                          {prev?.skinfolds?.[site] !== undefined && (
                            <span className="t-caption block text-ink-3">la volta scorsa {fmtNumber(prev.skinfolds[site], 1)} mm</span>
                          )}
                        </label>
                        <NumberInput
                          id={`plica-${site}`}
                          value={folds[site]}
                          onChange={(v) => setFolds((f) => ({ ...f, [site]: v }))}
                          decimals={1}
                          min={2}
                          max={80}
                          unit="mm"
                          className="w-[132px] shrink-0"
                          aria-label={`Plica ${site.toLowerCase()} in millimetri`}
                        />
                      </div>
                    ))}
                  {foldSum !== null && (
                    <p className="t-footnote flex items-baseline justify-between rounded-[12px] bg-ink-soft px-3 py-2.5 text-ink-2">
                      <span>Somma delle pliche</span>
                      <span className="t-mono text-ink">
                        {fmtNumber(foldSum, 1)} mm
                        {sameSites && prevFoldSum !== null && (
                          <span style={{ color: foldSum - prevFoldSum < 0 ? 'var(--good-ink)' : 'var(--ink-2)' }}> · {fmtDelta(foldSum - prevFoldSum, 'mm', 1)}</span>
                        )}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </Card>
        </Section>

        <Section
          title="Proposte per la prossima settimana"
          subtitle={
            !current
              ? 'Proposte di una settimana passata: si possono solo rileggere.'
              : pending.length === 0 && saved
                ? 'Decise quando hai salvato la revisione.'
                : 'Accetta quelle che fanno per te: il piano cambia quando salvi.'
          }
          action={current && pending.length > 1 ? { label: 'Accetta tutte', onPress: acceptAll } : undefined}
          delay={4}
        >
          {list.length === 0 ? (
            <Card variant="outline" className="t-callout text-ink-2">
              Niente da correggere: il piano resta com’è.
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {list.map((p) => (
                <ProposalCard key={p.id} proposal={p} plan={plan} state={stateOf(p)} actionable={current} onToggle={() => toggle(p)} />
              ))}
              {current && pending.length === 0 && list.some((p) => p.apply !== undefined) && (
                <p className="t-footnote inline-flex items-center gap-1.5 px-1 text-good-ink">
                  <CheckCheck size={16} strokeWidth={2.4} aria-hidden />
                  Tutte le proposte decise.
                </p>
              )}
            </div>
          )}
        </Section>

        <Section title="Nota" delay={5}>
          <Field label="Una riga sulla settimana" optional>
            <TextArea value={note} onChange={setNote} rows={3} placeholder="Cosa ha funzionato, cosa cambiare" maxLength={400} />
          </Field>
        </Section>

      </div>
    </Sheet>
  );
}
