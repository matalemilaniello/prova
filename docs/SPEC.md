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
- Incisi con le virgole; il trattino lungo (—) non si usa nei testi dell'interfaccia.
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
  Supporta anche `?overlay=recipe|checkin|session|football|barPlanB` per aprire un pannello e
  `?onboarding=1` per mostrare l'onboarding. La vista `oggi-primo-giorno` simula il primo giorno di un utente nuovo
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
  ("1 fetta abbondante · ≈ 50 g", "quasi 2 fette").
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
  calcio vale l'orario dopo la partita. `calendarStatus` dice se il file aggiunto è ancora allineato al piano.
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
  carboidrati, niente legumi a cena, niente ricette da preparazione della domenica.
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
con riepilogo (kcal per tipo di giorno ricalcolate, prima seduta, orario a letto di questa settimana).
Pulsante secondario "Prova con dati di esempio".

### Oggi (`src/features/oggi/`)
- Intestazione: giorno ("Martedì 10"), tipo di giorno con colore, kcal obiettivo, ingranaggio.
- Anello di avanzamento della giornata (voci fatte / totali) e serie di giornate riuscite.
- Card "Adesso" con la prossima voce non segnata (grande, con azione primaria).
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
- Striscia dei 7 giorni con tipo di giorno e attività; selezione del giorno.
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
  sonno con linea dell'obiettivo, dolore per zona, carico settimanale con soglia, calendario delle giornate
  riuscite (heatmap delle ultime 8-12 settimane).
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
  leggi la documentazione dello skill claude-api in
  `/tmp/claude-0/bundled-skills/2.1.316/c920797112a727e450cfdeb7ec1cca41/claude-api/typescript/claude-api/README.md`
  e `streaming.md` nella stessa cartella, più la sezione su refusal e fallback in
  `../../shared/model-migration.md` (Migrating to Claude Opus 5.5). Non inventare API dell'SDK.
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
