/**
 * Attivazione del coach: come si fa (passi, con il campo per la chiave sotto l'ultimo) e "Da sapere" (dove resta la
 * chiave, quanto costa, cosa esce dal telefono) dietro un tocco. Usato a pagina intera (coach mai attivato) e nel
 * foglio della chiave.
 */
import { useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck, Smartphone, Trash2, Wallet, WifiOff } from 'lucide-react';
import { IS_PREVIEW } from '../../../app/env';
import { CONSOLE_KEYS_URL, CONSOLE_LIMITS_URL, CONSOLE_URL, isLikelyApiKey, maskKey, modelLabel, normalizeKey, verifyKey } from '../../../lib/claude';
import { haptic } from '../../../lib/haptics';
import { useApp, useUi } from '../../../state/store';
import { Button, Callout, Card, cn, Disclosure, Field, SectionTitle, TextInput, toneInk, toneRing, toneSoft } from '../../../ui';

// ───────────────────────── Passi ─────────────────────────

const STEPS: { title: string; text: string; link?: { label: string; href: string } }[] = [
  {
    title: 'Apri la console di Claude',
    text: 'Accedi o crea un account Anthropic. Serve un indirizzo email, niente abbonamenti.',
    link: { label: 'platform.claude.com', href: CONSOLE_URL },
  },
  {
    title: 'Aggiungi credito e un limite',
    text: 'Carica qualche dollaro di credito e imposta un limite di spesa mensile, per esempio 15 $: oltre quella cifra il coach si ferma.',
    link: { label: 'Limiti di spesa', href: CONSOLE_LIMITS_URL },
  },
  {
    title: 'Crea una chiave API',
    text: 'In Impostazioni, Chiavi API, crea una chiave chiamata "Ritmo" e copiala: si vede una volta sola.',
    link: { label: 'Chiavi API', href: CONSOLE_KEYS_URL },
  },
  {
    title: 'Incollala qui sotto',
    text: 'Ritmo la verifica senza costi e la salva solo su questo telefono.',
  },
];

