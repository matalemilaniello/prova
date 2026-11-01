# Ritmo · design system e API condivise

Riferimento per chi costruisce le schermate. Tutto si importa da `src/ui` (barrel) salvo dove indicato.
Catalogo visivo di ogni componente nei suoi stati: apri l'app su `#kit`.

```ts
import { Screen, Card, Button, Sheet, ListGroup, ListRow, Stat } from '../../ui';
import { useApp, useUi } from '../../state/store';
import { useToday, useNow, useDayLog } from '../../state/hooks';
```

## Regole di stile (in breve)

- **Colori**: solo i token. Tailwind ha SOLO questi colori (più `white`, `black`, `transparent`, `current`):
  `bg`, `bg-elev`, `card`, `card-2`, `card-3`, `line`, `line-strong`, `ink`, `ink-2`, `ink-3`, `ink-4`, `accent`, `accent-ink`,
  `on-accent`, `accent-soft`, `good`, `warn`, `bad` (+ `-soft` e `-ink`), `ink-soft`, `scrim`,
  `calcio`, `palestra`, `leggero`, `riposo` (+ `-ink`), `sheet` (sfondo dei fogli), `control` e `control-line`
  (riempimento e bordo traslucidi dei controlli secondari), `field` (sfondo dei campi).
  Esempi: `bg-card`, `text-ink-2`, `border-line`, `text-accent-ink`, `bg-good-soft`, `text-palestra-ink`.
  Classi come `text-red-500` **non esistono**.
- **Testo colorato** su card: usa le varianti `-ink` (`text-good-ink`, `text-calcio-ink`, `text-accent-ink`):
  nel tema chiaro sono più scure e passano il contrasto AA. Il colore pieno (`bg-good`, `stroke` dei grafici) va
  bene per superfici e linee.
- In TS: `toneColor(tone)` (colore pieno), `toneInk(tone)` (testo colorato AA), `toneSoft(tone, pct)` (fondo
  tenue), `toneRing(tone, pct?)` (anello interno di 1 px, box-shadow), `toneEdge(tone, pct?)` (luce di bordo in
  alto, box-shadow), `toneOn(tone)` (testo sopra il colore pieno) restituiscono la variabile CSS giusta per
  `'neutral' | 'accent' | 'good' | 'warn' | 'bad' | DayType`. Per grafici SVG usa `stroke={toneColor('palestra')}`.
- **L'ambra è luce, non riempimento.** Ambra diluita sul blu notte diventa grigio oliva. Si usa per ciò che emette
  luce: azione primaria, lampade, cifre protagoniste, bordi di 1 px. Nel tema scuro `toneSoft` dei toni caldi
  (`accent`, `calcio`, `warn`, con `pct` sotto 30) e i token `accent-soft` e `warn-soft` sono una superficie blu
  (`--warm-tint`): il colore va su testo, icona e anello. Per le tessere icona usa insieme fondo e anello:
  `style={{ background: toneSoft(t, 16), boxShadow: toneRing(t), color: toneInk(t) }}`. Mai `color-mix` di
  ambra con `transparent` scritto a mano, mai opacità su un elemento ambra (un interruttore disattivato diventa
  oliva: il Toggle disattivato ora usa una pista neutra). Nel tema chiaro vale lo stesso per i riquadri grandi: un
  avviso caldo è una superficie bianca con anello ambra (`--callout-warm-bg`, `--callout-warm-ring`), non una
  velatura beige sul grigio-blu; `warn-soft` nel chiaro è appena un 5% di ambra sul bianco.
- **Neutri**: `ink-soft`, `control`, `field` sono tinti di blu (sopra il blu notte restano blu). `card-3` è il
  riquadro annidato posato direttamente sullo sfondo (es. "L'ultima volta" nel lettore della seduta). `ink-3` passa
  AA in entrambi i temi; `ink-4` è solo decorativo (chevron, linee, segnaposto), mai per testo da leggere.
- **Superfici**: nei fogli (`Sheet`) lo sfondo nel tema chiaro è grigio chiaro e le card bianche risaltano, come nei
  gruppi di iOS. Dentro le card usa `Card variant="nested"` (raggio 14 px) per i riquadri annidati.
- **Tipografia** (utility): `t-large-title` (36 px, titoli di schermata), `t-title` (28), `t-title-2` (22, titoli
  di foglio), `t-headline` (17 semibold), `t-body` (16), `t-callout` (15), `t-footnote` (13), `t-caption` (12),
  `t-label` (etichetta da tabellone: Barlow Condensed 600 maiuscolo 14 px, etichette di sezione),
  `t-mono` (solo orari e numeri tecnici: mai parole, etichette o unità), `t-unit` (unità accanto a un numero, "kcal",
  "g", "kg", "UA", "min", "rip.": Figtree 500 a 12 px; le quantità con parole, "6 uova", "25 min", vanno in Figtree con
  `tabular`),
  `t-num` (numeri protagonisti in Barlow Condensed, tabellari; scegli tu la dimensione: `t-num text-[2.5rem]`).
  Font: `font-display`, `font-sans`, `font-mono`.
- **Forma**: `rounded-card` (20 px), `rounded-control` (14 px), `rounded-full` per le pillole. `shadow-card`
  (nulla al buio, leggerissima al chiaro). Margini laterali: li mette `Screen` (20 px + safe area).
- **Altre utility**: `glass` (sfondo delle barre: 97,5% al buio, 98,5% al chiaro, sfocatura 24 px; il testo sotto non
  si legge), `hit-44` (area toccabile minima 44 px senza cambiare
  l'aspetto), `no-scrollbar`, `tabular`, `selectable` (rende selezionabile un testo: di base l'interfaccia non lo è).
