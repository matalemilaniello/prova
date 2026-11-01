import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** Pila dei pannelli aperti: solo quello in cima risponde a Esc e tiene il focus. */
const stack: symbol[] = [];

// ───────────────────────── Tutto il resto inerte ─────────────────────────
//
// Con un pannello aperto, quello che sta sotto non deve esistere per VoiceOver, per la tastiera e per il
// tocco: ogni figlio di <body> diverso dalla radice del pannello in cima riceve `inert` e `aria-hidden`
// (la schermata, la barra delle schede, i pannelli aperti prima). Restano vivi solo il pannello in cima
// e gli avvisi (`data-toast-host`). I valori di prima si ripristinano quando il pannello si chiude.

const hosts: HTMLElement[] = [];
const saved = new Map<HTMLElement, { inert: boolean; ariaHidden: string | null }>();

function syncInert() {
  if (typeof document === 'undefined') return;
  const top = hosts[hosts.length - 1];
  for (const child of Array.from(document.body.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const hide =
      Boolean(top) &&
      child !== top &&
      !child.contains(top!) &&
      !child.hasAttribute('data-toast-host') &&
      child.tagName !== 'SCRIPT' &&
      child.tagName !== 'STYLE';
    if (hide) {
      if (!saved.has(child)) saved.set(child, { inert: child.inert, ariaHidden: child.getAttribute('aria-hidden') });
      child.inert = true;
      child.setAttribute('aria-hidden', 'true');
    } else {
      const prev = saved.get(child);
      if (!prev) continue;
      child.inert = prev.inert;
      if (prev.ariaHidden === null) child.removeAttribute('aria-hidden');
      else child.setAttribute('aria-hidden', prev.ariaHidden);
      saved.delete(child);
    }
  }
  for (const el of Array.from(saved.keys())) if (!el.isConnected) saved.delete(el);
}

/**
 * Tiene il focus dentro `ref` finché `active`, chiude con Esc, restituisce il focus all'elemento
 * che lo aveva prima dell'apertura, rende inerte tutto il resto della pagina. Gestisce pannelli annidati
 * (vince l'ultimo aperto).
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
  initialFocus?: RefObject<HTMLElement | null>,
) {
  const escRef = useRef(onEscape);
  escRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const id = Symbol('trap');
    stack.push(id);
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    // Radice del portale (Sheet: [data-sheet-root]; FullScreenModal: il pannello stesso).
    const host = (node?.closest('[data-sheet-root]') as HTMLElement | null) ?? node;
    if (host) {
      hosts.push(host);
      syncInert();
    }

    const focusFirst = () => {
      const target = initialFocus?.current ?? node?.querySelector<HTMLElement>('[data-autofocus]') ?? node;
      target?.focus({ preventScroll: true });
    };
    const raf = requestAnimationFrame(focusFirst);

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id || !node) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        escRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (!items.length) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const cur = document.activeElement;
      if (e.shiftKey && (cur === first || cur === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && cur === last) {
        e.preventDefault();
        first.focus();
      } else if (!node.contains(cur)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey, true);
      const i = stack.indexOf(id);
      if (i !== -1) stack.splice(i, 1);
      if (host) {
        const h = hosts.lastIndexOf(host);
        if (h !== -1) hosts.splice(h, 1);
        syncInert();
      }
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
