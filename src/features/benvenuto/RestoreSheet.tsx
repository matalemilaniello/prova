/**
 * Ripristino di un backup dal benvenuto: telefono nuovo, app reinstallata, oppure il passaggio da Safari
 * all'app installata sulla schermata Home (su iPhone non condividono i dati: si copia il backup in Safari
 * e lo si incolla qui).
 */
import { useRef, useState } from 'react';
import { ClipboardPaste, FileUp, Upload } from 'lucide-react';
import { navigate } from '../../app/router';
import { parseBackup, readFileText, type BackupSummary } from '../../lib/backup';
import { fmtDateLong } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { normalizeData, useApp, useUi } from '../../state/store';
import { Button, Callout, Sheet, TextArea } from '../../ui';
import { useSessionDraft } from '../allenamento/draft';
import { StatGrid } from '../impostazioni/components/BackupStats';
import { InlineReveal } from '../impostazioni/components/controls';
import { useClosingSheet } from '../impostazioni/components/SupplementEditor';
import { clearDraft } from './draft';

interface Ready {
  data: Record<string, unknown>;
  summary: BackupSummary;
  exportedAt?: string;
}

export function RestoreSheet({ onClosed }: { onClosed: () => void }) {
  const [open, close] = useClosingSheet(onClosed);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const check = (raw: string) => {
    const res = parseBackup(raw);
    if (!res.ok) {
      setError(res.error);
      haptic('error');
      return;
    }
    if (!res.summary.onboarded) {
      setError('In questo backup il benvenuto non era ancora finito: non c’è un piano da ripristinare. Comincia da capo con Inizia.');
      haptic('error');
      return;
    }
    try {
      normalizeData(res.data);
    } catch {
      setError('Il backup è danneggiato e non si riesce a leggere. Prova con un backup precedente.');
      haptic('error');
      return;
    }
    setError(null);
    setReady({ data: res.data, summary: res.summary, exportedAt: res.exportedAt });
    haptic('success');
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      check(await readFileText(file));
    } catch {
      setError('Non riesco a leggere il file. Riprova, oppure aprilo e incolla il testo qui.');
    }
  };

  const restore = () => {
    if (!ready) return;
    if (!useApp.getState().importData(ready.data)) {
      setError('Questo non è un backup di Ritmo. Controlla di aver scelto il file giusto.');
      return;
    }
    clearDraft();
    useSessionDraft.getState().clear();
    haptic('success');
    navigate('oggi');
    useUi.getState().toast('Backup ripristinato: bentornato', 'good');
  };

  const day = ready?.exportedAt ? fmtDateLong(ready.exportedAt.slice(0, 10)) : null;

  return (
    <Sheet
      open={open}
      onClose={close}
      title={ready ? 'Ripristinare questo backup?' : 'Ripristina un backup'}
      subtitle={
        ready
          ? `${day ? `Esportato ${day}` : 'Backup di Ritmo'}${ready.summary.name ? `, profilo di ${ready.summary.name}` : ''}.`
          : 'Scegli il file di backup oppure incolla il testo copiato da Backup ed esportazione.'
      }
      footer={
        ready ? (
          <div className="flex flex-col gap-2">
            <Button fullWidth size="lg" icon={Upload} onClick={restore}>
              Ripristina e apri Ritmo
            </Button>
            <Button fullWidth variant="ghost" onClick={() => setReady(null)}>
              Scegli un altro backup
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3 pb-2">
        {ready ? (
          <StatGrid s={ready.summary} />
        ) : (
          <>
            <div className="flex gap-2.5">
              <Button variant="secondary" className="flex-1" icon={FileUp} onClick={() => fileRef.current?.click()}>
                Scegli un file
              </Button>
              <Button variant="secondary" className="flex-1" icon={ClipboardPaste} onClick={() => (setPasting((v) => !v), setError(null))}>
                Incolla
              </Button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json,text/plain"
              className="hidden"
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <InlineReveal open={pasting}>
              <div className="flex flex-col gap-2.5 pt-1">
                <TextArea
                  value={pasted}
                  onChange={(v) => {
                    setPasted(v);
                    if (error) setError(null);
                  }}
                  rows={6}
                  placeholder="Incolla qui il backup"
                  aria-label="Testo del backup"
                  className="font-mono text-[0.8125rem]"
                  invalid={Boolean(error)}
                />
                <Button icon={Upload} disabled={!pasted.trim()} onClick={() => check(pasted)}>
                  Controlla il backup
                </Button>
              </div>
            </InlineReveal>
          </>
        )}
        {error && (
          <Callout tone="bad" title="Backup non valido">
            {error}
          </Callout>
        )}
      </div>
    </Sheet>
  );
}
