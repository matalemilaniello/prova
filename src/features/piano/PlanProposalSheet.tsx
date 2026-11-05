/**
 * Foglio della proposta del piano (`planProposal`, docs/FASE2.md § 11.3): un solo foglio per blocchi, menù, obiettivi
 * e ritorni a una versione.
 *
 * In alto titolo e sottotitolo della proposta (per un menù con la spesa già cominciata, anche «Dopo la spesa: servono 3
 * prodotti in più», calcolato con le spunte di adesso); «Cosa cambia» con le prime 5 differenze (icona dell'area, etichetta,
 * «prima → dopo») e le altre dietro «Tutte le differenze (12)»; «Perché» con i motivi del motore; gli avvisi in un
 * `Callout`; il passaggio del coach (in corso, ritocchi accettati e non accettati, errore). Piede: «Approva», «Tieni il
 * piano attuale» e, per blocchi e menù con un generatore, «Un’altra proposta».
 *
 * All'apertura una proposta superata (base cambiata, giorno passato) si ricalcola e il foglio dice «Aggiornata con le
 * ultime modifiche». Approvata, scartata o superata senza ricalcolo: il foglio la mostra in sola lettura.
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Dumbbell, Flame, Gauge, ListChecks, RefreshCw, ShoppingCart, Sparkles, Target, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import type { DiffItem, PlanProposal } from '../../domain/types';
import { editLabel, topDiff, sortDiff } from '../../engine/plan/diff';
import { usePlanDay } from '../../state/hooks';
import { COACH_INTERRUPTED, useApp } from '../../state/store';
import { Button, Callout, Card, Disclosure, EmptyState, keepHyphens, ListGroup, ListRow, Sheet, Spinner, type AnyTone } from '../../ui';
// I due moduli registrano da sé i generatori (menù; blocco e obiettivi): il foglio ricalcola una proposta superata e dà
// «Un’altra proposta» anche quando lo si apre dalla revisione o dallo storico, prima di Settimana e Allenamento.
import '../allenamento/blocks';
import { afterShoppingText, menuProposalView } from '../settimana/useMenuProposal';
import { anotherProposal, approveProposal, canAskAnother, diffOptionsOf, keepCurrentPlan, refreshProposal, startLabel } from './actions';
import { useProposal } from './useProposals';

/** Differenze in vista prima di «Tutte le differenze». */
export const DIFF_SHOWN = 5;

const AREA_ICON: Record<DiffItem['area'], { icon: LucideIcon; tone: AnyTone }> = {
  pasto: { icon: UtensilsCrossed, tone: 'good' },
  spesa: { icon: ShoppingCart, tone: 'neutral' },
  seduta: { icon: Dumbbell, tone: 'palestra' },
  esercizio: { icon: ListChecks, tone: 'palestra' },
  settimana: { icon: CalendarDays, tone: 'riposo' },
  carico: { icon: Gauge, tone: 'palestra' },
  obiettivo: { icon: Target, tone: 'accent' },
  calorie: { icon: Flame, tone: 'calcio' },
};

/** «prima → dopo»; con un solo valore, quello (il testo dice già «nuovo» o «tolto»). */
export function beforeAfter(d: Pick<DiffItem, 'before' | 'after'>): string {
  if (d.before && d.after) return `${d.before} → ${d.after}`;
  return d.after ?? d.before ?? '';
}

function DiffRow({ d }: { d: DiffItem }) {
  const { icon, tone } = AREA_ICON[d.area] ?? AREA_ICON.settimana;
  const text = beforeAfter(d);
  return <ListRow icon={icon} iconTone={tone} title={d.label} subtitle={text ? keepHyphens(text) : undefined} />;
}

