/**
 * Fogli del coach: opzioni (chiave, contesto, cancella), cosa vede il coach, chiave API, foto a schermo intero.
 */
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Coffee, Copy, Eye, KeyRound, MessageSquareX, X } from 'lucide-react';
import { buildCoachContext } from '../../../engine/coachContext';
import { currentDate } from '../../../engine/dates';
import { maskKey, modelLabel } from '../../../lib/claude';
import { useApp, useUi } from '../../../state/store';
import { Button, Callout, Card, IconButton, ListGroup, ListRow, Sheet } from '../../../ui';
import { KeyForm, PreviewCallout, SavedKeyCard, SetupFacts, SetupSteps, TemporaryKeyNotice } from './KeySetup';

// ───────────────────────── Opzioni ─────────────────────────

export interface OptionsSheetProps {
  open: boolean;
  onClose: () => void;
  onContext: () => void;
  onKey: () => void;
  onClear: () => void;
}

export function OptionsSheet({ open, onClose, onContext, onKey, onClear }: OptionsSheetProps) {
  const key = useApp((s) => s.settings.coachApiKey);
  const model = useApp((s) => s.settings.coachModel);
  const count = useApp((s) => s.chat.length);
  const openOverlay = useUi((s) => s.open);
  const [confirm, setConfirm] = useState(false);
  const close = () => {
    setConfirm(false);
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} title="Coach" subtitle={`${modelLabel(model)} · allenatore e nutrizionista`}>
      <div className="flex flex-col gap-5 pb-2">
        <ListGroup>
          <ListRow
            icon={Eye}
            iconTone="palestra"
            title="Cosa vede il coach"
            subtitle="Il riassunto che parte con ogni domanda"
            onPress={() => {
              close();
              onContext();
            }}
          />
          <ListRow
            icon={KeyRound}
            iconTone={key ? 'good' : 'warn'}
            title="Chiave API"
            value={key ? maskKey(key) : 'Da inserire'}
            onPress={() => {
              close();
              onKey();
            }}
          />
          <ListRow
            icon={Coffee}
            title="Piano B al bar"
            subtitle="Funziona anche senza rete"
            onPress={() => {
              close();
              openOverlay({ type: 'barPlanB' });
            }}
          />
        </ListGroup>

        <ListGroup footer="I messaggi spariscono solo da questo telefono. Piano, diario e progressi restano.">
          {confirm ? (
            <div className="flex flex-col gap-3 px-4 py-3.5">
              <p className="t-callout text-ink">
                Cancellare {count === 1 ? 'il messaggio' : `tutti i ${count} messaggi`}?
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" fullWidth onClick={() => setConfirm(false)}>
                  Annulla
                </Button>
                <Button
                  variant="danger"
                  fullWidth
                  icon={MessageSquareX}
                  onClick={() => {
                    close();
                    onClear();
                  }}
                >
                  Cancella
                </Button>
              </div>
            </div>
          ) : (
            <ListRow
              icon={MessageSquareX}
              iconTone="bad"
              title="Cancella la conversazione"
              destructive
              disabled={count === 0}
              chevron={false}
              onPress={() => setConfirm(true)}
            />
          )}
        </ListGroup>
        <p className="t-footnote px-1 text-ink-3">
          Il coach aiuta a decidere e non sostituisce medico e fisioterapista. Le stime da foto sono indicative.
        </p>
      </div>
    </Sheet>
  );
}

// ───────────────────────── Cosa vede il coach ─────────────────────────

type ContextBlock = { title: string; lines: { text: string; bullet: boolean }[] };

function parseContext(text: string): ContextBlock[] {
  const blocks: ContextBlock[] = [];
  let cur: ContextBlock | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('# ')) continue;
    if (line.startsWith('## ')) {
      cur = { title: line.slice(3), lines: [] };
      blocks.push(cur);
      continue;
    }
    if (!cur) {
      cur = { title: 'Adesso', lines: [] };
      blocks.push(cur);
    }
    const bullet = line.startsWith('- ');
    let t = bullet ? line.slice(2) : line;
    // Nel riquadro "Adesso" il prefisso si ripeterebbe.
    if (cur.title === 'Adesso' && t.startsWith('Adesso: ')) t = t.charAt(8).toUpperCase() + t.slice(9);
    cur.lines.push({ text: t, bullet });
  }
  return blocks;
}

export function ContextSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useUi((s) => s.toast);
  // Ricalcolato a ogni apertura: è esattamente quello che partirebbe adesso.
  const text = useMemo(() => (open ? buildCoachContext(useApp.getState(), currentDate()) : ''), [open]);
  const blocks = useMemo(() => parseContext(text), [text]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Riassunto copiato', 'good');
    } catch {
      toast('Copia non riuscita: tieni premuto sul testo per selezionarlo.', 'warn');
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="large"
      title="Cosa vede il coach"
      subtitle="Con ogni domanda parte questo riassunto, aggiornato al momento. Il nome non viene inviato."
      headerAction={<IconButton icon={Copy} label="Copia il riassunto" size="sm" variant="tinted" onClick={copy} />}
    >
      <div className="selectable flex flex-col gap-3 pb-4">
        {blocks.map((b) => (
          <Card key={b.title} padding="md">
            <p className="t-label text-ink-3">{b.title}</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {b.lines.map((l, i) =>
                l.bullet ? (
                  <p key={i} className="t-footnote flex gap-2 text-ink-2">
                    <span aria-hidden className="mt-[0.5em] size-1 shrink-0 rounded-full bg-ink-3" />
                    <span className="min-w-0">{l.text}</span>
                  </p>
                ) : (
                  <p key={i} className="t-footnote text-ink">
                    {l.text}
                  </p>
                ),
              )}
            </div>
          </Card>
        ))}
        <Callout tone="neutral" title="Le foto">
          Partono con la domanda in cui le alleghi e restano nel contesto per le due risposte successive, poi diventano una nota
          di testo.
        </Callout>
      </div>
    </Sheet>
  );
}

// ───────────────────────── Chiave ─────────────────────────

export function KeySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const key = useApp((s) => s.settings.coachApiKey);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="large"
      title={key ? 'Chiave API' : 'Attiva il coach'}
      subtitle={key ? 'Salvata solo su questo telefono.' : 'Due minuti sulla console di Claude, poi resta su questo telefono.'}
    >
      <div className="flex flex-col gap-5 pb-4">
        <PreviewCallout />
        {key ? (
          <>
            <SavedKeyCard />
            <KeyForm onSaved={onClose} />
            <TemporaryKeyNotice />
          </>
        ) : (
          <>
            <Card padding="lg">
              <SetupSteps>
                <KeyForm onSaved={onClose} />
              </SetupSteps>
            </Card>
            <SetupFacts />
          </>
        )}
      </div>
    </Sheet>
  );
}

// ───────────────────────── Foto a schermo intero ─────────────────────────

export function ImageViewer({ src, onClose }: { src: string | null; onClose: () => void }) {
  const reduce = useReducedMotion();
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {src && (
        <motion.div
          key="viewer"
          role="dialog"
          aria-modal="true"
          aria-label="Foto allegata"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgb(3_7_14/0.94)] p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
        >
          <motion.img
            src={src}
            alt="Foto allegata"
            className="max-h-full max-w-full rounded-[18px] object-contain shadow-sheet"
            initial={reduce ? false : { scale: 0.92 }}
            animate={{ scale: 1 }}
            exit={reduce ? undefined : { scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          />
          <div className="absolute right-4 top-[calc(var(--safe-top)+12px)]">
            <IconButton icon={X} label="Chiudi la foto" variant="glass" onClick={onClose} autoFocus />
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
