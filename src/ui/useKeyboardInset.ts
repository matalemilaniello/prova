import { useEffect, useState } from 'react';

/**
 * Altezza della tastiera virtuale (px) dal visualViewport. Su iPhone la tastiera non cambia 100dvh:
 * i fogli la usano per restare sopra la tastiera quando si scrive in un campo.
 */
export function useKeyboardInset(active = true): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!active || !vv) return;
    const update = () => {
      const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setInset(kb > 80 ? kb : 0);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [active]);
  return inset;
}
