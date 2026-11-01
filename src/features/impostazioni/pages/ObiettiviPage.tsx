/** Obiettivi per tipo di giorno: kcal e macro modificabili, ricalcolo dal profilo con confronto prima/dopo. */
import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Calculator, ChevronRight, Wand2 } from 'lucide-react';
import type { DayType, MacroTarget } from '../../../domain/types';
import { isProfileComplete } from '../../../data/defaults';
import { currentDate } from '../../../engine/dates';
import { ageFrom, computeTargets } from '../../../engine/targets';
import { DAY_TYPES, DAY_TYPE_LABEL, fmtDelta, fmtKg, fmtNumber, plural } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { latestWeight, useApp, useUi } from '../../../state/store';
import { Button, Callout, Card, DayTypeBadge, ListGroup, NumberTicker, Sheet, cn, springSnappy, staggerItem, toneColor, toneInk } from '../../../ui';
import { FormRow, MiniStepper, tileStyle } from '../components/controls';
import { useClosingSheet } from '../components/SupplementEditor';
import { carbsToMatch, dayTypeCounts, kcalFromMacros, matchEveNote } from '../lib';
import { Page, type PageProps } from './Page';

/** Barra delle macro in proporzione alle kcal (proteine, carboidrati, grassi), nel colore del tipo di giorno. */
function MacroBar({ t, tone }: { t: MacroTarget; tone: DayType }) {
  const p = t.proteinG * 4;
  const c = t.carbG * 4;
  const f = t.fatG * 9;
  const tot = Math.max(1, p + c + f);
  const color = toneColor(tone);
  // Niente colore diluito (l'ambra trasparente sul blu diventa oliva): proteine piene, carboidrati a filo, grassi neutri.
  const parts = [
    { w: p / tot, style: { background: color }, label: 'proteine' },
    { w: c / tot, style: { boxShadow: `inset 0 0 0 1.5px ${color}` }, label: 'carboidrati' },
    { w: f / tot, style: { background: 'var(--line-strong)' }, label: 'grassi' },
  ];
  return (
    <div className="flex h-2 w-full gap-[3px] overflow-hidden rounded-full" aria-hidden>
      {parts.map((x) => (
        <motion.span key={x.label} className="h-full rounded-full" style={x.style} initial={false} animate={{ width: `${x.w * 100}%` }} transition={springSnappy} />
      ))}
    </div>
  );
}