/** I passi per attivare il coach; `children` (il campo della chiave) va sotto l'ultimo, "Incollala qui sotto". */
export function SetupSteps({ children }: { children?: ReactNode } = {}) {
  return (
    <ol className="flex flex-col">
      {STEPS.map((s, i) => (
        <li key={s.title} className="relative flex gap-3.5 pb-5 last:pb-0">
          {i < STEPS.length - 1 && <span aria-hidden className="absolute bottom-0 left-[15px] top-9 w-px bg-line" />}
          <span className="t-num grid size-[31px] shrink-0 place-items-center rounded-full bg-accent-soft text-[1.0625rem] text-accent-ink" style={{ boxShadow: toneRing('accent') }}>
            {i + 1}
          </span>
          <div className="min-w-0 flex-1 pt-[3px]">
            <p className="t-headline text-ink">{s.title}</p>
            <p className="t-footnote mt-0.5 text-ink-2">{s.text}</p>
            {s.link && (
              <a
                href={s.link.href}
                target="_blank"
                rel="noreferrer noopener"
                className="hit-44 t-footnote mt-1.5 inline-flex items-center gap-1 font-semibold text-accent-ink"
              >
                {s.link.label}
                <ArrowUpRight size={14} strokeWidth={2.4} aria-hidden />
              </a>
            )}
            {i === STEPS.length - 1 && children ? <div className="mt-3">{children}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ───────────────────────── Costo ─────────────────────────

/** Quanto costa, senza card: la cifra, la stima e tre numeri. */
function CostDetails() {
  const model = useApp((s) => s.settings.coachModel);
  return (
    <>
      <div className="flex items-end gap-2">
        <span className="t-num text-[2.5rem] leading-[0.9] text-ink">7-12 $</span>
        <span className="t-callout pb-0.5 text-ink-2">al mese</span>
      </div>
      <p className="t-footnote mt-2 text-ink-2">
        Stima per un uso tipico con {modelLabel(model)}: 5-8 domande al giorno, qualche foto. Si paga a consumo sulla console,
        non ci sono abbonamenti.
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {[
          { v: '≈ 0,04 $', l: 'a domanda' },
          { v: '≈ 0,01 $', l: 'in più con una foto' },
          { v: '15 $', l: 'limite consigliato' },
        ].map((x) => (
          <div key={x.l} className="rounded-[14px] bg-card-2 px-2.5 py-2.5">
            <dt className="sr-only">{x.l}</dt>
            <dd className="t-num text-[1.25rem] text-ink">{x.v}</dd>
            <dd className="t-caption mt-0.5 text-ink-3">{x.l}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

export function CostCard() {
  return (
    <Card padding="lg">
      <p className="t-label mb-3 text-ink-3">Quanto costa</p>
      <CostDetails />
    </Card>
  );
}

// ───────────────────────── Privacy ─────────────────────────

/** Cosa esce dal telefono e cosa resta, senza card. */
function PrivacyDetails() {
  return (
    <ul className="flex flex-col gap-3">
      <li className="flex gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-palestra/15 text-palestra-ink">
          <ArrowUpRight size={17} strokeWidth={2.2} aria-hidden />
        </span>
        <p className="t-footnote text-ink-2">
          <span className="font-semibold text-ink">Va ad Anthropic, solo quando scrivi: </span>
          la domanda, le foto che alleghi e un riassunto del piano e della giornata (pasti, sedute, sonno, dolori) per
          rispondere su di te.
        </p>
      </li>
      <li className="flex gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-good-soft text-good-ink">
          <Smartphone size={17} strokeWidth={2.2} aria-hidden />
        </span>
        <p className="t-footnote text-ink-2">
          <span className="font-semibold text-ink">Resta qui: </span>
          il nome, lo storico completo, la chiave e tutto il resto dei dati.
        </p>
      </li>
      <li className="flex gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-ink-soft text-ink-2">
          <ShieldCheck size={17} strokeWidth={2.2} aria-hidden />
        </span>
        <p className="t-footnote text-ink-2">
          Secondo i termini commerciali di Anthropic, le richieste fatte con una chiave API non servono ad addestrare i modelli.
        </p>
      </li>
    </ul>
  );
}

export function PrivacyCard() {
  return (
    <Card padding="lg">
      <p className="t-label mb-3 text-ink-3">Cosa esce dal telefono</p>
      <PrivacyDetails />
    </Card>
  );
}

const TEMPORARY_KEY_TEXT =
  'In questa prima versione la chiave resta nel browser di questo telefono e le domande partono da qui. Chi usa il telefono potrebbe leggerla: imposta un limite di spesa sulla console e revocala se lo perdi. Nella prossima versione passerà su un server.';

/**
 * Quello che serve sapere prima di attivare, in una card sola con tre righe dietro un tocco: dove resta la chiave
 * (scelta temporanea), quanto costa, cosa esce dal telefono. Prende il posto di un avviso e di due card sempre aperte.
 */
export function SetupFacts() {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="coach-da-sapere">
      <SectionTitle id="coach-da-sapere">Da sapere</SectionTitle>
      <Card padding="none" className="divide-y divide-line px-4 py-1">
        <Disclosure
          title="La chiave"
          summary="scelta temporanea"
          icon={
            <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px]" style={{ background: toneSoft('warn', 16), boxShadow: toneRing('warn'), color: toneInk('warn') }} aria-hidden>
              <LockKeyhole size={16} strokeWidth={2.2} />
            </span>
          }
        >
          <p className="t-footnote">{TEMPORARY_KEY_TEXT}</p>
        </Disclosure>
        <Disclosure
          title="Quanto costa"
          summary="7-12 $"
          icon={
            <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-ink-soft text-ink-2" aria-hidden>
              <Wallet size={16} strokeWidth={2.2} />
            </span>
          }
        >
          <CostDetails />
        </Disclosure>
        <Disclosure
          title="Cosa esce dal telefono"
          icon={
            <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-ink-soft text-ink-2" aria-hidden>
              <Smartphone size={16} strokeWidth={2.2} />
            </span>
          }
        >
          <PrivacyDetails />
        </Disclosure>
      </Card>
    </section>
  );
}

// ───────────────────────── Campo della chiave ─────────────────────────

export interface KeyFormProps {
  /** Dopo il salvataggio (es. chiudere il foglio). */
  onSaved?: () => void;
  autoFocus?: boolean;
}

/** Campo per incollare la chiave, verifica gratuita e salvataggio in settings.coachApiKey. */
export function KeyForm({ onSaved, autoFocus }: KeyFormProps) {
  const current = useApp((s) => s.settings.coachApiKey);
  const model = useApp((s) => s.settings.coachModel);
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [checking, setChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useUi((s) => s.toast);

  const save = async () => {
    const key = normalizeKey(value);
    if (!key) {
      setError('Incolla la chiave: inizia con sk-ant-.');
      inputRef.current?.focus();
      return;
    }
    if (!isLikelyApiKey(key)) {
      setError('Non sembra una chiave di Anthropic: deve iniziare con sk-ant- ed essere copiata per intero.');
      haptic('error');
      inputRef.current?.focus();
      return;
    }
    setError(undefined);
    if (IS_PREVIEW) {
      useApp.getState().updateSettings({ coachApiKey: key });
      toast('Chiave salvata. Nell’anteprima il coach non si collega: prova nell’app installata.', 'neutral');
      setValue('');
      onSaved?.();
      return;
    }
    setChecking(true);
    const result = await verifyKey(key, model || undefined);
    setChecking(false);
    if (result === 'chiave') {
      setError('La chiave non è valida: controlla di averla copiata tutta, oppure creane una nuova.');
      haptic('error');
      return;
    }
    useApp.getState().updateSettings({ coachApiKey: key });
    setValue('');
    haptic('success');
    if (result === 'ok') toast('Coach attivato', 'good');
    else if (result === 'modello') toast('Chiave salvata. Il modello scelto non risulta disponibile: cambialo nelle impostazioni.', 'warn');
    else toast('Chiave salvata. La verifico alla prima domanda.', 'neutral');
    onSaved?.();
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Field
        label={current ? 'Nuova chiave API' : 'Chiave API'}
        hint={current ? `Attuale: ${maskKey(current)}. Quella nuova la sostituisce.` : 'Inizia con sk-ant-. Resta salvata solo su questo telefono.'}
        error={error}
      >
        <TextInput
          ref={inputRef}
          value={value}
          onChange={(v) => {
            setValue(v);
            if (error) setError(undefined);
          }}
          type={show ? 'text' : 'password'}
          placeholder="sk-ant-…"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="done"
          autoFocus={autoFocus}
          className="font-mono"
          leading={<KeyRound size={18} strokeWidth={2.1} aria-hidden />}
          trailing={
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Nascondi la chiave' : 'Mostra la chiave'}
              aria-pressed={show}
              className="hit-44 grid size-8 place-items-center rounded-full text-ink-3 hover:text-ink"
            >
              {show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
            </button>
          }
        />
      </Field>
      <Button type="submit" size="lg" fullWidth icon={LockKeyhole} loading={checking}>
        {current ? 'Sostituisci la chiave' : 'Attiva il coach'}
      </Button>
    </form>
  );
}

/** Avviso sulla scelta temporanea della chiave nel browser. */
export function TemporaryKeyNotice() {
  return (
    <Callout tone="warn" title="Scelta temporanea" icon={LockKeyhole}>
      {TEMPORARY_KEY_TEXT}
    </Callout>
  );
}

/** Avviso dell'anteprima: la rete esterna è bloccata. */
export function PreviewCallout({ className }: { className?: string }) {
  if (!IS_PREVIEW) return null;
  return (
    <Callout tone="neutral" icon={WifiOff} title="Anteprima senza rete" className={className}>
      Qui il coach non può collegarsi a Claude: puoi leggere come funziona e provare il piano B al bar, che non ha bisogno di rete.
    </Callout>
  );
}

// ───────────────────────── Gestione della chiave salvata ─────────────────────────

export function SavedKeyCard({ onRemoved }: { onRemoved?: () => void }) {
  const key = useApp((s) => s.settings.coachApiKey);
  const model = useApp((s) => s.settings.coachModel);
  const toast = useUi((s) => s.toast);
  const [confirm, setConfirm] = useState(false);
  if (!key) return null;
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="grid size-9 place-items-center rounded-[11px] bg-good-soft text-good-ink">
          <KeyRound size={18} strokeWidth={2.2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="t-callout font-semibold text-ink">Coach attivo</p>
          <p className="t-footnote mt-0.5 truncate text-ink-3">
            <span className="t-mono">{maskKey(key)}</span> · {modelLabel(model)}
          </p>
        </div>
      </div>
      <div className="border-t border-line px-4 py-2.5">
        {confirm ? (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-2">
            <span className="t-footnote text-ink-2">Il coach si ferma finché non ne incolli un’altra.</span>
            <div className="flex shrink-0 gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                Annulla
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  useApp.getState().updateSettings({ coachApiKey: undefined });
                  toast('Chiave rimossa dal telefono', 'neutral');
                  setConfirm(false);
                  onRemoved?.();
                }}
              >
                Rimuovi
              </Button>
            </div>
          </motion.div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className={cn('hit-44 t-callout inline-flex items-center gap-2 py-1 font-medium text-bad-ink')}
          >
            <Trash2 size={16} strokeWidth={2.2} aria-hidden />
            Rimuovi la chiave
          </button>
        )}
      </div>
    </Card>
  );
}

