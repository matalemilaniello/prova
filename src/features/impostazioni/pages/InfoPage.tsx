/** Informazioni e privacy: versione, cosa resta sul telefono, avvertenze, crediti. */
import { useMemo } from 'react';
import { Archive, Camera, HardDrive, LayoutGrid, Lock, ServerOff, Sparkles, Stethoscope } from 'lucide-react';
import { navigate } from '../../../app/router';
import { APP_VERSION, BUILD_DATE, IS_PREVIEW } from '../../../app/env';
import { STORAGE_KEY } from '../../../data/defaults';
import { byteSize, fmtBytes } from '../../../lib/backup';
import { fromISO, isISODate } from '../../../engine/dates';
import { archiveInfo, safeStorage } from '../../../state/store';
import { Card, ListGroup, ListRow } from '../../../ui';
import { AppMark } from '../components/Pickers';
import { Page, type PageProps } from './Page';

/** '2026-10-31' → "31 ottobre 2026" */
function buildLabel(iso: string): string {
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(fromISO(iso));
}

export default function InfoPage({ onBack, backLabel }: PageProps) {
  const used = useMemo(() => {
    const raw = safeStorage.getItem(STORAGE_KEY);
    return typeof raw === 'string' ? byteSize(raw) : 0;
  }, []);

  return (
    <Page title="Informazioni" onBack={onBack} backLabel={backLabel}>
      <div className="flex flex-col items-center gap-3 pt-1 text-center">
        <AppMark size={88} className="rounded-[22px] shadow-[0_14px_40px_-14px_var(--accent-glow)]" />
        <div className="flex flex-col gap-1">
          <h2 className="t-title text-ink">Ritmo</h2>
          <p className="t-callout text-ink-2">La tua giornata, già decisa.</p>
          <p className="t-caption tabular text-ink-3">
            Versione {APP_VERSION}
            {isISODate(BUILD_DATE) ? ` · ${buildLabel(BUILD_DATE)}` : ''}
            {IS_PREVIEW ? ' · anteprima' : ''}
          </p>
        </div>
      </div>

      <ListGroup title="Privacy">
        <ListRow icon={Lock} iconTone="good" title="Tutto su questo telefono" subtitle="Diario, controlli, sedute e revisioni restano nel browser. Nessun account, nessuna pubblicità." />
        <ListRow icon={ServerOff} iconTone="palestra" title="Nessun server" subtitle="L’app funziona anche offline. Il codice è pubblico, i tuoi dati no." />
        <ListRow icon={Sparkles} iconTone="accent" title="Il coach" subtitle="Solo quando gli scrivi, messaggio e riassunto della giornata vanno ad Anthropic con la tua chiave." />
        <ListRow
          icon={Camera}
          iconTone="neutral"
          title="Foto dei piatti"
          subtitle="La foto va al coach solo per la lettura e non si salva: restano alimenti, grammi e valori; i piatti salvati tengono una miniatura."
        />
        {archiveInfo().status === 'illeggibile' && (
          <ListRow
            icon={Archive}
            iconTone="warn"
            title="Archivio non letto"
            subtitle="Miniature dei piatti e storico del piano non si sono letti: restano salvati come erano, l’app non li sovrascrive."
          />
        )}
        <ListRow icon={HardDrive} iconTone="neutral" title="Spazio usato" value={used ? fmtBytes(used) : '–'} />
      </ListGroup>

      <section className="flex flex-col gap-2" aria-labelledby="avvertenze-label">
        <h3 id="avvertenze-label" className="t-label px-1 text-ink-3">
          Avvertenze
        </h3>
        <Card padding="md" className="flex gap-3">
          <Stethoscope size={20} strokeWidth={2.2} className="mt-0.5 shrink-0 text-warn-ink" aria-hidden />
          <p className="t-footnote text-ink-2">
            Ritmo dà indicazioni generali di alimentazione, allenamento e sonno. Non sostituisce medico, nutrizionista o fisioterapista: con dolore che peggiora o
            sintomi importanti fermati e chiedi a chi ti segue. Le stime dei valori nutrizionali sono indicative.
          </p>
        </Card>
      </section>

      <ListGroup title="Crediti" footer="Caratteri Barlow Condensed, Figtree e IBM Plex Mono con licenza SIL Open Font License. Icone Lucide con licenza ISC.">
        <ListRow icon={LayoutGrid} iconTone="neutral" title="Catalogo dei componenti" subtitle="Il design system nei suoi stati" onPress={() => navigate('kit')} />
      </ListGroup>
    </Page>
  );
}
