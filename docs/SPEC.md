# Ritmo · specifica di costruzione (fase 1 + anteprima del coach)

Questo documento è il brief unico per chiunque lavori sul codice. Leggilo tutto prima di scrivere una riga.
Il contratto dei dati è `src/domain/types.ts`: non cambiarlo. Se ti serve un campo in più, aggiungilo in modo
retrocompatibile (opzionale) e annotalo in fondo a questo file nella sezione "Modifiche al contratto".

## 1. Il prodotto in una frase

Un'app web installabile su iPhone che **decide per l'utente la giornata** (cosa mangiare, come allenarsi intorno
alle partite di calcio, quando posare il telefono e dormire) e gli chiede solo di **eseguire e segnare con un
tocco**. La domenica, in 10 minuti, l'utente rivede la settimana e accetta le correzioni proposte.

Persona: calciatore amatoriale adulto che va in palestra (partita, calcetto e allenamento serali durante la
settimana), con il pomeriggio libero e una storia di infortuni da sovraccarico; le zone da monitorare le sceglie
nel profilo. I contenuti tecnici devono reggere lo sguardo di un professionista della nutrizione e
dell'allenamento. Problemi tipici: mangia male (bar, dolci, poca frutta e verdura per comodità), va a letto tardi
perché resta al telefono, si allena in palestra senza programma, dimentica gli integratori. Priorità:
1) salute (infiammazione di basso grado, microbiota), 2) rendimento nel calcio senza infortuni, 3) un po' di
muscolo (ricomposizione).

**Privacy: il repository è pubblico.** Nel codice non scrivere mai dati personali (nome, età, peso, esami,
diagnosi). I valori predefiniti sono generici e plausibili per "calciatore amatoriale che va in palestra";
l'utente li conferma o li cambia nell'onboarding e tutto resta salvato solo sul dispositivo.

## 2. Principi che guidano ogni scelta

1. **Decidi una volta, esegui sette.** Niente schermate che chiedono di pianificare durante la settimana.
2. **Un tocco per voce.** Fatto, sostituito o saltato. Niente diario alimentare con grammature.
3. **Anche la giornata minima conta.** Nei giorni no bastano quattro cose; la giornata vale comunque.
4. **Il piano impara.** Peso, sonno, dolori e carico correggono il piano nella revisione della domenica.
5. **Tempo d'uso:** 2-3 minuti al giorno, 10 la domenica.
6. **Funziona offline**, tutto in locale. Solo il coach usa la rete.

## 3. Lingua e testi (vincolante)

- Tutta l'interfaccia è in **italiano**. Evita anglicismi quando esiste un equivalente preciso: "controllo del
  mattino" (non check-in), "seduta" (non workout), "carico" (non load), "spesa", "preparazione", "revisione",
  "impostazioni", "salva", "annulla". Ammessi: "coach", "RPE", "RIR", "Nordic", "Copenhagen" (termini tecnici).
- **Maiuscole:** nei titoli e nelle etichette solo la prima parola maiuscola (più i nomi propri). "Lista della
  spesa", non "Lista Della Spesa".
- Frasi brevi, voce attiva, tono da allenatore competente e calmo. Niente esclamazioni a raffica, niente emoji.
- Incisi con le virgole; il trattino lungo (—) non si usa nei testi dell'interfaccia. Apostrofo tipografico (’) e
  virgolette basse (« »): `scripts/check-typography.mjs` li controlla nella CI.
- Errori: dicono cosa è successo e come rimediare, senza scuse.
- Numeri e date in formato italiano: `2.600 kcal`, `70,2 kg`, `6 h 40`, `martedì 10 novembre`, orari `07:30`.
  Usa `Intl.NumberFormat('it-IT')` e `Intl.DateTimeFormat('it-IT')`.

## 4. Stack tecnico

- **Vite + React + TypeScript** (strict). Scegli versioni che si installano senza conflitti di peer
  dependency e che compilano: se TypeScript 7 crea problemi con gli strumenti, usa l'ultima 5.x.
- **Tailwind CSS v4** (`@tailwindcss/vite`) con i token del design system come variabili CSS (`@theme`).
- **motion** (Framer Motion) per le animazioni; rispetta `prefers-reduced-motion`.
- **zustand** con `persist` su `localStorage` (chiave `ritmo:v1`, campo `version`, funzione `migrate`).
- **lucide-react** per le icone.
- **Font self-hosted** con `@fontsource`: Barlow Condensed (500, 600, 700) per titoli e numeri grandi,
  Figtree (400, 500, 600, 700) per l'interfaccia, IBM Plex Mono (400, 500) per orari e dati.
- **vite-plugin-pwa** per service worker e manifest (solo nella build per GitHub Pages).
- **vite-plugin-singlefile** per la build "anteprima" in un unico file HTML.
- **@anthropic-ai/sdk** per il coach (chiamata diretta dal browser con chiave personale, vedi §12).
- **Vitest** per i test dei motori; **Playwright** (già installato nel sistema: `require('playwright')`
  funziona senza installare nulla, Chromium in `/opt/pw-browsers`) per gli screenshot.
- Nessun router esterno: router a hash minimale (vedi §6).

### Build

