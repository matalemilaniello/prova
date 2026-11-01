/**
 * Struttura comune delle sotto-pagine delle impostazioni: titolo grande, "Impostazioni" per tornare,
 * spazio in fondo per la safe area.
 */
import type { ReactNode } from 'react';
import { Screen } from '../../../ui';

export type PageId =
  | 'profilo'
  | 'obiettivi'
  | 'settimana'
  | 'pasti'
  | 'sonno'
  | 'integratori'
  | 'dolore'
  | 'fisio'
  | 'promemoria'
  | 'coach'
  | 'backup'
  | 'info';

export const PAGE_IDS: PageId[] = ['profilo', 'obiettivi', 'settimana', 'pasti', 'sonno', 'integratori', 'dolore', 'fisio', 'promemoria', 'coach', 'backup', 'info'];

export const PAGE_TITLE: Record<PageId, string> = {
  profilo: 'Profilo',
  obiettivi: 'Obiettivi',
  settimana: 'Settimana',
  pasti: 'Orari dei pasti',
  sonno: 'Sonno',
  integratori: 'Integratori',
  dolore: 'Zone di dolore',
  fisio: 'Fisioterapista',
  promemoria: 'Promemoria',
  coach: 'Coach',
  backup: 'Backup',
  info: 'Informazioni',
};

export interface PageProps {
  onBack: () => void;
  /** Apre un'altra sotto-pagina. */
  open: (id: PageId) => void;
  /** Etichetta del pulsante indietro (la pagina da cui si arriva). */
  backLabel: string;
}

/**
 * Nella barra compatta il pulsante indietro ha un quarto della larghezza: un nome lungo ("Impostazioni",
 * "Fisioterapista") finirebbe sotto il titolo che compare scorrendo. Come su iOS, al suo posto va "Indietro".
 */
const MAX_BACK_LABEL = 8;
export const fittingBackLabel = (label: string): string => (label.length <= MAX_BACK_LABEL ? label : 'Indietro');

export function Page({
  title,
  subtitle,
  onBack,
  backLabel,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  onBack: () => void;
  backLabel: string;
  children: ReactNode;
}) {
  return (
    <Screen title={title} subtitle={subtitle} onBack={onBack} backLabel={fittingBackLabel(backLabel)} bottom="safe">
      {children}
    </Screen>
  );
}
