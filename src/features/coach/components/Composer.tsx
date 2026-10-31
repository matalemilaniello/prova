/**
 * Barra per scrivere al coach, come in Messaggi: allega una foto, campo che cresce con il testo,
 * invio (o stop mentre il coach scrive), suggerimenti rapidi sopra.
 */
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUp, Camera, ImagePlus, Images, Plus, Square, X } from 'lucide-react';
import { prepareImage } from '../../../lib/image';
import { haptic } from '../../../lib/haptics';
import { useUi } from '../../../state/store';
import { cn, Spinner, springSnappy } from '../../../ui';
import type { OutgoingImage } from '../useCoachChat';
import type { Suggestion } from '../suggestions';

export interface ComposerHandle {
  focus: () => void;
}

export interface ComposerProps {
  onSend: (text: string, image?: OutgoingImage) => void;
  onStop: () => void;
  busy: boolean;
  /** Campo spento (anteprima senza rete). */
  disabled?: boolean;
  placeholder?: string;
  suggestions?: Suggestion[];
  onSuggestion?: (s: Suggestion) => void;
  /** Contenuto sopra il campo (avviso dell'anteprima). */
  notice?: ReactNode;
}

const MAX_LINES_PX = 132;

const isCoarse = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { onSend, onStop, busy, disabled, placeholder = 'Scrivi al coach', suggestions, onSuggestion, notice },
  ref,
) {
  const [text, setText] = useState('');
  const [image, setImage] = useState<OutgoingImage | null>(null);
  const [processing, setProcessing] = useState(false);
  const [menu, setMenu] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const menuId = useId();
  const reduce = useReducedMotion();
  const toast = useUi((s) => s.toast);
  const [coarse] = useState(isCoarse);

  useImperativeHandle(ref, () => ({ focus: () => areaRef.current?.focus() }), []);

  // Il campo cresce con il testo fino a circa 5 righe.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(MAX_LINES_PX, el.scrollHeight)}px`;
  }, [text]);

  const canSend = !disabled && !busy && !processing && (text.trim().length > 0 || image !== null);

  const submit = () => {
    if (!canSend) return;
    onSend(text, image ?? undefined);
    setText('');
    setImage(null);
  };

  const onFile = async (file: File | undefined) => {
    setMenu(false);
    if (!file) return;
    setProcessing(true);
    try {
      const prepared = await prepareImage(file);
      setImage({ send: prepared.send, store: prepared.store });
      haptic('light');
      areaRef.current?.focus();
    } catch {
      toast('Questa foto non si apre. Prova con un’altra o scattala di nuovo.', 'bad');
    } finally {
      setProcessing(false);
    }
  };

  const showSuggestions = Boolean(suggestions?.length) && !text && !image && !busy && !processing;

  return (
    <div className="relative">
      {notice}
      <AnimatePresence initial={false}>
        {showSuggestions && (
          <motion.div
            key="sugg"
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={springSnappy}
            className="overflow-hidden"
          >
            <div
              className="no-scrollbar flex gap-2 overflow-x-auto pb-1 pt-2.5"
              style={{ paddingLeft: 'calc(var(--gutter) - 4px + var(--safe-left))', paddingRight: 'calc(var(--gutter) - 4px + var(--safe-right))' }}
              role="group"
              aria-label="Domande rapide"
            >
              {suggestions!.map((s) => {
                const Icon = s.icon;
                return (
                  <motion.button
                    key={s.id}
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    transition={springSnappy}
                    onClick={() => {
                      haptic('selection');
                      onSuggestion?.(s);
                    }}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-control px-3.5 text-[0.875rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--control-line)]"
                  >
                    <Icon size={15} strokeWidth={2.3} aria-hidden className="text-accent-ink" />
                    {s.short}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {(image || processing) && (
          <motion.div
            key="att"
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={springSnappy}
            className="overflow-hidden"
          >
            <div className="flex items-end gap-3 pb-1 pt-3" style={{ paddingLeft: 'calc(var(--gutter) + 44px + var(--safe-left))' }}>
              <div className="relative size-[68px] overflow-hidden rounded-[14px] border border-line bg-card-2">
                {image ? (
                  <img src={image.store} alt="Foto pronta da inviare" className="size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center text-ink-2">
                    <Spinner size={20} label="Preparo la foto" />
                  </span>
                )}
                {image && (
                  <button
                    type="button"
                    onClick={() => {
                      haptic('selection');
                      setImage(null);
                    }}
                    aria-label="Togli la foto"
                    className="hit-44 absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-[rgb(10_18_32/0.72)] text-white backdrop-blur"
                  >
                    <X size={14} strokeWidth={2.6} aria-hidden />
                  </button>
                )}
              </div>
              <p className="t-caption pb-1 text-ink-3">{image ? 'Ridotta a 1024 px prima dell’invio' : 'Preparo la foto'}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="flex items-end gap-2 pb-2.5 pt-2"
        style={{ paddingLeft: 'calc(var(--gutter) - 6px + var(--safe-left))', paddingRight: 'calc(var(--gutter) - 6px + var(--safe-right))' }}
      >
        {/* Allegato */}
        <div className="relative">
          <motion.button
            type="button"
            whileTap={disabled ? undefined : { scale: 0.9 }}
            transition={springSnappy}
            disabled={disabled || busy}
            aria-label="Allega una foto del piatto"
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-controls={menu ? menuId : undefined}
            onClick={() => {
              haptic('selection');
              setMenu((v) => !v);
            }}
            className="grid size-10 place-items-center rounded-full bg-control text-ink-2 shadow-[inset_0_0_0_1px_var(--control-line)] transition-colors disabled:opacity-40"
          >
            <motion.span animate={{ rotate: menu ? 45 : 0 }} transition={springSnappy} className="grid place-items-center">
              <Plus size={22} strokeWidth={2.2} aria-hidden />
            </motion.span>
          </motion.button>
          <AttachMenu
            id={menuId}
            open={menu}
            onClose={() => setMenu(false)}
            onCamera={() => cameraRef.current?.click()}
            onLibrary={() => libraryRef.current?.click()}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <input
            ref={libraryRef}
            type="file"
            accept="image/*"
            className="hidden"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        {/* Campo */}
        <div
          className={cn(
            'flex min-h-10 min-w-0 flex-1 items-end rounded-[21px] border bg-field transition-[border-color,box-shadow] duration-150',
            'border-line focus-within:border-[color-mix(in_srgb,var(--focus)_60%,var(--line))] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--focus)_16%,transparent)]',
            disabled && 'opacity-60',
          )}
        >
          <textarea
            ref={areaRef}
            rows={1}
            value={text}
            disabled={disabled}
            placeholder={placeholder}
            aria-label="Messaggio per il coach"
            // Su iPhone il tasto Invio va a capo (come in Messaggi) e si invia con il pulsante; con la tastiera fisica Invio invia.
            enterKeyHint={coarse ? 'enter' : 'send'}
            autoComplete="off"
            autoCorrect="on"
            spellCheck
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !coarse) {
                e.preventDefault();
                submit();
              }
            }}
            className="max-h-[132px] min-w-0 flex-1 resize-none bg-transparent py-[9px] pl-4 pr-2 text-[1rem] leading-[1.35] text-ink outline-none placeholder:text-ink-3 disabled:cursor-not-allowed"
          />
          <div className="shrink-0 p-[4px]">
            <AnimatePresence mode="popLayout" initial={false}>
              {busy ? (
                <motion.button
                  key="stop"
                  type="button"
                  initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={reduce ? undefined : { scale: 0.6, opacity: 0 }}
                  transition={springSnappy}
                  whileTap={{ scale: 0.9 }}
                  onClick={onStop}
                  aria-label="Interrompi la risposta"
                  className="hit-44 grid size-8 place-items-center rounded-full bg-ink text-bg"
                >
                  <Square size={12} strokeWidth={0} fill="currentColor" aria-hidden />
                </motion.button>
              ) : (
                <motion.button
                  key="send"
                  type="button"
                  initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={reduce ? undefined : { scale: 0.6, opacity: 0 }}
                  transition={springSnappy}
                  whileTap={canSend ? { scale: 0.9 } : undefined}
                  onClick={() => {
                    if (!canSend) return;
                    haptic('light');
                    submit();
                  }}
                  disabled={!canSend}
                  aria-label="Invia"
                  className={cn(
                    'hit-44 grid size-8 place-items-center rounded-full transition-colors duration-150',
                    canSend ? 'bg-accent text-on-accent shadow-[0_4px_12px_-4px_var(--accent-glow)]' : 'bg-ink-soft text-ink-3',
                  )}
                >
                  <ArrowUp size={18} strokeWidth={2.8} aria-hidden />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
});

/** Menu dell'allegato: scatta o scegli dalla libreria. */
function AttachMenu({
  id,
  open,
  onClose,
  onCamera,
  onLibrary,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  onCamera: () => void;
  onLibrary: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest('[aria-haspopup="menu"]')) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const items = [
    { label: 'Scatta una foto', hint: 'Il piatto, dall’alto', icon: Camera, action: onCamera },
    { label: 'Scegli dalla libreria', hint: 'Una foto che hai già', icon: Images, action: onLibrary },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          id={id}
          role="menu"
          aria-label="Allega una foto"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: 8 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 6 }}
          transition={springSnappy}
          style={{ transformOrigin: '20px 100%' }}
          className="absolute bottom-[52px] left-0 z-10 w-[248px] overflow-hidden rounded-[18px] border border-[var(--bar-line)] bg-bg-elev/95 shadow-sheet backdrop-blur-xl"
        >
          <p className="t-label flex items-center gap-1.5 px-4 pb-1.5 pt-3 text-ink-3">
            <ImagePlus size={13} strokeWidth={2.2} aria-hidden />
            Foto del piatto
          </p>
          {items.map((it, i) => {
            const Icon = it.icon;
            return (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  haptic('selection');
                  it.action();
                  onClose();
                }}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-soft active:bg-ink-soft',
                  i > 0 && 'border-t border-line',
                )}
              >
                <span className="grid size-8 place-items-center rounded-[10px] bg-accent-soft text-accent-ink">
                  <Icon size={17} strokeWidth={2.2} aria-hidden />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="t-callout font-semibold text-ink">{it.label}</span>
                  <span className="t-caption text-ink-3">{it.hint}</span>
                </span>
              </button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