function DiffList({ items }: { items: DiffItem[] }) {
  const sorted = useMemo(() => sortDiff(items), [items]);
  if (!sorted.length) {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="t-label px-1 text-ink-3">Cosa cambia</h3>
        <Card padding="md">
          <p className="t-callout text-ink-2">Nessuna differenza con il piano di oggi.</p>
        </Card>
      </section>
    );
  }
  const shown = topDiff(sorted, DIFF_SHOWN);
  const rest = sorted.slice(shown.length);
  return (
    <div className="flex flex-col gap-3">
      <ListGroup title="Cosa cambia">
        {shown.map((d, i) => (
          <DiffRow key={`${d.label}-${i}`} d={d} />
        ))}
      </ListGroup>
      {rest.length > 0 && (
        <Card padding="none" className="px-4">
          <Disclosure title={`Tutte le differenze (${sorted.length})`} contentClassName="-mx-4 pb-1">
            <div className="flex flex-col">
              {rest.map((d, i) => (
                <div key={`${d.label}-${i}`} className="relative before:absolute before:left-4 before:right-0 before:top-0 before:h-px before:bg-line">
                  <DiffRow d={d} />
                </div>
              ))}
            </div>
          </Disclosure>
        </Card>
      )}
    </div>
  );
}

function CoachSection({ p }: { p: PlanProposal }) {
  const physio = useApp((s) => s.physio);
  const plan = useApp((s) => s.plan);
  const opts = useMemo(() => diffOptionsOf({ plan, physio }), [plan, physio]);
  const c = p.coach;
  if (!c) return null;
  if (c.status === 'in-corso') {
    return (
      <Card padding="md" className="flex items-center gap-3">
        <Spinner size={18} className="text-accent-ink" label="Il coach sta rifinendo la proposta" />
        <p className="t-callout text-ink-2">Il coach sta rifinendo la proposta</p>
      </Card>
    );
  }
  if (c.status === 'errore') {
    return (
      <Card padding="md">
        <p className="t-callout text-ink-2">{c.message || COACH_INTERRUPTED}</p>
      </Card>
    );
  }
  const total = c.applied.length + c.rejected.length;
  if (!total) {
    return (
      <Card padding="md" className="flex gap-3">
        <Sparkles size={18} strokeWidth={2.2} className="mt-0.5 shrink-0 text-accent-ink" aria-hidden />
        <p className="t-callout text-ink-2">{c.summary || 'Il coach ha controllato la proposta: nessun ritocco.'}</p>
      </Card>
    );
  }
  return (
    <Card padding="none" className="px-4">
      <Disclosure title={`Ritocchi del coach (${c.applied.length})`} icon={Sparkles} contentClassName="flex flex-col gap-3 pb-4 pt-1">
        {c.summary && <p className="t-callout text-ink-2">{c.summary}</p>}
        {c.applied.length > 0 && (
          <ul className="flex flex-col gap-2">
            {c.applied.map((e, i) => (
              <li key={i} className="flex flex-col">
                <span className="t-callout text-ink">{keepHyphens(editLabel(e, opts))}</span>
                {'reason' in e && e.reason && <span className="t-footnote text-ink-2">{e.reason}</span>}
              </li>
            ))}
          </ul>
        )}
        {c.rejected.length > 0 && (
          <Disclosure variant="inline" tone="quiet" title={`Non accettati (${c.rejected.length})`}>
            <ul className="flex flex-col gap-2">
              {c.rejected.map((r, i) => (
                <li key={i} className="flex flex-col">
                  <span className="t-footnote text-ink">{keepHyphens(editLabel(r.edit, opts))}</span>
                  <span className="t-footnote text-ink-3">{r.reason}</span>
                </li>
              ))}
            </ul>
          </Disclosure>
        )}
      </Disclosure>
    </Card>
  );
}

function DecidedNote({ p, today }: { p: PlanProposal; today: string }) {
  if (p.status === 'approvata') {
    return (
      <Callout tone="good" title="Approvata">
        Vale {startLabel(p.effectiveFrom, today)}.
      </Callout>
    );
  }
  if (p.status === 'scartata') return <Callout tone="neutral">Hai tenuto il piano attuale.</Callout>;
  if (p.status === 'superata') return <Callout tone="neutral">Il piano è cambiato dopo questa proposta: non vale più.</Callout>;
  return null;
}

/**
 * Sottotitolo di una proposta di menù aperta con la spesa di quel lunedì già cominciata (§ 5.3): «Dopo la spesa: servono 3
 * prodotti in più». Si calcola a ogni spunta: le spunte arrivano dopo la nascita della proposta, il sottotitolo salvato non
 * le conosce. Null per gli altri tipi, per le proposte decise e senza spunte.
 */
