/**
 * Backup: esporta in JSON (download, condivisione o appunti) e importa da file o testo incollato,
 * con validazione e anteprima prima di sostituire i dati.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardPaste, Copy, Download, FileUp, HardDrive, Share, ShieldAlert, ShieldCheck, Upload } from 'lucide-react';
import { APP_VERSION, IS_PREVIEW, getStoragePersistence, requestPersistentStorage, type StoragePersistence } from '../../../app/env';
import { todayISO } from '../../../engine/dates';
import {
  backupFileName,
  byteSize,
  canShareFiles,
  copyText,
  createBackup,
  downloadText,
  fmtBytes,
  getLastBackupAt,
  parseBackup,
  readFileText,
  serializeBackup,
  setLastBackupAt,
  shareText,
  summarizeData,
  type BackupSummary,
} from '../../../lib/backup';
import { fmtDateLong, fmtDateShort, fmtNumber } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { normalizeData, pickData, storageFull, useApp, useUi } from '../../../state/store';
import { useSessionDraft } from '../../allenamento/draft';
import { Button, Callout, Card, Pill, Sheet, TextArea, Toggle } from '../../../ui';
import { StatGrid } from '../components/BackupStats';
import { FormRow, InlineReveal } from '../components/controls';
import { useClosingSheet } from '../components/SupplementEditor';
import { ManualCopySheet } from './PromemoriaPage';
import { Page, type PageProps } from './Page';

const MIME = 'application/json';

const isoDay = (iso: string) => iso.slice(0, 10);

export default function BackupPage({ onBack, backLabel }: PageProps) {
  const state = useApp();
  const toast = useUi((s) => s.toast);
  const data = useMemo(() => pickData(state), [state]);
  const hasKey = Boolean(state.settings.coachApiKey);
  const [withKey, setWithKey] = useState(false);
  const [lastAt, setLastAt] = useState(getLastBackupAt);
  const [manual, setManual] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ data: Record<string, unknown>; summary: BackupSummary; exportedAt?: string; n: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const shareable = useMemo(() => !IS_PREVIEW && canShareFiles(), []);
  // Il browser può cancellare da solo i dati di un sito quando manca spazio, se non sono protetti.
  const [persist, setPersist] = useState<StoragePersistence>(getStoragePersistence);
  useEffect(() => {
    let alive = true;
    void requestPersistentStorage().then((p) => alive && setPersist(p));
    return () => {
      alive = false;
    };
  }, []);
  const full = storageFull();

  const summary = summarizeData(data);
  const text = useMemo(() => serializeBackup(createBackup(data, { includeCoachKey: withKey && hasKey, appVersion: APP_VERSION })), [data, withKey, hasKey]);
  const size = byteSize(text);
  const today = todayISO();

  const done = () => {
    const now = new Date().toISOString();
    setLastBackupAt(now);
    setLastAt(now);
  };

  const copy = async () => {
    if (await copyText(text)) {
      haptic('success');
      done();
      toast('Backup copiato negli appunti: incollalo in una nota o in un file', 'good');
    } else setManual(text);
  };

  const download = async () => {
    if (IS_PREVIEW) return copy();
    if (downloadText(backupFileName(today), text, MIME)) {
      haptic('success');
      done();
      toast('Backup scaricato', 'good');
    } else await copy();
  };

  const share = async () => {
    const res = await shareText(backupFileName(today), text, MIME, 'Backup di Ritmo');
    if (res === 'condiviso') done();
    else if (res === 'non-disponibile') await download();
  };

  const check = (raw: string) => {
    const res = parseBackup(raw);
    if (!res.ok) {
      setError(res.error);
      haptic('error');
      return;
    }
    // Prova a leggerlo davvero, come farà l'importazione, prima di proporre di sostituire i dati.
    try {
      normalizeData(res.data);
    } catch {
      setError('Il backup è danneggiato e non si riesce a leggere. Prova con un backup precedente.');
      haptic('error');
      return;
    }
    setError(null);
    setPending((p) => ({ data: res.data, summary: res.summary, exportedAt: res.exportedAt, n: (p?.n ?? 0) + 1 }));
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      check(await readFileText(file));
    } catch {
      setError('Non riesco a leggere il file. Riprova, oppure apri il file e incolla il testo qui sotto.');
    }
  };

  return (
    <Page title="Backup" subtitle="I dati vivono solo su questo telefono. Un backup ogni tanto li mette al sicuro." onBack={onBack} backLabel={backLabel}>
      {full && (
        <Callout
          tone="bad"
          icon={HardDrive}
          title="Memoria del browser piena"
          action={
            <Button size="sm" variant="ghost" icon={IS_PREVIEW ? Copy : Download} onClick={download}>
              Esporta un backup
            </Button>
          }
        >
          Le ultime modifiche potrebbero non restare dopo la chiusura. Esporta subito un backup, poi libera spazio: le foto della chat sono la parte più pesante.
        </Callout>
      )}
      <section className="flex flex-col gap-2" aria-labelledby="esporta-label">
        <h3 id="esporta-label" className="t-label px-1 text-ink-3">
          Esporta
        </h3>
        <Card padding="lg" className="flex flex-col gap-4">
          <StatGrid s={summary} />
          <div className="flex items-center justify-between gap-3">
            <span className="t-footnote text-ink-2">
              {summary.from && summary.to ? `Dal ${fmtDateShort(summary.from)} al ${fmtDateShort(summary.to)} · ` : ''}
              {fmtBytes(size)}
            </span>
            {state.settings.demoData && <Pill tone="riposo">Dati di esempio</Pill>}
          </div>
          {hasKey && (
            <div className="overflow-hidden rounded-[14px] bg-card-2">
              <FormRow label="Includi la chiave del coach" hint={withKey ? 'Chi ha il file può usarla: conservalo con cura' : 'Di base resta fuori dal file'}>
                <Toggle label="Includi la chiave del coach" checked={withKey} onChange={setWithKey} />
              </FormRow>
            </div>
          )}
          <div className="flex flex-col gap-2.5">
            <Button size="lg" fullWidth icon={IS_PREVIEW ? Copy : Download} onClick={download}>
              {IS_PREVIEW ? 'Copia il backup' : 'Scarica il backup'}
            </Button>
            {!IS_PREVIEW && (
              <div className="flex gap-2.5">
                {shareable && (
                  <Button variant="secondary" className="flex-1" icon={Share} onClick={share}>
                    Condividi
                  </Button>
                )}
                <Button variant="secondary" className="flex-1" icon={Copy} onClick={copy}>
                  Copia
                </Button>
              </div>
            )}
          </div>
        </Card>
        <p className="t-footnote px-1 text-ink-3">
          {lastAt ? `Ultimo backup: ${fmtDateLong(isoDay(lastAt))}.` : 'Non hai ancora fatto un backup da questo telefono.'} Salvalo in File o in iCloud Drive.
        </p>
        {persist === 'protetta' ? (
          <p className="t-footnote flex items-center gap-1.5 px-1 text-good-ink">
            <ShieldCheck aria-hidden size={15} strokeWidth={2.3} className="shrink-0" />
            Dati protetti dal browser: non li cancella da solo.
          </p>
        ) : (
          !IS_PREVIEW && (
            <p className="t-footnote px-1 text-ink-3">Il browser può cancellare i dati quando manca spazio: fai un backup ogni settimana, per esempio dopo la revisione.</p>
          )
        )}
      </section>

      {IS_PREVIEW && (
        <Callout tone="warn" title="Anteprima senza download">
          Qui i file non si scaricano: il backup viene copiato negli appunti. Incollalo in una nota per conservarlo.
        </Callout>
      )}

      <section className="flex flex-col gap-2" aria-labelledby="importa-label">
        <h3 id="importa-label" className="t-label px-1 text-ink-3">
          Importa
        </h3>
        <Card padding="lg" className="flex flex-col gap-3">
          <p className="t-callout text-ink-2">Ripristina un backup di Ritmo: prima di sostituire i dati ti mostro cosa contiene.</p>
          <div className="flex gap-2.5">
            <Button variant="secondary" className="flex-1" icon={FileUp} onClick={() => fileRef.current?.click()}>
              Scegli un file
            </Button>
            <Button variant="secondary" className="flex-1" icon={ClipboardPaste} onClick={() => (setPasting((v) => !v), setError(null))}>
              Incolla il testo
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
                placeholder="Incolla qui il contenuto del file di backup"
                aria-label="Testo del backup"
                className="font-mono text-[0.8125rem]"
                invalid={Boolean(error)}
              />
              <Button icon={Upload} disabled={!pasted.trim()} onClick={() => check(pasted)}>
                Controlla il backup
              </Button>
            </div>
          </InlineReveal>
          {error && (
            <Callout tone="bad" title="Backup non valido">
              {error}
            </Callout>
          )}
        </Card>
      </section>

      {manual !== null && <ManualCopySheet text={manual} onClosed={() => setManual(null)} title="Copia il backup" />}
      {pending && (
        <ImportSheet
          key={pending.n}
          summary={pending.summary}
          exportedAt={pending.exportedAt}
          onClosed={() => setPending(null)}
          onConfirm={() => {
            const ok = useApp.getState().importData(pending.data);
            if (ok) {
              // Una seduta lasciata a metà apparteneva ai dati di prima.
              useSessionDraft.getState().clear();
              haptic('success');
              toast('Backup importato', 'good');
              setPasted('');
              setPasting(false);
            } else {
              setError('Questo non è un backup di Ritmo. Controlla di aver scelto il file giusto.');
            }
          }}
        />
      )}
    </Page>
  );
}

function ImportSheet({ summary, exportedAt, onConfirm, onClosed }: { summary: BackupSummary; exportedAt?: string; onConfirm: () => void; onClosed: () => void }) {
  const [open, close] = useClosingSheet(onClosed);
  return (
    <Sheet
      open={open}
      onClose={close}
      title="Importare questo backup?"
      subtitle={exportedAt ? `Esportato ${fmtDateLong(isoDay(exportedAt))}${summary.name ? `, profilo di ${summary.name}` : ''}.` : summary.name ? `Profilo di ${summary.name}.` : undefined}
      footer={
        <div className="flex flex-col gap-2">
          <Button
            fullWidth
            size="lg"
            variant="danger"
            icon={Upload}
            onClick={() => {
              onConfirm();
              close();
            }}
          >
            Sostituisci i dati
          </Button>
          <Button fullWidth variant="ghost" onClick={close}>
            Annulla
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <StatGrid s={summary} />
        <div className="flex flex-wrap gap-2">
          {summary.demo && <Pill tone="riposo">Dati di esempio</Pill>}
          {summary.hasCoachKey && <Pill tone="warn">Contiene la chiave del coach</Pill>}
          {!summary.onboarded && <Pill tone="neutral">Benvenuto da completare</Pill>}
          {summary.chat > 0 && <Pill tone="neutral">{`${fmtNumber(summary.chat)} messaggi del coach`}</Pill>}
        </div>
        <Callout tone="warn" icon={ShieldAlert} title="I dati attuali verranno sostituiti">
          Profilo, piano, diario e impostazioni di questo telefono lasciano il posto a quelli del backup. Se vuoi tenerli, esporta prima un backup.
        </Callout>
      </div>
    </Sheet>
  );
}