- `npm run dev` · sviluppo.
- `npm run build` · build per GitHub Pages in `dist/`, `base: '/prova/'`, con PWA.
- `npm run build:preview` · build in un unico file `dist-preview/index.html`, `base: './'`, **senza service
  worker**, per l'anteprima come Artifact su claude.ai. Variabile: `import.meta.env.MODE === 'preview'`.
  Nell'anteprima: niente rete esterna (il coach mostra un avviso), i download di file non funzionano
  (l'esportazione usa la copia negli appunti).
- `npm test` · Vitest. `npm run typecheck` · `tsc --noEmit`.
- `npm run screenshots` · `scripts/screenshots.mjs`: avvia `vite preview` (o legge la build) e salva PNG di
  ogni schermata e di ogni pannello in `screenshots/` a 390×844 (iPhone), tema scuro e chiaro, con i dati di
  esempio caricati. Deve poter aprire i pannelli (ricetta, controllo del mattino, seduta, coach, revisione).
  Supporta l'URL `?demo=1` che carica i dati di esempio e salta l'onboarding, e `?theme=chiaro|scuro`.
  Supporta anche `?overlay=recipe|checkin|session|football|barPlanB` per aprire un pannello (con `?recipe=<id>` la
  ricetta da aprire) e `?onboarding=1` per mostrare l'onboarding. La vista `oggi-primo-giorno` simula il primo giorno di un utente nuovo
  (dati svuotati, primo avvio alle 15:30 di un mercoledì, senza dati di esempio).

### Pubblicazione

`.github/workflows/deploy.yml`: su push a `main` e a `claude/focused-mendel-tgcz8o` esegue `npm ci`,
`npm run typecheck`, `npm test`, il controllo tipografico dei testi (`node scripts/check-typography.mjs --strict`),
`npm run build` e pubblica `dist/` sul ramo `gh-pages` (es. `peaceiris/actions-gh-pages@v4`,
`permissions: contents: write`). L'utente dovrà solo scegliere il ramo `gh-pages` in Settings → Pages.
URL finale: `https://matalemilaniello.github.io/prova/`.

## 5. Design system

Direzione: **"campo di sera"**. Blu notte profondo, la luce calda dei riflettori come accento, linee pulite
come le righe del campo. Premium, calmo, leggibile alla luce del sole e al buio. Ispirazione: le migliori app
iOS native (spaziature generose, titoli grandi, fogli che salgono dal basso, movimenti a molla), non dashboard
web. Evita: crema + serif + terracotta, nero con un solo verde acido, gradienti viola-blu, emoji come icone,
tutto centrato, ombre e bordi arrotondati identici ovunque.

### Token (CSS custom properties, in `src/styles/tokens.css`)

Tema scuro (predefinito con `prefers-color-scheme: dark` o impostazione "scuro"):

| token | valore | uso |
|---|---|---|
| `--bg` | `#0A1220` | sfondo app |
| `--bg-elev` | `#0F1A2C` | barre, fogli |
| `--card` | `#142036` | card |
| `--card-2` | `#1A2842` | card annidate, input |
| `--line` | `#22324D` | bordi, divisori |
| `--ink` | `#EEF2F8` | testo principale |
| `--ink-2` | `#A9B5CA` | testo secondario |
| `--ink-3` | `#6E7E99` | testo terziario, segnaposto |
| `--accent` | `#F5C04A` | riflettori: azione principale, evidenze |
| `--on-accent` | `#1B1405` | testo su accento |
| `--good` | `#4CC38A` | fatto, in miglioramento |
| `--warn` | `#F0A548` | attenzione |
| `--bad` | `#F2706A` | dolore alto, errore |
| `--calcio` | `#F5C04A` | tipo di giorno calcio |
| `--palestra` | `#6EA8FE` | tipo di giorno palestra |
| `--leggero` | `#4FD1C5` | tipo di giorno leggero |
| `--riposo` | `#B39DFF` | tipo di giorno riposo |

Tema chiaro ("giorno di partita"): `--bg #F3F5F9`, `--bg-elev #FFFFFF`, `--card #FFFFFF`, `--card-2 #EEF2F7`,
`--line #DCE2EC`, `--ink #0D1A2C`, `--ink-2 #4B5A72`, `--ink-3 #7D8BA3`, `--accent #E3A21F`,
`--on-accent #1B1405`, `--good #1E8A57`, `--warn #B86A08`, `--bad #C9372C`, `--calcio #C98A0E`,
`--palestra #2F6FE0`, `--leggero #138A80`, `--riposo #6E56D8`. Per testo color accento su fondo chiaro usa
`--accent-ink #8A5A00` (definiscilo anche nel tema scuro uguale a `--accent`).

Il tema segue `Settings.theme` ('sistema' | 'scuro' | 'chiaro') impostando `data-theme` su `<html>`; con
'sistema' segue `prefers-color-scheme`. Aggiorna anche `<meta name="theme-color">`.

### Tipografia

- Titoli grandi di schermata: Barlow Condensed 700, 34-40 px, interlinea 1.
- Numeri protagonisti (kcal, peso, ore di sonno, carichi): Barlow Condensed 600-700, `tabular-nums`.
- Interfaccia e testi: Figtree 15-17 px (input almeno 16 px per evitare lo zoom su iOS).
- Orari, unità, etichette tecniche: IBM Plex Mono 11-13 px, maiuscoletto con spaziatura 0.06em per le
  etichette di sezione.

### Forma, spazio, movimento

- Griglia a 4 px. Margini laterali 16-20 px più le safe area (`env(safe-area-inset-*)`).
- Raggi: card 20 px, controlli 14 px, pillole 999 px. Le card non hanno ombra nel tema scuro (si staccano col
  colore); nel chiaro ombra molto leggera.
- Barra delle schede in basso con sfondo sfocato (`backdrop-filter`), icona + etichetta, indicatore animato.
- Fogli dal basso (`Sheet`) con maniglia, trascinamento per chiudere, sfondo oscurato.
- Animazioni: molle brevi (stiffness ~400, damping ~32), pressione dei tasti `scale(0.97)`, liste con
  ingresso sfalsato leggero, numeri che scorrono quando cambiano, cerchio di avanzamento animato.
  Un solo momento "wow" per schermata, il resto quieto. Quando la giornata è completa: piccola celebrazione
  sobria (anello che si chiude con un bagliore), niente coriandoli da festa.
- Aree toccabili ≥ 44 px. Focus visibile. Contrasto AA in entrambi i temi.

### iOS e PWA

`viewport-fit=cover`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style:
black-translucent`, `apple-touch-icon` 180 px, icone 192/512 e maskable, `display: standalone`,
`theme_color`, `background_color`, nome "Ritmo". Disattiva l'effetto elastico sullo scroll del body
(`overscroll-behavior: none`), usa `100dvh`, niente evidenziazione al tocco grigia. Icona: disegno originale
(es. una "R" condensata su blu notte con un arco di luce ambra, oppure un cerchio di avanzamento stilizzato):
genera i PNG da un SVG con Playwright.

## 6. Architettura

```
src/
  domain/types.ts            contratto dei dati (NON modificare le forme)
  data/                      contenuti statici (alimenti, ricette, menù, esercizi, sedute, valori predefiniti)
  engine/                    funzioni pure, testate (date, nutrizione, menù, timeline, spesa, allenamento…)
  state/store.ts             stato zustand persistito
  ui/                        design system (componenti riusabili)
  app/                       guscio, router, barra delle schede, host dei pannelli
  features/<area>/           schermate e componenti di ogni area
  lib/                       utilità (formato, id, vibrazione, immagini, client del coach, backup)
  demo/seed.ts               dati di esempio
```

### Router

Hash semplici (compatibili con gli Artifact, che accettano solo `#nome`): `#oggi` (predefinito),
`#settimana`, `#allenamento`, `#coach`, `#progressi`, `#impostazioni`, `#kit` (catalogo dei componenti, non in
barra). Se `onboarded === false` si mostra `BenvenutoScreen` a schermo intero. I sotto-livelli (ricetta,
seduta, controllo, revisione…) sono pannelli gestiti dallo stato, non route.

Barra delle schede (5): **Oggi**, **Settimana**, **Allenamento**, **Coach**, **Progressi**. Le impostazioni si
aprono dall'icona ingranaggio nell'intestazione di Oggi e Progressi.

### Host dei pannelli

`src/app/OverlayHost.tsx` legge `ui.overlay` (stato non persistito) e monta il componente giusto, importato
da percorsi fissi (contratto tra moduli). Ogni componente riceve il payload del pannello più `onClose`:

| overlay.type | file (export default) | props |
|---|---|---|
| `recipe` | `src/features/settimana/RecipeSheet.tsx` | `{ recipeId, date, slot?, onClose }` |
| `checkin` | `src/features/oggi/CheckInSheet.tsx` | `{ date, onClose }` |
| `session` | `src/features/allenamento/SessionPlayer.tsx` | `{ sessionId, date, onClose }` (schermo intero) |
| `football` | `src/features/oggi/FootballSheet.tsx` | `{ date, kind, itemId, onClose }` |
| `barPlanB` | `src/features/coach/BarPlanBSheet.tsx` | `{ slot?, onClose }` |

Apertura da qualunque punto: `useUi.getState().open({ type: 'recipe', ... })`.

### Stato (`src/state/store.ts`)

Due store zustand:

- `useApp` (persistito, forma `AppData` + azioni). Azioni obbligatorie:
  - `completeOnboarding(profile, plan)`, `updateProfile(patch)`, `updatePlan(patch)`, `setTarget(dayType, patch)`,
    `setScheduleDay(weekday, patch)`
  - `setItemStatus(date, itemId, status | null, note?)`, `setMinimal(date, on)`, `addWater(date, delta)`,
    `addSweet(date, delta)`, `swapRecipe(date, slot, recipeId | null)`
  - `saveCheckIn(checkIn)`, `saveWorkout(log)`, `deleteWorkout(id)`, `saveFootball(log)`, `saveReview(review)`
  - `applyProposal(proposal)` (gestisce `sleepCurrent` e `kcalDelta`)
  - `setPhysio(exercises, prescriptions)`
  - `toggleShopping(weekStart, key)`, `togglePrep(weekStart, taskId)`
  - `addChat(msg)`, `updateChat(id, patch)`, `clearChat()`
  - `updateSettings(patch)`, `loadDemo()`, `clearDemo()`, `importData(data)`, `resetAll()`
  - `getDayLog(date)` restituisce il diario del giorno o uno vuoto, senza scriverlo.
- `useUi` (non persistito): `overlay`, `open(overlay)`, `close()`, `toast(message, tone?)`, coda dei toast.

Se una schermata ha bisogno di un'azione che manca, la implementa nel proprio modulo con `useApp.setState`,
senza modificare `store.ts` (evita conflitti tra chi lavora in parallelo).

### Valori predefiniti (`src/data/defaults.ts`)

- Profilo: sesso 'M', anno di nascita vuoto da chiedere, altezza e peso da chiedere, obiettivo
  'ricomposizione', zone di dolore suggerite (l'utente sceglie): Tibia, Gomito, Ginocchio, Flessori,
  Adduttori, Caviglia, Schiena, Spalla. Acqua 2,5 l.
- Obiettivi per tipo di giorno: calcio 2.800 kcal (P 135, G 80, C 385, fibre 35); palestra 2.600 (135/80/335/35);
  leggero 2.450 (132/80/300/35); riposo 2.300 (130/80/265/35). Una funzione in `engine/targets.ts` li
  ricalcola da sesso, età, altezza e peso (Mifflin-St Jeor × fattore di attività per tipo di giorno, proteine
  1,9 g/kg, grassi ~28% kcal, carboidrati il resto) quando l'utente lo chiede nell'onboarding.
- Settimana: lun calcio (partita 21:00, 90 min, fisio), mar palestra (A alle 17:00), mer calcio (calcetto 21:00,
  60 min, fisio), gio calcio (allenamento 20:30, 90 min), ven palestra (B alle 17:00), sab leggero (C facoltativa
  alle 11:00), dom riposo.
- Integratori: creatina monoidrato 5 g (colazione), omega-3 1-2 g EPA+DHA (colazione), vitamina D "dose da
  definire con l'esame" (colazione). Tutti attivi.
- Sonno: sveglia 07:15, attuale 00:45, obiettivo 23:30, passo 15 min, coprifuoco 30 min prima.
- Orari dei pasti: colazione 07:30, spuntino 10:30, pranzo 14:15, merenda 16:30, cena 20:30.
  Nei giorni di partita la cena si sposta: merenda pre-partita alle 18:30 e cena di recupero dopo la partita
  (gestito dalla timeline, non dagli orari salvati).
- Dolci programmati: 3 a settimana. Soglia del dolore: 3.

## 7. Motori (funzioni pure in `src/engine/`, ciascuno con test)

Tutte le date sono locali. Mai `new Date('YYYY-MM-DD')` (UTC): usa i costruttori locali.

- `dates.ts` · `todayISO()`, `toISO(d)`, `fromISO(s)`, `addDays(iso, n)`, `weekdayOf(iso): Weekday`,
  `weekStart(iso)` (lunedì), `weekDates(weekStartIso)`, `weekIndexSince(startIso, iso)`,
  `formatDayLong(iso)` → "martedì 10 novembre", `formatShort`, `minutesBetween(a: HHMM, b: HHMM)`,
  `addMinutes(t: HHMM, m)`, `hhmmToMin`, `minToHHMM`, gestione orari dopo mezzanotte.
- `targets.ts` · `bmrMifflin`, `tdee`, `computeTargets(profile, weightKg)`.
- `nutrition.ts` · `carbFactor(dayType)` (calcio 1.25, palestra 1, leggero 0.9, riposo 0.75),
  `lineGrams(line, dayType)`, `recipeNutrition(recipe, dayType): Nutrients`, `recipeVegPortions`,
  `formatPortion(line, dayType)` → "1 pugno e mezzo · ≈ 225 g" (arrotonda le porzioni a mezze unità),
  `dayNutrition(date, state)` somma i pasti del giorno (con eventuali sostituzioni di ricetta). Le righe
  `carbScaled` seguono anche gli obiettivi del piano (`dayCarbScale`): +150 kcal nel piano, +150 kcal nel piatto.
  Partita e vigilia hanno un minimo di carboidrati di 6 g/kg (`MATCH_CARB_G_PER_KG` in `targets.ts`, `isMatchDay`
  in `menu.ts`): `referenceWeightKg` (media delle pesate dei 7 giorni, poi il peso del profilo, poi proteine / 1,9),
  `matchCarbs(date, state)` (minimo, base, grammi e kcal da aggiungere), `dayTargetFor(date, state)` (obiettivo
  della data: tipo di giorno effettivo più il minimo) e `dayCarbScale`, che alza le righe di carboidrati del menù
  previsto fino al minimo, così i 6 g/kg sono nel piatto e non solo nell'obiettivo. Calcetto e allenamento non
  cambiano. Le funzioni accettano `NutritionState` (piano e diario, controlli e profilo facoltativi: senza peso il
  minimo si ricava dalle proteine); `DayNutritionDetail.target` e `.matchCarbs` danno a ogni schermata lo stesso
  obiettivo (`useNutritionState()` in `state/hooks.ts`). Con `onlyDone` un pasto sostituito con il piano B al bar
  vale i valori dell'ordine (`DayLog.barMeals`), come nella revisione. Le porzioni a occhio usano `portionPhrase`:
  mezze unità, con "abbondante" o "quasi" quando l'arrotondamento si allontanerebbe dai grammi di oltre il 10%
  ("1 fetta abbondante · ≈ 50 g", "quasi 2 fette"). A pezzi la porzione nomina l'alimento e mai "pezzo"
  (`PIECE_WORDS`: "7 gallette", "mezzo limone", "uno spicchio d’aglio"); gallette, quadretti, frutta secca, uova e
  cubetti si contano solo a unità intere (`WHOLE_PIECES`). Il menù previsto su cui `dayCarbScale` misura il minimo è
  quello di `mealsForDate` senza le sostituzioni del diario: nei giorni di avvio il menù di avvio.
- `menu.ts` · `menuWeekFor(iso, planStart)` (rotazione su `MENU_ROTATION`), `mealsForDate(iso, state)`:
  restituisce per ogni slot la ricetta effettiva (sostituzioni comprese) e il tipo di giorno delle porzioni
  (`effectiveDayType`: la vigilia della partita mangia come un giorno di calcio). Nei giorni di avvio
  (`isStarterDay`: dal primo avvio al lunedì che trova fatte spesa e preparazione) i pasti vengono dal menù di
  avvio `STARTER_WEEK` (ricette da 15 minuti, nessuna preparazione, 17 prodotti), e spesa, valori e Oggi lo
  seguono da soli.
- `sleep.ts` · `bedtimeFor(iso, plan)` (usa `plan.sleep.current`; nelle sere di calcio non prima di fine calcio
  + 30 min di cena + 75 min, es. 00:15 dopo la partita delle 21:00), `curfewFor`, `sleepHours(bed, wake)`,
  `nightsOnTarget(checkIns, plan, dates)` (ogni controllo si confronta con la sera prima), `dayCutoffMin` e
  `planDayISO` (la giornata cambia 90 minuti prima della sveglia: tutte le schermate usano `usePlanDay()`).
- `timeline.ts` · `buildTimeline(iso, state): TimelineItem[]` ordinata per orario:
  controllo del mattino (sveglia + 5 min), integratori (con la colazione), i 5 pasti, palestra (se prevista),
  calcio, esercizi del fisio (solo se l'utente li ha inseriti: altrimenti Oggi mostra una riga che invita a
  inserirli e non conta), coprifuoco, a letto. Nei giorni di partita/calcetto/allenamento serale: merenda
  pre-calcio ~2 h 30 prima, cena di recupero dopo il calcio (se il calcio finisce dopo le 21:30 la cena è
  "cena di recupero, veloce e digeribile"). In modalità minima restituisce le 4 voci `minima:*`
  (proteine a ogni pasto, almeno un frutto, integratori, telefono fuori dalla camera); calcio e palestra
  restano come appuntamenti che non contano.
  `buildDay(iso, state)` è quello che mostra Oggi: la timeline più i riti del fine settimana (spesa il sabato,
  preparazione e revisione la domenica), con lo stato ricavato da `shoppingChecked`, `prepDone` e `reviews`.
  Primi giorni: la spesa di avvio (`rito:spesa-avvio`, `starterShopping`) il primo giorno feriale dal primo
  avvio, un'ora dopo il pranzo e mezz'ora dopo l'avvio, entro le 19:30 (chi comincia di domenica la fa il
  lunedì, chi comincia di sabato no), con il numero dei prodotti. La revisione della domenica compare solo per
  una settimana da rivedere (`firstReviewWeek`: quella del primo avvio se restano almeno 3 giorni alla domenica,
  mai prima della settimana di inizio del piano); la preparazione no se anche il lunedì dopo è un giorno di
  avvio. La palestra dura come in Allenamento (`gymDuration`: `sessionDuration` con la fase di ingresso e il
  blocco del fisioterapista).
  Le voci prima del primo avvio (`Plan.firstUse`) non contano. Coprifuoco, letto e telefono fuori si segnano
  solo da un'ora prima del coprifuoco (quelle dei giorni passati sempre).
  Prima della prima spesa (`firstShopping`: quella di avvio o, per chi comincia il venerdì sera o il sabato, la
  spesa del sabato, mai prima di mezz'ora dopo il primo avvio) i pasti dei giorni di avvio hanno `preShopping` e il
  dettaglio "Con quello che hai: proteine, un carboidrato, frutta o verdura" (`PRE_SHOPPING_DETAIL`), con il piano B
  al bar; con la spesa fatta o una ricetta scelta a mano il segno sparisce. Gli integratori con la dose "da
  definire" non entrano nella voce da segnare (`takenSupplements`, `doseUndefined`): Oggi lo ricorda con una riga
  che non conta il lunedì e il giorno del primo avvio (`supplementDoseDue`).
  `dayAdherence(iso, state)`: fatto = 1, sostituito = 0,5, saltato o non segnato = 0, su tutte le voci tranne
  `letto`; `daySuccessful`: aderenza ≥ 70% oppure giornata minima con 4 voci su 4. `streak(state, today)` e
  `streakInfo`: con 5 giornate riuscite in una settimana si guadagna un jolly (al massimo uno da parte), che
  salva la serie alla prossima giornata non riuscita; la giornata salvata non si somma ma non spezza.
- `shopping.ts` · `shoppingList(weekStartIso, state)`: somma i grammi di tutti gli ingredienti della settimana
  (tipo di giorno compreso, sostituzioni comprese), applica `buyFactor`, raggruppa per `ShopCategory`,
  arrotonda in modo umano ("≈ 600 g", "6 uova", "2 confezioni da 400 g"), separa i prodotti da dispensa.
  Le chiavi delle spunte sono gli id degli alimenti. Chi comincia il venerdì sera o il sabato non ha la spesa di
  avvio: la lista della settimana dopo comprende anche i pasti di avvio da dopo la spesa del sabato alla domenica
  (`lead`, calcolato da `shoppingLeadFor` in `timeline.ts`), senza note di congelamento per quei giorni.
  `shoppingList` accetta `NutritionState`: le quantità di partita e vigilia seguono il minimo di carboidrati.
  Conservazione: un fresco regge fino al giorno dopo la spesa (`FRESH_DAYS` = 1, `freshUntil`); oltre, la lista dice di
  metterlo in freezer a porzioni. Il giorno della spesa è `ShoppingOptions.shopDate` (per difetto `defaultShopDate`: il
  sabato prima del lunedì, il sabato della prima spesa con `lead`, il primo giorno di avvio nella spesa di avvio).
- `training.ts` · `lastLogFor(exerciseId, logs)`, `suggestNext(sessionExercise, lastLog)` (progressione
  doppia: se tutte le serie hanno raggiunto `repMax` con il carico precedente, proponi carico +incremento e
  `repMin`; altrimenti stesso carico puntando a +1 ripetizione; dopo due esecuzioni di fila con la media delle
  ripetizioni sotto `repMin` allo stesso carico, cioè uno stallo, il carico scende del 10% circa, arrotondato
  all'incremento, e si risale), `e1rm(weight, reps)` (Epley),
  `sessionLoad(durationMin, rpe)`, `weeklyLoad(weekStart, state)` (palestra + calcio),
  `loadAlert(weekStart, state)` (settimana > 120% della media delle 4 precedenti; serve almeno 2 settimane di
  storico), `painGate(state, iso)` (regola di Silbernagel adattata: dolore ≤ soglia ok; sopra soglia o in
  peggioramento → "mantieni o riduci", e suggerisci alternative `elbowFriendly` quando la zona è il gomito).
  Con `workoutLogs` e `footballLogs` conta anche il dolore registrato a fine seduta (entro 2 giorni) e il
  giorno dopo una seduta o un calcio (il dolore del mattino sale di almeno 1 punto). Per le zone sotto il
  ginocchio gli impatti (balzi, salti, partita) hanno la soglia `impactThresholdFor(plan)`: `Plan.impactThreshold`
  scelta con il fisioterapista, altrimenti min(soglia, 2), mai sopra la soglia generale (`gate.impact`). La usano
  anche Oggi, i consigli, il coach e le impostazioni. `painGate(state, iso, { sessionId })` legge la regola per una
  seduta (senza opzioni quella prevista quel giorno): il titolo va sulla zona che la seduta carica di più (A gomito,
  B e C gamba, `sessionFocus`), il messaggio tace i balzi se la seduta non ne ha. Con il gomito sopra soglia
  (`gate.elbowOver`) le spinte con i manubri passano da sole alla variante del catalogo (`elbowSwitch`: panca piana
  → chest press, panca inclinata → distensioni ai cavi; `elbowSwitchFor`), con carichi di partenza ridotti del 15%
  circa e la panca riprendibile con un tocco. Una zona sotto il ginocchio a soglia degli impatti + 2 o più
  (`PHYSIO_REFERRAL_MARGIN`) rimanda al fisioterapista se il giorno dopo è ancora sopra soglia. `workoutVolume`
  conta i due manubri e i due lati (`volumeFactor`).
  `introLevel`: nelle prime 2 esecuzioni di una seduta una serie in meno e un RIR in più (non per le sedute
  già leggere). Nel catalogo degli esercizi `impact` e `startKg` (carichi di partenza) stanno in un tipo
  locale, non nel contratto. `physioCoverage`: la prevenzione della seduta che lavora lo stesso tessuto di un
  esercizio del fisioterapista (gomito, soleo, polpacci, tibiale anteriore e posteriore, adduttori, flessori;
  gli allungamenti non contano) si salta. `sessionDuration(session, physio, { intro })` dà la durata vissuta
  (`own` senza doppioni e con la fase di ingresso, `physio`, `total`), la stessa in Allenamento, Oggi e nel
  calendario. `gateForExercise` e `painNoteForExercise`: con la tibia sopra soglia frenano anche polpacci e
  tibiali di prevenzione, e la nota dice quale zona e perché.
- `review.ts` · `weekStats(weekStart, state)` (peso medio e variazione, pesate, aderenza, sonno medio,
  notti in orario, fibre e proteine stimate dai pasti fatti, dolore medio per zona e tendenza, carico, dolci
  fuori programma) e `proposals(weekStart, state): Proposal[]` con queste regole. Fibre e proteine contano solo i
  giorni con almeno 3 pasti su 5 segnati (`MIN_DAY_MEAL_SHARE`; con meno di 3 giorni la media è null e
  l'interfaccia mostra "–"); un pasto preso con il piano B al bar vale i valori dell'ordine; le notti in orario si
  giudicano con l'orario a letto di quella settimana, ricostruito dalle revisioni accettate (`sleepPhaseOn`,
  `planOnEvening`). Si decide solo sulle proposte che cambiano il piano (`needsDecision`: orario a letto, calorie,
  scarico, settimana più leggera); pesate, dolore, fibre e dolci sono informative, in "Da sapere", senza pulsanti.
  - sonno: ≥ 5 notti a letto entro `current` + 15 min → anticipa di `stepMin` (fino a `target`);
  - calorie (ricomposizione): servono ≥ 4 pesate; calo medio > 0,5% del peso → +150 kcal; aumento > 0,5% →
    −100 kcal; altrimenti invariato (proposta informativa);
  - fibre: stima dai pasti segnati (i pasti senza stato non contano come saltati: menù previsto × quota arrivata
    nei pasti segnati, esclusi i pasti prima della prima spesa) < riferimento − 5 g, dove il riferimento è
    l'obiettivo o, nei giorni di avvio, il menù di avvio. Se il menù previsto porta almeno obiettivo − 2 g, la
    proposta dice quale pasto tenere quando si sostituisce, senza aggiungere cibo; altrimenti aggiunge frutto,
    legumi e vellutata, quanti ne servono, con le calorie;
  - dolore: media sopra soglia o in aumento → riduci il carico e senti il fisioterapista;
  - carico: allarme del carico → settimana più leggera, seduta C facoltativa saltata;
  - dolci: oltre quelli previsti → strategia (merenda proteica alle 16:30, dolce dopo cena);
  - scarico: ogni 6-8 settimane dall'inizio, o prima con sonno < 6 h per 3 notti e dolore in aumento.
- `ics.ts` · genera un file `.ics` (RFC 5545, CRLF, righe ripiegate a 75 ottetti, `TZID=Europe/Rome` con
  VTIMEZONE) con eventi settimanali ricorrenti (`RRULE:FREQ=WEEKLY;BYDAY=…`) e `VALARM` all'orario:
  controllo del mattino (sveglia + 5 min), integratori e colazione, pranzo, palestra (durata a regime di
  `sessionDuration`, blocco del fisioterapista compreso), esercizi del fisio (solo se inseriti), coprifuoco,
  revisione della domenica alle 18:00 (dalla prima settimana da rivedere). L'utente sceglie quali. Il coprifuoco segue
  la scala del sonno: una serie con `UNTIL` per ogni settimana, l'ultimo gradino senza fine; nelle sere di
  calcio vale l'orario dopo la partita. La scala conta le settimane dalla prima settimana da rivedere, mai prima
  dell'inizio del piano (`sleepStairOrigin`); il file ricorda da dove l'ha contata (`CalendarFileRecord.origin`).
  `calendarStatus` dice se il file aggiunto è ancora allineato al piano.
- `coachContext.ts` · costruisce il contesto per il coach (profilo, piano, giornata di oggi con stati e riti
  del fine settimana, ultimi 7 controlli, dolori, ultime sedute, menù di oggi con valori, scalino della
  settimana) in testo compatto. Le zone di dolore non entrano nel prompt di sistema, solo nel contesto.

## 8. Contenuti (in `src/data/`)

Qualità da professionista: un professionista della nutrizione e dell'allenamento li leggerà riga per riga.

### Alimentazione (`foods.ts`, `recipes.ts`, `menu.ts`, `barPlanB.ts`)

- `FOODS`: 70-100 alimenti italiani comuni con valori per 100 g realistici (tabelle CREA o USDA come
  riferimento), `unitGrams` sensati (palmo di pollo ≈ 110-120 g, pugno di riso cotto ≈ 150 g, cucchiaio di
  olio ≈ 10 g, ecc.), `buyFactor` per gli alimenti che cambiano peso con la cottura, `vegPortionG` (80 g) per
  frutta e verdura, `pantry` per olio, sale, spezie, aceto.
- `RECIPES`: 45-60 ricette. Colazioni (7+), spuntini da portare fuori casa (7+, trasportabili, senza frigo o quasi),
  pranzi alle 14:15 a casa (12+, molti da preparazione domenicale, 10-15 minuti di montaggio), merende e
  pre-calcio (6+, digeribili, carboidrati), cene (12+, incluse cene di recupero veloci dopo la partita).
  Vincoli: proteine 30-45 g nei pasti principali; molte fibre e vegetali **comodi** (surgelati, insalate in
  busta, legumi in barattolo, vellutate, frutta senza preparazione, frutti di bosco surgelati); ricette ≤ 15
  minuti o da preparazione; cucina italiana vera, gustosa; pochi ultra-processati. Passaggi chiari e brevi.
  Ogni ricetta ha 1-3 `swaps` dello stesso tipo di pasto.
- `MENU_ROTATION`: **2 settimane** (14 giorni) con tutti e 5 i pasti. Con `carbFactor` del tipo di giorno
  previsto dalla settimana predefinita, i totali giornalieri calcolati da `recipeNutrition` devono stare entro
  ±8% dalle kcal obiettivo, proteine ≥ 125 g, fibre ≥ 28 g, almeno 5 porzioni di frutta e verdura.
  Varietà: pesce 2-3 volte a settimana, legumi 4+ volte, carne rossa al massimo 1 volta, uova 2-3 volte.
  Ogni settimana ha 4-6 attività di preparazione domenicale (60-90 minuti totali).
  Spesa: al massimo 40 prodotti a settimana (oggi 36 in entrambe), con un solo yogurt, l'avena per le colazioni,
  un pollo e un pesce. Confezioni: un fresco si usa almeno per metà confezione nella settimana; un prodotto a lunga
  conservazione torna in almeno due pasti della settimana o arriva a metà confezione nelle due settimane. Le
  alternative mettono prima le ricette con gli stessi prodotti. Nei passaggi non si scrivono le quantità degli
  ingredienti scalati (le dicono le porzioni). Vigilia della partita: fibre ≤ 40 g anche con il minimo di
  carboidrati, niente legumi a cena, niente ricette da preparazione della domenica. Partita e vigilia, con il minimo
  di 6 g/kg nel piatto: kcal entro ±5% dell'obiettivo della data e proteine non oltre il 20% (pasta, riso e gallette
  alzati portano anche proteine), anche nei giorni di avvio (`engine/nutrition.test.ts`). Per questo la merenda di
  quei giorni è il pre-calcio con gallette e banana, anche alla vigilia.
- `BAR_OPTIONS`: 15-20 opzioni reali di un bar italiano con verdetto ('si', 'meglio', 'programmato') e motivo.
- Scrivi uno script di verifica `scripts/check-menu.ts` (eseguibile con `npx tsx` o come test Vitest
  `src/data/menu.test.ts`) che stampa i totali per giorno e fallisce se i vincoli non sono rispettati.

### Allenamento (`exercises.ts`, `sessions.ts`)

- `EXERCISES`: 45-60 esercizi con nomi italiani diffusi in palestra, 2-3 indicazioni tecniche essenziali,
  attrezzatura, `elbowFriendly`, alternative. Includi: riscaldamento (attivazione ispirata a FIFA 11+),
  spinte con manubri a presa neutra, tirate a presa neutra, squat, stacco con trap bar, affondi, hip thrust,
  Nordic hamstring curl, Copenhagen (leva corta e lunga), polpacci in piedi e seduto (soleo), tibiale
  anteriore e posteriore (sollevamenti sulle punte con la pallina tra i talloni), isometria e eccentrico degli
  estensori del polso (Tyler twist), core anti-estensione e anti-rotazione, mobilità di anche e caviglie.
- `SESSIONS`: A (parte superiore e prevenzione, 50-55 min), B (forza gambe, Nordic, polpacci, 55-60 min),
  C (corpo intero leggero e mobilità, 35-40 min, facoltativa). Ogni seduta: riscaldamento, blocco principale,
  prevenzione. Serie, ripetizioni, RIR 1-3, recuperi realistici. Gomito: niente bilanciere in spinta, solo
  manubri a presa neutra. Considera che lunedì sera c'è la partita (B il venerdì, ~72 ore prima).
- Gli esercizi del fisioterapista li inserisce l'utente (`AppData.physio`) e compaiono nelle sedute in un
  blocco "Dal fisioterapista" e nei giorni con `physio: true`.

## 9. Schermate

Ogni schermata apre in uno stato realistico. Con i dati di esempio deve sembrare un'app in uso da 3 settimane.

### Benvenuto (onboarding, `src/features/benvenuto/`)
5 passi a schermo intero con avanzamento: 1) Ritmo, la tua giornata già decisa (3 principi); 2) Tu: sesso,
anno di nascita, altezza, peso, obiettivo, competenze (facoltativo); 3) La tua settimana: giorni e orari di
calcio, palestra, fisio (precompilati, modificabili con pochi tocchi); 4) Sonno: sveglia, ora attuale, obiettivo
(spiega il passo di 15 minuti a settimana); 5) Zone da monitorare e integratori. Finale: "Il tuo piano è pronto"
con riepilogo (kcal per tipo di giorno ricalcolate, prima seduta, orario a letto di questa settimana) e l'invito agli
avvisi nel calendario (controllo del mattino, coprifuoco, revisione della domenica), tranne quando invita a
installare l'app (l'app installata rifà il benvenuto). Pulsante secondario "Prova con dati di esempio".

