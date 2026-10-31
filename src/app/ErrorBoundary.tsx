import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';

interface Props {
  /** Nome dell'area, per il messaggio e per la console. */
  area: string;
  /** Variante compatta (dentro un pannello). */
  compact?: boolean;
  onReset?: () => void;
  /** Disegna l'errore a modo tuo (es. dentro un foglio). */
  fallback?: (reset: () => void) => ReactNode;
  children: ReactNode;
}

interface State {
  error: Error | null;
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
    if (!this.state.error) return this.props.children;
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
        <span className="grid size-14 place-items-center rounded-full bg-warn-soft text-warn-ink">
          <TriangleAlert size={26} aria-hidden />
        </span>
        <h2 className="t-title-2 text-ink">Questa parte non si è caricata</h2>
        <p className="t-callout max-w-[30ch] text-ink-2">
          I tuoi dati sono al sicuro sul telefono. Riprova; se succede ancora, chiudi e riapri l&apos;app.
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
