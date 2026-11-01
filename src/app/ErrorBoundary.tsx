import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { Copy, Download, RefreshCw, RotateCcw, Sparkles, TriangleAlert } from 'lucide-react';
import { backupFileName, copyText, createBackup, downloadText, serializeBackup } from '../lib/backup';
import { todayISO } from '../engine/dates';
import { pickData, useApp } from '../state/store';
import { IS_PREVIEW } from './env';

interface Props {
  /** Nome dell'area, per il messaggio e per la console. */
  area: string;
  /** Variante compatta (dentro un pannello). */
  compact?: boolean;
  /**
   * Ultimo livello, attorno a tutta l'app: a tutto schermo, con "Esporta i dati" e "Azzera e ricomincia",
   * così un errore non chiude mai fuori l'utente dai suoi dati.
   */
  root?: boolean;
  onReset?: () => void;
  /** Disegna l'errore a modo tuo (es. dentro un foglio). */
  fallback?: (reset: () => void) => ReactNode;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Errore di caricamento di una parte dell'app (file vecchio sparito dopo un aggiornamento). */
export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '');
  return /dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch dynamically|ChunkLoadError|Unable to preload CSS/i.test(
    msg,
  );
}

/** Isola gli errori di una schermata o di un pannello: il resto dell'app continua a funzionare. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.area}]`, error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (isChunkLoadError(error)) return <NewVersion compact={this.props.compact} root={this.props.root} />;
    if (this.props.root) return <RootFallback onRetry={this.reset} />;
    if (this.props.fallback) return this.props.fallback(this.reset);
    return (
      <div
        role="alert"
        className={
          this.props.compact
            ? 'flex flex-col items-center gap-3 px-6 py-10 text-center'
            : 'flex h-full flex-col items-center justify-center gap-3 px-8 pb-[var(--tabbar-h)] text-center'
        }
      >
        <span className="grid size-14 place-items-center rounded-full bg-card-2 text-warn-ink ring-1 ring-inset ring-[color-mix(in_srgb,var(--warn)_32%,transparent)]">
          <TriangleAlert size={26} aria-hidden />
        </span>
        <h2 className="t-title-2 text-ink">Questa parte non si è caricata</h2>
        <p className="t-callout max-w-[30ch] text-ink-2">
          I tuoi dati sono al sicuro sul telefono. Riprova; se succede ancora, chiudi e riapri l’app.
        </p>
        <button
          type="button"
          onClick={this.reset}
          className="mt-2 inline-flex h-11 items-center gap-2 rounded-control bg-card-2 px-4 font-semibold text-ink"
        >
          <RotateCcw size={18} aria-hidden /> Riprova
        </button>
      </div>
    );
  }
}

/** Una parte dell'app è stata aggiornata mentre era aperta: basta ricaricare. */
function NewVersion({ compact, root }: { compact?: boolean; root?: boolean }) {
  return (
    <div
      role="alert"
      className={
        compact
          ? 'flex flex-col items-center gap-3 px-6 py-10 text-center'
          : root
            ? 'flex h-dvh flex-col items-center justify-center gap-3 bg-bg px-8 text-center text-ink'
            : 'flex h-full flex-col items-center justify-center gap-3 px-8 pb-[var(--tabbar-h)] text-center'
      }
    >
      <span className="grid size-14 place-items-center rounded-full bg-card-2 text-accent-ink ring-1 ring-inset ring-[color-mix(in_srgb,var(--accent)_36%,transparent)]">
        <Sparkles size={26} aria-hidden />
      </span>
      <h2 className="t-title-2 text-ink">È uscita una nuova versione di Ritmo</h2>
      <p className="t-callout max-w-[30ch] text-ink-2">Ricarica per usarla. I tuoi dati restano sul telefono.</p>
      <button
        type="button"
        onClick={() => location.reload()}
        className="mt-2 inline-flex h-11 items-center gap-2 rounded-control bg-accent px-5 font-semibold text-on-accent"
      >
        <RefreshCw size={18} aria-hidden /> Ricarica
      </button>
    </div>
  );
}

/** Ultima rete di sicurezza: l'utente può sempre salvare i suoi dati o ripartire. */
function RootFallback({ onRetry }: { onRetry: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const exportData = async () => {
    try {
      const text = serializeBackup(createBackup(pickData(useApp.getState())));
      if (!IS_PREVIEW && downloadText(backupFileName(todayISO()), text, 'application/json')) {
        setMsg('Backup scaricato.');
        return;
      }
      setMsg((await copyText(text)) ? 'Backup copiato negli appunti: incollalo in una nota.' : 'Non riesco a copiare il backup.');
    } catch {
      setMsg('Non riesco a preparare il backup.');
    }
  };

  const resetAll = () => {
    try {
      useApp.getState().resetAll();
    } finally {
      location.reload();
    }
  };

  return (
    <div role="alert" className="flex h-dvh flex-col items-center justify-center gap-3 bg-bg px-8 text-center text-ink">
      <span className="grid size-14 place-items-center rounded-full bg-card-2 text-warn-ink ring-1 ring-inset ring-[color-mix(in_srgb,var(--warn)_32%,transparent)]">
        <TriangleAlert size={26} aria-hidden />
      </span>
      <h1 className="t-title text-ink">Ritmo si è bloccato</h1>
      <p className="t-callout max-w-[32ch] text-ink-2">
        Prova a riaprire. Se succede ancora, salva i tuoi dati con un backup e riparti da zero: potrai reimportarli
        dalle impostazioni.
      </p>
      <div className="mt-3 flex w-full max-w-[300px] flex-col gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-control bg-accent px-4 font-semibold text-on-accent"
        >
          <RotateCcw size={18} aria-hidden /> Riprova
        </button>
        <button
          type="button"
          onClick={exportData}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-control bg-card-2 px-4 font-semibold text-ink"
        >
          {IS_PREVIEW ? <Copy size={18} aria-hidden /> : <Download size={18} aria-hidden />} Esporta i dati
        </button>
        {confirm ? (
          <div className="mt-1 flex flex-col gap-2 rounded-card bg-card p-3 text-left">
            <p className="t-footnote text-ink-2">Cancella tutti i dati da questo telefono. Hai esportato un backup?</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirm(false)}
                className="h-11 flex-1 rounded-control bg-card-2 font-semibold text-ink"
              >
                Annulla
              </button>
              <button type="button" onClick={resetAll} className="h-11 flex-1 rounded-control bg-bad font-semibold text-[var(--on-bad)]">
                Azzera
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className="h-11 rounded-control font-semibold text-bad-ink">
            Azzera e ricomincia
          </button>
        )}
        {msg && (
          <p className="t-footnote mt-1 text-ink-2" role="status">
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