### Oggi (`src/features/oggi/`)
- Intestazione: giorno ("Martedì 10"), tipo di giorno con colore, kcal obiettivo, ingranaggio.
- Anello di avanzamento della giornata (voci fatte / totali) e serie di giornate riuscite.
- Card "Adesso" con la prossima voce non segnata (grande, con azione primaria). Se la voce non si può ancora segnare
  (es. il coprifuoco prima dell'orario), Adesso offre "Lista della spesa" (spesa da fare oggi o domani) oppure "Vedi
  domani", con l'orario da cui si segna.
- Il primo giorno, al posto dell'anello, "Il piano è pronto" con al massimo tre orari in colonne (`welcomeBoard`); anello,
  statistiche e conto alla rovescia tornano dal giorno dopo o a giornata chiusa.
- Una riga "Da completare" sotto la timeline, una cosa alla volta e senza contare: promemoria nel calendario da
  aggiungere o aggiornare (`useCalendarTask`), esercizi del fisioterapista, dose degli integratori.
- Se il controllo del mattino non è fatto: card in alto che apre `CheckInSheet`.
- Timeline: ogni voce ha orario, titolo, dettaglio; tocco breve → segna fatto (con animazione e vibrazione
  se disponibile); tocco lungo o pulsante "…" → foglio con Fatto / Sostituito (con nota) / Saltato / Annulla.
  Toccare un pasto apre la ricetta; la voce palestra apre la seduta; la voce calcio apre `FootballSheet`
  (minuti e RPE); la voce spuntino offre "Piano B bar".
- Interruttore "Giornata minima".
- Acqua: bicchieri con avanzamento verso l'obiettivo. Dolci: "Ne restano 2 dei 3 previsti", pulsante "Ho
  mangiato un dolce". Lo scalino della settimana è una riga della stessa card.
- La sera: conto alla rovescia al coprifuoco ("Telefono fuori tra 1 h 20").
- Un consiglio del giorno breve e motivato (`src/data/tips.ts`, 30+ consigli su sonno, fibre, carico, bar…).
- Valori del giorno stimati dal menù (kcal, proteine, fibre, porzioni di vegetali) rispetto all'obiettivo, in
  quattro piccoli anelli che si aprono con un tocco.

### Settimana (`src/features/settimana/`)
- Striscia dei 7 giorni con tipo di giorno e attività, nella scheda Menù; selezione del giorno.
- Schede: **Menù** (pasti del giorno selezionato, con porzioni a occhio adattate al tipo di giorno, valori
  stimati, sostituzione con alternative), **Spesa** (lista aggregata per reparto, spunte, avanzamento,
  copia come testo), **Preparazione** (attività della domenica con minuti e resa, spunte, tempo totale).
- `RecipeSheet`: foto illustrata generata con CSS/SVG (niente immagini esterne), ingredienti con porzioni a
  mano e grammi, passaggi, tempo, valori, alternative, "Usa questa al posto di…".

### Allenamento (`src/features/allenamento/`)
- Prossima seduta in evidenza con durata, focus e avviso del dolore se serve (`painGate`).
- Settimana di allenamento (palestra + calcio) e carico settimanale con avviso.
- Elenco sedute A, B, C con anteprima; storico delle sedute.
- `SessionPlayer` a schermo intero: un esercizio alla volta con indicazioni tecniche, serie da registrare con
  stepper per carico e ripetizioni (precompilati dal suggerimento di progressione), "l'ultima volta",
  timer di recupero animato che parte quando segni una serie, sostituzione con alternativa, blocco
  "Dal fisioterapista". Alla fine: durata automatica, RPE (1-10), dolore per zona, salvataggio, riepilogo con
  record personali (1RM stimato).
- Editor degli esercizi del fisioterapista (`PhysioEditor.tsx`, riusato nelle impostazioni).

### Coach (`src/features/coach/`)
- Chat con Claude (vedi §12) con contesto della giornata. Suggerimenti rapidi: "Sono al bar, cosa prendo?",
  "Cosa cucino stasera con quello che ho?", "Salto la palestra?", "Com'è andata la settimana?".
- Allegare una foto del piatto (input file con `accept="image/*"` e `capture="environment"`), ridotta a max
  1024 px JPEG prima dell'invio.
- Senza chiave: schermata che spiega come attivarlo (passi chiari) e cosa costa (stima 7-12 $ al mese con
  Claude Opus 5.5, uso tipico), e indica che i dati inviati al coach escono dal telefono.
- `BarPlanBSheet`: piano B al bar sempre disponibile anche offline (da `BAR_OPTIONS`).

### Progressi (`src/features/progressi/`)
- Numeri chiave della settimana: peso medio 7 giorni e variazione, sonno medio, aderenza, fibre stimate.
- Grafici SVG disegnati a mano, in scala, leggibili in entrambi i temi: peso con media mobile a 7 giorni,
  sonno con linea dell'obiettivo, dolore per zona, carico settimanale con soglia, uno alla volta (scelti con un
  `Segmented`), e sotto il calendario delle giornate riuscite (heatmap delle ultime 8-12 settimane).
