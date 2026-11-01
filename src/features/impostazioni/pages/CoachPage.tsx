/** Coach: chiave API (nascosta, con mostra/nascondi) e modello. */
import { useState } from 'react';
import { motion } from 'motion/react';
import { Cpu, ExternalLink, Eye, EyeOff, KeyRound, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { IS_PREVIEW } from '../../../app/env';
import { DEFAULT_COACH_MODEL } from '../../../data/defaults';
import { CONSOLE_KEYS_URL, CONSOLE_LIMITS_URL, isLikelyApiKey, maskKey, modelLabel, normalizeKey } from '../../../lib/claude';
import { haptic } from '../../../lib/haptics';
import { useApp, useUi } from '../../../state/store';
import { Button, Callout, Card, Disclosure, Field, IconButton, Pill, TextInput, springSnappy } from '../../../ui';
import { ChoiceCards, InlineReveal, tileStyle } from '../components/controls';
import { Page, type PageProps } from './Page';

const MODELS: { value: string; label: string; text: string }[] = [
  { value: 'claude-opus-5-5', label: 'Claude Opus 5.5', text: 'Predefinito. Risposte accurate e ragionate, costo medio.' },
  { value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', text: 'Più rapido, circa metà del costo. Ottimo per l’uso di tutti i giorni.' },
  { value: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', text: 'Il più rapido ed economico, risposte più semplici.' },
  { value: 'claude-fable-5-1', label: 'Claude Fable 5.1', text: 'Il più capace, costa più del doppio di Opus.' },
];
const OTHER = 'altro';

export default function CoachPage({ onBack, backLabel }: PageProps) {
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const toast = useUi((s) => s.toast);
  const saved = settings.coachApiKey ?? '';
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(!saved);
  const known = MODELS.some((m) => m.value === settings.coachModel);
  const [custom, setCustom] = useState(known ? '' : settings.coachModel);
  const choice = known ? settings.coachModel : OTHER;

  const clean = normalizeKey(key);
  const plausible = !clean || isLikelyApiKey(clean);

  const saveKey = () => {
    if (!clean) return;
    update({ coachApiKey: clean });
    haptic('success');
    toast('Chiave salvata su questo telefono', 'good');
    setKey('');
    setShow(false);
    setEditing(false);
  };

  const removeKey = () => {
    const prev = saved;
    update({ coachApiKey: undefined });
    setEditing(true);
    toast('Chiave rimossa', 'neutral', { actionLabel: 'Annulla', onAction: () => (update({ coachApiKey: prev }), setEditing(false)) });
  };

  return (
    <Page title="Coach" subtitle="Un allenatore e nutrizionista che conosce il tuo piano e la tua giornata." onBack={onBack} backLabel={backLabel}>
      {IS_PREVIEW && (
        <Callout tone="warn" title="Anteprima senza rete">
          Qui la rete esterna è bloccata: il coach risponde nell’app installata. Puoi comunque salvare chiave e modello.
        </Callout>
      )}

      <Card variant="highlight" padding="lg" className="flex flex-col gap-4">
        <div className="flex items-center gap-3.5">
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-[14px]" style={tileStyle('accent')}>
            <Sparkles size={24} strokeWidth={2} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="t-headline text-ink">{modelLabel(settings.coachModel)}</span>
            </div>
            {saved ? (
              <Pill tone="good" dot>
                Attivo
              </Pill>
            ) : (
              <Pill tone="neutral" dot>
                Serve una chiave
              </Pill>
            )}
          </div>
        </div>
        {saved && !editing ? (
          <div className="flex items-center gap-3 rounded-[14px] bg-card-2 px-3.5 py-3">
            <KeyRound size={18} strokeWidth={2.2} className="shrink-0 text-ink-3" aria-hidden />
            <span className="t-mono min-w-0 flex-1 truncate text-[0.875rem] text-ink" aria-label="Chiave salvata, nascosta">
              {maskKey(saved)}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Cambia
            </Button>
          </div>
        ) : (
          <p className="t-callout text-ink-2">Incolla la tua chiave API di Anthropic. Resta su questo telefono e serve solo per parlare con il coach.</p>
        )}
      </Card>

      <InlineReveal open={editing}>
        <div className="flex flex-col gap-3">
          <Field
            label="Chiave API"
            hint={plausible ? 'Inizia con sk-ant-. La trovi nella console di Anthropic.' : undefined}
            error={plausible ? undefined : 'Non sembra una chiave di Anthropic: di solito inizia con sk-ant- ed è lunga. Controlla di averla copiata tutta.'}
          >
            <TextInput
              value={key}
              onChange={setKey}
              type={show ? 'text' : 'password'}
              placeholder="sk-ant-…"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              className="font-mono"
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveKey();
              }}
              trailing={<IconButton icon={show ? EyeOff : Eye} label={show ? 'Nascondi la chiave' : 'Mostra la chiave'} variant="plain" size="sm" onClick={() => setShow((v) => !v)} />}
            />
          </Field>
          <div className="flex gap-2.5">
            {saved && (
              <Button variant="secondary" className="flex-1" onClick={() => (setEditing(false), setKey(''))}>
                Annulla
              </Button>
            )}
            <Button className="flex-1" icon={KeyRound} disabled={!clean} onClick={saveKey}>
              Salva la chiave
            </Button>
          </div>
        </div>
      </InlineReveal>

      {/* Il modello si sceglie di rado: la scelta sta dietro un tocco, con il nome di quello attivo a destra. */}
      <section className="flex flex-col gap-1" aria-label="Modello del coach">
        <Card padding="none" className="px-4">
          <Disclosure title="Modello" icon={Cpu} summary={modelLabel(settings.coachModel)} defaultOpen={choice === OTHER} contentClassName="flex flex-col gap-2 pb-4 pt-1">
            <ModelChoices choice={choice} custom={custom} setCustom={setCustom} />
          </Disclosure>
        </Card>
        <p className="t-footnote px-1 pt-1 text-ink-3">Uso tipico: 7-12 $ al mese con Claude Opus 5.5, pagati ad Anthropic con la tua chiave.</p>
      </section>

      <Card padding="none">
        <ul className="flex flex-col">
          <li className="flex gap-3 px-4 py-3.5">
            <ShieldCheck size={20} strokeWidth={2.2} className="mt-0.5 shrink-0 text-good-ink" aria-hidden />
            <p className="t-footnote text-ink-2">
              <strong className="font-semibold text-ink">Cosa esce dal telefono.</strong> Solo quando scrivi al coach: il messaggio, l’eventuale foto e un riassunto del piano e della giornata. Tutto il resto resta qui.
            </p>
          </li>
          <li className="relative flex gap-3 px-4 py-3.5 before:absolute before:left-4 before:right-0 before:top-0 before:h-px before:bg-line">
            <KeyRound size={20} strokeWidth={2.2} className="mt-0.5 shrink-0 text-warn-ink" aria-hidden />
            <p className="t-footnote text-ink-2">
              <strong className="font-semibold text-ink">Soluzione temporanea.</strong> La chiave è salvata nel browser e le richieste partono da qui. Imposta un limite di spesa sulla console: una versione futura sposterà la chiave su un server.
            </p>
          </li>
        </ul>
      </Card>

      <div className="flex flex-col gap-2.5">
        <LinkButton href={CONSOLE_KEYS_URL}>Crea una chiave nella console</LinkButton>
        <LinkButton href={CONSOLE_LIMITS_URL}>Imposta un limite di spesa</LinkButton>
      </div>

      {saved && (
        <Button variant="ghost" icon={Trash2} className="self-center !text-bad-ink" onClick={removeKey}>
          Rimuovi la chiave
        </Button>
      )}
    </Page>
  );
}

/** I modelli tra cui scegliere, più "Altro modello" con l'identificativo scritto a mano. */
function ModelChoices({ choice, custom, setCustom }: { choice: string; custom: string; setCustom: (v: string) => void }) {
  const update = useApp((s) => s.updateSettings);
  return (
    <>
      <ChoiceCards
        aria-label="Modello del coach"
        columns={1}
        surface="control"
        value={choice}
        onChange={(v) => {
          if (v === OTHER) update({ coachModel: custom.trim() || DEFAULT_COACH_MODEL });
          else update({ coachModel: v });
        }}
        options={[...MODELS, { value: OTHER, label: 'Altro modello', text: 'Scrivi l’identificativo esatto, ad esempio da una novità della console.' }]}
      />
      <InlineReveal open={choice === OTHER}>
        <div className="pt-1">
          <TextInput
            value={custom}
            onChange={(v) => {
              setCustom(v);
              const id = v.trim();
              if (id) update({ coachModel: id });
            }}
            placeholder="claude-…"
            aria-label="Identificativo del modello"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="font-mono"
          />
        </div>
      </InlineReveal>
    </>
  );
}

function LinkButton({ href, children }: { href: string; children: string }) {
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      whileTap={{ scale: 0.97 }}
      transition={springSnappy}
      onClick={() => haptic('light')}
      className="flex h-11 items-center justify-center gap-2 rounded-control border border-control-line bg-control px-4 text-[0.9375rem] font-semibold text-ink"
    >
      {children}
      <ExternalLink size={16} strokeWidth={2.2} aria-hidden className="text-ink-3" />
    </motion.a>
  );
}
