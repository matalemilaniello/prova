/**
 * Consegna del file .ics al calendario, la stessa in Impostazioni > Promemoria e nel benvenuto: condivisione
 * nell'app installata su iPhone (il download lì spesso non apre niente), download nel browser, copia del testo
 * nell'anteprima o quando il resto non va. Dopo la consegna l'app ricorda il file (`saveCalendarFile`), così sa
 * quando va aggiornato.
 */
import { useMemo, useState } from 'react';
import { Copy, Download, Share } from 'lucide-react';
import type { ISODate } from '../../domain/types';
import { IS_PREVIEW, isStandalone } from '../../app/env';
import { ICS_FILE_NAME, remindersIcs, type ReminderKind, type ReminderState } from '../../engine/ics';
import { canShareFiles, copyText, downloadText, shareText } from '../../lib/backup';
import { haptic } from '../../lib/haptics';
import { useUi } from '../../state/store';
import { saveCalendarFile } from './reminders';

const MIME = 'text/calendar;charset=utf-8';

export type DeliveryMode = 'condividi' | 'scarica' | 'copia';

export interface CalendarDeliveryOptions {
  state: ReminderState;
  kinds: ReminderKind[];
  /** Giorno del file (la giornata del piano). */
  today: ISODate;
  /** Salva anche la scelta dei promemoria (il benvenuto ne propone tre). */
  rememberKinds?: boolean;
  /** Dopo la consegna (per aprire le istruzioni, cambiare la card…). */
  onDelivered?: (mode: DeliveryMode) => void;
}

export interface CalendarDelivery {
  /** Modo principale su questo dispositivo. */
  mode: DeliveryMode;
  /** Il sistema sa condividere un file. */
  shareable: boolean;
  /** Icona del modo principale. */
  icon: typeof Share;
  /** Il modo principale, con i ripieghi. */
  deliver: () => Promise<void>;
  share: () => Promise<void>;
  download: () => Promise<void>;
  copy: () => Promise<void>;
  /** Testo da copiare a mano quando gli appunti non sono disponibili. */
  manual: string | null;
  closeManual: () => void;
}

export function useCalendarDelivery({ state, kinds, today, rememberKinds, onDelivered }: CalendarDeliveryOptions): CalendarDelivery {
  const [manual, setManual] = useState<string | null>(null);
  const shareable = useMemo(() => !IS_PREVIEW && canShareFiles(), []);
  const mode: DeliveryMode = IS_PREVIEW ? 'copia' : shareable && isStandalone() ? 'condividi' : 'scarica';
  const none = kinds.length === 0;

  const build = () => remindersIcs(state, kinds, { start: today, now: new Date() });
  const delivered = (how: DeliveryMode, message: string) => {
    saveCalendarFile(state, kinds, today, rememberKinds);
    haptic('success');
    useUi.getState().toast(message, 'good');
    onDelivered?.(how);
  };

  const copy = async () => {
    if (none) return;
    const text = build();
    if (await copyText(text)) delivered('copia', 'Calendario copiato negli appunti');
    else setManual(text);
  };

  const download = async () => {
    if (none) return;
    if (IS_PREVIEW) return copy();
    if (downloadText(ICS_FILE_NAME, build(), MIME)) delivered('scarica', 'Calendario scaricato: aprilo per aggiungere gli eventi');
    else await copy();
  };

  const share = async () => {
    if (none) return;
    const res = await shareText(ICS_FILE_NAME, build(), MIME, 'Promemoria di Ritmo');
    if (res === 'condiviso') delivered('condividi', 'Calendario condiviso: aprilo per aggiungere gli eventi');
    else if (res === 'non-disponibile') await download();
  };

  const deliver = mode === 'copia' ? copy : mode === 'condividi' ? share : download;
  const icon = mode === 'copia' ? Copy : mode === 'condividi' ? Share : Download;

  return { mode, shareable, icon, deliver, share, download, copy, manual, closeManual: () => setManual(null) };
}