function useAfterShopping(p: PlanProposal | undefined): string | null {
  const open = p?.kind === 'menu' && p.status === 'aperta';
  const monday = p?.effectiveFrom ?? '';
  const plan = useApp((s) => s.plan);
  const profile = useApp((s) => s.profile);
  const physio = useApp((s) => s.physio);
  const planner = useApp((s) => s.planner);
  const dayLogs = useApp((s) => s.dayLogs);
  const checkIns = useApp((s) => s.checkIns);
  const reviews = useApp((s) => s.reviews);
  const checked = useApp((s) => s.shoppingChecked[monday]);
  return useMemo(() => {
    if (!p || !open || !checked?.length) return null;
    const v = menuProposalView({ plan, profile, physio, planner, dayLogs, checkIns, reviews, shoppingChecked: { [monday]: checked } }, p);
    return v.shopped ? afterShoppingText(v.extra) : null;
  }, [p, open, monday, plan, profile, physio, planner, dayLogs, checkIns, reviews, checked]);
}

export default function PlanProposalSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const today = usePlanDay();
  const [currentId, setCurrentId] = useState(id);
  const [refreshed, setRefreshed] = useState(false);
  const p = useProposal(currentId);
  const afterShopping = useAfterShopping(p);

  // All'apertura (e se cambia la giornata) una proposta superata si ricalcola.
  useEffect(() => {
    const r = refreshProposal(currentId, today);
    if (r && r.id !== currentId) {
      setCurrentId(r.id);
      setRefreshed(r.refreshed);
    }
  }, [currentId, today]);

  if (!p) {
    return (
      <Sheet open onClose={onClose} title="Proposta del piano">
        <EmptyState compact icon={CalendarDays} title="Nessuna proposta da vedere" text="Quando il piano può cambiare, la proposta arriva qui con le differenze." />
      </Sheet>
    );
  }

  const open = p.status === 'aperta';
  const another = open && canAskAnother(p);

  const approve = () => {
    const out = approveProposal(p.id, today);
    if (out.status === 'approvata') onClose();
    else if (out.status === 'superata' && out.id !== p.id) {
      setCurrentId(out.id);
      setRefreshed(true);
    }
  };
  const keep = () => {
    keepCurrentPlan(p.id);
    onClose();
  };
  const askAnother = () => {
    const next = anotherProposal(p.id, today);
    if (next) {
      setCurrentId(next);
      setRefreshed(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      size="large"
      title={p.title}
      subtitle={afterShopping ? `${p.subtitle ? `${p.subtitle} · ` : ''}${afterShopping}` : p.subtitle}
      footer={
        open ? (
          <div className="flex flex-col gap-2">
            <Button fullWidth size="lg" icon={Check} onClick={approve}>
              Approva
            </Button>
            <Button fullWidth variant="secondary" onClick={keep}>
              Tieni il piano attuale
            </Button>
            {another && (
              <Button fullWidth variant="ghost" icon={RefreshCw} onClick={askAnother}>
                Un’altra proposta
              </Button>
            )}
          </div>
        ) : (
          <Button fullWidth variant="secondary" onClick={onClose}>
            Chiudi
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-6 pb-2">
        {refreshed && open && (
          <Callout tone="accent" icon={RefreshCw}>
            Aggiornata con le ultime modifiche.
          </Callout>
        )}
        <DecidedNote p={p} today={today} />
        {p.warnings && p.warnings.length > 0 && (
          <Callout tone="warn">
            {p.warnings.length === 1 ? (
              p.warnings[0]
            ) : (
              <ul className="flex list-disc flex-col gap-1 pl-4">
                {p.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </Callout>
        )}
        <DiffList items={p.diff} />
        {p.reasons.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="t-label px-1 text-ink-3">Perché</h3>
            <Card padding="md" className="flex flex-col gap-1.5">
              {p.reasons.slice(0, 3).map((r, i) => (
                <p key={i} className="t-callout text-ink-2">
                  {keepHyphens(r)}
                </p>
              ))}
            </Card>
          </section>
        )}
        <CoachSection p={p} />
      </div>
    </Sheet>
  );
}