- **Movimento**: `motion/react`. Preset in `src/ui/motion.ts`: `spring` (400/32), `springSnappy`, `springSoft`,
  `fadeUp`, `staggerItem(i)` per liste sfalsate (`<motion.li {...staggerItem(i)}>`), `PRESS_SCALE` (0.97).
  L'app è avvolta in `<MotionConfig reducedMotion="user">`: con la riduzione del movimento le trasformazioni si
  spengono da sole; per animazioni tue usa `useReducedMotion()`.
- **Vibrazione**: `haptic('selection' | 'light' | 'medium' | 'success' | 'warning' | 'error')` da
  `src/lib/haptics.ts` (Android e iPhone con Safari 18+). Button, IconButton, Toggle, Segmented, CheckRow e
  Stepper vibrano già da soli.
- **Testi**: italiano, maiuscola solo sulla prima parola, niente emoji, niente trattino lungo, apostrofo
  tipografico (’: "l’orario", "Com’è andata"). Formattatori in `src/lib/format.ts` (vedi sotto).
  `npm run check:typography` elenca per area gli apostrofi dritti e i trattini lunghi nei testi (stringhe tra apici
  o tra virgolette doppie, template e JSX, non i commenti): tra due lettere ("l'orario") e dopo una parola tronca
  ("un po' di", anche scritto `'un po\' di'`), mentre un apice che apre e chiude una citazione non conta.
  `node scripts/check-typography.mjs --fix --area <area>` sostituisce gli apostrofi nei file dell'area, test
  compresi (`\'` diventa `’` senza escape); `--strict` esce con errore (per la CI). Una riga con il commento
  `tipografia-ok` è esclusa (testi che sono codice).

## Struttura di una schermata

```tsx
export default function OggiScreen() {
  return (
    <Screen
      eyebrow="martedì 10 novembre"
      title="Oggi"
      subtitle={<DayTypeBadge dayType="palestra" />}
      actions={<IconButton icon={Settings} label="Impostazioni" onClick={() => navigate('impostazioni')} />}
    >
      <Card>…</Card>
      <section className="flex flex-col gap-3">
        <SectionTitle action={{ label: 'Vedi tutto', onPress: … }}>Timeline</SectionTitle>
        …
      </section>
    </Screen>
  );
}
```

`Screen` crea il titolo grande, la barra compatta sfocata che compare scorrendo, l'etichetta "Dati di esempio"
quando servono, lo spazio per la barra delle schede e il ritorno in cima quando si ritocca la scheda attiva.
Dietro l'intestazione accende i **Riflettori** (vedi sotto): sopra la riga dell'occhiello ci sono 24 px (+ safe area)
per le batterie di lampade negli angoli. I figli sono impilati con 24 px di spazio (`contentClassName` per cambiarlo).
**Ritmo verticale, uguale in tutta l'app** (Oggi e Impostazioni comprese): 24 px tra le sezioni, 12 px tra il titolo di
sezione e la card e tra le card della stessa sezione, 16 px dentro le card (20 nelle card protagoniste, come Adesso o la
stima del menù). Una card ha al massimo tre livelli di testo: occhiello, titolo o numero, una riga di dettagli.

## Componenti

### Screen
| prop | tipo | note |
|---|---|---|
| `title` | `string` | titolo grande e titolo della barra compatta |
| `eyebrow?` | `ReactNode` | riga in maiuscoletto sopra il titolo (data) |
| `subtitle?` | `ReactNode` | sotto il titolo |
| `actions?` | `ReactNode` | a destra del titolo |
| `onBack?`, `backLabel?` | | pulsante "Indietro" nella barra (es. Impostazioni); un'etichetta lunga si accorcia con i puntini e non finisce sotto il titolo |
| `toolbar?` | `ReactNode` | fascia che resta attaccata in alto (es. `Segmented`) |
| `bottom?` | `'tabbar' \| 'safe'` | spazio in fondo, default `'tabbar'` |
| `light?` | `{ intensity?, tone?, flare?, curfew?, pitch? } \| false` | riflettori dietro l'intestazione (default intensità 0,5); `false` li spegne |