export default function ObiettiviPage({ onBack, open, backLabel }: PageProps) {
  const targets = useApp((s) => s.plan.targets);
  const week = useApp((s) => s.plan.week);
  const profile = useApp((s) => s.profile);
  const checkIns = useApp((s) => s.checkIns);
  const [editing, setEditing] = useState<{ type: DayType; n: number } | null>(null);
  const [recalc, setRecalc] = useState(0);
  const counts = Object.fromEntries(dayTypeCounts(week).map((c) => [c.type, c.count])) as Partial<Record<DayType, number>>;
  const eveNote = matchEveNote(week);
  const complete = isProfileComplete(profile);
  const weight = latestWeight({ checkIns, profile });

  return (
    <Page title="Obiettivi" subtitle="Calorie e macro di ogni tipo di giornata. Il menù adatta le porzioni a questi numeri." onBack={onBack} backLabel={backLabel}>
      {complete ? (
        <Card variant="highlight" padding="lg" className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px]" style={tileStyle('accent')}>
              <Calculator size={20} strokeWidth={2.2} />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="t-headline text-ink">Ricalcola dal profilo</h2>
              <p className="t-footnote text-ink-2">
                Mifflin-St Jeor con {ageFrom(profile.birthYear, currentDate())} anni, {fmtNumber(profile.heightCm)} cm e {fmtKg(weight)}; proteine 1,9 g per kg, grassi 28%.
              </p>
            </div>
          </div>
          <Button variant="secondary" icon={Wand2} onClick={() => setRecalc((n) => n + 1)}>
            Calcola e confronta
          </Button>
        </Card>
      ) : (
        <Callout tone="accent" title="Completa il profilo per ricalcolare" action={<Button variant="ghost" size="sm" iconRight={ArrowRight} onClick={() => open('profilo')}>Vai al profilo</Button>}>
          Servono anno di nascita, altezza e peso. Intanto puoi modificare i numeri a mano.
        </Callout>
      )}

      <section className="flex flex-col gap-2.5" aria-label="Obiettivi per tipo di giorno">
        {DAY_TYPES.map((t, i) => {
          const v = targets[t];
          return (
            <motion.div key={t} {...staggerItem(i, 0.04)}>
              <Card padding="md" onPress={() => setEditing({ type: t, n: Date.now() })} aria-label={`Modifica ${DAY_TYPE_LABEL[t]}: ${fmtNumber(v.kcal)} kcal`} className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <DayTypeBadge dayType={t} />
                    <span className="t-label text-[0.75rem] text-ink-2">{counts[t] ? plural(counts[t]!, 'giorno', 'giorni') : 'nessun giorno'}</span>
                  </div>
                  <ChevronRight size={18} strokeWidth={2.2} className="text-ink-3" aria-hidden />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <NumberTicker value={v.kcal} className="t-num text-[2.25rem] text-ink" />
                  <span className="t-mono text-[0.8125rem] text-ink-3">kcal</span>
                </div>
                <MacroBar t={v} tone={t} />
                <dl className="grid grid-cols-4 gap-2">
                  {[
                    ['Proteine', v.proteinG],
                    ['Carboidrati', v.carbG],
                    ['Grassi', v.fatG],
                    ['Fibre', v.fiberG],
                  ].map(([label, g], j) => (
                    <div key={label} className="flex flex-col gap-0.5">
                      <dt className="text-[0.6875rem] font-medium text-ink-3">{label}</dt>
                      <dd className="t-mono text-[0.875rem] text-ink" style={j === 0 ? { color: toneInk(t) } : undefined}>
                        {fmtNumber(g as number)} g
                      </dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </motion.div>
          );
        })}
        <p className="t-footnote px-1 text-pretty text-ink-3">
          {eveNote ? `${eveNote}: obiettivo e porzioni del calcio. ` : ''}La revisione della domenica può proporre di spostare le calorie: la variazione passa dai carboidrati, proteine e grassi restano fermi.
        </p>
      </section>

      {editing && <TargetSheet key={editing.n} type={editing.type} onClosed={() => setEditing(null)} />}
      {recalc > 0 && <RecalcSheet key={recalc} onClosed={() => setRecalc(0)} />}
    </Page>
  );
}

// ───────────────────────── Modifica di un tipo di giorno ─────────────────────────

function TargetSheet({ type, onClosed }: { type: DayType; onClosed: () => void }) {
  const saved = useApp((s) => s.plan.targets[type]);
  const [open, close] = useClosingSheet(onClosed);
  const [t, setT] = useState<MacroTarget>(saved);
  const set = (patch: Partial<MacroTarget>) => setT((x) => ({ ...x, ...patch }));
  const fromMacros = kcalFromMacros(t);
  const diff = fromMacros - t.kcal;
  const ok = Math.abs(diff) <= Math.max(40, t.kcal * 0.03);

  const save = () => {
    useApp.getState().setTarget(type, t);
    haptic('success');
    useUi.getState().toast(`${DAY_TYPE_LABEL[type]}: obiettivi salvati`, 'good');
    close();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={DAY_TYPE_LABEL[type]}
      subtitle="Obiettivi giornalieri di questo tipo di giorno."
      footer={
        <Button fullWidth size="lg" onClick={save}>
          Salva
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <ListGroup>
          <FormRow label="Calorie">
            <MiniStepper label="Calorie" value={t.kcal} min={1200} max={5000} step={50} unit="kcal" onChange={(kcal) => set({ kcal })} />
          </FormRow>
          <FormRow label="Proteine" hint={`${fmtNumber(t.proteinG * 4)} kcal`}>
            <MiniStepper label="Proteine" value={t.proteinG} min={40} max={300} step={5} unit="g" onChange={(proteinG) => set({ proteinG })} />
          </FormRow>
          <FormRow label="Carboidrati" hint={`${fmtNumber(t.carbG * 4)} kcal`}>
            <MiniStepper label="Carboidrati" value={t.carbG} min={0} max={800} step={5} unit="g" onChange={(carbG) => set({ carbG })} />
          </FormRow>
          <FormRow label="Grassi" hint={`${fmtNumber(t.fatG * 9)} kcal`}>
            <MiniStepper label="Grassi" value={t.fatG} min={20} max={250} step={5} unit="g" onChange={(fatG) => set({ fatG })} />
          </FormRow>
          <FormRow label="Fibre">
            <MiniStepper label="Fibre" value={t.fiberG} min={10} max={80} step={1} unit="g" onChange={(fiberG) => set({ fiberG })} />
          </FormRow>
        </ListGroup>

        <div
          className={cn('flex flex-col gap-2 rounded-[16px] p-4 transition-colors duration-200', ok ? 'bg-good-soft' : 'bg-warn-soft')}
          role="status"
          aria-live="polite"
        >
          <p className="t-callout text-ink">
            Dalle macro: <strong className="font-semibold">{fmtNumber(fromMacros)} kcal</strong>{' '}
            <span className={ok ? 'text-good-ink' : 'text-warn-ink'}>({fmtDelta(diff, 'kcal', 0)})</span>
          </p>
          <p className="t-footnote text-ink-2">
            {ok ? 'Calorie e macro tornano: proteine e carboidrati 4 kcal per grammo, grassi 9.' : 'Calorie e macro non tornano. Adatta i carboidrati per chiudere il conto senza toccare proteine e grassi.'}
          </p>
          {!ok && (
            <Button variant="secondary" size="sm" className="self-start" onClick={() => set({ carbG: carbsToMatch(t) })}>
              Adatta i carboidrati a {fmtNumber(carbsToMatch(t))} g
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

// ───────────────────────── Ricalcolo dal profilo ─────────────────────────

function RecalcSheet({ onClosed }: { onClosed: () => void }) {
  const profile = useApp((s) => s.profile);
  const checkIns = useApp((s) => s.checkIns);
  const current = useApp((s) => s.plan.targets);
  const [open, close] = useClosingSheet(onClosed);
  const weight = latestWeight({ checkIns, profile });
  const next = useMemo(() => computeTargets(profile, weight, currentDate()), [profile, weight]);
  const same = DAY_TYPES.every((t) => (['kcal', 'proteinG', 'carbG', 'fatG', 'fiberG'] as const).every((k) => next[t][k] === current[t][k]));

  const apply = () => {
    const before = JSON.parse(JSON.stringify(current)) as typeof current;
    useApp.getState().updatePlan({ targets: next });
    haptic('success');
    useUi.getState().toast('Obiettivi ricalcolati', 'good', {
      actionLabel: 'Annulla',
      onAction: () => useApp.getState().updatePlan({ targets: before }),
    });
    close();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Nuovi obiettivi"
      subtitle={`Con ${fmtKg(weight)}, ${fmtNumber(profile.heightCm)} cm e ${ageFrom(profile.birthYear, currentDate())} anni.`}
      footer={
        <Button fullWidth size="lg" onClick={apply} disabled={same}>
          {same ? 'Sono già questi' : 'Applica i nuovi obiettivi'}
        </Button>
      }
    >
      <div className="flex flex-col gap-3 pb-2">
        {DAY_TYPES.map((t) => {
          const a = current[t];
          const b = next[t];
          const d = b.kcal - a.kcal;
          return (
            <Card key={t} padding="md" className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <DayTypeBadge dayType={t} variant="dot" />
                {d !== 0 && (
                  <span className="t-mono text-[0.8125rem]" style={{ color: d > 0 ? 'var(--good-ink)' : 'var(--warn-ink)' }}>
                    {fmtDelta(d, 'kcal', 0)}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                {d !== 0 && (
                  <>
                    <span className="t-num text-[1.25rem] text-ink-3 line-through decoration-1">{fmtNumber(a.kcal)}</span>
                    <ArrowRight size={14} className="self-center text-ink-3" aria-hidden />
                  </>
                )}
                <span className="t-num text-[1.75rem] text-ink">{fmtNumber(b.kcal)}</span>
                <span className="t-mono text-[0.75rem] text-ink-3">kcal{d === 0 ? ', invariate' : ''}</span>
              </div>
              <span className="t-mono text-[0.75rem] text-ink-2">
                {(
                  [
                    ['P', 'proteinG'],
                    ['C', 'carbG'],
                    ['G', 'fatG'],
                    ['fibre', 'fiberG'],
                  ] as const
                ).map(([l, k], j) => (
                  <span key={k}>
                    {j > 0 && ' · '}
                    {l}{' '}
                    <span className={b[k] !== a[k] ? 'font-medium text-accent-ink' : undefined}>{fmtNumber(b[k])}</span>
                  </span>
                ))}
              </span>
            </Card>
          );
        })}
        <p className="t-footnote px-1 text-ink-3">Le modifiche fatte a mano su questi tipi di giorno verranno sostituite.</p>
      </div>
    </Sheet>
  );
}
