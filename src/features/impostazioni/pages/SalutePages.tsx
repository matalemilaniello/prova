/** Salute: zone di dolore con soglia, esercizi del fisioterapista. */
import { Activity, ClipboardCheck, Footprints, Hand, ShieldCheck, TrendingDown } from 'lucide-react';
import { IMPACT_PAIN_THRESHOLD } from '../../../engine/training';
import PhysioEditor from '../../allenamento/PhysioEditor';
import { useApp } from '../../../state/store';
import { Card, Disclosure, Field, ScaleSlider, TextInput, type AnyTone } from '../../../ui';
import { testGesture } from '../../oggi/painTests';
import { tileStyle } from '../components/controls';
import { PainSitesPicker } from '../components/Pickers';
import { elbowSites, lowerLegSites, painLabel, sitesInText } from '../lib';
import { Page, type PageProps } from './Page';

interface Rule {
  icon: typeof Activity;
  tone: AnyTone;
  title: string;
  text: string;
}

/**
 * La regola del dolore, punto per punto, con la soglia scelta. I punti sotto il ginocchio e al gomito compaiono solo
 * se tra le zone del profilo ce n'è una di quel tipo: si spiega quello che vale per te.
 */
function painRules(sites: readonly string[], t: number): Rule[] {
  const rules: Rule[] = [
    {
      icon: ShieldCheck,
      tone: 'good',
      title: 'Fino alla soglia',
      text: `Dolore fino a ${t} su 10 durante e dopo, e il giorno dopo non peggiora: il carico resta com’è.`,
    },
    {
      icon: TrendingDown,
      tone: 'warn',
      title: 'Sopra la soglia o in peggioramento',
      text: `Carichi dell’ultima volta, senza aumenti. Oltre ${Math.max(5, t + 2)} su 10 i carichi scendono del 10% e l’app ti chiede di scrivere al fisioterapista.`,
    },
    {
      icon: ClipboardCheck,
      tone: 'riposo',
      title: 'A fine seduta e il giorno dopo',
      text: `Il dolore che segni a fine seduta, se supera ${t}, frena la seduta successiva. Se il mattino dopo una seduta o una partita il dolore sale rispetto al giorno prima, niente aumenti.`,
    },
  ];
  const lower = lowerLegSites(sites);
  const impact = Math.min(t, IMPACT_PAIN_THRESHOLD);
  if (lower.length && impact < t) {
    const tibia = lower.some((s) => /tibi|stinc/i.test(s));
    rules.push({
      icon: Footprints,
      tone: 'leggero',
      title: 'Sotto il ginocchio',
      text: `Per ${sitesInText(lower)} balzi, salti e partita si fermano già sopra ${impact} su 10: gli impatti caricano molto queste zone${tibia ? ', e lungo la tibia il dolore può venire dall’osso, che chiede più prudenza di un tendine' : ''}.`,
    });
  }
  if (elbowSites(sites).length) {
    rules.push({
      icon: Hand,
      tone: 'palestra',
      title: 'Gomito',
      text: 'Al posto delle spinte che danno fastidio propone esercizi a presa neutra, con poco carico sugli estensori del polso.',
    });
  }
  return rules;
}

/**
 * Gesto di prova per zona: ogni mattina lo stesso, così il numero si confronta. Di base quello standard della zona;
 * se il fisioterapista ne ha indicato un altro, si scrive qui e lo usano il controllo del mattino e gli avvisi.
 */
function PainTestsEditor({ sites }: { sites: readonly string[] }) {
  const tests = useApp((s) => s.profile.painTests);
  const own = sites.filter((site) => tests?.[site]?.trim()).length;
  const setTest = (site: string, text: string) => {
    const next: Record<string, string> = { ...(useApp.getState().profile.painTests ?? {}) };
    if (text.trim()) next[site] = text;
    else delete next[site];
    useApp.getState().updateProfile({ painTests: Object.keys(next).length ? next : undefined });
  };
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-1">
        <Disclosure title="Gesto di prova" summary={own ? `${own} dal fisioterapista` : 'Standard'}>
          <div className="flex flex-col gap-4 pb-3">
            <p className="t-footnote text-ink-2">
              Ogni mattina rifai lo stesso gesto e segna il dolore che senti: così i numeri si confrontano. Se il fisioterapista te ne ha indicato un altro, scrivilo al posto di quello proposto in grigio.
            </p>
            {sites.map((site) => (
              <Field key={site} label={site}>
                <TextInput
                  value={tests?.[site] ?? ''}
                  onChange={(v) => setTest(site, v)}
                  placeholder={testGesture(site)}
                  maxLength={120}
                  enterKeyHint="done"
                />
              </Field>
            ))}
          </div>
        </Disclosure>
      </div>
    </Card>
  );
}

export function DolorePage({ onBack, backLabel }: PageProps) {
  const sites = useApp((s) => s.profile.painSites);
  const threshold = useApp((s) => s.plan.painThreshold);
  const rules = painRules(sites, threshold);

  return (
    <Page title="Zone di dolore" subtitle="Le segni da 0 a 10 nel controllo del mattino e a fine seduta." onBack={onBack} backLabel={backLabel}>
      <section className="flex flex-col gap-2.5" aria-labelledby="zone-imp">
        <h3 id="zone-imp" className="t-label px-1 text-ink-3">
          Zone da monitorare
        </h3>
        <PainSitesPicker value={sites} onChange={(painSites) => useApp.getState().updateProfile({ painSites })} />
        {!sites.length && <p className="t-footnote px-1 text-ink-3">Nessuna zona scelta: il controllo del mattino chiede solo sonno, peso ed energia.</p>}
        {sites.length > 0 && <PainTestsEditor sites={sites} />}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="soglia-imp">
        <h3 id="soglia-imp" className="t-label px-1 text-ink-3">
          Soglia
        </h3>
        <Card padding="none" className="overflow-hidden">
          <div className="flex flex-col gap-3 px-5 pb-4 pt-5">
            <span className="t-callout font-medium text-ink">Oltre questo valore l’app frena il carico</span>
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
          </div>
          {/* La regola punto per punto, dietro un tocco. */}
          <div className="border-t border-line px-5 py-1">
            <Disclosure title="Come frena il carico" summary={`${rules.length} regole`}>
              <ul className="flex flex-col gap-3.5 pb-1">
                {rules.map((r) => (
                  <li key={r.title} className="flex gap-3">
                    <span aria-hidden className="grid size-[30px] shrink-0 place-items-center rounded-[9px]" style={tileStyle(r.tone)}>
                      <r.icon size={17} strokeWidth={2.2} />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="t-callout font-semibold text-ink">{r.title}</span>
                      <span className="t-footnote text-ink-2">{r.text}</span>
                    </span>
                  </li>
                ))}
                <li className="t-footnote text-ink-3">
                  Regola ispirata al modello di monitoraggio del dolore di Silbernagel per i tendini, più prudente negli impatti sotto il ginocchio. Non è una diagnosi: con dolore che peggiora, fermati e chiedi a chi ti segue.
                </li>
              </ul>
            </Disclosure>
          </div>
        </Card>
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
