/**
 * #kit · catalogo del design system: ogni componente nei suoi stati, per il controllo visivo.
 */
import { useState, type ReactNode } from 'react';
import {
  AlarmClock,
  Bell,
  Check,
  ChevronRight,
  Coffee,
  Droplet,
  Dumbbell,
  Flame,
  Moon,
  Plus,
  Search,
  Settings,
  Share,
  ShoppingBasket,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { DayType, ThemePref } from '../domain/types';
import { todayISO } from '../engine/dates';
import { fmtKcal, fmtNumber } from '../lib/format';
import { useApp, useUi } from '../state/store';
import {
  Button,
  Callout,
  Card,
  Chip,
  CheckRow,
  DayTypeBadge,
  Disclosure,
  EmptyState,
  Floodlights,
  BallIcon,
  Field,
  FullScreenModal,
  IconButton,
  ListGroup,
  ListRow,
  NumberInput,
  NumberTicker,
  Pill,
  ProgressBar,
  ProgressRing,
  RatingPicker,
  ScaleSlider,
  Screen,
  SectionTitle,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  Spinner,
  Stat,
  Stepper,
  TextArea,
  TextInput,
  TimeInput,
  Toggle,
  useLongPress,
} from '../ui';
import { sampleOverlay } from './boot';
import { goBack } from './router';

function Block({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle subtitle={note}>{title}</SectionTitle>
      {children}
    </section>
  );
}

const SWATCHES = [
  ['bg', 'Sfondo'],
  ['bg-elev', 'Barre'],
  ['card', 'Card'],
  ['card-2', 'Annidata'],
  ['line', 'Linee'],
  ['ink', 'Testo'],
  ['ink-2', 'Secondario'],
  ['ink-3', 'Terziario'],
  ['accent', 'Riflettori'],
  ['good', 'Bene'],
  ['warn', 'Attenzione'],
  ['bad', 'Dolore'],
  ['calcio', 'Calcio'],
  ['palestra', 'Palestra'],
  ['leggero', 'Leggero'],
  ['riposo', 'Riposo'],
] as const;

const DAY_TYPES: DayType[] = ['calcio', 'palestra', 'leggero', 'riposo'];

export default function KitScreen() {
  const theme = useApp((s) => s.settings.theme);
  const updateSettings = useApp((s) => s.updateSettings);
  const open = useUi((s) => s.open);
  const toast = useUi((s) => s.toast);

  const [seg, setSeg] = useState<'menu' | 'spesa' | 'prep'>('menu');
  const [tog, setTog] = useState(true);
  const [kg, setKg] = useState(22.5);
  const [reps, setReps] = useState(10);
  const [pain, setPain] = useState<number | undefined>(2);
  const [energy, setEnergy] = useState<number | undefined>(7);
  const [unset, setUnset] = useState<number | undefined>(undefined);
  const [quality, setQuality] = useState<number | undefined>(4);
  const [vote, setVote] = useState<number | undefined>(7);
  const [checks, setChecks] = useState([true, false, false]);
  const [text, setText] = useState('Yogurt greco');
  const [num, setNum] = useState<number | undefined>(70.2);
  const [time, setTime] = useState('07:15');
  const [sel, setSel] = useState('ricomposizione');
  const [note, setNote] = useState('');
  const [ticker, setTicker] = useState(1840);
  const [ring, setRing] = useState(0.72);
  const [lights, setLights] = useState<'spenti' | 'meta' | 'pieni' | 'coprifuoco'>('meta');
  const [flare, setFlare] = useState(0);
  const lightProps = {
    intensity: lights === 'spenti' ? 0 : lights === 'pieni' ? 1 : 0.5,
    curfew: lights === 'coprifuoco',
    flare,
  };
  const [sheet, setSheet] = useState(false);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sites, setSites] = useState<string[]>(['Tibia', 'Gomito']);
  const [pressed, setPressed] = useState('Tocca o tieni premuto');
  const longPress = useLongPress(() => setPressed('Pressione lunga: si apre il foglio delle opzioni'), {
    onPress: () => setPressed('Tocco breve: voce segnata come fatta'),
  });

  return (
    <Screen
      eyebrow="Design system"
      title="Kit"
      subtitle="Tutti i componenti nei loro stati. Cambia tema per controllare il contrasto."
      onBack={goBack}
      bottom="safe"
      contentClassName="gap-9"
      light={lightProps}
    >
      <Segmented<ThemePref>
        aria-label="Tema"
        value={theme}
        onChange={(t) => updateSettings({ theme: t })}
        options={[
          { value: 'sistema', label: 'Sistema' },
          { value: 'scuro', label: 'Scuro', icon: Moon },
          { value: 'chiaro', label: 'Chiaro' },
        ]}
      />

      <Block title="Colori">
        <div className="grid grid-cols-4 gap-2.5">
          {SWATCHES.map(([token, name]) => (
            <div key={token} className="flex flex-col gap-1.5">
              <span className="h-12 rounded-[12px] border border-line" style={{ background: `var(--${token})` }} />
              <span className="t-caption truncate font-medium text-ink">{name}</span>
              <span className="t-mono -mt-1 truncate text-[0.625rem] text-ink-3">--{token}</span>
            </div>
          ))}
        </div>
      </Block>

      <Block
        title="Riflettori"
        note="L’elemento firma: due torri faro negli angoli, coni di luce bianco calda e le righe del campo. L’intensità segue la giornata; a giornata chiusa un bagliore breve, dopo il coprifuoco la luce cala verso il lilla."
      >
        <div className="relative h-[200px] overflow-hidden rounded-card bg-bg ring-1 ring-inset ring-[var(--bar-line)]">
          <Floodlights {...lightProps} height={200} />
          <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
            <span className="t-label text-ink-3">Sabato 31</span>
            <span className="t-num text-[2rem] text-accent-ink">7/9</span>
          </div>
        </div>
        <Segmented
          aria-label="Riflettori"
          value={lights}
          onChange={setLights}
          size="sm"
          options={[
            { value: 'spenti', label: 'Spenti' },
            { value: 'meta', label: 'Metà' },
            { value: 'pieni', label: 'Pieni' },
            { value: 'coprifuoco', label: 'Notte' },
          ]}
        />
        <Button variant="secondary" icon={Sparkles} onClick={() => setFlare((n) => n + 1)}>
          Giornata chiusa
        </Button>
      </Block>

      <Block title="Tipografia">
        <Card padding="lg" className="flex flex-col gap-3">
          <span className="t-label text-ink-3">Etichetta di sezione</span>
          <span className="t-large-title">Titolo grande 36</span>
          <span className="t-title">Titolo 28 di sezione</span>
          <span className="t-headline">Titolo di card, Figtree 17</span>
          <p className="t-body text-ink-2">
            Testo dell’interfaccia a 16 px: frasi brevi, voce attiva, tono da allenatore calmo e competente.
          </p>
          <div className="flex items-baseline gap-4">
            <span className="t-num text-[3rem] text-accent-ink">2.600</span>
            <span className="t-mono whitespace-nowrap text-ink-2">kcal · 07:30 · 6&nbsp;h&nbsp;40</span>
          </div>
        </Card>
      </Block>

      <Block title="Pulsanti" note="Pressione a scala 0,97, focus visibile, vibrazione leggera.">
        <div className="flex flex-wrap items-center gap-2.5">
          <Button icon={Check}>Fatto</Button>
          <Button variant="secondary">Sostituito</Button>
          <Button variant="ghost">Annulla</Button>
          <Button variant="danger" icon={Trash2}>
            Elimina
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button size="sm">Piccolo</Button>
          <Button size="md">Medio</Button>
          <Button size="lg" iconRight={ChevronRight}>
            Grande
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            loading={loading}
            onClick={() => {
              setLoading(true);
              window.setTimeout(() => setLoading(false), 1600);
            }}
          >
            Salva
          </Button>
          <Button disabled>Disattivato</Button>
          <Button variant="secondary" disabled>
            Disattivato
          </Button>
        </div>
        <Button size="lg" fullWidth icon={Dumbbell}>
          Inizia la seduta
        </Button>
      </Block>

      <Block title="Pulsanti icona">
        <div className="flex flex-wrap items-center gap-3">
          <IconButton icon={Settings} label="Impostazioni" />
          <IconButton icon={Bell} label="Promemoria" variant="filled" badge />
          <IconButton icon={Search} label="Cerca" variant="plain" />
          <IconButton icon={Share} label="Condividi" variant="glass" />
          <IconButton icon={Plus} label="Aggiungi" variant="accent" />
          <IconButton icon={Plus} label="Aggiungi piccolo" size="sm" />
          <IconButton icon={Plus} label="Aggiungi grande" size="lg" variant="filled" />
          <IconButton icon={Trash2} label="Disattivato" disabled />
        </div>
      </Block>

      <Block title="Pillole e tipi di giorno">
        <div className="flex flex-wrap items-center gap-2">
          <Pill>Neutro</Pill>
          <Pill tone="accent" dot>
            In evidenza
          </Pill>
          <Pill tone="good" icon={Check}>
            Fatto
          </Pill>
          <Pill tone="warn">Attenzione</Pill>
          <Pill tone="bad">Dolore 5</Pill>
          <Pill tone="accent" variant="solid">
            Adesso
          </Pill>
          <Pill tone="palestra" variant="outline">
            Seduta A
          </Pill>
          <Pill tone="good" size="md">
            Media
          </Pill>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {DAY_TYPES.map((d) => (
            <DayTypeBadge key={d} dayType={d} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {DAY_TYPES.map((d) => (
            <DayTypeBadge key={d} dayType={d} variant="solid" size="md" />
          ))}
        </div>
        <div className="flex flex-wrap gap-4">
          {DAY_TYPES.map((d) => (
            <DayTypeBadge key={d} dayType={d} variant="dot" />
          ))}
        </div>
      </Block>

      <Block title="Card">
        <Card variant="highlight" tone="accent" padding="lg">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Pill tone="accent" variant="solid">
                Adesso · 14:15
              </Pill>
              <h3 className="t-title mt-2">Pranzo</h3>
              <p className="t-callout text-ink-2">Riso, pollo al limone e zucchine. 12 minuti di montaggio.</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button icon={Check} size="md">
              Fatto
            </Button>
            <Button variant="secondary">Altro</Button>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <span className="t-label text-ink-3">Standard</span>
            <p className="t-headline mt-2">Card</p>
          </Card>
          <Card variant="outline">
            <span className="t-label text-ink-3">Bordo</span>
            <p className="t-headline mt-2">Outline</p>
          </Card>
          <Card tone="palestra" onPress={() => toast('Card toccata')}>
            <span className="t-label text-ink-3">Toccabile</span>
            <p className="t-headline mt-2">Palestra</p>
          </Card>
          <Card variant="highlight" tone="riposo">
            <span className="t-label text-ink-3">Luce</span>
            <p className="t-headline mt-2">Riposo</p>
          </Card>
        </div>
        <Card>
          <Card variant="nested" padding="sm">
            <p className="t-callout text-ink-2">Card annidata dentro una card.</p>
          </Card>
        </Card>
      </Block>

      <Block title="Avanzamento" note="Tocca l’anello per farlo avanzare: la lampada sulla punta segue l’arco, a 100% si chiude con un bagliore.">
        <Card padding="lg" className="flex items-center justify-around gap-2">
          <button type="button" aria-label="Avanza l’anello" onClick={() => setRing((r) => (r >= 1 ? 0.2 : Math.min(1, r + 0.14)))}>
            <ProgressRing value={ring} size={148} stroke={11} label="Giornata" tipLight>
              <span className="t-num text-[2.5rem]">{Math.round(ring * 100)}</span>
              <span className="t-caption -mt-0.5 text-ink-2">per cento</span>
            </ProgressRing>
          </button>
          <div className="flex flex-col items-center gap-3">
            <ProgressRing value={0.35} size={64} stroke={7} tone="palestra">
              <Dumbbell size={20} className="text-palestra-ink" aria-hidden />
            </ProgressRing>
            <ProgressRing value={1} size={64} stroke={7} tone="good">
              <Check size={22} strokeWidth={3} className="text-good-ink" aria-hidden />
            </ProgressRing>
          </div>
        </Card>
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="t-footnote flex justify-between text-ink-2">
              <span>Fibre</span>
              <span className="tabular">22 su 30 g</span>
            </div>
            <ProgressBar value={22 / 30} tone="good" label="Fibre 22 su 30 g" />
          </div>
          <div className="flex flex-col gap-2">
            <div className="t-footnote flex justify-between text-ink-2">
              <span>Calorie con obiettivo intermedio</span>
              <span className="tabular">{fmtKcal(1840)}</span>
            </div>
            <ProgressBar value={0.7} size="md" marker={0.85} label="Calorie" />
          </div>
          <div className="flex flex-col gap-2">
            <div className="t-footnote flex justify-between text-ink-2">
              <span>Acqua</span>
              <span className="tabular">6 su 10 bicchieri</span>
            </div>
            <ProgressBar value={0.6} tone="palestra" segments={10} size="md" label="Acqua" />
          </div>
        </Card>
      </Block>

      <Block title="Numeri">
        <Card padding="lg" className="grid grid-cols-2 gap-x-4 gap-y-6">
          <Stat label="Peso medio" value={70.2} decimals={1} unit="kg" delta={{ value: -0.3, unit: 'kg', tone: 'good', label: '7 giorni' }} />
          <Stat label="Sonno" value="6 h 54" delta={{ value: 22, unit: 'min', decimals: 0, tone: 'good' }} />
          <Stat label="Carico" value={2140} unit="UA" delta={{ value: 18, unit: '%', decimals: 0, tone: 'bad', label: 'sopra media' }} />
          <Stat label="Senza dati" value={null} caption="Servono 4 pesate" />
        </Card>
        <Card className="flex items-center justify-between">
          <div className="flex items-baseline gap-1.5">
            <NumberTicker value={ticker} className="t-num text-[2.75rem]" />
            <span className="t-mono text-ink-2">kcal</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setTicker((t) => Math.max(0, t - 320))}>
              −320
            </Button>
            <Button size="sm" onClick={() => setTicker((t) => t + 450)}>
              +450
            </Button>
          </div>
        </Card>
      </Block>

      <Block title="Controlli">
        <Segmented
          aria-label="Esempio"
          value={seg}
          onChange={setSeg}
          options={[
            { value: 'menu', label: 'Menù' },
            { value: 'spesa', label: 'Spesa', badge: 12 },
            { value: 'prep', label: 'Preparazione' },
          ]}
        />
        <Segmented
          aria-label="Esempio piccolo"
          size="sm"
          fullWidth={false}
          value={seg}
          onChange={setSeg}
          options={[
            { value: 'menu', label: 'Giorno' },
            { value: 'spesa', label: 'Settimana' },
            { value: 'prep', label: 'Mese' },
          ]}
        />
        <ListGroup>
          <ListRow icon={Moon} iconTone="riposo" title="Giornata minima" subtitle="Quattro cose e la giornata vale" trailing={<Toggle checked={tog} onChange={setTog} label="Giornata minima" />} />
          <ListRow icon={Flame} iconTone="warn" title="Spento" trailing={<Toggle checked={false} onChange={() => undefined} label="Spento" />} />
          <ListRow icon={Bell} iconTone="neutral" title="Disattivato" trailing={<Toggle checked disabled onChange={() => undefined} label="Disattivato" />} />
        </ListGroup>
        <div className="flex flex-wrap gap-2">
          {['Tibia', 'Gomito', 'Ginocchio', 'Flessori', 'Adduttori', 'Caviglia'].map((z) => (
            <Chip key={z} selected={sites.includes(z)} onChange={(on) => setSites((x) => (on ? [...x, z] : x.filter((y) => y !== z)))}>
              {z}
            </Chip>
          ))}
        </div>
        <button
          type="button"
          {...longPress}
          className="t-callout flex min-h-14 w-full select-none items-center justify-center rounded-card bg-card px-4 text-center text-ink-2 shadow-card"
        >
          {pressed}
        </button>
        <Card padding="lg" className="flex flex-col gap-6">
          <Stepper label="Carico" unit="kg" step={2.5} value={kg} onChange={setKg} size="lg" />
          <Stepper label="Ripetizioni" step={1} min={0} max={30} value={reps} onChange={setReps} format={(n) => fmtNumber(n)} />
        </Card>
        <Card padding="lg" className="flex flex-col gap-7">
          <ScaleSlider label="Tibia" value={pain} onChange={setPain} threshold={3} lowLabel="Nessun dolore" highLabel="Il peggiore" describe={(v) => (v <= 2 ? 'lieve' : v <= 5 ? 'moderato' : 'forte')} />
          <ScaleSlider label="Energia" scheme="energy" value={energy} onChange={setEnergy} lowLabel="A terra" highLabel="Al massimo" />
          <div className="flex flex-col gap-2">
            <ScaleSlider
              label="Gomito"
              value={unset}
              onChange={setUnset}
              threshold={3}
              ghost={2}
              ghostLabel="ieri"
              lowLabel="Nessun dolore"
              highLabel="Il peggiore"
              describe={(v) => (v <= 2 ? 'lieve' : v <= 5 ? 'moderato' : 'forte')}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="t-footnote text-ink-3">Non indicato: niente cursore, tacca della soglia e cerchio vuoto di ieri.</p>
              <Button size="sm" variant="ghost" disabled={unset === undefined} onClick={() => setUnset(undefined)}>
                Azzera
              </Button>
            </div>
          </div>
        </Card>
        <Card padding="lg" className="flex flex-col gap-7">
          <RatingPicker label="Qualità del sonno" value={quality} onChange={setQuality} labels={['Pessima', 'Scarsa', 'Discreta', 'Buona', 'Ottima']} />
          <RatingPicker label="Energia della settimana" max={10} value={vote} onChange={setVote} lowLabel="Bassa" highLabel="Alta" />
        </Card>
      </Block>

      <Block title="Liste">
        <ListGroup title="Sonno" footer="Il passo avanza di 15 minuti a settimana, se dormi in orario 5 notti su 7.">
          <ListRow icon={AlarmClock} title="Sveglia" value="07:15" onPress={() => undefined} />
          <ListRow icon={Moon} iconTone="riposo" title="A letto" subtitle="Questa settimana" value="00:15" onPress={() => undefined} />
          <ListRow icon={Trash2} iconTone="bad" title="Azzera tutto" destructive onPress={() => undefined} />
        </ListGroup>
        <Card padding="none" className="overflow-hidden">
          <CheckRow checked={checks[0]} onChange={(c) => setChecks((x) => [c, x[1], x[2]])} title="Petto di pollo" subtitle="Carne e pesce" meta="≈ 600 g" />
          <div className="ml-14 h-px bg-line" />
          <CheckRow checked={checks[1]} onChange={(c) => setChecks((x) => [x[0], c, x[2]])} title="Riso basmati" subtitle="2 confezioni da 500 g" meta="≈ 450 g" />
          <div className="ml-14 h-px bg-line" />
          <CheckRow checked={checks[2]} onChange={(c) => setChecks((x) => [x[0], x[1], c])} title="Cuoci il riso per 4 pranzi" meta="20 min" tone="accent" />
        </Card>
      </Block>

      <Block title="Dietro un tocco" note="Spiegazioni ed elenchi lunghi restano chiusi: si vede cosa c’è, si apre se serve.">
        <Card className="flex flex-col gap-1">
          <Disclosure title="Valori del giorno" summary="2.640 kcal" icon={Flame}>
            <p className="t-callout">Proteine 142 g su 135, fibre 33 g su 35, 6 porzioni di frutta e verdura.</p>
          </Disclosure>
          <div className="h-px bg-line" />
          <Disclosure title="Già segnate" summary="7 voci" icon={Check}>
            <p className="t-callout">Controllo del mattino, integratori, colazione, spuntino, pranzo, merenda, acqua.</p>
          </Disclosure>
        </Card>
        <Card className="flex flex-col gap-2">
          <p className="t-callout text-ink">Alla vigilia della partita i carboidrati salgono.</p>
          <Disclosure variant="inline" title="Perché">
            Il giorno prima della gara le scorte di glicogeno si riempiono con i carboidrati: le porzioni di pasta, riso
            e pane crescono, proteine e grassi restano uguali.
          </Disclosure>
        </Card>
      </Block>

      <Block title="Campi">
        <Card padding="lg" className="flex flex-col gap-5">
          <Field label="Spuntino">
            <TextInput value={text} onChange={setText} placeholder="Cosa hai mangiato" leading={<Coffee size={18} />} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Peso" hint="A digiuno">
              <NumberInput value={num} onChange={setNum} decimals={1} unit="kg" />
            </Field>
            <Field label="Sveglia">
              <TimeInput value={time} onChange={setTime} />
            </Field>
          </div>
          <Field label="Obiettivo">
            <Select
              value={sel}
              onChange={setSel}
              options={[
                { value: 'ricomposizione', label: 'Ricomposizione' },
                { value: 'dimagrimento', label: 'Dimagrimento' },
                { value: 'massa', label: 'Massa' },
                { value: 'mantenimento', label: 'Mantenimento' },
              ]}
            />
          </Field>
          <Field label="Nota" optional>
            <TextArea value={note} onChange={setNote} placeholder="Cosa hai fatto al posto di quanto previsto" />
          </Field>
          <Field label="Altezza" error="Inserisci un valore tra 120 e 230 cm.">
            <NumberInput value={302} onChange={() => undefined} unit="cm" />
          </Field>
        </Card>
      </Block>

      <Block title="Avvisi">
        <Callout tone="warn" title="Tibia sopra soglia">
          Dolore 4 su 10 ieri sera: oggi mantieni i carichi e salta i balzi. Se domani non scende, senti il fisioterapista.
        </Callout>
        <Callout tone="good" title="Sei notti su sette in orario">
          Alla revisione di domenica l’orario a letto può anticipare di 15 minuti.
        </Callout>
        <Callout tone="accent" title="Consiglio del giorno" action={<Button size="sm" variant="ghost">Perché</Button>}>
          Una vellutata surgelata a cena vale due porzioni di verdura in cinque minuti.
        </Callout>
        <Callout title="Anteprima senza rete">Il coach funziona nell’app installata; qui la rete esterna è bloccata.</Callout>
      </Block>

      <Block title="Stati">
        <Card>
          <EmptyState icon={ShoppingBasket} title="Lista vuota" text="Quando il menù è pronto, qui trovi la spesa divisa per reparto." action={<Button size="sm" variant="secondary">Apri il menù</Button>} />
        </Card>
        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-full" />
            <Skeleton lines={2} className="flex-1" />
          </div>
          <Skeleton className="h-24 w-full rounded-[16px]" />
          <div className="t-footnote flex items-center gap-2 text-ink-2">
            <Spinner /> Caricamento in corso
          </div>
        </Card>
      </Block>

      <Block title="Pannelli e messaggi">
        <div className="grid grid-cols-2 gap-2.5">
          <Button variant="secondary" onClick={() => setSheet(true)}>
            Foglio
          </Button>
          <Button variant="secondary" onClick={() => setModal(true)}>
            Schermo intero
          </Button>
          <Button variant="secondary" onClick={() => toast('Pranzo segnato come fatto', 'good', { actionLabel: 'Annulla', onAction: () => undefined })}>
            Toast con azione
          </Button>
          <Button variant="secondary" onClick={() => toast('Dolore sopra soglia: riduci il carico', 'warn')}>
            Toast attenzione
          </Button>
        </div>
        <ListGroup title="Pannelli dell’app">
          {(['recipe', 'checkin', 'session', 'football', 'barPlanB'] as const).map((t) => (
            <ListRow
              key={t}
              icon={t === 'session' ? Dumbbell : t === 'football' ? BallIcon : t === 'checkin' ? Droplet : t === 'barPlanB' ? Coffee : ShoppingBasket}
              iconTone={t === 'session' ? 'palestra' : t === 'football' ? 'calcio' : 'accent'}
              title={{ recipe: 'Ricetta', checkin: 'Controllo del mattino', session: 'Seduta', football: 'Calcio', barPlanB: 'Piano B al bar' }[t]}
              onPress={() => {
                const o = sampleOverlay(t);
                if (o) open(o);
              }}
            />
          ))}
        </ListGroup>
        <p className="t-footnote px-1 text-ink-3">Data di riferimento: {todayISO()}</p>
      </Block>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Segna la voce"
        subtitle="Pranzo · 14:15"
        footer={
          <Button fullWidth size="lg" icon={Check} onClick={() => setSheet(false)}>
            Fatto
          </Button>
        }
      >
        <div className="flex flex-col gap-3 pb-2">
          <Button variant="secondary" fullWidth>
            Sostituito
          </Button>
          <Button variant="secondary" fullWidth>
            Saltato
          </Button>
          <Field label="Cosa hai mangiato" optional>
            <TextArea value={note} onChange={setNote} rows={2} />
          </Field>
        </div>
      </Sheet>

      <FullScreenModal
        open={modal}
        onClose={() => setModal(false)}
        title="Seduta A"
        subtitle="Parte superiore e prevenzione"
        footer={
          <Button fullWidth size="lg" onClick={() => setModal(false)}>
            Termina
          </Button>
        }
      >
        <div className="flex flex-col gap-4 py-4">
          <Card padding="lg">
            <span className="t-label text-ink-3">Esercizio 1 di 7</span>
            <h3 className="t-title mt-2">Panca con manubri a presa neutra</h3>
            <p className="t-callout mt-2 text-ink-2">Scapole addotte, gomiti a 45 gradi, scendi in 3 secondi.</p>
          </Card>
          <Card padding="lg">
            <Stepper label="Carico" unit="kg" step={2} value={kg} onChange={setKg} size="lg" />
          </Card>
        </div>
      </FullScreenModal>
    </Screen>
  );
}
