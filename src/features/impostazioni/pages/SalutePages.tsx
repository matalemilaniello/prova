/** Salute: zone di dolore con soglia, esercizi del fisioterapista. */
import { Activity, Hand, ShieldCheck, TrendingDown } from 'lucide-react';
import PhysioEditor from '../../allenamento/PhysioEditor';
import { useApp } from '../../../state/store';
import { Card, ScaleSlider, toneInk, toneSoft, type AnyTone } from '../../../ui';
import { PainSitesPicker } from '../components/Pickers';
import { painLabel } from '../lib';
import { Page, type PageProps } from './Page';

const RULES: { icon: typeof Activity; tone: AnyTone; title: string; text: (t: number) => string }[] = [
  {
    icon: ShieldCheck,
    tone: 'good',
    title: 'Fino alla soglia',
    text: (t) => `Dolore fino a ${t} su 10 durante e dopo, e il giorno dopo non peggiora: il carico resta com’è.`,
  },
  {
    icon: TrendingDown,
    tone: 'warn',
    title: 'Sopra la soglia o in peggioramento',
    text: () => 'L’app propone di mantenere o ridurre il carico e di sentire il fisioterapista.',
  },
  {
    icon: Hand,
    tone: 'palestra',
    title: 'Gomito',
    text: () => 'Al posto delle spinte che danno fastidio suggerisce esercizi a presa neutra, con poco carico sugli estensori.',
  },
];

export function DolorePage({ onBack, backLabel }: PageProps) {
  const sites = useApp((s) => s.profile.painSites);
  const threshold = useApp((s) => s.plan.painThreshold);

  return (
    <Page title="Zone di dolore" subtitle="Le zone che segni ogni mattina da 0 a 10, nel controllo del mattino e a fine seduta." onBack={onBack} backLabel={backLabel}>
      <section className="flex flex-col gap-2.5" aria-labelledby="zone-imp">
        <h3 id="zone-imp" className="t-label px-1 text-ink-3">
          Zone da monitorare
        </h3>
        <PainSitesPicker value={sites} onChange={(painSites) => useApp.getState().updateProfile({ painSites })} />
        {!sites.length && <p className="t-footnote px-1 text-ink-3">Nessuna zona scelta: il controllo del mattino chiede solo sonno, peso ed energia.</p>}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="soglia-imp">
        <h3 id="soglia-imp" className="t-label px-1 text-ink-3">
          Soglia
        </h3>
        <Card padding="lg" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="t-callout font-medium text-ink">Oltre questo valore l’app frena il carico</span>
          </div>
          <ScaleSlider
            label="Soglia del dolore"
            hideLabel
            value={threshold}
            onChange={(painThreshold) => useApp.getState().updatePlan({ painThreshold })}
            scheme="pain"
            min={0}
            max={10}
            describe={painLabel}
            lowLabel="Nessun dolore"
            highLabel="Il peggiore"
          />
        </Card>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="regola-imp">
        <h3 id="regola-imp" className="t-label px-1 text-ink-3">
          Come funziona
        </h3>
        <Card padding="none" as="section">
          <ul className="flex flex-col">
            {RULES.map((r, i) => (
              <li key={r.title} className={i > 0 ? 'relative flex gap-3 px-4 py-3.5 before:absolute before:left-[58px] before:right-0 before:top-0 before:h-px before:bg-line' : 'flex gap-3 px-4 py-3.5'}>
                <span aria-hidden className="grid size-[30px] shrink-0 place-items-center rounded-[9px]" style={{ background: toneSoft(r.tone, 18), color: toneInk(r.tone) }}>
                  <r.icon size={17} strokeWidth={2.2} />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="t-callout font-semibold text-ink">{r.title}</span>
                  <span className="t-footnote text-ink-2">{r.text(threshold)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <p className="t-footnote px-1 text-ink-3">Regola ispirata al modello di monitoraggio del dolore di Silbernagel per i tendini. Non è una diagnosi: con dolore che peggiora, fermati e chiedi a chi ti segue.</p>
      </section>
    </Page>
  );
}

export function FisioPage({ onBack, backLabel }: PageProps) {
  return (
    <Page title="Fisioterapista" subtitle="Gli esercizi che ti ha dato, con dosi e giorni. Li trovi nella giornata e in fondo alle sedute." onBack={onBack} backLabel={backLabel}>
      <PhysioEditor />
    </Page>
  );
}
