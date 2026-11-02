/**
 * Storico del piano (docs/FASE2.md § 5.5): versioni di blocchi, obiettivi e ritorni, più i menù approvati, per mese e dal
 * più recente, con quella in vigore segnata. Si apre da Impostazioni › Obiettivi («Storico del piano») e da
 * Allenamento («Blocchi precedenti»): le props sono quelle delle sotto-pagine delle impostazioni (`onBack`,
 * `backLabel`).
 *
 * Un tocco apre un foglio con le differenze rispetto al piano di oggi e «Torna a questa versione» (per un menù «Usalo
 * la prossima settimana»): nasce una proposta che si approva come le altre, nel foglio della proposta. Lo storico si
 * accoda e non si riscrive; una versione già in vigore non ha differenze e non offre il ritorno.
 */
import { useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { CalendarDays, History, RotateCcw, Target, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import type { DiffItem, PlanVersion } from '../../domain/types';
import { usePlanDay } from '../../state/hooks';
import { useApp } from '../../state/store';
import { Button, Card, EmptyState, ListGroup, ListRow, Pill, Sheet, keepHyphens, type AnyTone } from '../../ui';
import { Page } from '../impostazioni/pages/Page';
import { historyDiff, restoreVersion, reuseMenu, type HistoryEntry, type HistoryStatus } from './actions';
import { beforeAfter, DIFF_SHOWN } from './PlanProposalSheet';
import { usePlanHistory } from './useProposals';

const KIND_ICON: Record<PlanVersion['kind'] | 'menu', { icon: LucideIcon; tone: AnyTone }> = {
  blocco: { icon: CalendarDays, tone: 'palestra' },
  obiettivi: { icon: Target, tone: 'accent' },
  ritorno: { icon: RotateCcw, tone: 'riposo' },
  menu: { icon: UtensilsCrossed, tone: 'good' },
};

const STATUS_PILL: Partial<Record<HistoryStatus, { label: string; tone: AnyTone }>> = {
  'in-vigore': { label: 'In vigore', tone: 'good' },
  'in-arrivo': { label: 'In arrivo', tone: 'accent' },
};

function iconOf(e: HistoryEntry) {
  return KIND_ICON[e.version?.kind ?? 'menu'];
}

/** Gruppi per mese, nell'ordine dello storico (dal più recente). */
function byMonth(entries: HistoryEntry[]): { month: string; items: HistoryEntry[] }[] {
  const out: { month: string; items: HistoryEntry[] }[] = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (last && last.month === e.month) last.items.push(e);
    else out.push({ month: e.month, items: [e] });
  }
  return out;
}

function EntrySheet({ entry, today, onClose }: { entry: HistoryEntry; today: string; onClose: () => void }) {
  const plan = useApp((s) => s.plan);
  const profile = useApp((s) => s.profile);
  const physio = useApp((s) => s.physio);
  const reviews = useApp((s) => s.reviews);
  const planner = useApp((s) => s.planner);
  const diff = useMemo<DiffItem[]>(
    () => historyDiff(entry, { plan, profile, physio, reviews, planner }, today),
    [entry, plan, profile, physio, reviews, planner, today],
  );
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? diff : diff.slice(0, DIFF_SHOWN);
  const isMenu = entry.kind === 'menu';

  const act = () => {
    const res = isMenu ? reuseMenu(entry.monday ?? '', today) : restoreVersion(entry.version?.id ?? '', today);
    if (res) onClose();
  };

  const canAct = diff.length > 0;
  return (
    <Sheet
      open
      onClose={onClose}
      title={entry.title}
      subtitle={entry.subtitle}
      footer={
        canAct ? (
          <Button fullWidth size="lg" icon={isMenu ? UtensilsCrossed : RotateCcw} onClick={act}>
            {isMenu ? 'Usalo la prossima settimana' : 'Torna a questa versione'}
          </Button>
        ) : (
          <Button fullWidth variant="secondary" onClick={onClose}>
            Chiudi
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {canAct ? (
          <>
            <ListGroup
              title={isMenu ? 'Rispetto alla prossima settimana' : 'Rispetto al piano di oggi'}
              footer={isMenu ? 'Diventa una proposta per la settimana dopo: la approvi come le altre.' : 'Tornano solo le parti che questa versione aveva cambiato. Diventa una proposta da domani: la approvi come le altre.'}
            >
              {shown.map((d, i) => {
                const text = beforeAfter(d);
                return <ListRow key={`${d.label}-${i}`} title={d.label} subtitle={text ? keepHyphens(text) : undefined} />;
              })}
            </ListGroup>
            {diff.length > shown.length && (
              <Button variant="ghost" size="sm" className="self-center" onClick={() => setShowAll(true)}>
                {`Tutte le differenze (${diff.length})`}
              </Button>
            )}
          </>
        ) : (
          <Card padding="md">
            <p className="t-callout text-ink-2">{isMenu ? 'La prossima settimana ha già questo menù.' : 'Il piano di oggi è già così: questa versione è in vigore.'}</p>
          </Card>
        )}
      </div>
    </Sheet>
  );
}

export interface StoricoPageProps {
  onBack: () => void;
  /** Etichetta del pulsante indietro (la pagina da cui si arriva). */
  backLabel: string;
}

export default function StoricoPage({ onBack, backLabel }: StoricoPageProps) {
  const today = usePlanDay();
  const entries = usePlanHistory(today);
  const groups = useMemo(() => byMonth(entries), [entries]);
  const [selected, setSelected] = useState<HistoryEntry | null>(null);

  return (
    <Page title="Storico del piano" onBack={onBack} backLabel={backLabel}>
      {groups.length === 0 ? (
        <EmptyState
          icon={History}
          title="Ancora nessuna versione"
          text="Quando approvi un blocco, degli obiettivi o un menù, qui trovi la versione e puoi tornarci."
        />
      ) : (
        groups.map((g) => (
          <ListGroup key={g.month} title={g.month}>
            {g.items.map((e) => {
              const { icon, tone } = iconOf(e);
              const pill = STATUS_PILL[e.status];
              return (
                <ListRow
                  key={e.key}
                  icon={icon}
                  iconTone={tone}
                  title={e.title}
                  subtitle={e.subtitle}
                  trailing={
                    pill ? (
                      <Pill tone={pill.tone} size="sm">
                        {pill.label}
                      </Pill>
                    ) : undefined
                  }
                  onPress={() => setSelected(e)}
                />
              );
            })}
          </ListGroup>
        ))
      )}
      <AnimatePresence>{selected && <EntrySheet key={selected.key} entry={selected} today={today} onClose={() => setSelected(null)} />}</AnimatePresence>
    </Page>
  );
}