- **Revisione della domenica**: voti 1-10 (energia, digestione, umore, sensazioni in campo), vita in cm, pliche
  facoltative, statistiche, proposte con "Accetta" / "Accetta tutte", salvataggio. Disponibile sempre per la
  settimana appena chiusa; la domenica è evidenziata.

### Impostazioni (`src/features/impostazioni/`)
Profilo, obiettivi per tipo di giorno (modifica kcal e macro, "ricalcola"), settimana (editor dei giorni),
orari dei pasti, sonno, integratori, zone di dolore e soglia, esercizi del fisioterapista, promemoria nel
calendario (scarica `.ics`), coach (chiave, modello), tema, backup (esporta JSON: download o copia negli appunti;
importa da file o incolla), dati di esempio (carica/rimuovi), azzera tutto (con conferma nella pagina, niente
`confirm()`), informazioni e privacy.

### Kit (`#kit`)
Catalogo di tutti i componenti del design system nei loro stati, per controllo visivo.

## 10. Dati di esempio (`src/demo/seed.ts`)

`buildDemo(todayIso)`: profilo generico (nessun dato reale dell'utente), piano predefinito iniziato 3 settimane
fa, 21 giorni di diario credibile (aderenza 60-90%, qualche giornata minima, qualche pasto sostituito),
controlli del mattino con peso che oscilla intorno a 70 kg in lieve calo, sonno che migliora da 6,2 a 7,2 h,
dolore alla tibia che scende da 3 a 1 e al gomito da 3 a 2, 7-8 sedute registrate con progressione
realistica, partite e calcetti con RPE, 2 revisioni, qualche messaggio di chat. Deterministico (niente
`Math.random()` senza seme): ogni giorno e ogni sezione hanno il proprio generatore, quindi l'ora (`?now=`) cambia
solo le voci di oggi e non i giorni passati. L'interfaccia mostra sempre un'etichetta "Dati di esempio" quando sono attivi.

## 11. Qualità

- `tsc --noEmit` senza errori, `npm test` verde, `npm run build` e `npm run build:preview` riusciti.
- Nessun warning in console all'avvio. Nessun overflow orizzontale a 360 px.
- Test dei motori significativi (casi limite: mezzanotte, cambio settimana, ora legale, dati mancanti).
- Accessibilità: etichette sui pulsanti a icona, ruoli corretti, focus visibile, contrasto AA.

## 12. Coach con Claude

- Chiamata diretta dal browser con la chiave API personale dell'utente salvata solo sul dispositivo
  (`Settings.coachApiKey`), SDK ufficiale `@anthropic-ai/sdk` con `dangerouslyAllowBrowser: true`.
  È una scelta temporanea della fase 1 per un'app personale a utente singolo: la fase 2 sposterà la chiave su
  un server. L'interfaccia lo dice chiaramente e consiglia di impostare un limite di spesa sulla console.
- Modello predefinito `claude-opus-5-5`, pensiero adattivo, risposta in streaming. Prima di scrivere il codice
  leggi la documentazione dello skill claude-api (`typescript/claude-api/README.md` e `streaming.md`), più la
  sezione su refusal e fallback in `shared/model-migration.md` (Migrating to Claude Opus 5.5). Non inventare API
  dell'SDK.
- Prompt di sistema in italiano: allenatore e nutrizionista sportivo pratico, risposte brevi e concrete,
  conosce il piano e i dati della giornata (da `coachContext.ts`), non fa diagnosi, rimanda al fisioterapista
  per i dolori e al medico per sintomi importanti, rispetta le competenze dichiarate dall'utente.
- Gestisci: chiave mancante o errata (401), limite (429), rete assente, rifiuto (`stop_reason: 'refusal'`),
  interruzione dello streaming. Nell'anteprima Artifact la rete esterna è bloccata: mostra un avviso.

## 13. Proprietà dei file durante il lavoro in parallelo

Ognuno modifica solo i propri file. Se `tsc` segnala errori in file altrui, ignorali (li sistema
l'integrazione). Non eseguire `npm install` se non sei l'agente delle fondamenta.

| area | file |
|---|---|
| Fondamenta | configurazioni, `index.html`, `public/`, `scripts/screenshots.mjs`, `.github/`, `src/main.tsx`, `src/App.tsx`, `src/app/**`, `src/ui/**`, `src/styles/**`, `src/state/**`, `src/lib/format.ts`, `src/lib/id.ts`, `src/lib/haptics.ts`, `src/engine/{dates,targets,nutrition,menu,sleep}.ts` (+ test), `src/data/defaults.ts`, `src/demo/**`, segnaposto delle schermate, `README.md` |
| Contenuti alimentari | `src/data/{foods,recipes,menu,barPlanB}.ts`, `src/data/menu.test.ts` |
| Contenuti allenamento | `src/data/{exercises,sessions}.ts`, `src/data/sessions.test.ts` |
| Oggi | `src/features/oggi/**`, `src/engine/timeline.ts` (+ test), `src/data/tips.ts` |
| Settimana | `src/features/settimana/**`, `src/engine/shopping.ts` (+ test) |
| Allenamento | `src/features/allenamento/**`, `src/engine/training.ts` (+ test) |
| Progressi | `src/features/progressi/**`, `src/engine/review.ts` (+ test) |
| Coach | `src/features/coach/**`, `src/engine/coachContext.ts`, `src/lib/claude.ts`, `src/lib/image.ts` |
| Impostazioni e benvenuto | `src/features/impostazioni/**`, `src/features/benvenuto/**`, `src/engine/ics.ts` (+ test), `src/lib/backup.ts` |

## Modifiche al contratto

(annota qui ogni campo aggiunto a `types.ts`, con motivo)

- `WeeklyReview.proposals?: Proposal[]` (area Progressi): istantanea delle proposte mostrate al salvataggio
  della revisione. Riaprendo una revisione salvata si vedono le stesse proposte con il loro stato
  (accettata o no), anche se nel frattempo il piano è cambiato (es. l'orario a letto già anticipato), e una
  proposta già applicata non si può applicare due volte. Le revisioni senza il campo ricalcolano le proposte.
- `ChatMessage.stop?: 'interrotta' | 'rifiuto' | 'limite'` (area Coach): segna una risposta del coach non
  completa. `interrotta` quando l'utente ferma lo streaming (il testo parziale resta), `rifiuto` quando il
  modello rifiuta (`stop_reason: 'refusal'`, il messaggio non si reinvia nella conversazione), `limite` quando
  la risposta è troncata a `max_tokens` (l'interfaccia offre "Continua"). Senza il campo la risposta è completa.
- `Overlay` di tipo `barPlanB` con `slot?: MealSlot` (integrazione): il piano B aperto dalla voce spuntino o
  merenda di Oggi mostra subito quel pasto invece di quello dell'ora attuale. Senza il campo il comportamento
  è quello di prima.
- `DATA_VERSION` 2 (fondamenta): la migrazione porta l'obiettivo di fibre da 30 a 35 g dove era rimasto
  il valore predefinito. `normalizeData` ripara ogni sezione (voci illeggibili scartate, numeri ricavati
  anche da stringhe) e conserva i campi sconosciuti, così i campi facoltativi aggiunti qui non si perdono.
- `Plan.firstUse?: { date: ISODate; time: HHMM }` (Oggi, Progressi, integrazione): primo avvio, scritto alla
  fine del benvenuto (non con i dati di esempio). Le voci di quel giorno prima di quell'ora non contano, la
  serie e le notti partono da lì e la prima settimana della revisione non giudica i giorni precedenti.
  Senza il campo vale l'inizio del piano (o il primo giorno con qualcosa di segnato).
- `WeeklyReview.step?: { id: 'frutta-spuntino' | 'verdura-cena' | 'acqua' | 'dolci' | 'caffe'; title: string }`
  (Progressi): lo scalino della settimana scelto nella revisione. Vale la settimana dopo; Oggi ne mostra i 7
  giorni e il conteggio verso 5. Frutta, verdura e caffè si segnano con la voce di diario `scalino`, che non
  entra nell'aderenza; acqua e dolci si contano dal diario.
- `DATA_VERSION` 3 (sistema): l'obiettivo predefinito del sonno passa da 23:30 a 23:15 (con la sveglia delle 07:15
  sono 8 ore a letto, circa 7 di sonno vero con un'efficienza dell'85-90%; con 7 h 45 a letto si restava sotto le 7
  ore). La migrazione lo cambia solo dove erano rimasti obiettivo 23:30 e sveglia 07:15. `CheckIn.sleepHours` è
  il tempo a letto calcolato dagli orari (`sleepHours(bed, wake)`): nei testi si scrive "a letto", non "sonno".
- `MealEntry.starterOf?` e `DayMeals.starter` (sistema, tipi del motore del menù, non di `types.ts`): nei giorni
  di avvio (dal primo avvio al lunedì che trova fatte spesa e preparazione) `DayMeals.starter` è vero e i pasti
  vengono dal menù di avvio `STARTER_WEEK`; `starterOf` c'è solo quando la ricetta della rotazione sostituita era
  da preparazione. Se il menù di avvio non prevede un pasto, la ricetta da preparazione lascia il posto a
  un'alternativa veloce (`starterRecipeFor`). `planStartFor(today)` dà il lunedì di inizio del piano alla fine
  del benvenuto (questa settimana dal lunedì al giovedì, la prossima dal venerdì alla domenica).
- `STARTER_WEEK` e `STARTER_PRODUCTS` in `src/data/menu.ts` (contenuti alimentari): il menù dei giorni di avvio
  (7 giorni, nessuna preparazione, ricette da 15 minuti al massimo, stessi vincoli della rotazione verificati da
  `menu.test.ts` tranne le fibre, 22-32 g, oggi 28-31 g, per un aumento graduale: pane comune al posto
  dell'integrale e ceci a piccole dosi, 40 g due volte) e i suoi 17 prodotti. `ShoppingList.starter` e `ShoppingList.starterDates` in
  `engine/shopping.ts` (tipi del motore, solo aggiunte): la lista copre solo giorni di avvio (è la "Spesa di
  avvio") e quali; in quei giorni niente è cotto in anticipo.
- `firstReviewWeek`, `isReviewableWeek`, `MIN_FIRST_WEEK_DAYS` (integrazione, nessun campo nuovo): stanno in
  `engine/timeline.ts`, perché li usa anche il rito della domenica, e `engine/review.ts` li riesporta.
  `firstReviewDate` e `planWeekNumber` restano in `review.ts`.
- `Profile.painTests?: Record<string, string>` (Oggi, Impostazioni, integrazione): gesto di prova del dolore per
  zona indicato dal fisioterapista (chiave: nome della zona), modificabile in Impostazioni > Zone di dolore. Il
  controllo del mattino e gli avvisi di Oggi lo usano al posto del gesto standard della zona (`testGesture` in
  `features/oggi/painTests.ts`); con un gesto del fisioterapista la regola di sicurezza standard non si mostra.
  `normalizeData` tiene solo i testi non vuoti. Senza il campo valgono i gesti standard.
- Tipi e funzioni del motore della timeline (Oggi, nessun campo in `types.ts`): `DayItem.preShopping?`,
  `firstShopping(state)`, `PRE_SHOPPING_DETAIL`; la spesa del sabato di chi comincia il sabato è almeno mezz'ora
  dopo il primo avvio; `takenSupplements(plan)`, `doseUndefined(s)` e `supplementDoseDue(iso, state)`. Anche il
  calendario (`ics.ts`) e il coach usano `takenSupplements`: un integratore con la dose da definire non finisce nel
  promemoria, e il coach sa che per ora non si prende. `shoppingLeadFor(monday, state)` e
  `shoppingOptionsFor(monday, state)` danno i pasti del fine settimana da aggiungere alla lista
  (`ShoppingOptions.lead`, `ShoppingList.leadDates` in `engine/shopping.ts`).
- Tipi e funzioni del motore dell'allenamento (Allenamento, nessun campo in `types.ts`):
  `SuggestOptions.previous?: ExerciseLog | null` (esecuzione precedente, per riconoscere lo stallo),
  `Suggestion.stalled?: boolean` (kind 'riduci' per lo stallo e non per il dolore), `recentLogsFor(exerciseId,
  logs, count = 2, opts)`, `gateForLater(gate)` (per una seduta che non è oggi, "niente balzi oggi" diventa "nella
  prossima seduta"), `STALL_REDUCE_FACTOR` = 0,9; `isLowerLegSite(site)` e `isElbowSite(site)`, usate anche dal
  coach e dalle impostazioni.
- Tipi del motore della revisione (Progressi, nessun campo in `types.ts`): `PeriodStats.fiberPlannedG`,
  `proteinPlannedG`, `mealsCounted`, `mealsLogged`, `mealsReplaced`, `mealsSkipped`, `fiberLostBySlot`,
  `fiberStarter`, `fiberLow` e `DayIntake.planned`, `plannedLogged`, `meals`: la stima di fibre e proteine dai pasti
  segnati e il confronto con il menù previsto.
- `Plan.impactThreshold?: number` (revisione, giro 4): soglia di dolore per gli impatti nelle zone sotto il
  ginocchio, modificabile nelle impostazioni del dolore d'accordo con il fisioterapista. Senza il campo vale
  min(painThreshold, 2).
  Nelle impostazioni lo stepper "Negli impatti" va da 0 alla soglia generale; tornare a 2 toglie il campo (min(soglia,
  2) e min(2, soglia) coincidono sempre). `impactThresholdFor` in `engine/training.ts` la limita comunque alla soglia
  generale.
- `DayLog.barMeals?` (revisione, giro 4): pasti presi con il piano B al bar, con etichetta e valori stimati
  dell'ordine, così la revisione conta proteine, fibre e vegetali veri invece della quota fissa dei sostituiti.
  Lo scrive `setBarMeal(date, slot, meal | null)` (solo ordini validi, `normalizeBarMeals`); si toglie da solo se la
  voce non è più sostituita o se la si segna sostituita con una nota scritta a mano. Valori del giorno (`onlyDone`),
  revisione e coach lo leggono.
- Tipi del motore della nutrizione (sistema, giro 4, nessun campo in `types.ts`): `MATCH_CARB_G_PER_KG` = 6,
  `isMatchDay`, `NutritionState`, `referenceWeightKg`, `MatchCarbs` e `matchCarbs`, `dayTargetFor`,
  `DayNutritionDetail.target` e `.matchCarbs`, `portionPhrase` e `PORTION_TOLERANCE`; `useNutritionState()` in
  `state/hooks.ts`. `shoppingList` accetta `NutritionState` (controlli e profilo facoltativi, compatibile).
- Tipi del motore dell'allenamento (Allenamento, giro 4, nessun campo in `types.ts`): `impactThresholdFor`,
  `PHYSIO_REFERRAL_MARGIN`, `PainGateOptions`, `PainGate.elbowOver`, `.threshold`, `.impactThreshold`, `.sessionId`,
  `elbowSwitchFor` ed `ElbowSwitch`, `SuggestionKind` 'sostituisci' (carico × 0,85 arrotondato all'incremento, uguale se
  anche l'ultima volta era una sostituzione) con `SuggestOptions.switched` e `SWITCH_REDUCE_FACTOR`, `sessionFocus`, `volumeFactor`,
  `workoutVolume` con `sessionId` facoltativo; `CatalogExercise.elbowSwitch` ed `elbowSwitchOf` in `data/exercises.ts`.
- Tipi del motore della revisione e del coach (Progressi e Coach, giro 4, nessun campo in `types.ts`):
  `MIN_DAY_MEAL_SHARE` (0,6), `DayIntake.menuMeals`, `.complete`, `.bar`, `PeriodStats.mealsAtBar`, `mealsLogged`
  contato solo sui giorni completi, `prevFiberAvgG` null con meno di 3 giorni, `sleepPhaseOn(evening, state)`,
  `planOnEvening` e `needsDecision` in `engine/review.ts`; `LoadWeek.previousWeeks` in `features/progressi/series.ts`;
  `BAR_VEG_PORTIONS` e `barOrder` in `features/coach/barPick.ts` (`plannedMeal` accetta `NutritionState`).
- Impostazioni (giro 4, nessun campo in `types.ts`): `impactThresholdView`, `impactThresholdPatch`, `painSummary`,
  `matchCarbNote` in `features/impostazioni/lib.ts`; `impactRuleNote` ha un terzo argomento facoltativo.
- Giro 5 (nessun campo nuovo in `types.ts`), motori e schermate:
  - nutrizione (sistema): `PIECE_WORDS`, `WHOLE_PIECES`, `PortionParts.named`, `portionWithName(parts, nome)`,
    `foodId` facoltativo in `portionWords` e `portionPhrase`; `dayCarbScale` misura il minimo sul menù previsto, quello
    di avvio nei giorni di avvio. Tolto `fiberRampFactor`: nei giorni di avvio il riferimento delle fibre è
    `STARTER_FIBER_SHARE` (0,8) in `data/menu.ts`, in Menù e nei valori del giorno di Oggi.
  - stato (sistema): `normalizeImpactThreshold` arrotonda al mezzo punto e toglie il campo a 2 (anche in
    `updatePlan`); `normalizeBarMeals(raw, status)` tiene solo i pasti segnati sostituiti, con l'etichetta su una riga.
    `?recipe=<id>` tra i parametri delle anteprime (`app/boot.ts`).
  - spesa (Settimana): `ShoppingOptions.shopDate`, `ShoppingList.shopDate`, `FRESH_DAYS` = 1, `defaultShopDate`,
    `freshUntil`; tolto `FRESH_LAST_WEEKDAY` (il fresco si contava fino a mercoledì qualunque fosse il giorno della
    spesa).
  - menù (Settimana): partita e vigilia entro ±5% delle kcal e con proteine non oltre +20% (test in
    `engine/nutrition.test.ts`); alla vigilia la merenda può essere un pre-calcio (`menu.test.ts`).
  - Oggi: `shoppingTarget(iso, state, item)` in `engine/timeline.ts` (la usano `derivedStatus` e Oggi),
    `setItemStatusSynced` in `features/oggi/shoppingSync.ts` (la spesa segnata fatta spunta la lista; Annulla, Saltato
    e Sostituito la ripristinano), `welcomeBoard` in `features/oggi/firstDay.ts`; `OggiData.setup` accetta anche
    `CalendarTask` e `OggiData.valuesTarget` è il riferimento dei valori del giorno.
  - calendario (Impostazioni): `sleepStairOrigin(plan, start, reviews?)`, `calendarFileRecord(state, kinds, at)`,
    `CalendarFileRecord.origin?`, `ReminderState.reviews?`; in `features/impostazioni`: `useCalendarDelivery`,
    `useCalendarTask`, `CALENDAR_TASK_TEXT`, `CALENDAR_TASK_HASH`, `saveCalendarFile(…, remember?)`,
    `components/ManualCopySheet` e `components/reminderIcons`.
  - controllo tipografico: anche le virgolette doppie dritte nei testi (`straightQuotePairs`), con `--fix` in « ».
- Fase 2, onda 0 (docs/FASE2.md § 12; nessun campo fuori dal § 12.1). Tipi, stato e archivio (0A1):
  - `types.ts`: tutto il § 12.1, con ogni campo nuovo dei tipi esistenti facoltativo (pasti stimati `EatenMeal` come forma
    di `DayLog.barMeals`, `DayLog.swapPlanned`, `MyDish`, esclusioni, obiettivi su tre livelli, `Program`, proposte e
    versioni, integratori dal catalogo, `Settings.coachRefine` e `.coachUsage`, i tre pannelli nuovi in `Overlay`, le
    sezioni `dishes`, `dishThumbs`, `planner`, `planVersions` di `AppData`); `Violation` sta qui perché la usano più onde.
  - `DATA_VERSION` 4 senza migrazioni di valori; normalizzazione del § 12.4 in `state/store.ts` (con `keepsEatenMeal`,
    `normalizeEatenMeal`, `validPer100g`, `normalizeEstimatedItem`, `estimatedItemsValues`, `MealSnapshot`); archivio
    freddo `ritmo:v1:archivio` per miniature e versioni (§ 12.5), letto in modo sincrono nel `merge` e scritto solo dopo
    l'idratazione, con `archiveInfo()`; le azioni del § 12.3. `applyProposal(proposal, today?)` gestisce anche
    `planProposal` e `weekKind` e, con `kcalDelta`, taglia la correzione (`clampKcalCorrection`) e scrive
    `Plan.goalDeltaKcal`.
  - `data/defaults.ts`: `ESPRESSO_CAFFEINE_MG` = 80; integratori dei nuovi utenti dal catalogo (creatina 3 g, omega-3
    600 mg, vitamina D 15 µg), quelli della fase 1 in `LEGACY_DEFAULT_SUPPLEMENTS`. `data/supplementCatalogIds.ts`
    (`CATALOG_IDS`, `CATALOG_VERSION`, con il test sul JSON), `data/foodFactsTypes.ts`, `data/estimateFoods.ts` (vuoto).
  - `lib/backup.ts`: il riepilogo conta piatti, versioni e proposte aperte; accetta le versioni 1-4.
  - `app/OverlayHost.tsx` e `app/boot.ts`: `mealLog`, `planProposal`, `supplement` con un segnaposto e `?overlay=`.
  - `engine/energy.ts` (§ 2.1): `goalDeltaOf`, `dayEnergyDelta`, `clampKcalCorrection`, `deficitAtCap`, `EnergyState`,
    `expenditureKcal` (kcal dell'obiettivo meno il deficit in vigore: non dipende dall'età né dall'orologio),
    `isPreseason` (ridotta, la fase completa arriva con `engine/plan/season.ts`), `lowerLegGuard` (anche il fermo degli
    impatti `Plan.impactHold` su una zona sotto il ginocchio porta il deficit massimo a 250). In `engine/nutrition.ts`
    `energyAdjust`; `NutritionState` e `useNutritionState()` comprendono le revisioni.
  - `engine/plan/proposals.ts`: `planBasis`, `proposalId`, `applyPatch`, `beforeOf`, `isSuperseded`, più `ProposalState`,
    `stableStringify`, `lastApprovableDay`, `PATCH_KEYS`. `features/progressi/areas.ts`: l'area `piano`.
- Fase 2, onda 0, risolutori (0A2, firme del § 12.2):
  - `engine/menu.ts`: `menuWeekInForce(iso, plan)` (menù approvato del lunedì, altrimenti la rotazione; la ripetizione
    dell'ultima settimana approvata arriva nell'onda 2A), `plannedMealsForDate(iso, plan)` (strato 1, il menù di avvio
    vince su tutto), `weekSubstitutions(monday, plan)` (vuoto fino all'onda 1B; un valore che non è una ricetta nota non
    sostituisce), `prepInForce(monday, plan)` (compiti del menù in vigore; un compito che serviva solo a ricette tolte
    dalle sostituzioni sparisce). `mealsForDate` è lo strato 2 con gli scambi sopra (le sostituzioni solo con la
    rotazione vera, non con una scritta a mano dai test); `DayMeals.source: MenuSource`
    (`'avvio' | 'rotazione' | 'approvato' | 'ripetuto'`) e `MealEntry.excludedFrom?` (la ricetta tolta, con `plannedId`
    che diventa la sostituta).
  - `engine/plan/program.ts`: `sessionFor(slot, iso, plan)` (senza blocco la seduta fissa, lo stesso oggetto di
    `SESSIONS`; con un blocco la seduta della settimana 1 con i fattori della sua settimana; prima dell'inizio del blocco
    o per uno slot che il blocco non ha, la seduta fissa), `daySession` (in quest'onda sempre «piena», senza motivi),
    `DaySession`, `weekOverrideFor`, `droppedByOverride`; `deriveItem` e `deriveSession` con gli arrotondamenti del
    § 3.4 (la durata `estMin` segue le serie), `lightenSession`, `programWeekDose` (ripetizione senza progressione a fine
    blocco, § 3.1), `DELOAD_DOSE`, `BASE_DOSE`, `LIGHT_WEEK_MIN_RIR`, `MAX_RIR`, `REPEAT_CYCLE_WEEKS`. «Scarico»
    (`Plan.weekOverrides`) applica i fattori dello scarico a tutte le sedute di quella settimana, anche quelle fisse;
    «leggera» porta il RIR ad almeno 3 e toglie la seduta facoltativa (in `plannedSessionFor`, nella timeline, nel
    carico previsto, nel coach e in `nextGymSession`). Il cambio di fase senza approvazione (§ 3.1) resta all'onda 2B.
  - Punti che leggevano `SESSIONS[...]` (31): passano da `sessionFor` o `daySession` quelli che mostrano o eseguono la
    seduta di una data: `gymDuration` e `gymTotalMin` (argomento `iso?`: con la data e il piano nello stato
    `daySession`, senza la seduta fissa), la voce della palestra in `buildTimeline`, il coach (ultime sedute, prossima
    seduta, attività di oggi), `painGate`, `plannedLoadRemaining`, `nextGymSession`, `WorkoutDetailSheet`,
    `NextSessionCard` e `ResumeCard`, `AllenamentoScreen`, `SessionPlayer`, `QuickWorkoutSheet`, `nowContent`
    (`NowContentContext.session?`) e i dati di esempio. Tengono `SESSIONS` quelli che usano solo lo slot o la settimana
    tipo: `boot.ts` (`?overlay=session`), `physioTime` e `itemWindowMin` (stima quando chi chiama non dà la durata),
    `weekdayPlan` del coach, il calendario ricorrente (`ics.ts`), `introLevel` e `workoutVolume` (identità dello slot),
    `WeekEditor` (tre punti), `dayActivities`, `DayDial`.
  - Punti che leggevano `menuWeekFor(…, plan.startDate)` per la preparazione: `nextWeekPrep(iso, plan)` (ora vuole il
    `Plan` intero), `shoppingList` (con `opts.rotation` resta la rotazione data), `PrepTab` (due punti),
    `SettimanaScreen` e i dati di esempio passano da `prepInForce`.
  - `engine/nutrition.ts`: `eatenMeal(log, slot)` (vale con «sostituito», oppure «fatto» con `asPlanned`: la regola di
    `keepsEatenMeal`), unico accessorio di `dayNutritionDetail` con `onlyDone`, `dayIntake` e della riga del coach
    (che dice la provenienza: «ordine al bar», «stima dalla foto», «piatto salvato»); `carbScaleForMeals(recipes,
    dayType, target, carbFloorG?)`, di cui `dayCarbScale` è il caso del menù previsto. In `dayIntake` `bar` conta solo i
    sostituiti con un ordine del bar.
  - `engine/review.ts`: la correzione delle calorie è già tagliata con `clampKcalCorrection` (deficit ricavato dalle
    revisioni prima della settimana rivista); con il deficit al tetto (`deficitAtCap`) nessun taglio e il motivo
    `DEFICIT_AT_CAP_TEXT` («Deficit già al massimo: tieni le calorie e guarda sonno e passi.»); con il surplus al tetto
    «Calorie invariate». Scarico e settimana più leggera hanno `apply: { type: 'weekKind', weekStart: lunedì dopo, kind }`;
    `appliesToPlan(p)` dice quali proposte accettate passano da `applyProposal` (`changesPlan` resta orario e calorie,
    per il riepilogo).
  - `engine/compat.test.ts` con `compat.base.json`: l'istantanea del § 13.1, impronte dei valori calcolati sul ramo di
    partenza (2d95033). Cambi dichiarati: integratori predefiniti (anche nei dati di esempio), `DATA_VERSION` 4, `apply`
    di scarico e settimana leggera.
- Fase 2, onda 0, proposte e coach (0B; firme del § 12.2 e del § 14.3, più queste aggiunte):
  - `engine/rng.ts`: generatore con seme per i motori senza `Math.random` (P4): `Rng`, `mulberry32`, `seedOf`,
    `intBelow`, `chance`, `shuffled`, `pick`.
  - `engine/plan/diff.ts`: oltre a `diffMenus`, `diffPrograms`, `diffWeeks`, `diffTargets`, `topDiff` e `restoreTo`,
    anche `diffTraining`, `diffPatch` (tutte le parti di una toppa, rispetto al piano dato), `sortDiff`, `changedMeals`,
    `editLabel` (riga di un ritocco del coach), `describeTraining`, `describeBlock`, `describeDose`, `describeDay`,
    `dayMonthLabel`, `fromDayLabel`, `QUALITY_LABEL` e i tipi `MenuDiffOptions`, `ProgramDiffOptions`, `DiffOptions`.
    `restoreTo(version, state, today, opts?)`: il quarto argomento facoltativo (nomi degli esercizi del
    fisioterapista, menù in vigore, deficit in vigore) non cambia la firma congelata per chi non lo passa.
  - `lib/claudeTasks.ts`: `runStructuredTask` con la firma del § 14.3. `TaskResult` negativo, rispetto al § 10.1: in
    più `kind: 'annullata'` (l'ha interrotta chi chiama), `retryable` (ha senso «Riprova») e, quando la risposta è
    arrivata (rifiuto, incompleta, non valida: i token sono spesi), `model?` e `usage?`. Esportati anche
    `StructuredTask`, `StructuredClient` (il client finto dei test ha la stessa forma), `TaskOptions` (con `client?`,
    `timeoutMs?`, `fallback?`, `onPhase?`), `TaskValidation`, `TaskFailureKind`, `TaskEffort`, `TASK_TIMEOUT_MS`,
    `COACH_REASON_MAX`, `COACH_SUMMARY_MAX`, `schemaProblems`, `coachText`, `structuredRequest`.
  - `lib/claude.ts`: `ModelSupport.structuredOutputs`, `CoachReply.usage?`, `CoachUsageDelta`, `usageDelta`,
    `usageMonth`; esportati `imageBlock` e `makeClient`.
  - `features/piano/**`: `actions.ts` (regia del ciclo di vita: `registerProposalBuilder` con `BuildContext` e
    `ProposalBuilder`, `submitProposal`, `refreshProposal`, `approveProposal` con «Annulla», `undoApproval`,
    `keepCurrentPlan`, `anotherProposal`, `canAskAnother`, `restoreVersion`, `reuseMenu`, `reuseMenuProposal`,
    `REUSE_ATTEMPT`, `planHistory`, `historyDiff`, `registerCoachRun`, `abortCoachRun`, `startLabel`, `approvedText`,
    `diffOptionsOf`, `proposalStateOf`), `useProposals.ts` (hook di sola lettura), `PlanProposalSheet.tsx` (il pannello
    `planProposal`), `StoricoPage.tsx` (ancora senza rotta: la collega chi aggiunge le righe in Impostazioni › Obiettivi
    e in Allenamento).
- Fase 2, onda 0, correzioni dopo la verifica:
  - **Decorrenza delle proposte** (§ 5.4 e test 11 del § 13.3; decisa nel contratto prima delle onde 1-2). Il piano
    contiene ciò che vale oggi (P3): `approveProposal(id, today)` segna la proposta approvata e aggiunge la versione, ma
    la toppa entra nel piano subito solo se non può cambiare oggi né i giorni passati, cioè se la proposta vale già
    (`effectiveFrom` ≤ oggi, approvata entro `approvableUntil`) oppure tocca solo menù di settimane che iniziano dopo
    oggi (`entersPlanAtApproval`). Altrimenti resta approvata «in attesa» (`status: 'approvata'` senza `before`,
    `isPendingApproval`) ed entra il primo giorno del piano a partire da `effectiveFrom` con l'azione nuova
    `applyDueProposals(today)`, che `app/boot.ts` chiama all'avvio, al ritorno in primo piano, ogni minuto e quando
    cambiano le proposte (`applyDueApprovals`). `before` si scrive quando la toppa entra, nella proposta e nella
    versione. Le approvate in attesa entrano nell'ordine delle decisioni; una che tocca un campo di un'approvata prima
    di lei ancora in attesa la aspetta (`dueApprovals`). Basi, superamento, differenze e generatori guardano il piano
    proiettato (`projectedState` in `engine/plan/proposals.ts`, `proposalStateOf` e `projectedAppData` in
    `features/piano/actions.ts`: il piano con le approvate in attesa), così un menù aperto diventa superato quando si
    approva un blocco che cambia i tipi di giorno anche se il blocco entra lunedì; `BuildContext.state` è già
    proiettato. «Annulla» su un'approvata in attesa la riapre e toglie la versione senza toccare il piano. Le approvate
    in attesa restano sempre nell'elenco, fuori dal conto delle 3 decise per tipo. Lo storico dà «in arrivo» a una
    versione in attesa. `applyProposal` con `planProposal` e senza `today` usa la giornata del piano (`planTodayISO`),
    come `applyDueProposals`. Regola per chi crea le proposte (onde 2A e 2B): una toppa con `program` ha `effectiveFrom` =
    `program.start` (un lunedì), così il blocco in vigore resta fino a quel giorno. Limite dichiarato: quando la toppa
    entra, i giorni prima di `effectiveFrom` ricalcolati seguono il piano nuovo nei campi senza data (settimana tipo,
    `targets`, `goal`, `goalDeltaKcal`, `training`) e nelle sedute di un blocco sostituito (il piano tiene solo il blocco
    in vigore; i blocchi chiusi restano nei riepiloghi, come chiede R10), come già succede con le modifiche fatte a mano
    e con le correzioni della revisione.
  - `restoreTo`: con un blocco nella toppa (anche `null`) il ritorno vale dal primo lunedì da domani (`restoreStart`) e
    il blocco riparte da quel lunedì con un id nuovo, `<id di partenza>@<lunedì>` (`restoredPatch`): con l'inizio
    lasciato nel passato il blocco di allora tornava subito, a metà, e cambiava le sedute di oggi. Senza blocco vale da
    domani come prima. Anche `mondayOnOrAfter`. `restoreVersion` non crea niente quando il piano proiettato ha già i
    valori della versione.
  - `nutritionStateOf(s)` in `engine/nutrition.ts`: lo stato dei valori e degli obiettivi di una data con piano, diario,
    controlli, profilo e revisioni; `useNutritionState()` lo usa. Senza le revisioni `goalDeltaOf` non vede le
    correzioni accettate e i limiti dell'energia restano a metà per chi è in dimagrimento senza `Plan.goalDeltaKcal`.
- Orario di lavoro nella settimana tipo (Impostazioni, Oggi, Settimana, calendario, coach; `DATA_VERSION` resta 4):
  - `types.ts`: `TimeRange { from: HHMM; to: HHMM }`, `ScheduleDay.work?: TimeRange[]` (da 1 a 4 blocchi in ordine,
    senza sovrapposizioni; assente = giorno libero) e `TimelineItem.carry?: boolean` (pasto, o integratori del pasto, da
    portare al lavoro). Senza il campo l'app è quella di prima: l'istantanea di compatibilità non cambia.
  - `engine/work.ts`: `normalizeWork` (orari validi, inizio prima della fine, ordinati, sovrapposti o contigui uniti,
    al massimo `MAX_WORK_BLOCKS` = 4, vuoto = undefined; la usano `normalizeScheduleDay` in `normalizeData` e
    `setScheduleDay`, che toglie il campo vuoto), `parseWork` (testo delle impostazioni: "9-13.30", "8:30-10:00,
    10:30-13:00", "dalle 14 alle 18", vuoto o "libero" = giorno libero; errori in italiano), `formatWork`, `workSpans`
    (minuti della giornata del piano, pause corte unite a richiesta), `spanAt`, `overlapsWork`, `afterWork`. Il backup
    accetta il campo così com'è e l'importazione lo normalizza.
  - `engine/mealTimes.ts`: unica fonte degli orari dei pasti. `mealTimesFor(iso, plan, opts?)` per una data,
    `mealSchedule(day, plan, opts?)` e `daySchedule` (con `earlyBreakfast`) per un giorno della settimana tipo,
    `usualMealTime(slot, plan)`, `scheduleDayOf`, `workBlocksFor`; con `{ football: false }` gli orari abituali (lavoro sì,
    calcio no), al posto di chi leggeva `Plan.mealTimes` così com'era (giornata minima, spesa di avvio, revisione). Le
    regole del calcio e le costanti relative (`EVENING_FOOTBALL_FROM`, `PRE_FOOTBALL_*`, `RECOVERY_DELAY_MIN`,
    `LATE_FOOTBALL_END`, `isEveningFootball`) si spostano qui da `timeline.ts`, che le riesporta; `dayMinutes` passa a
    `sleep.ts` (riesportata). Regole del lavoro, dopo quelle del calcio: colazione a inizio lavoro meno 45 minuti se il
    lavoro comincia prima di colazione più 30, mai prima del controllo del mattino (sveglia più 5), con l'avviso se
    servirebbe prima della sveglia; un pasto che cade nel lavoro va in una pausa di almeno 30 minuti entro 90 minuti,
    altrimenti a fine lavoro più 15 se finisce entro 60, altrimenti 45 minuti prima di un lavoro cominciato da non più di
    30, altrimenti resta ed è da portare; tra due pasti almeno 90 minuti (o la distanza del piano, se più corta), con il
    pasto dopo che segue quello spostato avanti. Passano da qui la timeline (pasti, integratori, giornata minima), gli
    esercizi del fisioterapista (fuori dal lavoro, 30 minuti dopo la fine: `WORK_RETURN_MIN`), la spesa del sabato (dopo
    il lavoro), la spesa di avvio (il lavoro tra le finestre occupate), il calendario (orari del giorno e "Da portare al
    lavoro."), Settimana (`mealScheduleFor`, Menù e ricetta), la revisione (merenda e spuntino della settimana, senza
    orario se il lavoro lo cambia da un giorno all'altro), il coach e i dati di esempio. Le pagine Orari dei pasti e
    Impostazioni mostrano e modificano ancora `Plan.mealTimes`, gli orari dei giorni normali.
  - `engine/timeline.ts`: `heldByWork(item, now, work, plan)` e `pickNow(…, { work })`: durante un blocco di lavoro la
    card Adesso non propone le voci che vi cadono, tranne quelle da portare; se restassero solo quelle, le mostra lo
    stesso. Il lavoro non è una voce della timeline: non si segna e non conta. `planBasis` ignora il lavoro (sposta i
    pasti, non i tipi di giorno né le sedute), così cambiarlo non supera le proposte di blocco e di menù.
  - Interfaccia: Impostazioni › Settimana ha la sezione «Lavoro» (`components/WorkEditor.tsx`), un campo per giorno che si
    salva all'uscita solo se valido e mostra gli orari normalizzati, cosa cambia nei pasti (`workMealNote`) e gli avvisi
    (`workWarnings`: palestra o calcio nel lavoro, colazione prima della sveglia); «Ripristina la settimana tipo» tiene il
    lavoro (`weekWithoutWork`, `withWorkOf`); `weekSummary` aggiunge i giorni di lavoro. Oggi mostra il lavoro del giorno
    in una pillola dell'intestazione (`OggiData.work`) e "Da portare al lavoro" sotto le voci (`CARRY_META` nella card
    Adesso); Settimana › Menù mostra la pillola del lavoro e "Da portare" accanto all'orario del pasto.
  - Coach: la settimana tipo dice il lavoro di ogni giorno, il piano i giorni di lavoro della settimana con i pasti
    spostati o da portare, la giornata il lavoro di oggi; le voci da portare lo dicono nella timeline.
- Fase 2, onda 1, pasti stimati e i miei piatti (1A; funzioni A e B, docs/FASE2.md § 7-8; nessun campo nuovo in
  `types.ts`):
  - `engine/estimate.ts`: `resolveEstimate(raw, ctx)` (firma del § 14.3) dà la scheda (`EstimateDraft`, con `DraftItem`,
    `PhotoReading`, `EstimateCtx`); i valori li calcola sempre il motore (`draftValues`, `draftMeal`,
    `estimatedItemsValues`): dall'archivio per gli alimenti di `FOODS` e di `ESTIMATE_FOODS`, dal coach solo fuori
    archivio e dopo `validPer100g`. Olio della domanda (`OIL_CHOICES`, `OIL_GRAMS`, `nearestOil`) e olio assorbito nella
    frittura (`FRIED_OIL_SHARE` = 0,08, solo sugli alimenti dell'archivio: quelli di sola stima fritti lo contengono già,
    `friedOilGrams`); intervallo ±25% con gli alimenti a confidenza bassa oltre il 25% delle kcal (`LOW_CONFIDENCE_SHARE`,
    `RANGE_SHARE`, arrotondato verso il centro), kcal a 10 (`roundKcal10`) e grammi a 5 (`roundItemGrams`);
    `kcalCheck` (sotto 100 o oltre 1.800 kcal la scheda chiede conferma); `matchesPlanned` (almeno il 60% degli
    alimenti non di dispensa della ricetta prevista, `MATCH_PLANNED_SHARE`); `stepGrams` (passi di 10 g sotto i 100, di
    25 sopra); `estimateDetail` («Dalla foto · 720 kcal», «Il mio piatto: … · 640 kcal»), letto dal dettaglio dei pasti
    in `engine/timeline.ts`. `MAX_MEAL_ITEMS` = 12 vale per validatore, normalizzazione e piatti; nella scheda gli
    alimenti sono al massimo `DRAFT_ITEMS_MAX` = 11, perché il dodicesimo posto è dell'olio, che si salva come alimento
    (`OIL_FOOD_ID`) così le porzioni dei piatti lo scalano. Un alimento senza valori blocca la conferma finché non si
    sceglie dall'archivio o si toglie. `validPer100g`, `normalizeEstimatedItem` ed `estimatedItemsValues` stanno qui
    dall'onda 1: `state/store.ts` li importa e li riesporta con le stesse costanti.
  - `engine/dishes.ts`: `scaleDish` e `scaledItems` (lineari, condimenti compresi), `dishMeal`, `newDish`,
    `dishMatchesPlanned`, `dishUsage` (usi contati dal diario, solo i `dishId` esistenti), `sortDishes` (prima quelli
    nati in quel pasto, poi i più usati, poi i più recenti), `searchDishes` (ricerca da `DISH_SEARCH_FROM` = 8 piatti),
    `unusedDishes` (oltre `DISH_PRUNE_FROM` = 60), `dishReadyForMenu` (condimenti sotto `MENU_CONDIMENT_SHARE` = 5%
    delle kcal), `dishAsRecipe`, `PORTIONS`, `PORTION_LABEL`.
  - `data/estimateFoods.ts`: 35 alimenti di sola stima (`ESTIMATE_FOODS`) con i fatti di ciascuno
    (`ESTIMATE_FOOD_FACTS`: i salumi sono `carne-lavorata`); mai nel menù né nella spesa (test).
  - `engine/coachTasks/photo.ts`: compito `foto-piatto` sopra `runStructuredTask` (`photoTask`, `readPhoto`,
    `photoSchema` con gli id di `FOODS` e `ESTIMATE_FOODS` in `enum`, `photoSystemPrompt` stabile, `photoContext`,
    `validatePhotoReading`, `photoFoodIds`, `PHOTO_TIMEOUT_MS` = 45 s, `PHOTO_MAX_TOKENS` = 8.000). `photoReadable(settings)`
    decide se la riga «Fotografa il piatto» compare (chiave e modello con l'uscita strutturata). `PHOTO_FALLBACK` = true:
    se nel § 14.4 l'uscita strutturata non regge insieme a `fallbacks: 'default'`, si mette a false (§ 15.8). Gli alimenti
    esclusi dall'utente sono ammessi: è ciò che si è mangiato (§ 10.2).
  - `lib/image.ts`: `thumbnail(dataUrl, 96)` con `centerSquare` (ritaglio quadrato al centro), JPEG alle qualità di
    `THUMB_QUALITIES` finché sta in `THUMB_MAX_CHARS` (i 12 KB di `normalizeThumbs`), `THUMB_PX`.
  - `features/pasti/**`: il pannello `mealLog` (`MealLogSheet`, modi `foto` e `piatti`; `DishesSheet`, `ItemsEditor`,
    `PhotoPick` con il `<label>` sull'`<input type="file" accept="image/*">` senza `capture`, `parts`); `actions.ts`
    (`markEatenMeal` con «Annulla» da `mealSnapshot` e `restoreMeal`, `markDish`, `saveDishFromMeal`, `mealNote`: nota della
    voce di un pasto sostituito, «Dalla foto: …» o «Il mio piatto: …»); `logic.ts` (testi e scelte pure: `MEAL_LOG_TEXT`,
    `failureView` per gli errori del § 7.6, `nearestOpenSlot` per «Metti nel diario», `searchFoods`, `markedToast`);
    `photoInbox.ts` (foto scelta in attesa del pannello e copie da 1.024 px delle foto della chat, solo in memoria:
    `stashPhoto`, `peekPhoto`, `clearPhoto`, `rememberChatPhoto`, `chatPhoto`); `useMealContext`, `useOnline`;
    `fakeReading.ts`, la lettura registrata che il pannello usa con `?coach=finto`.
  - Righe nuove nei fogli che ci sono già: `ItemActionsSheet` («Fotografa il piatto» solo con `photoReadable`, «Serve la
    rete» senza rete, che apre il foglio con «I miei piatti», «Piano B al bar» e «Chiudi»; «I miei piatti» con almeno un
    piatto), `coach/components/Messages.tsx` («Metti nel diario» sotto le foto di oggi), `app/OverlayHost.tsx` (il
    pannello vero al posto del segnaposto). Screenshot: scenari `mealLog` e `mealLog-piatti` (tre piatti inventati).
- Fase 2, onda 1, gusti e prevenzione (1B; funzioni D ed E, docs/FASE2.md § 4.7-4.9 e § 6):
  - `data/foodFacts.ts`: `FOOD_FACTS` (tutti gli alimenti di `FOODS`, con la stagionalità del § 4.10), `factsOf(foodId)`
    (archivio e sole stime: l'unico accesso per motori e test), `inSeason`, `seasonAllows`. `data/recipeFacts.ts`:
    `RECIPE_FACTS` (tutte le ricette: cotture, `riceMethod`, `prep` con `PrepComponentId`), `recipeFactsOf`, `Cooking`.
  - `engine/exclusions.ts`: `excludedFoods(plan, iso?)` e `recipeAllowed` (firme del § 14.3): le esclusioni dell'utente da
    `since` più i divieti fissi A1-A3 (`preventionBan`, `bannedFoods`; le carni lavorate di sola stima comprese);
    `userExclusions`, `userExcludedFoods`, `excludableFoods` (ingredienti di una ricetta senza dispensa),
    `searchableFoods` (pagina Gusti); cambi ripetuti (`tasteSignals`, `isRepeatedSwap`, `tasteQuestion`, con
    `TASTE_MIN_SWAPS` = 3, `TASTE_MIN_SHARE` = 0,6, `TASTE_WINDOW_DAYS` = 28, `TASTE_ASK_COOLDOWN_DAYS` = 56); nomi con
    l'articolo per i testi («Tolte le carote»: `foodLabel`, `foodWithArticle`, `agreed`, `objectPronoun`, `capitalFirst`).
  - `engine/similar.ts`: `mealAlternatives(entry, ctx, limit?)` (firma del § 14.3) e `alternativesFor` (con `widened`):
    filtro H0, H1, stagione `strict`, niente ricette da preparazione, tetti di H3; banda `BAND` ±10%, allargata a
    `WIDE_BAND` ±20% quando non c'è niente; ordine per spesa, valori, minuti, familiarità e id. `baseCarbScale` (strato 1),
    `recipeInSeason`, `weekMealsFor`, `substitutionsForWeek` (lo strato 2 dietro `weekSubstitutions`, mai `dayCarbScale`
    né la spesa: un test lo verifica con un contatore), `doneRates`, `exclusionImpact`, `clearedMeals`,
    `exclusionWarnings` (avvisi della pagina Gusti), `FOOTBALL_LUNCH_MAX_FIBER_G`.
  - `engine/menu.ts`: `weekSubstitutions` ora sostituisce; il valore `''` è una casella senza alternative valide, che
    resta vuota, e `DayMeals.cleared?: Partial<Record<MealSlot, string>>` dice quale ricetta è stata tolta; `prepInForce`
    toglie i compiti che servivano solo alle ricette tolte o svuotate.
  - `engine/prevention.ts`: `weekPreventionStats(meals, ctx)` (firma del § 14.3), `mealPrevention`, `mealFromRecipe`,
    `mealFromEaten` (un pasto stimato conta per i suoi alimenti, un ordine del bar senza alimenti no), `PlannedMeal`,
    `PreventionCtx` (fatti iniettabili nei test), le costanti di A4-A10 e di B1 (`RED_MEAT_WEEK_G` = 350,
    `OUTSIDE_RED_MEAT_PORTION_G` = 150).
  - `engine/review.ts`: `preventionMeasures(weekStart, state, opts)` con `PreventionReport` (`measures`, `days`,
    `prefill`, `alcohol`), `measuresOutside`, `alcoholStepOption`; lo scalino `alcol` («Una sera senza alcol in più») in
    `WeeklyStepId` e in `ALL_STEP_IDS` (`WEEKLY_STEP_IDS` resta l'elenco degli scalini sempre proposti), il parametro
    `outside` di `proposeWeeklyStep`, `WAIST_LIMIT_CM`, `WAIST_RISE_CM`. Le misure sui giorni con meno del 60% dei pasti
    segnati non contano per le medie al giorno; i pasti non segnati contano come previsti.
  - `data/barPlanB.ts`: `BarPlanBOption.contains?: string[]` (alimenti dell'archivio, campo locale); `barPick.ts` e
    `BarPlanBSheet` tolgono le opzioni con un alimento escluso.
  - Coach (`engine/coachContext.ts`): la riga «Esclusi dall’utente» nel contesto e il divieto nel prompt di sistema. Senza
    esclusioni il contesto non cambia: l'istantanea di compatibilità resta uguale.
  - Interfaccia: `RecipeSheet` (alternative con valori simili, «Qualcosa non ti piace?» con «Togli dal piano»),
    `SwapSheet` (domanda dei cambi ripetuti; il cambio passa `plannedId` a `swapRecipe`, che scrive `DayLog.swapPlanned`),
    `GustiPage` (Impostazioni › Gusti), revisione (tre domande facoltative nel passo Misure, misure fuori riferimento in
    «Da sapere», il resto dietro un tocco).
- Fase 2, onda 1, integrazione:
  - `FoodFacts.meatShare?: number` (tipo locale in `data/foodFactsTypes.ts`): per i piatti composti di sola stima con
    gruppo `carne-rossa` o `carne-lavorata`, la quota del peso che è carne; assente = 1. Valori [ipotesi, ricetta tipica da
    bar o da asporto]: hamburger nel panino e kebab 0,4, cotoletta alla milanese 0,75, panino al prosciutto cotto 0,33,
    piadina farcita e toast 0,2; lasagna e pasta al ragù passano da `cereale-raffinato` a `carne-rossa` con 0,15 (il ragù
    è di carne: prima non contavano). `meatShareOf` in `engine/prevention.ts`; i menù non cambiano (gli alimenti
    dell'archivio non hanno la quota).
  - Carne rossa nella revisione (§ 4.7): grammi cotti del menù dei giorni contati e di tutti i pasti stimati (con la
    quota), più le porzioni fuori dal menù che il diario non ha × 150 g. La domanda parte dai pasti stimati che non erano il
    pasto previsto (`prefill.redMeat`) e conta solo la differenza, così una foto non vale due volte; una foto del pasto
    previsto conta i suoi grammi e non precompila la domanda. Prima ogni foto con carne rossa valeva 150 g qualunque fosse
    il peso.
  - `CLEARED_MEAL_DETAIL` in `engine/timeline.ts` («Scegli tu: proteine, un carboidrato, verdura», § 6.4): dettaglio di un
    pasto svuotato da un'esclusione, dopo la stima e lo scambio dell'utente. La card Adesso mostra «Piano B» al posto di
    «Ricetta» per un pasto senza ricetta (stesso posto, nessun pulsante in più).
  - `PageId` comprende `gusti` (`features/impostazioni/pages/Page.tsx`), anche per `#impostazioni?sezione=gusti` e per
    gli screenshot (`impostazioni-gusti`).
  - La chat tiene in memoria la foto da 1.024 px di ogni messaggio inviato (`rememberChatPhoto` in `useCoachChat`):
    «Metti nel diario» la usa finché l'app è aperta, poi quella da 720 px del messaggio.
  - Informazioni: riga «Foto dei piatti» nel gruppo Privacy (§ 7.7) e riga «Archivio non letto» quando l'archivio freddo
    è illeggibile (`archiveInfo().status`, § 12.5).
  - Esclusioni, stime e piatti: un alimento escluso resta ammesso nelle stime da foto e nei piatti salvati (§ 10.2: è ciò
    che si è mangiato); le esclusioni valgono per il piano (menù, alternative, spesa, piano B, coach).
- Fase 2, onda 1, correzioni:
  - `mealsForDate`: uno scambio del diario (`DayLog.recipeSwaps`) la cui ricetta contiene un alimento escluso in quella
    data non vale e il pasto torna allo strato 2 (§ 4.9: l'escluso non ricompare dal giorno dopo, nemmeno in un pasto già
    cambiato per un giorno futuro). Lo scambio resta nel diario: riattivato l'alimento, torna. Prima di `since` niente
    cambia. Senza esclusioni nessuna ricetta contiene alimenti vietati: l'istantanea di compatibilità resta uguale.
  - `exclusionImpact(plan, ids, since, days?, dayLogs?)`: confronta la ricetta che si mangia, scambi del diario compresi
    (l'avviso «cambia 1 pasto da domani» conta anche lo scambio che torna allo strato 2).
  - `preventionHeadline(report)` in `engine/review.ts`: «Prevenzione: tutto nei limiti» solo con tutte le misure dentro;
    con domande saltate «Prevenzione: niente fuori dai limiti» e quante non sono indicate (§ 4.7).
  - `SwapSheet`: tre alternative in vista e «Tutte (n)» per le altre (§ 6.1, come il foglio della ricetta).
  - I miei piatti: nella modifica la riga del tetto delle kcal e il piede «Controlla i grammi» oltre 3.000 kcal; senza
    alimenti il piede apre la ricerca; nel dettaglio di un piatto oltre il tetto già alla porzione normale il piede porta
    alla modifica (`dishDetailAction`, `dishEditAction` in `features/pasti/logic.ts`). Porzioni con `Segmented` piccolo.
  - Screenshot: scenario `mealLog-piatto` (dettaglio di un piatto, con `tap`) e controllo delle etichette tagliate nei
    controlli segmentati in ogni vista.
- Fase 2, onda 2, menù generato (2A1; docs/FASE2.md § 4.10-4.11; nessun campo nuovo in `types.ts`):
  - `engine/menuGen/` (accesso unico da `index.ts`): `validateMenuWeek(week, ctx)` (firma del § 14.3, mai eccezioni; vincoli
    H0-H6 con i codici del § 4.10, A1-A10, pasti da portare, preparazione della domenica; con `rules: 'avvio'` vale A11),
    `isMenuWeekValid`, `menuWeekSummary`; `generateMenuWeek(input)` (sincrona, seme da `engine/rng.ts`, ripiego
    `generato` → `seme-adattato` → `seme` → `fuori-limiti`; in più del § 4.10 una mossa «stessa ricetta in tutti i giorni»
    e la ripartenza dal migliore con due mosse a caso del generatore se restano violazioni), `menuCellPool`,
    `menuWeekCost`; `menuGenInput(monday, state, opts?)` (l'unico che legge lo stato: piano proiettato, tipi di giorno,
    obiettivo della data, minimo di partita, rampa delle fibre, pasti da portare da `mealTimesFor`, seme, settimana prima,
    gusti dal diario, esclusioni), `menuDaysFor`, `validationCtxOf`, `MAX_EVALUATIONS` (3.000), `FIBER_STEP`;
    `prepTasksFor(week)` (firma del § 14.3), `prepPlan`, `prepYield`, `sameBatchLayout`; per la proposta
    `buildMenuProposal(ctx)` (un `ProposalBuilder`), `isMenuProposalTime` (dal venerdì alle 12:00, `MENU_PROPOSAL_FROM`),
    `menuProposalMonday`, `menuProposalShopping` (spesa prima e dopo, `extra`), `proposalMeals`. Pesi delle classi nel
    punteggio (× 10.000): H0 × 100, H1 × 10, H6 × 0,5, crescenti con la distanza dal limite fino al quadruplo; il tetto
    dei 40 prodotti pesa come H1; al massimo `NEW_FOODS_MAX_PER_WEEK` (2) freschi nuovi a settimana; la rampa delle fibre è
    solo la soglia del punteggio, mai sotto i 30 g di A7; «5 su 14» vale per lo spuntino, non per la merenda pre-calcio.
  - `engine/menu.ts`: la ripetizione dell'ultima settimana approvata (§ 4.10, test 57): `repeatedMenuWeek(monday, plan)`
    (solo tra i lunedì prima, `REPEAT_LOOKBACK_WEEKS` = 4, e solo se `menuWeekInSeason(week, menuMonthOf(monday))`),
    `DayMeals.source` `'ripetuto'`. Senza menù approvati niente cambia: l'istantanea di compatibilità è la stessa.
  - `engine/shopping.ts`: `shoppingExtra(before, after)` e `EXTRA_WEIGHT_G` («Da comprare in più»: prodotti nuovi e quelli
    che salgono di almeno una confezione).
  - Dati: `RecipeFacts.carry` (`ambiente` o `borsa-termica`, per i pasti da portare), i `PrepComponentId` nuovi
    (`zuppa-cavolo-nero`, `salmone-forno`, `sacchetti-frutta-secca`) e `PREP_GUIDE` per componente in `data/menu.ts`,
    `data/prepComponents.ts` (titolo, minuti, timer, guida, resa e `fridgeDays` del § 4.11; «freezer», non
    «congelatore», come nel resto dell'app); `NEW_SEASONAL_FOODS` in `data/foodFacts.ts` (fragole, pesche, cachi, finocchi,
    cavolfiore, cavolo nero, con la stagione obbligatoria) e 16 ricette nuove in `data/recipes.ts`; in
    `fiocchi-latte-pomodorini` il pane integrale al posto dei crackers, nella vellutata «3 giorni». I test di `menu.test.ts`
    leggono i gruppi da `factsOf` e passano dal validatore (rotazione in tutti i mesi, menù di avvio).
- Fase 2, onda 2, menù nell'interfaccia (2A2; § 5.3, § 11.5):
  - `features/settimana/useMenuProposal.ts`: `menuProposalBuilder` (registrato per il tipo `menu`; una proposta nata dallo
    storico non si ricalcola), `menuProposalStep`, `proposeMenuIfDue`, `scheduleMenuProposal`, `setupMenuProposals`,
    `useMenuProposalTrigger`, `proposalClock` (dopo mezzanotte l'orario conta come fine giornata), `menuProposalView`,
    `useMenuProposalView`, `proposalChanges`, `proposalSummary`, `afterShoppingText`, `proposalMondayFor`. La proposta nasce
    una volta per lunedì, dal venerdì alle 12:00, quando si apre Settimana o l'app torna in primo piano, sempre dopo il
    disegno; senza differenze dal menù che varrebbe comunque la base si annota e non si ricalcola.
  - `features/settimana/extraShopping.ts`: la nota di «Da comprare in più» (chiave `ritmo:spesa-in-piu`, fuori dallo stato e
    dal backup, come la seduta in corso: le spunte non hanno orario, il momento dell'approvazione non si ricava dallo
    stato), spunta `in-piu:<id>` dentro `shoppingChecked` per un prodotto che sale; `nextMarks`, `recordMenuApprovals`,
    `setupExtraShopping`, `extraShoppingRows`, `useExtraShopping`, `approvedMenuOf`. Conteggio di «Dopo la spesa»: i
    prodotti nuovi più quelli che salgono, questi solo se già spuntati.
  - `features/settimana/menuInfo.ts`: `menuSourceInfo` (pillola «Menù di avvio | di base | approvato | ripetuto»: «Menù di
    base» è il nome in interfaccia della rotazione), `repeatedFromMonday`, `clearedReason`, `prepStorage`, `freezerNote`.
    Proprietà nuove: `MenuTab.proposal`, `ShoppingTab.proposal`, `WeekStrip.marked`, `PrepPlayer.storage`.
- Fase 2, onda 2, allenamento generato (2B1; § 3; nessun campo nuovo in `types.ts`):
  - `data/exercises.ts`: campi locali di `CatalogExercise` (`pattern`, `qualities`, `impactLevel`, `contactsPerRep`,
    `space`, `uncounted`), tipi `MovementPattern`, `ExerciseSpace`, `ImpactLevel`, le 37 esercitazioni del § 3.7 (catalogo a
    97 esercizi; `prova-saltello` senza alternative), `impactLevelOf`, `spaceOf`, `patternOf`. `data/sessions.ts`:
    `estimateItemSec` stima metri (`distanceM`) e intervalli (`workSec`); negli esercizi a ripetute `restSec` vale dopo ogni
    ripetuta; `DOSE_PRESETS` (dose di riferimento per esercizio). Le sedute fisse non cambiano.
  - `engine/plan/season.ts` (fasi e stadi, `seasonOn`, `isPreseason`, `nextPhaseChange`, `dayTypeForLoad`, compatibilità
    delle qualità, `TRAINING_PRESETS`, `presetsFor`, `lockedPresets`, coppie vietate, `trainingForPhase`); `limits.ts`
    (contatti e metri con i tetti per fase, gambe pesanti, pavimenti `FloorId` meno il fisioterapista, spazi,
    `substituteFor`, `substituteItem`, `candidatesFor` per il coach); `returnStages.ts` (stadi del rientro per zona con
    `maxImpactLevel` e `allowed`, `returnAdvice`, `impactHoldActive`); `week.ts` (distanza dalla partita, posizione delle
    sedute con R1-R7 fuori dal lavoro, `plannedLoad` e `validateWeek` con le firme del § 14.3, la settimana conta da 1; R10
    è un avviso, non una violazione); `readiness.ts` (`dayReadiness`, varianti ridotta e minima, `readinessText`);
    `blockReview.ts` (`blockReview`, `nextBlockPlan`, `sequenceSuggestion`, `blockSummaryOf` con `peakLoad`); `build.ts`
    (`buildBlock` nell'ordine del § 3.12, `blockShape`, `r10Reference`, `r8Active`, `R8_TEXT`, `blockTrigger`,
    `blockWeekInfo`, `buildInputOf`, `buildBlockProposal`, `goalsProposal`, `buildGoalsProposal`, `blockSessionsText`).
    `TrainingBuildInput.blocks?` e i campi in più di `TrainingBuildResult` (`training`, `seasonWeek`, `review`, `peakLoad`,
    `weekLoads`, `season`). Nella proposta di blocco `effectiveFrom` = `program.start` e `approvableUntil` il giorno prima
    del primo giorno che cambia.
  - `engine/plan/program.ts`: `programInForce` (a un cambio di fase senza approvazione tornano le sedute fisse), `sessionFor`
    con `season` facoltativa (firma compatibile) e i ritocchi `Program.edits` (`applyEdits`), `deriveItem` (negli sprint
    cresce la distanza, nei salti le ripetizioni, mai insieme), `daySession` con il fermo degli impatti anche sulle sedute
    fisse e, con un blocco, la variante del giorno, il richiamo dopo una partita sotto i 45 minuti (`RECALL_ITEM`,
    `SHORT_MATCH_MIN`) e la prova del saltello una volta sola; `withoutImpacts`, `programWeekOf`. Lo slot `R` è l'uscita
    facile della pausa; nelle sedute di corsa il blocco si chiama «Corsa» o «Intervalli» e non riceve le serie in più.
  - `engine/training.ts`: il fermo degli impatti dentro `painGate` («Impatti fermi»), `exerciseIntro` con
    `RESUME_LOAD_FACTOR` 0,8 dopo 14 giorni o più senza sedute (solo con un blocco in vigore: senza i campi nuovi l'app
    resta quella di prima). `engine/energy.ts`: `isPreseason` da `season.ts`, stesso risultato. `engine/targets.ts`:
    `targetsForGoal`, `PROTEIN_G_PER_KG_BY_GOAL` (2,2 g/kg in dimagrimento).
- Fase 2, onda 2, allenamento e obiettivi nell'interfaccia (2B2; § 11.4-11.5):
  - `PageId` con `macro` («Calorie e macro», la pagina di prima) e `storico`; `ObiettiviPage` nuova (corpo, allenamento,
    rientro, tempo e spazi, stagione; «Vedi la proposta» solo con qualcosa di cambiato; con il rientro senza zona il pulsante
    dice «Scegli la zona del rientro» e porta alla pagina Dolore); segnali d'allarme nella pagina Dolore; obiettivo tolto
    dal Profilo. Il via libera del fisioterapista per un rientro già in vigore vale da subito, senza proposta.
  - `features/allenamento/blocks.ts` (registrazione dei generatori `blocco` e `obiettivi`, `blockProposalDue`,
    `ensureBlockProposal`, `endingBlockSummary` salvato con `recordBlockSummary`, `BLOCK_REJECT_PAUSE_DAYS` = 28 dopo «Tieni
    il piano attuale» tranne quando cambia l'obiettivo, `openBlockProposal`, `pendingBlock`, `blockWeekLabel`,
    `blockSessions`, `fullDaySession` per «Fai la piena», `dayVariantSession`, `blockStamp`), `goals.ts`,
    `sessionNames.ts` (`sessionName`, `sessionWithArticle`: mai «Seduta K»).
  - Lettore: `SessionDraft.variant?` e `hopTest?`, `PlayerItem.exIntro?` e `hop?`, `PlayerPlan.exIntro` e `hopTest`,
    `buildPlayerPlan` con `introFor` e `hopTest`, `suggestionForItem` con `variant`; il registro scrive `variant`, `blockId`
    e `weekIndex`. Oggi: `NowCardProps.date`, `NowContentContext.variant`, `GYM_VARIANT_LABEL`, `GYM_NO_IMPACT_DETAIL`; il
    dettaglio della palestra dice «Ridotta · 40 min» (non «Seduta B ridotta» del § 11.2, per non ripetere il titolo).
- Fase 2, onda 2, integrazione:
  - `saveProposal`: una proposta «superata» con lo stesso id torna aperta (la base è tornata quella di prima, per esempio
    un'esclusione tolta con «Annulla»); approvate e scartate restano decise. Lo stesso in `refreshProposal` e in
    `ensureBlockProposal`; tolto il ripiego `reopenSuperseded` di Settimana. `rebuild` non chiama mai il generatore per una
    proposta nata dallo storico (`isReuseProposal`).
  - `announceDataReplaced` toglie anche `EXTRA_SHOPPING_KEY` (`ritmo:spesa-in-piu`, ora esportata dallo store).
  - `app/boot.ts`: «Da comprare in più» ascolta le approvazioni da subito; dopo il primo disegno (`afterFirstPaint`) si
    caricano a richiesta le regie delle proposte (`setupPlanProposals`): generatori registrati, ritorno in primo piano del
    menù, proposta di blocco della giornata all'avvio, al ritorno in primo piano e dopo dati sostituiti; con i dati di
    esempio anche la proposta del menù della settimana dopo (dal venerdì alle 12:00). `?overlay=planProposal` aspetta le
    regie e apre la proposta aperta più recente. Il foglio della proposta importa da sé le due regie (generatori
    registrati anche quando lo apre la revisione o lo storico).
  - Foglio della proposta: per un menù aperto con la spesa di quel lunedì già cominciata il sottotitolo aggiunge «Dopo la
    spesa: …», calcolato con le spunte di adesso (§ 5.3).
  - `engine/timeline.ts`: `TimelineState` comprende `profile` e `planner` (Oggi li passa: il dettaglio della palestra conta
    la regola del dolore); la spesa del sabato dice `SHOPPING_NEW_MENU_DETAIL` («Prima guarda il menù nuovo») con una
    proposta di menù aperta per il lunedì dopo (`menuProposalOpen`); lo schema di un pasto vuoto segue il pasto
    (`clearedMealDetail(slot, day)`, `CLEARED_MEAL_DETAILS`: colazione «proteine, un cereale e un frutto», spuntino e merenda
    «un frutto e un po’ di proteine», merenda prima del calcio della sera «un carboidrato semplice e poca proteina», pranzo e
    cena `CLEARED_MEAL_DETAIL`), lo stesso nella card «Scegli tu» di Menù; prima della spesa di avvio conta lo scambio che
    vale dopo le esclusioni (`mealsForDate`), non quello grezzo del diario.
  - `slotLabel(slot)` in `engine/plan/program.ts` («Seduta B», «Corsa», «Uscita facile»): differenze, ritocchi del coach,
    settimana tipo in Settimana e la card del primo giorno non scrivono più «Seduta K».
  - `TrainingBuildInput.today?` (facoltativo; `buildInputOf` lo passa) ed `endingBlockSummary(s, monday, today?)`: con un
    blocco cambiato a metà la costanza del riepilogo conta le sedute fino a ieri, non quelle ancora da fare.
  - Variante minima: almeno `MINIMAL_MIN_MIN` (15) minuti; con i pavimenti già fatti si completa con la mobilità del
    riscaldamento, poi con quella del catalogo (`MINIMAL_MOBILITY`) e la cyclette facile, sempre entro i 20 minuti.
  - `computeTargets` usa `PROTEIN_G_PER_KG_BY_GOAL`: chi sceglie il dimagrimento nel benvenuto parte da 2,2 g/kg, come la
    proposta di obiettivi (§ 2.1). Ricomposizione, mantenimento e massa non cambiano.
  - Storico: un menù approvato che si ripete questa settimana è «in vigore» («Menù approvato · si ripete questa
    settimana»).
  - `ui/Screen.tsx`: il titolo piccolo della barra sta sopra, al centro, e non toglie spazio all'etichetta di ritorno, che
    sfuma quando il titolo compare (a 360 px «Indietro» non si taglia più).
  - Dati di esempio: `buildDemo(today, { block: true })` (lo usa `loadDemo`; senza l'opzione i dati della fase 1, per
    l'istantanea): obiettivo pronto «Prestazione nel calcio» (`DEMO_TRAINING`) e il blocco che il motore propone la domenica
    prima del lunedì della settimana scorsa, approvato (proposta approvata con `before`, versione nello storico); le sedute
    registrate del blocco hanno `blockId`, `weekIndex` e `variant`.
  - Valutato e lasciato: `planBasis('menu')` non legge `Plan.menus`. I menù approvati cambiano solo approvando una
    proposta di menù per quel lunedì, che al salvataggio supera già le aperte dello stesso lunedì; la ripetizione guarda
    solo i lunedì passati, che non si approvano più.
- Fase 2, onda 2, correzioni dopo la verifica (nessun campo nuovo in `types.ts`):
  - Menù generato: mosse di riparazione dei conteggi della settimana (`repairMoves` in `engine/menuGen/generate.ts`:
    legumi nei giorni che non li hanno, pesce, uova, riso e carne rossa fuori dai limiti, partita e vigilia con i
    carboidrati o le kcal fuori, prima delle mosse a caso e all'inizio di ogni ripartenza); `RESTART_EVALUATIONS` (3.000)
    e `MenuGenInput.restartEvaluations`: valutazioni in più solo per le ripartenze e solo finché il migliore ha violazioni
    (un menù valido si ferma entro `MAX_EVALUATIONS`; il test 17 controlla `maxEvaluations + restartEvaluations`). Carne
    rossa (A4) e riso (A5) pesano come H1 (`CODE_FACTOR`); `NEVER_RELAXED` (H0, H1, A4, A5): tra il migliore e il seme
    adattato il ripiego «fuori-limiti» sceglie quello che non li viola. Una violazione di partita o vigilia resta solo
    quando un pasto del giorno non ha candidati. Due pranzi da portare con le lenticchie rosse e senza pesce
    (`couscous-lenticchie-carote`, `pasta-fredda-lenticchie-zucchine`): nei giorni di calcio sono gli unici legumi
    ammessi a pranzo. Misura in node: al più circa 300 ms nei casi con le ripartenze; da rimisurare nell'onda 4.
  - `planBasis` dei blocchi e dei menù legge anche l'orario di lavoro (dall'onda 2 sposta le sedute e decide i pasti da
    portare): cambiarlo supera le proposte aperte. `applyPatch` con `patch.week` tiene per ogni giorno il lavoro del piano
    attuale (`withCurrentWork`): una toppa nata prima di un cambio di orario non lo riporta indietro. Cambia la decisione
    dell'onda 0 («`planBasis` ignora il lavoro»).
  - `daySession(slot, iso, state, opts?)` con `opts.ignoreReadiness` («Fai la piena», `fullDaySession`): toglie solo la
    variante del controllo del mattino; con una zona sotto il ginocchio a soglia degli impatti + `PHYSIO_REFERRAL_MARGIN`
    la seduta piena resta senza impatti (§ 3.6, freno 4). Le soglie del piano restano quelle vere.
  - `blockTrigger`: `fine-blocco` in ogni settimana dall'ultima del blocco in poi (prima solo ogni 4); `blockProposalDue`
    lo accetta di domenica, così una proposta scaduta senza decisione si rigenera la domenica dopo e chi non apre l'app
    la domenica di fine blocco la trova la domenica dopo. La pausa di 28 giorni resta solo dopo «Tieni il piano attuale».
  - `buildBlock`: prima l'obiettivo valido nella fase (con il nome dell'obiettivo pronto nell'avviso), poi il rientro
    proposto dal fermo o dal riepilogo; con una zona fragile e un impatto come principale il rientro diventa la
    principale con la prevenzione; con un rientro appena proposto la sequenza delle qualità non lo sostituisce.
  - Variante minima: i 15-20 minuti si contano sulla seduta propria, senza i pavimenti coperti dal fisioterapista
    (`VariantOptions.physio` in `minimalSession` e `sessionForVariant`), come la durata del lettore.
  - `EMPTY_MENU_CELL` in `engine/menu.ts`: in un menù approvato o ripetuto una casella che il generatore ha lasciato vuota
    finisce in `DayMeals.cleared` con questo valore; Menù mostra «Scegli tu» («Nessuna ricetta adatta con le tue
    esclusioni.», `clearedReason`) e Oggi lo schema del pasto.