### Floodlights (Riflettori, elemento firma)
Due torri faro negli angoli alti: testa in acciaio di 26 × 16 pt con 8 lampade tonde (4 × 2), visiera, staffa e
traliccio a rombi che scende verso l'esterno e sfuma, inclinate di 20° verso il centro e tagliate appena dal bordo.
La testa resta sopra la riga dell'occhiello e il traliccio nel margine laterale. Due coni di luce bianco calda (uno
largo e sfumato, uno stretto che dà la direzione) ben visibili nei primi 200 pt; righe del campo (cerchio di
centrocampo e metà campo). Le monta già `Screen` (prop `light`) e `FullScreenModal` (intensità 0,35). In una
`Screen` con `onBack` le torri si spengono da sole (starebbero sotto la barra di ritorno). **Se metti i riflettori
sotto un'intestazione tua** (es. spostati in basso con `style.top`), passa `lamps={false}`: la testa finirebbe sotto
l'intestazione e spunterebbe solo un pezzo di traliccio.
Props: `intensity?` 0-1 (lega la luce all'avanzamento della giornata: coni da 0,07 a 0,16, lampade e alone che si
riempiono), `tone?` (tinge il bordo dei coni al 10%, es. il tipo di giorno), `flare?` (bagliore di 900 ms a piena
luce: `true` o un numero che cambia a ogni evento, es. giornata chiusa; spento con la riduzione del movimento),
`curfew?` (dopo il coprifuoco la luce cala verso il lilla), `pitch?` (righe, default true), `height?` (360),
`lamps?` (batterie di lampade, default true; spegnile dove l'angolo alto ospita un controllo, es. un contatore).
`Screen` e `FullScreenModal` accettano `lamps` nella prop `light`; in `FullScreenModal` le lampade sono spente di
base, perché negli angoli ci sono chiudi e azioni.
Nel tema chiaro è una partita di giorno: torre in grigio acciaio scuro, lampade bianche con un alone ambra sottile,
coni come velatura ambra, righe più marcate. Nel tema scuro la testa quasi sparisce nella notte e restano le lampade.
Token: `--lamp` (nucleo), `--lamp-halo` (alone sfocato), `--lamp-rim` (bordo della lampada), `--lamp-housing`
(testa), `--lamp-frame` (telaio, visiera, staffa), `--lamp-mast` (traliccio), `--halo-strength`, `--cone-strength`.
```tsx
<Screen title="Oggi" light={{ intensity: done / total, tone: dayType, flare: closedAt, curfew: afterCurfew }}>…</Screen>
```

### Card
`variant`: `'default' | 'nested' | 'outline' | 'highlight' | 'ghost'`; `padding`: `'none' | 'sm' | 'md' | 'lg'`
(12/16/20 px, default md); `tone?`: su `highlight` colora luce di bordo e anello di 1 px (la luce dall'alto è
bianco calda; con tono `accent` anche un alone esterno), sulle altre varianti accende una luce di bordo in alto; `onPress?` la
rende un pulsante con pressione (**niente pulsanti dentro una Card con `onPress`**: HTML non ammette pulsanti
annidati; in quel caso rendi toccabile solo una parte); `as?`: `'div' | 'section' | 'article' | 'li'`.
```tsx
<Card variant="highlight" tone="palestra" onPress={open}>…</Card>
```

### Button
`variant`: `'primary' | 'secondary' | 'ghost' | 'danger'`; `size`: `'sm' | 'md' | 'lg'` (36/44/52 px);
`icon?`, `iconRight?` (componente lucide, es. `icon={Check}`); `loading?`; `fullWidth?`; `haptic?`.
Il piccolo (`sm`) è alto 36 px ma tocca su 44 (`hit-44`): tienilo ad almeno 4 px da altri elementi toccabili.
```tsx
<Button icon={Check} fullWidth size="lg" onClick={save}>Salva</Button>
<Button variant="ghost" size="sm">Annulla</Button>
```

### IconButton
`icon` (lucide), **`label` obbligatoria** (aria-label); `variant`: `'plain' | 'tinted' | 'filled' | 'glass' | 'accent'`;
`size`: `'sm' | 'md' | 'lg'` (36/44/52); `badge?` (puntino).

### Pressable
Superficie toccabile libera con scala 0.97 e vibrazione: `onPress`, `haptic?`, `pressScale?` + props di button.

### Pill e DayTypeBadge
`Pill`: `tone?` (`Tone | DayType`), `variant?`: `'soft' | 'solid' | 'outline'`, `size?`: `'sm' | 'md'`, `icon?`, `dot?`.
`Pill` soft ha fondo tenue e anello di 1 px nel colore del tono.
`DayTypeBadge`: `dayType`, `variant?`: `'soft' | 'solid' | 'dot'`, `size?`, `label?` (testo al posto del nome),
`showIcon?`. `DAY_TYPE_ICON[dayType]` dà l'icona del tipo di giorno: per il calcio è il pallone (`BallIcon`,
esportato da `src/ui`). Il trofeo (`Trophy`) è riservato ai record personali.
```tsx
<DayTypeBadge dayType="calcio" label="Partita 21:00" />
<Pill tone="good" icon={Check}>Fatto</Pill>
```

