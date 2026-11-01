/** Quando gli appunti non sono disponibili: il testo da selezionare e copiare a mano (calendario, backup). */
import { Sheet, TextArea } from '../../../ui';
import { useClosingSheet } from './SupplementEditor';

export function ManualCopySheet({ text, onClosed, title = 'Copia a mano' }: { text: string; onClosed: () => void; title?: string }) {
  const [open, close] = useClosingSheet(onClosed);
  return (
    <Sheet open={open} onClose={close} size="large" title={title} subtitle="Gli appunti non sono disponibili qui. Tieni premuto sul testo, scegli Seleziona tutto e poi Copia.">
      <TextArea value={text} onChange={() => undefined} readOnly rows={16} className="selectable font-mono text-[0.75rem]" aria-label="Testo da copiare" onFocus={(e) => e.currentTarget.select()} />
    </Sheet>
  );
}
