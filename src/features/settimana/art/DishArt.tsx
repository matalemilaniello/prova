/**
 * Piatto illustrato che segue il tema attivo. La miniatura è decorativa; la versione grande ha
 * un'etichetta per i lettori di schermo. Il disegno è in `DishArtView`.
 */
import { memo } from 'react';
import { useResolvedTheme } from '../../../app/theme';
import { DishArtView, type DishArtProps } from './DishArtView';

export type { DishArtProps } from './DishArtView';

export const DishArt = memo(function DishArt(props: DishArtProps) {
  const theme = useResolvedTheme();
  return <DishArtView {...props} theme={theme} />;
});