### ProgressRing
`value` 0-1, `size?` (120), `stroke?` (10), `tone?`, `label?` (lettori di schermo), `celebrate?` (bagliore
sobrio quando si chiude, default true), `gradient?`, `tipLight?` (lampada sulla punta dell'arco: nucleo chiaro con
l'alone del tono, segue l'avanzamento con la stessa molla; per l'anello protagonista di una schermata, da 140 px,
legato ai riflettori), `marker?` (tacca di una soglia 0-1, es. `0.7` per la giornata riuscita: taglio sottile
nell'anello e trattino appena fuori; scrivila anche nella `label`), `markerSurface?` (colore del taglio, la superficie
sotto l'anello: default `var(--bg)`, su una card `var(--card)`), `children` al centro.
```tsx
<ProgressRing value={done / total} size={148} marker={0.7} label={`${done} voci su ${total}, riuscita dal 70%`}>
  <span className="t-num text-[2.5rem]">{done}</span><span className="t-caption text-ink-2">su {total}</span>
</ProgressRing>
```

### ProgressBar
`value` 0-1, `tone?`, `size?`: `'xs' | 'sm' | 'md'`, `label?`, `marker?` (tacca 0-1), `segments?` (es. 10 bicchieri).
Il riempimento è il colore pieno con un riflesso chiaro in alto (mai diluito con la trasparenza: l'ambra non
diventa oliva).

### Sheet (foglio dal basso)
`open`, `onClose`, `title?`, `subtitle?`, `footer?` (fisso in basso con safe area), `headerAction?`,
`size?`: `'auto' | 'large' | 'full'`, `dismissible?` (default true: trascina giù, tocca lo sfondo, Esc),
`showClose?`, `initialFocus?`, `contentClassName?`. Focus intrappolato e restituito alla chiusura; sale da solo
sopra la tastiera di iPhone (`useKeyboardInset`); il tasto indietro di Android chiude il pannello aperto
dall'host.
Si anima anche in uscita quando è dentro l'`OverlayHost`: nei componenti dei pannelli rendi semplicemente
`<Sheet open onClose={onClose} …>`. Con un pannello aperto tutto il resto della pagina è `inert` e `aria-hidden`
(schermata, barra delle schede, pannelli aperti prima): VoiceOver e la tastiera restano nel pannello in cima. Gli
avvisi restano vivi.
```tsx
<Sheet open={open} onClose={() => setOpen(false)} title="Segna la voce" footer={<Button fullWidth>Salva</Button>}>
  …
</Sheet>
```

### FullScreenModal
Come `Sheet` ma a schermo intero (sale dal basso): `open`, `onClose`, `title?`, `subtitle?`, `headerRight?`,
`footer?`, `closeIcon?`: `'close' | 'down'`, `closeLabel?`, `escapeCloses?`, `light?` (riflettori: stesse props di
`Floodlights` tranne l'altezza, default intensità 0,35 senza righe e senza lampade; `false` li spegne). Per `SessionPlayer`
(riepilogo con `{ flare: true }`) e il rito della sera (`{ curfew: true }`).

### Segmented
`options: { value, label, icon?, badge? }[]`, `value`, `onChange`, **`aria-label`**, `size?`, `fullWidth?`.
Indicatore animato, frecce da tastiera. Con `size="sm"` l'aspetto è più basso ma l'area toccabile resta 44 px.
```tsx
<Segmented aria-label="Sezione" value={tab} onChange={setTab}
  options={[{ value: 'menu', label: 'Menù' }, { value: 'spesa', label: 'Spesa' }, { value: 'prep', label: 'Preparazione' }]} />
```

### Toggle
`checked`, `onChange(checked)`, `label?` (aria) o `aria-labelledby`, `tone?`: `'accent' | 'good'`, `disabled?`.

### Stepper
`value`, `onChange`, **`label`**, `min?`, `max?`, `step?`, `format?`, `unit?`, `hideLabel?`, `size?`: `'md' | 'lg'`.
Tieni premuto per ripetere (accelera). Frecce e Pagina su/giù da tastiera.
```tsx
<Stepper label="Carico" unit="kg" step={2.5} value={kg} onChange={setKg} size="lg" />
```

### ScaleSlider (0-10)
`value: number | undefined` (undefined = non indicato), `onChange`, **`label`**, `min?`, `max?`, `step?`,
`scheme?`: `'pain'` (verde → rosso) | `'energy'` (rosso → verde) | `'neutral'`, `lowLabel?`, `highLabel?`,
`threshold?` (tacca, es. soglia del dolore), `ghost?` (anello vuoto sul valore di riferimento, es. quello di ieri)
con `ghostLabel?` per i lettori di schermo ("ieri"), `describe?(v)` (es. "lieve"), `placeholder?` (invito quando il
valore non c'è, default "Tocca un punto della linea"), `hideLabel?`.
**Non indicato** (`value` undefined): nessun cursore e nessun numero, linea tratteggiata, tacca della soglia e
anello di ieri visibili, l'invito al posto del valore. Mai un valore di partenza a metà scala: per il dolore sarebbe
un'ancora sopra la soglia. Si sceglie toccando un punto qualsiasi della linea (anche su iPhone, dove l'input range
nativo risponde solo al trascinamento) o trascinando in orizzontale; uno scorrimento verticale lascia scorrere la
pagina senza cambiare nulla. L'input nativo resta sotto per tastiera (frecce; Invio o Spazio sceglie il valore di
ieri, o il minimo) e VoiceOver, con i decimali alla italiana ("7,7").
`scaleColor(v, min, max, scheme)` restituisce il colore del valore (energia verde da 7 su 10).

### RatingPicker
`value`, `onChange`, **`label`**, `max?`: `5 | 10`, `min?`, `lowLabel?`, `highLabel?`, `labels?` (testo per ogni
valore), `hideLabel?`. Da 1 a 10 va su due righe da 5 (pulsanti alti 44 px e larghi almeno 50).

### ListGroup e ListRow
`ListGroup`: `title?`, `footer?`, figli = righe (divisori automatici).
`ListRow`: `icon?`, `iconTone?`, `title`, `subtitle?`, `value?` (testo a destra), `trailing?` (Toggle, Pill…),
`chevron?`, `onPress?`, `destructive?`, `disabled?`.
```tsx
<ListGroup title="Sonno" footer="Il passo avanza di 15 minuti a settimana.">
  <ListRow icon={AlarmClock} title="Sveglia" value="07:15" onPress={…} />
  <ListRow icon={Moon} iconTone="riposo" title="Coprifuoco" trailing={<Toggle checked={on} onChange={setOn} label="Coprifuoco" />} />
</ListGroup>
```

### SectionTitle
`children`, `action?` (nodo o `{ label, onPress }`), `subtitle?`, `variant?`: `'label'` (etichetta da tabellone,
default) | `'title'`, `as?`, `id?`. Titolo e azione stanno sulla stessa linea di base; il sottotitolo va sotto su
tutta la larghezza, quindi l'azione resta accanto al titolo anche con un sottotitolo lungo.

### Stat
`label`, `value` (numero animato oppure testo già formattato), `unit?`, `format?`, `decimals?`,
`delta?: { value, unit?, decimals?, tone?: 'good' | 'bad' | 'neutral', label? }`, `caption?`,
`size?`: `'sm' | 'md' | 'lg'`, `align?`, `color?`.
```tsx
<Stat label="Peso medio" value={70.2} decimals={1} unit="kg" delta={{ value: -0.3, unit: 'kg', tone: 'good', label: 'in 7 giorni' }} />
```

### EmptyState
`icon?`, `title`, `text?`, `action?`, `compact?`. Usalo in ogni lista che può essere vuota.

### NumberTicker
`value`, `format?`, `decimals?`, `duration?`. Il numero scorre quando cambia.

### Campi: Field, TextInput, NumberInput, TimeInput, Select, TextArea
`Field`: `label`, `hint?`, `error?`, `optional?`, un solo figlio (riceve id e aria in automatico).
- `TextInput`: `value`, `onChange(string)`, `leading?`, `trailing?` + props di input.
- `NumberInput`: `value: number | undefined`, `onChange`, `decimals?`, `min?`, `max?`, `unit?`. Accetta la virgola.
  `parseItalianNumber(s)` è esportata.
- `TimeInput`: `value: 'HH:MM'`, `onChange`.
- `Select`: `value`, `onChange`, `options: { value, label }[]` (nativo, rotella su iPhone).
- `TextArea`: `value`, `onChange`, `rows?`.
Tutti a 16 px (niente zoom su iOS).
```tsx
<Field label="Peso" hint="A digiuno, dopo il bagno"><NumberInput value={kg} onChange={setKg} decimals={1} unit="kg" /></Field>
```

### CheckRow
`checked`, `onChange`, `title`, `subtitle?`, `meta?` (a destra, in Figtree con cifre tabellari: le quantità
contengono parole, "6 uova", e il monospazio resta agli orari), `tone?`, `disabled?`. Mettila dentro una
`Card padding="none"` o una `ListGroup`.

### Callout
Riquadro di avviso o consiglio: `tone?` (`neutral | accent | good | warn | bad`), `title?`, `icon?`, `action?`,
`children`. Ruolo `alert` per warn e bad. Per l'avviso del dolore (`painGate`), l'anteprima senza rete, la privacy.
I toni caldi (`accent`, `warn`) non colorano il fondo: superficie blu al buio, bianca al chiaro, con anello e luce di
bordo nel colore del tono (token `--callout-warm-bg` e `--callout-warm-ring`).
```tsx
<Callout tone="warn" title="Tibia sopra soglia">Mantieni i carichi e salta i balzi.</Callout>
```

### Chip
Pillola attivabile per scelte multiple (zone di dolore, filtri): `selected`, `onChange(selected)`, `icon?`,
`tone?`, `disabled?`. Usa `aria-pressed`.

### Disclosure (dietro un tocco)
Per togliere testo dalla pagina senza perderlo: spiegazioni, elenchi lunghi, dettagli dei valori. Di base è chiuso.
`title`, `summary?` (riassunto a destra quando è chiuso, es. "7 voci" o "2.450 kcal"), `icon?`,
`variant?`: `'row'` (riga a tutta larghezza alta almeno 44 px, in una Card o da sola) | `'inline'` (collegamento
color luce con la freccia, es. "Perché", con il testo in `t-footnote` sotto), `tone?` (solo `'inline'`: `'accent'`,
default, oppure `'quiet'` in testo secondario, per le spiegazioni ripetute che non devono competere con l'azione
dominante, come i "Come si legge" dei grafici), `defaultOpen?`, `open?` e
`onOpenChange?` (controllato), `contentClassName?`. Pulsante con `aria-expanded` e `aria-controls`; il contenuto
chiuso non è nel DOM; l'altezza si anima con una molla (istantanea con la riduzione del movimento).
```tsx
<Disclosure title="Valori del giorno" summary="2.640 kcal" icon={Flame}>…</Disclosure>
<Disclosure variant="inline" title="Perché">Alla vigilia le scorte di glicogeno…</Disclosure>
```

### useLongPress (hook)
Tocco breve e pressione lunga sullo stesso elemento, con vibrazione, annullamento se il dito scorre e menu
contestuale bloccato. Tastiera: Invio = tocco, Maiusc+Invio o tasto menu = pressione lunga.
```tsx
const lp = useLongPress(() => openOptions(item), { onPress: () => markDone(item) });
<button {...lp}>…</button>
```

### keepHyphens
`keepHyphens(text)` restituisce il testo con le parole che contengono un trattino ("omega-3", "1-2 g") rese
indivisibili, così non vanno a capo a metà. Usalo nei dettagli brevi che possono contenere sigle o intervalli.

### Skeleton, ScreenSkeleton, Spinner
`Skeleton`: `className` (dimensioni) oppure `lines`. `ScreenSkeleton`: schermata in caricamento.
`Spinner`: `size?`, `label?`.

### ToastHost e DemoBadge
`ToastHost` è già montato nell'app: avvisi opachi, il nuovo davanti e al massimo due precedenti compressi dietro
(come le notifiche di iOS), pulsante d'azione alto 44 px. Mostra un messaggio con
`useUi.getState().toast('Salvato', 'good')` oppure con un'azione:
`toast('Voce saltata', 'neutral', { actionLabel: 'Annulla', onAction: undo })`. Toni: `neutral | good | warn | bad`.
`DemoBadge` mostra "Dati di esempio" solo se attivi (Screen lo include già).

## Stato

- `useApp` (zustand persistito, `src/state/store.ts`): tutti i campi di `AppData` più le azioni di SPEC §6,
  in più `deleteFootball(id)`. Seleziona solo quello che ti serve: `useApp((s) => s.plan)`.
  `importData(data)` restituisce `false` se il contenuto non è un backup valido. `addChat(msg)` restituisce l'id.
- Utilità esportate: `emptyDayLog(date)`, `latestWeight(state)`, `normalizeData(raw)`, `migrateData(raw, v)`,
  `pickData(state)` (solo dati, senza azioni: per il backup), `persistedData(state)` (quello che finisce in
  localStorage: le foto della chat oltre le 4 più recenti restano solo in memoria), `safeStorage`,
  `storageFull()` (true se lo spazio è finito; l'utente riceve già un avviso, una volta).
  `announceDataReplaced()` (la chiamano `loadDemo`, `clearDemo`, `importData` e `resetAll`): toglie la seduta in
  corso salvata ed emette `DATA_REPLACED_EVENT` (`'ritmo:dati-sostituiti'`), che `allenamento/draft.ts` ascolta.
- `normalizeData` ripara ogni sezione (diari senza `status`, sedute senza `exercises`, zone di dolore non in
  array, numeri scritti come testo…) e conserva i campi sconosciuti: un backup danneggiato non blocca mai l'app.
  `DATA_VERSION` è 3 (2: fibre da 30 a 35 g; 3: obiettivo del sonno da 23:30 a 23:15 con la sveglia delle 07:15).
  Campi facoltativi del giro 4: `Plan.impactThreshold` resta un numero da 0 a 10 (anche da testo, "2,5"),
  altrimenti sparisce (`normalizeImpactThreshold`); `DayLog.barMeals` tiene solo pasti noti con etichetta e kcal,
  valori numerici tra 0 e un tetto da pasto (`normalizeBarMeal`, `normalizeBarMeals`), e sparisce se vuoto.
- Pasti al bar: `setBarMeal(date, slot, { label, nutrients, vegPortions? } | null)` salva l'ordine già ripulito
  (un ordine senza etichetta o kcal vale come `null`). `setItemStatus` toglie il pasto al bar dello slot quando la
  voce `pasto:<slot>` diventa fatta, saltata o annullata; resta finché il pasto è sostituito. Chi segna un'altra
  sostituzione scritta a mano per quel pasto chiama `setBarMeal(date, slot, null)`.
- `updatePlan({ impactThreshold })`: un valore vuoto o illeggibile toglie il campo (vale il predefinito
  min(soglia, 2)), uno fuori scala si riporta tra 0 e 10.
- `useUi`: `overlay`, `open(overlay)`, `close()`, `toast(message, tone?, opts?)`, `dismissToast(id)`.
- Hook (`src/state/hooks.ts`): **usa questi al posto di `new Date()` nelle schermate**:
  `usePlanDay()` (alias `useLogicalToday()`): **la giornata del piano**, quella da usare in Oggi, Settimana,
  Allenamento, Coach, Progressi e nei pannelli. Fino a 90 minuti prima della sveglia è ancora ieri: alle 00:40 di
  giovedì è mercoledì, in tutte le schermate. `useToday()` è la data del calendario: solo dove serve davvero.
  `useNow(intervalMs?)` (Date aggiornata), `useNowHHMM()` (ridisegna solo quando cambia il minuto),
  `useDayLog(date)` (diario stabile, vuoto se manca), `useDemoData()`. Con la pagina nascosta non ridisegnano.
  `useNutritionState()`: `{ plan, dayLogs, checkIns, profile }` stabile, da passare a `dayNutritionDetail`,
  `dayCarbScale` e `dayTargetFor` (con controlli e profilo il minimo di partita e vigilia usa il peso recente, e i
  numeri coincidono in tutte le schermate).
  Rispettano l'orologio sostituito delle anteprime (`?today=2026-11-10&now=18:30`).

## Navigazione e app (`src/app`)

- `navigate(route)` e `useRoute()` da `src/app/router.ts`. Rotte: `'oggi' | 'settimana' | 'allenamento' |
  'coach' | 'progressi' | 'impostazioni' | 'kit'`. `goBack()` torna alla scheda precedente (per Impostazioni).
- `useUrlParam(name)` / `getUrlParam(name)` da `src/app/urlParams.ts`: legge `?tab=` e gli altri parametri.
  Settimana legge `?tab=menu|spesa|preparazione` per la scheda iniziale (serve agli screenshot).
- `IS_PREVIEW` (anteprima in un unico file: niente rete esterna, niente download), `APP_VERSION`,
  `BUILD_DATE` da `src/app/env.ts`. `getStoragePersistence()`: `'protetta' | 'normale' | 'sconosciuta'` (dopo il
  benvenuto l'app chiede al browser di non cancellare i dati da solo; la pagina Backup può dire "Dati protetti dal
  browser" oppure consigliare il backup). `requestPersistentStorage()` restituisce l'esito.
- `ErrorBoundary` (`src/app/ErrorBoundary.tsx`): `area`, `compact?`, `fallback?`; `root` per l'ultimo livello (già
  attorno all'app: offre "Esporta i dati" e "Azzera e ricomincia"). Se una parte caricata a richiesta non si trova
  più dopo un aggiornamento mostra "È uscita una nuova versione di Ritmo" con "Ricarica" (`isChunkLoadError`).
- Aggiornamenti (solo build Pages, `src/app/pwa.ts`): quando è pronta una versione nuova compare l'avviso "Nuova
  versione pronta" con "Aggiorna"; niente più attivazione a metà sessione.
- `useResolvedTheme()` da `src/app/theme.ts`: `'scuro' | 'chiaro'` effettivo (per grafici o immagini).
- Pannelli: `useUi.getState().open({ type: 'recipe', recipeId, date, slot })` e simili. L'host monta i componenti
  di SPEC §6 con `onClose`.

## Motori e formattatori (fondamenta)

- `src/engine/dates.ts`: `todayISO`, `toISO`, `fromISO`, `addDays`, `daysBetween`, `weekdayOf`, `weekStart`,
  `weekDates`, `weekIndexSince`, `dateRange`, `isISODate`, `formatDayLong` ("martedì 10 novembre", "domenica 1º
  novembre"), `formatShort` ("10 nov", "1º nov"), `formatWeekday`, `formatWeekdayShort`, `formatDayTitle`
  ("Martedì 10", "Domenica 1º"), `formatWeekRange` per etichette e titoli ("9-15 novembre", "26 ottobre-1º novembre":
  trattino senza spazi), `formatWeekSpan` per le frasi ("dal 26 ottobre al 1º novembre", "dall’8 al 14 marzo"),
  `dayOfMonthLabel(n)` ("1º" per il primo del mese), `formatRelativeDay`, `hhmmToMin`, `minToHHMM`, `addMinutes`,
  `minutesBetween` (in avanti, attraversa la mezzanotte), `nightMinutes`/`nightDiff` (orari serali: 00:45 dopo
  23:30), `nowHHMM`, `nowMinutes`, `currentDate`, `compareHHMM`, `isHHMM`.
- `src/engine/nutrition.ts`: `carbFactor`, `lineGrams`, `lineQty`, `lineNutrition`, `recipeNutrition`,
  `recipeVegPortions`, `portionParts` / `formatPortion` ("1 pugno e mezzo · ≈ 225 g"), `portionWords`,
  `roundGrams`, `dayNutrition(date, state, { onlyDone? })`, `dayNutritionDetail` (totale, porzioni di vegetali,
  per pasto, `carbScale`), `addNutrients`, `roundNutrients`, `ZERO_NUTRIENTS`. `onlyDone` conta i pasti con la voce
  `pasto:<slot>` segnata `fatto`.
  **Le porzioni seguono gli obiettivi del piano**: tutte le funzioni per riga e per ricetta accettano un ultimo
  argomento facoltativo `scale` (dopo `foods`): `dayCarbScale(date, state)` (esatto per il giorno: +150 kcal nel
  piano → +150 kcal nel piatto, dai carboidrati) oppure il piano (`planCarbScale`, media del tipo di giorno).
  Esempio: `const k = dayCarbScale(date, { plan, dayLogs }); recipeNutrition(r, dayType, FOODS, k); portionParts(l, dayType, FOODS, k)`.
  `totalCarbFactor(dayType, scale)` è il fattore complessivo da mostrare ("carboidrati −10%").
  `dayNutritionDetail` lo applica già.
  **Partita e vigilia**: il giorno della partita (`isMatchDay`, solo `kind: 'partita'`) e la vigilia (`isMatchEve`) i
  carboidrati non scendono sotto 6 g/kg (`MATCH_CARB_G_PER_KG` in `targets.ts`, UEFA 2021: 6-8 g/kg). Calcetto e
  allenamento no. `referenceWeightKg(date, state)`: media delle pesate dei 7 giorni fino all'ultima pesata entro la
  data, poi il peso del profilo, poi quello delle proteine del piano (1,9 g/kg). `matchCarbs(date, state)` →
  `{ when: 'partita' | 'vigilia', weightKg, gPerKg, floorG, baseG, extraG, extraKcal }` o null.
  `dayTargetFor(date, state)` è **l'obiettivo da mostrare per una data** (tipo effettivo più il minimo: es. 360 → 430
  g e +280 kcal per 72 kg); `dayNutritionDetail` lo restituisce in `target` (e `matchCarbs`). `dayCarbScale` sale
  quanto serve perché il menù previsto arrivi al minimo: nel piatto ci sono davvero 6 g/kg. Lo stato è
  `NutritionState` (`MenuState` più `checkIns` e `profile` facoltativi): passa `useNutritionState()`.
  **Porzioni a parole**: `portionPhrase(qty, unit)` (usata da `portionParts`) tiene le mezze unità quando stanno entro
  il 10% (`PORTION_TOLERANCE`) dei grammi; altrimenti lo dice, con al massimo un quarto di unità di scarto e le unità
  intere preferite: "1 fetta abbondante · ≈ 50 g" (fetta da 40 g), "quasi 1 fetta e mezza", "quasi 2 fette", "mezza
  fetta abbondante". `portionWords` resta l'arrotondamento a mezze unità senza qualificatori. Avvio delle fibre: `fiberRampWeek(date, plan)` (1, 2 o null) e
  `fiberRampFactor` (0,6 / 0,8 / 1).
- `src/engine/menu.ts`: `MEAL_SLOTS`, `menuWeekFor`, `menuDayFor`, `rotationIndexFor`, `dayTypeFor(iso, plan)`
  (tipo previsto dalla settimana: etichette e colori), `effectiveDayType(iso, plan)` (tipo per porzioni e obiettivi:
  la **vigilia della partita** mangia come un giorno di calcio), `isMatchEve(iso, plan)`, `isMatchDay(iso, plan)`,
  `mealsForDate(iso, state)` → `{ dayType (effettivo), scheduledDayType, matchEve, meals: MealEntry[], bySlot }`
  con `recipe`, `plannedId`, `swapped`; `swapOptions(recipeId, slot?)`. L'obiettivo da mostrare è
  `dayTargetFor(iso, state)` (`engine/nutrition.ts`: `plan.targets[effectiveDayType(iso, plan)]` più il minimo di
  carboidrati di partita e vigilia); il badge resta quello di `dayTypeFor`, con la dicitura "Vigilia della partita"
  quando `matchEve`.
  **Giorni di avvio**: `isStarterDay(iso, plan)` è vero dal primo avvio (`Plan.firstUse`) a `starterEnd(plan)`, il
  lunedì che trova fatte spesa e preparazione (il lunedì dopo; chi parte di domenica, quello ancora dopo). In quei
  giorni `mealsForDate` prende i pasti dal menù di avvio `STARTER_WEEK` (`src/data/menu.ts`: ricette da 15 minuti,
  nessuna preparazione, 17 prodotti in `STARTER_PRODUCTS`) e `DayMeals.starter` è vero; la voce ha `starterOf`
  solo quando la ricetta della rotazione al suo posto era da preparazione. Se il menù di avvio non prevede un pasto,
  vale `starterRecipeFor(id, slot)` (la prima delle `swaps` senza preparazione, o la più rapida del pasto). Spesa,
  valori e Oggi seguono da soli, perché passano tutti da `mealsForDate`. Senza `firstUse` (dati di esempio) non ci
  sono giorni di avvio.
- `src/engine/sleep.ts`: `bedtimeFor(iso, plan)` (nelle sere di calcio non prima di fine calcio + 30 min di cena +
  75 min: 00:15 dopo la partita delle 21:00; con `''` restituisce la fase), `curfewFor`, `footballBedtimeFloor`,
  `sleepHours` (**tempo a letto**, non sonno: anche `CheckIn.sleepHours` salva il tempo a letto, così i numeri
  coincidono ovunque), `timeInBedHours` (sinonimo), `timeInBedLabel(bed, wake)` ("8 h a letto": usalo nei testi al
  posto di "sonno"), `estimatedSleep(bed, wake)` (`{ low, high, mid }` con l'efficienza dell'85-90%,
  `SLEEP_EFFICIENCY`), `estimatedSleepLabel` ("circa 7 h di sonno"), `checkInSleepHours`, `isOnTarget`,
  `isOnTargetFor(bed, checkInDate, plan)` (il controllo del
  mattino si confronta con la sera prima: **usalo per contare le notti in orario**), `nightsOnTarget`,
  `nextBedtime`, `weeksToTarget`, `atSleepTarget`, `plannedSleepHours`, `minutesUntilNight`, `dayCutoffMin(plan)`
  (inizio della giornata: sveglia − 90 min, tra le 03:00 e le 10:00), `planDayISO(now, plan)`.
- `src/engine/targets.ts`: `bmrMifflin`, `tdee`, `ageFrom`, `computeTargets(profile, weightKg?)`, costanti
  `PROTEIN_G_PER_KG` (1,9), `FAT_SHARE`, `FIBER_G`, `MATCH_CARB_G_PER_KG` (6, applicato per data da `matchCarbs`).
- `src/lib/format.ts`: `fmtNumber`, `fmtKcal` ("2.600 kcal"), `fmtKg` ("70,2 kg"), `fmtLoad`, `fmtGrams`,
  `fmtLiters`, `fmtCm`, `fmtPercent`, `fmtHours` ("6 h 40"), `fmtMinutes` ("1 h 20", "45 min": spazi indivisibili
  anche tra ore e minuti, la durata non va mai a capo a metà), `fmtClock`
  ("1:30"), `fmtDelta` ("+0,4 kg", "−0,3 kg"), `fmtTime`, `fmtDateLong`, `fmtDateShort`, `fmtDateCompact`
  ("mar 10", "dom 1º"), `fmtDayTitle`, `capitalize`, `plural`, `listIt`; etichette `DAY_TYPE_LABEL`, `DAY_TYPES`,
  `MEAL_SLOT_LABEL`, `FOOTBALL_LABEL`, `WEEKDAY_LONG`, `WEEKDAY_SHORT`, `WEEKDAY_INITIAL`.
  Gli spazi prima delle unità sono indivisibili.
- `src/data/defaults.ts`: valori predefiniti, `defaultPlan`, `defaultAppData`, `isProfileComplete`,
  `SUGGESTED_PAIN_SITES`, `DEFAULT_COACH_MODEL`. Profilo vuoto: anno, altezza e peso valgono 0 finché non inseriti.
  Sonno predefinito: sveglia 07:15, obiettivo a letto 23:15 (8 ore a letto, circa 7 di sonno vero).
  `planStartFor(today)`: il lunedì da cui parte il piano alla fine del benvenuto (questa settimana dal lunedì al
  giovedì, la prossima dal venerdì alla domenica: chi comincia domenica sera vive lunedì la settimana 1).
- `src/lib/id.ts`: `uid(prefix?)`, `hashString(s)` (scelte deterministiche, es. consiglio del giorno), `slug(s)`.

- `src/engine/timeline.ts` (oltre a `buildTimeline` e `buildDay`): `gymDuration(sessionId, { physio, workoutLogs })`
  è la durata della seduta come la mostra Allenamento (`sessionDuration`: fase di ingresso, doppioni del
  fisioterapista tolti, `own` + `physio` = `total`); `gymTotalMin` il totale in minuti. `firstReviewWeek(plan)` e
  `isReviewableWeek(monday, plan)`: la prima settimana da rivedere (riesportate da `engine/review.ts`).

## Parametri URL (anteprime e screenshot)

I dati di esempio sono deterministici per giornata: lo storico dei giorni passati non cambia con `?now=`, che decide
solo quali voci di oggi risultano già segnate.

`?demo=1` dati di esempio senza onboarding · `?theme=scuro|chiaro` (anche `dark|light`) · `?overlay=recipe|checkin|session|football|barPlanB`
· `?onboarding=1` · `?tab=…` (scheda iniziale di una schermata) · `?today=YYYY-MM-DD` e `?now=HH:MM` (orologio fisso).
Esempio: `index.html?demo=1&theme=chiaro&now=18:30#oggi`.
