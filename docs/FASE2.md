# Ritmo · specifica vincolante della fase 2

Questo documento decide la fase 2. Chi costruisce lo legge tutto prima di scrivere codice, insieme a `docs/SPEC.md`
(che resta valida dove questo file non dice altro) e a `docs/UI.md`. Quando una regola di qui contraddice una bozza o
un'abitudine del codice, vale questo file. Le modifiche al contratto si annotano poi in fondo a `docs/SPEC.md`, come
sempre.

Contenuto: foto dei piatti (A), i miei piatti (B), generatore dei piani di allenamento e di alimentazione (C), gusti (D),
prevenzione oncologica come regola di base del menù (E), catalogo degli integratori (F).

**Privacy.** Il repository è pubblico. In questo file, nel codice, nei test e nei dati di esempio non compaiono dati
dell'utente: niente età, misure, diagnosi, professione, orari personali, abitudini, dispositivi, integratori che prende.
Si descrive una persona tipo generica; i valori veri restano sul telefono. Il controllo è uno script (§ 14.1), non una
promessa.

## Come leggere le etichette

- **[codice]** fatto verificato nel repository (file e funzione indicati);
- **[misura]** misurato sul repository con uno script;
- **[doc]** documentazione dell'API di Claude (skill claude-api) o tipi dell'SDK installato (`@anthropic-ai/sdk` 1.3.0);
- **[fonte]** evidenza pubblicata, con l'autore;
- **[pratica]** consenso professionale senza prove sperimentali forti;
- **[ipotesi]** scelta di progetto da verificare sul telefono, con i dati o con l'utente.

Una regola senza etichetta è una decisione di questo documento.

---

## 1. Obiettivo e principi

### 1.1 Persona tipo

Adulto che gioca a calcio la sera e va in palestra, con una stagione e una pausa estiva, ed eventuali zone di dolore
scelte nel profilo (le regole per le zone sotto il ginocchio e per il gomito ci sono già nel codice **[codice]**). Chi
usa Ritmo legge i numeri: ognuno ha la sua fonte o la sua etichetta (§ «Come leggere le etichette»). La costanza è il
problema più comune: il piano chiede poco, cambia poco e non toglie quello che piace se non lo chiede l'utente.

### 1.2 Cosa ottiene con la fase 2

1. Fotografa un piatto e il diario prende valori veri, dopo la sua conferma (A).
2. Ritrova i piatti che mangia spesso e li segna offline con un tocco (B).
3. Riceve ogni mese un blocco di allenamento e ogni settimana un menù costruiti sui suoi progressi, sul suo stato e sui
   suoi obiettivi, sempre come proposte da approvare (C).
4. Toglie per sempre un ingrediente che non gli piace; l'app impara dai cambi senza decidere da sola (D).
5. Mangia secondo le regole di prevenzione oncologica più solide, senza doverci pensare (E).
6. Aggiunge un integratore senza scrivere un numero: dose, momento, limiti ed esami li conosce l'app (F).

### 1.3 Principi vincolanti

- **P1 · Il motore costruisce e controlla, il coach ritocca dentro i recinti, il codice rivalida tutto.** Ogni numero
  che arriva dal coach, da un'etichetta o da un backup passa da un validatore con limiti scritti. Il coach sceglie solo
  tra opzioni che il motore gli passa.
- **P2 · Niente si applica da solo.** Un piano nuovo (blocco, menù, obiettivi, ritorno a una versione) è una proposta
  con le differenze; si approva, si scarta o si annulla. Una stima da foto non entra nel diario senza conferma. Nessuna
  dose di integratore cambia in silenzio.
- **P3 · Il piano contiene ciò che vale.** Menù approvati, blocco in vigore, esclusioni e obiettivi stanno in `Plan`,
  che ogni motore riceve già. Proposte e storico stanno fuori. Senza i campi nuovi l'app si comporta esattamente come
  oggi (verificato da un'istantanea, § 13.1), salvo tre cambi dichiarati e voluti: la patch di prevenzione, la
  conservazione del ragù del seme (§ 4.11) e i limiti di sicurezza dell'energia per chi ha già un deficit (§ 2.1).
- **P4 · Motori puri e deterministici.** I motori nuovi non leggono l'orologio e non usano `Math.random`: la data e il
  seme arrivano dagli argomenti; i limiti di calcolo sono un numero di valutazioni, mai millisecondi.
- **P5 · Non salvare ciò che si deriva.** Dosi delle settimane del blocco, contatti di una seduta, usi dei piatti,
  segnali dei gusti, variante del giorno: si calcolano.
- **P6 · Oggi non cresce.** Nessuna card nuova, nessun pulsante nuovo in vista. Cambiano solo testi di dettaglio e il
  contenuto dei fogli che ci sono già (§ 11.2). Le funzioni nuove vivono nei fogli esistenti, in Settimana, in
  Allenamento, in Progressi e nelle Impostazioni, e arrivano dentro i riti che l'utente fa già (spesa del sabato,
  revisione della domenica).
- **P7 · Senza rete e senza chiave si vive lo stesso.** Tutto funziona offline tranne la lettura delle foto (piatti ed
  etichette) e la rifinitura del coach. Niente pulsanti disattivati: ciò che non si può fare non compare, oppure dice
  perché in una riga.
- **P8 · Meno, ma fatto.** Con la costanza bassa il piano chiede meno; il menù cambia poco da una settimana all'altra.
  Un piano eseguito vale più di un piano ottimo.

### 1.4 Fatti del codice che il progetto rispetta

| Fatto | Dove | Conseguenza |
|---|---|---|
| `normalizeData` ricostruisce `AppData` chiave per chiave: una sezione sconosciuta in cima allo stato sparisce; dentro `Plan`, `DayLog`, `Settings` i campi sconosciuti restano | `state/store.ts` **[codice]** | ogni sezione nuova va in `normalizeData` e in `DATA_KEYS` |
| `parseBackup` rifiuta un backup con `version` più alta di `DATA_VERSION` | `lib/backup.ts` **[codice]** | `DATA_VERSION` passa a 4: un'app vecchia rifiuta un backup nuovo invece di perdere piatti e proposte |
| `persist` riscrive tutto lo stato a ogni tocco; stato dei dati di esempio 29,8 KB, serializzazione 0,2 ms | **[misura]** | miniature e versioni del piano vanno in un archivio a parte (§ 12.5) |
| `normalizeBarMeals` tiene un pasto stimato solo se la voce è «sostituito»; `setItemStatus` lo toglie quando la voce cambia | `state/store.ts` **[codice]** | la regola si allarga per i pasti fotografati che erano quelli previsti (§ 7.5) |
| I lettori dei valori stimati sono tre: `dayNutritionDetail` (`onlyDone`), `dayIntake` in `review.ts`, la riga del coach | `engine/nutrition.ts`, `engine/review.ts`, `engine/coachContext.ts` **[codice]** | un accessorio unico, `eatenMeal`, li serve tutti |
| La preparazione della domenica è scritta a mano per ogni settimana della rotazione; le spunte (`prepDone`) usano l'id del compito | `data/menu.ts` **[codice]** | i compiti scritti a mano restano finché le ricette da preparazione non cambiano; altrimenti si generano da componenti con id stabili (§ 4.11) |
| Gli id delle ricette restano quando cambiano gli ingredienti (`gallette-grana-clementine` oggi è pane, grana e kiwi) | `data/recipes.ts` **[codice]** | le esclusioni e i divieti valgono per alimento, mai per id o nome di ricetta |
| `gallette-riso` è ancora nell'archivio | `data/foods.ts` **[codice]** | i divieti di prevenzione lo escludono per regola |
| Lo scarico e la «settimana più leggera» accettati nella revisione non cambiano nessuna seduta (`apply: { type: 'none' }`) | `engine/review.ts` **[codice]** | la fase 2 li rende veri (§ 3.9) |
| Gli integratori sono già raggruppati per momento nella timeline (`integratori`, `integratori:pranzo`, `:cena`, `:sera`) | `engine/timeline.ts` **[codice]** | il promemoria con il pasto usa la struttura che c'è |
| 60 ricette, 30 usate dalla rotazione; per pasto 9 colazioni, 10 spuntini, 14 merende, 21 pranzi, 26 cene | **[misura]** | servono ricette nuove di stagione (§ 4.10) |
| L'SDK 1.3.0 ha `BetaOutputConfig { effort?, format?: { type: 'json_schema'; schema } }`, `strict` sugli strumenti, `web_search_20260209` | `node_modules/@anthropic-ai/sdk` **[doc]** | uscita strutturata ed effort nello stesso `output_config` |
| `zod` non è tra le dipendenze | `package.json` **[codice]** | schemi JSON scritti a mano, validatori nostri, nessuna dipendenza nuova |
| La patch di prevenzione si applica pulita sull'HEAD di oggi (`git apply --check`): 6 file, 610 test su 610 in una copia | **[misura]** | entra nel repository con un commit dedicato nel passo 0, prima dell'onda 0 (§ 14.1); dopo il passo 0 nessuna onda dipende da file fuori dal repository |
| `doneSets` tiene solo le serie con `done` e `reps > 0` | `engine/training.ts` **[codice]** | le serie di sprint, intervalli e salti si registrano con le ripetizioni previste (§ 3.7), altrimenti costanza e statistiche le perdono |
| `dayCarbScale` chiama `mealsForDate` | `engine/nutrition.ts` **[codice]** | le sostituzioni delle esclusioni lavorano su uno strato che non dipende dalla scala (§ 6.4) |
| Il ragù di lenticchie del seme si mangia il giovedì dal frigo, quattro giorni dopo la domenica | `data/menu.ts` (`s1-ragu`, `s2-ragu`) **[codice]** | il passo 0 lo sposta in freezer (§ 4.11) |

---

## 2. Obiettivi su tre livelli

Tre livelli indipendenti, che si sommano:

1. **corpo**: decide l'energia e le macro (`Profile.goal`, esistente);
2. **qualità da allenare**: decide il contenuto delle sedute (`Plan.training`, nuovo);
3. **fase della stagione**: è un fatto, ricavato dalle date (`Plan.season`, nuovo), e limita le scelte dei primi due.

La prevenzione oncologica non è un obiettivo: vale sempre (§ 4.1).

### 2.1 Corpo

| Obiettivo | Energia per tipo di giorno | Proteine | Correzione settimanale (esistente, `kcalCorrection`) | Note |
|---|---|---|---|---|
| Ricomposizione | dispendio stimato (Mifflin-St Jeor × fattore del tipo di giorno) | 1,9 g/kg | +150 se cala oltre lo 0,5% a settimana, −100 se sale oltre lo 0,5% **[codice]** | predefinito |
| Mantenimento | dispendio stimato | 1,9 g/kg | come oggi **[codice]** | |
| Dimagrimento | dispendio − 350 kcal | **2,2 g/kg** | come oggi, entro i limiti sotto | in deficit servono più proteine per tenere il muscolo **[fonte: Helms 2014; ISSN, Jäger 2017]** |
| Massa | dispendio + 250 kcal | 1,9 g/kg | come oggi | |

Limiti di sicurezza dell'energia, validi per ogni piano e per ogni correzione della revisione **[fonte: consenso IOC sulla
REDs, Mountjoy 2023, sul legame tra bassa disponibilità energetica e stress osseo]**:

- deficit massimo 500 kcal e mai oltre il 20% del dispendio stimato del tipo di giorno;
- **nessun deficit il giorno della partita e la vigilia**: l'obiettivo della data rimette le kcal tolte (dai carboidrati);
- deficit massimo 250 kcal quando una zona sotto il ginocchio ha superato la soglia degli impatti almeno una volta negli
  ultimi 14 giorni, o è in rientro (§ 2.2), e nel precampionato;
- il minimo di carboidrati di 6 g/kg a partita e vigilia resta un vincolo duro (`MATCH_CARB_G_PER_KG` **[codice]**).

Il deficit in vigore si salva in `Plan.goalDeltaKcal` quando si approva una proposta di obiettivi; le correzioni
settimanali `kcalDelta` lo aggiornano e restano dentro i limiti. **I limiti valgono anche per i piani di oggi, che il
campo non ce l'hanno**: chi è già in dimagrimento ha le −350 kcal dentro `Plan.targets` (`GOAL_DELTA_KCAL` **[codice:
`engine/targets.ts`]**) ed è proprio chi rischia di più. Senza il campo il deficit si ricava (`goalDeltaOf` in
`engine/energy.ts`): `GOAL_DELTA_KCAL[profile.goal]` più la somma dei `kcalDelta` accettati che le revisioni hanno
salvato (`WeeklyReview.acceptedProposals` sulle `proposals` registrate **[codice]**). Le modifiche fatte a mano in Calorie
e macro non entrano: limite dichiarato. Alla prima correzione accettata, o alla prima proposta di obiettivi approvata, il
campo si scrive e la derivazione non serve più.

Le regole si applicano sempre e in due punti:

- `applyProposal` con `kcalDelta` (oggi somma −150 a ogni revisione senza tetto **[codice: `kcalCorrection`,
  `engine/review.ts`]**) taglia la correzione perché il deficit non superi 500 kcal né il 20% del dispendio del tipo di
  giorno; la revisione non propone più −150 quando il deficit è già al tetto e dice «Deficit già al massimo: tieni le
  calorie e guarda sonno e passi»;
- `dayTargetFor` applica le regole per data (partita, vigilia, zona sotto il ginocchio, precampionato) con
  `dayEnergyDelta(iso, state)`: rimette dai carboidrati le kcal oltre il deficit ammesso quel giorno, e `dayCarbScale` le
  porta nel piatto **[codice: stesso meccanismo del minimo di carboidrati]**.

Con ricomposizione e mantenimento senza correzioni il deficit ricavato è 0 e niente cambia: l'istantanea di compatibilità
(§ 13.1) resta uguale. Cambia, per scelta dichiarata, solo l'obiettivo dei giorni in cui il deficit di oggi supera quello
ammesso (partita, vigilia, zona sotto il ginocchio sopra soglia, precampionato, tetto del 20%), e solo per chi ha un
deficit, correzioni accettate comprese.

Il cambio di obiettivo del corpo diventa una proposta (§ 5) con le calorie per tipo di giorno ricalcolate; si sceglie
nella pagina Obiettivi, non più nel Profilo. Al cambio di fase il motore **suggerisce** l'obiettivo, l'utente decide:
pausa estiva per un dimagrimento, stagione per ricomposizione o mantenimento **[pratica]**.

### 2.2 Qualità da allenare: elenco definitivo

Una qualità principale e una secondaria per blocco. «Precampionato» non è una qualità ma una fase; «prestazione nel
calcio» è un insieme di qualità, quindi è un obiettivo pronto (tabella 2.3).

| Qualità (`TrainingQuality`) | Definizione | Effetti sul piano | Controindicazioni |
|---|---|---|---|
| `forza` | forza massima di gambe e tronco, spinte e tirate | blocco principale con 3-6 ripetizioni nelle gambe e 6-10 nella parte superiore; progressione doppia; misura: 1RM stimato (Epley **[codice]**) degli esercizi principali | gomito sopra soglia: spinte con il cambio di variante che c'è già **[codice: `elbowSwitchFor`]** |
| `potenza` (potenza e pliometria) | salto, rigidità di caviglia, forza veloce | salti e lanci all'inizio della seduta B, contati in contatti con il suolo (§ 3.6); trap bar veloce e lanci della palla medica come varianti senza impatto | zona sotto il ginocchio oltre la soglia degli impatti al mattino: solo livello 0; rientro di una zona sotto il ginocchio o dei flessori: non ammessa |
| `rapidita` (rapidità e cambi di direzione) | accelerazione 0-20 m, frenata, cambi a 45°, 90° e 180° | accelerazioni e frenate a MD−3 prima della forza; serve lo spazio «corsia» (15-20 m liberi) | come la potenza (sono impatti); senza corsia passa a sprint in cyclette |
| `velocita` | velocità massima e la sua tolleranza da parte dei flessori | allunghi e sprint lanciati, 60-150 m sopra il 90% a seduta; serve lo spazio «campo» | flessori con dolore sopra 0; mai dopo il Nordic; mai a MD+1, MD−1, MD |
| `resistenza` (resistenza intermittente) | capacità di ripetere sforzi intensi; nella pausa anche la base aerobica | sedute «K» di corsa intermittente o cyclette (§ 3.4) | in stagione non si sceglie (la porta il calcio) tranne nelle settimane senza calcio; con dolore sotto il ginocchio nei 14 giorni la corsa diventa cyclette o ellittica |
| `ipertrofia` | massa muscolare | 10-16 serie a settimana per gruppo nella pausa, 6-15 ripetizioni **[fonte: Schoenfeld 2017]**; in stagione solo parte superiore | in stagione solo secondaria; mai nel precampionato |
| `prevenzione` | Nordic, Copenhagen, polpacci e soleo, tibiali, polso, tronco | sopra i pavimenti fissi (§ 3.5): una serie in più e progressioni di leva | nessuna |
| `rientro` (rientro da infortunio) | ritorno guidato dal dolore per una zona scelta tra quelle del profilo | stadi per zona (§ 3.8); ogni stadio con impatti o corsa chiede il via libera del fisioterapista | nessuna; esclude potenza, rapidità e velocità se la zona è sotto il ginocchio o i flessori |

Scartate, con il motivo: mobilità (sta già nei riscaldamenti e nella seduta C), resistenza aerobica di base (è il primo
tratto della resistenza intermittente nella pausa), capacità di ripetere gli sprint (è una forma della resistenza
intermittente nel precampionato), ripresa dopo uno stop (la gestisce il motore da solo, § 3.10).

### 2.3 Obiettivi pronti

L'utente sceglie una riga; «Scegli tu» apre principale e secondaria. Compaiono solo le righe compatibili con la fase; una
riga sotto l'elenco dice quali si sbloccano in un'altra fase (niente opzioni grigie).

| Obiettivo pronto (`presetId`) | Principale | Secondaria | Fasi |
|---|---|---|---|
| Prestazione nel calcio (`calcio`) | potenza | forza | stagione, precampionato |
| Salti e pliometria (`pliometria`) | potenza | prevenzione | stagione, pausa, precampionato |
| Più rapido (`rapido`) | rapidità | potenza | tutte |
| Più forte (`forte`) | forza | prevenzione | stagione, pausa |
| Più muscolo (`muscolo`) | ipertrofia | forza | pausa |
| Pronto per la stagione (`pronto`) | resistenza | velocità | precampionato, ultime 4 settimane della pausa |
| Senza infortuni (`sicuro`) | prevenzione | forza | tutte (già scelto quando la pagina si apre la prima volta) |
| Rientro da un dolore (`rientro`) | rientro (zona) | prevenzione | tutte |

Compatibilità per fase («P» principale, «S» secondaria, «–» non ammessa). Nella transizione (i primi 14 giorni della
pausa) le qualità non contano: il blocco è di recupero attivo (§ 2.4).

| Qualità | In stagione | Pausa estiva (sviluppo) | Precampionato |
|---|---|---|---|
| forza | P S | P S | S |
| potenza | P S (livelli 0-2) | P S | P S |
| rapidità | P S | P S | P S |
| velocità | S (1 esposizione) | S | P S |
| resistenza | – (sì nelle settimane senza calcio) | S; P nelle ultime 4 settimane | P |
| ipertrofia | S (parte superiore) | P S | – |
| prevenzione | P S | P S | P S |
| rientro | P S | P S | P S |

La rapidità è principale anche nella pausa perché è il periodo senza partite in cui accelerazioni e frenate si possono
sviluppare **[pratica]**; la resistenza diventa principale nelle ultime 4 settimane per arrivare al precampionato con una
base. Tabella e obiettivi pronti coincidono per costruzione: un test (§ 13.7) controlla che per ogni obiettivo pronto e
ogni fase dichiarata `normalizeTraining` lo tenga e `buildBlock` non dia violazioni di compatibilità.

Al cambio di fase, se l'obiettivo pronto in vigore non è ammesso nella fase nuova («Più forte» nel precampionato), la
proposta di blocco lo sostituisce con il primo compatibile della tabella con la stessa principale o, se non c'è, con
«Prestazione nel calcio» (precampionato e stagione) o «Senza infortuni»; lo dice nelle differenze.

Coppie vietate: potenza, rapidità o velocità con il rientro di una zona sotto il ginocchio o dei flessori; ipertrofia
con resistenza nel precampionato (interferenza e fatica) **[pratica]**.

**Con R8 attiva** (§ 3.2) potenza e rapidità restano sceglibili ma producono solo varianti di livello 0: sotto gli obiettivi
pronti con potenza o rapidità la pagina Obiettivi lo dice in una riga, «Con il dolore di queste settimane: solo varianti
senza impatto» (il nome della zona viene dal profilo). Non è un'opzione grigia: è il contenuto che cambia.

### 2.4 Fasi della stagione

Due date nelle impostazioni: ultima partita della stagione (`lastMatch`) e prima partita della nuova (`firstMatch`), più
le settimane di precampionato (3-8, predefinito 5). **Senza date la fase è sempre «in stagione»**: chi non le inserisce
vede l'app di oggi. Le date si salvano subito (sono fatti); il cambio di fase che ne deriva produce una proposta di blocco.

| Fase (`SeasonPhase`) | Stadio (`SeasonStage`) | Quando | Contenuto |
|---|---|---|---|
| `stagione` | `stagione` | da `firstMatch` a `lastMatch` | calcio come da piano, palestra 2 sedute + 1 facoltativa leggera |
| `pausa` | `transizione` | i primi 14 giorni dopo `lastMatch` | recupero attivo: 2 sedute leggere, 1-2 uscite facili da 30 min, niente test **[pratica; Mujika e Padilla 2000 sui tempi del deallenamento]** |
| `pausa` | `sviluppo` | dalla terza settimana all'inizio del precampionato | blocchi di 4 settimane; 3 sedute di palestra, 2 di corsa o condizionamento |
| `precampionato` | `generale` | prime 2 settimane del precampionato | resistenza intermittente, accelerazioni, pliometria bassa, forza 2 volte |
| `precampionato` | `specifico` | dalla terza settimana alla penultima | ripetute di sprint, cambi di direzione, velocità massima, potenza |
| `precampionato` | `rifinitura` | ultima settimana prima di `firstMatch` | volume −40%, intensità mantenuta **[fonte: Bosquet 2007, sugli sport di resistenza; per il calcio è un'estensione, ipotesi]** |

Settimana tipo per fase:

- **stagione**: `Plan.week` dell'utente (oggi partita lunedì, calcetto mercoledì, allenamento giovedì nella settimana
  predefinita **[codice: `DEFAULT_WEEK`]**);
- **pausa**: settimana senza calcio proposta dal motore (`patch.week`); la settimana in stagione si salva in
  `Plan.seasonWeek` all'approvazione e torna con la proposta del precampionato;
- **precampionato**: la settimana in stagione senza la partita; gli allenamenti di squadra si correggono in
  Impostazioni › Settimana come oggi.

Nella pausa il tipo di giorno si ricava dal carico previsto della giornata (session-RPE, `TYPICAL_RPE` **[codice]**):
almeno 500 UA calcio, 250-499 palestra, 1-249 leggero, 0 riposo **[ipotesi]**. Così i carboidrati seguono il lavoro
senza un tipo di giorno nuovo.

---

## 3. Motore dei piani di allenamento

Moduli: `engine/plan/season.ts`, `week.ts`, `program.ts`, `limits.ts`, `readiness.ts`, `blockReview.ts`,
`returnStages.ts`, `build.ts` (§ 14). Riusa senza cambiarle le regole che ci sono: progressione doppia, stallo −10%,
`painGate`, `impactThresholdFor`, `elbowSwitchFor`, `physioCoverage`, `sessionDuration` **[codice: `engine/training.ts`]**.
`painGate` si applica sempre dopo la generazione, esercizio per esercizio.

### 3.1 Il blocco

- Un blocco dura **4 settimane: 3 di carico e 1 di scarico**, in stagione e nella pausa (sviluppo). Le prove sul ritmo
  dello scarico sono deboli; il consenso degli allenatori indica scarichi ogni 4-6 settimane ottenuti togliendo serie
  **[pratica: Bell 2023, Delphi]**. Quattro anche in stagione perché il calcio non si scarica e la palestra è l'unica leva.
- Nella **transizione** il blocco è di 2 settimane, senza progressione.
- Nel **precampionato** il blocco dura fino alla prima partita: niente scarico, ultima settimana di rifinitura.
- Inizia sempre di lunedì (`Program.start`); un cambio di obiettivo o di fase fa partire il blocco nuovo dal lunedì dopo.
  La proposta si può approvare fino al giorno prima del primo giorno in cui cambierebbe qualcosa (`approvableUntil`, § 5.2):
  con la settimana predefinita una proposta della domenica si approva anche il lunedì, perché la prima seduta che cambia è
  quella del martedì. Oggi non cambia mai (§ 5.4).
- **Alla fine del blocco senza un blocco nuovo approvato il blocco si ripete senza progressione**: settimane 1-3 alla dose
  della settimana 2, settimana 4 di scarico, e così di seguito (un blocco senza progressione, come quello di 2 settimane della
  transizione, si ripete com'è). `sessionFor` lo deriva da `Program.start` e dalla lunghezza
  di `weeks`: niente si salva (P5). Mai la settimana 3 ripetuta all'infinito: dopo tre settimane di carico c'è sempre uno
  scarico, e i contatti non superano mai quelli della settimana 2. Una proposta aperta e non decisa si rigenera la domenica
  dopo; «Tieni il piano attuale» la scarta e la proposta successiva nasce alla fine del ciclo ripetuto (4 settimane), senza
  insistere ogni settimana.
- **A un cambio di fase senza approvazione** il blocco della fase prima non si ripete (un blocco della pausa con il
  precampionato sopra sarebbe troppo): valgono le sedute fisse di oggi con `weekOverrides`, cioè l'app di oggi, finché
  l'utente non approva la proposta della fase nuova. Nella transizione (stessa fase della pausa) si ripete il blocco di
  recupero.
- **Forma salvata**: le sedute della settimana 1 per slot e i fattori di ogni settimana (`Program.dose`). Le settimane 2-4
  e le dosi si derivano (`deriveSession`). Gli slot restano `'A'`, `'B'`, `'C'` (più `'K'` corsa o condizionamento,
  `'R'` richiamo): `WorkoutLog.sessionId`, `introLevel`, `sessionFocus` e le statistiche continuano a funzionare.

### 3.2 La settimana in stagione intorno alla partita

Le regole sono relative al giorno della partita (MD) e si calcolano da `Plan.week`: valgono anche se la partita si
sposta. Tabella per la settimana predefinita:

| Giorno | Distanza | Calcio | Palestra generata |
|---|---|---|---|
| lunedì | MD | partita | – |
| martedì | MD+1 | – | A: parte superiore, prevenzione in isometria o a basso carico, cyclette facile 10 min, niente impatti |
| mercoledì | MD+2 | calcetto | – |
| giovedì | MD−4 | allenamento | – |
| venerdì | MD−3 | – | B: qualità principale in testa (salti, accelerazioni o velocità), poi forza pesante, Nordic in fondo |
| sabato | MD−2 | – | C facoltativa: RIR ≥ 3, mobilità, prevenzione, al massimo 20 contatti di livello 1 e 4 sprint da 20 m al 90% |
| domenica | MD−1 | – | riposo |

Il venerdì per le gambe è il modello «alto-basso»: i giorni duri vicini, poi due giorni leggeri prima della gara, a circa
72 ore **[pratica]**; le gambe il martedì metterebbero l'indolenzimento sul calcetto.

Regole di posizionamento (`validateWeek`, testate; R1-R9 dure, R10 di dosaggio):

- **R1** Niente palestra il giorno della partita (il fisioterapista resta).
- **R2** Gambe pesanti (multiarticolari a RIR ≤ 2 con 3-6 ripetizioni), Nordic, pliometria di livello 2-3 e sprint sopra
  il 90% solo da MD+2 a MD−3.
- **R3** MD−2: solo seduta leggera (RIR ≥ 3, nessun esercizio nuovo, niente Nordic, ≤ 20 contatti di livello 1, ≤ 4
  sprint da 20 m al 90%).
- **R4** MD−1: niente palestra.
- **R5** MD+1: parte superiore, prevenzione in isometria o a basso carico, cyclette facile; niente impatti.
- **R6** Giorni con calcetto o allenamento: niente gambe; parte superiore o prevenzione solo se finiscono almeno 4 ore
  prima del calcio.
- **R7** Gambe pesanti mai nelle 24 ore prima di una sessione di calcio; almeno 48 ore tra due sedute di gambe pesanti.
- **R8** Con una zona sotto il ginocchio sopra la soglia degli impatti almeno una volta negli ultimi 14 giorni, il giorno
  dopo due giorni consecutivi con impatti (calcio, corsa, salti) non ha impatti. Motivo: l'osso risponde meno a carichi
  senza pausa **[fonte: Robling 2002, sugli animali; il trasferimento all'uomo è plausibile, non dimostrato]**.
- **R9** Dentro la seduta: sprint e salti dopo il riscaldamento e prima della forza; Nordic e Copenhagen in fondo
  **[pratica]**.
- **R10 · regola di dosaggio, non di validità.** Il confronto è **previsto contro previsto**, mai contro il registrato:
  chi non registra il calcio avrebbe una media bassa e ogni blocco sembrerebbe un picco. Per ogni settimana `plannedLoad`
  somma il calcio previsto `F` (durata di `ScheduleDay.football` × `TYPICAL_RPE` **[codice]**) e la quota controllabile `C`
  (palestra, corsa, pliometria, richiamo: `sessionDuration` × RPE prevista, 7 per la palestra e quella scritta per le
  sedute K). Il riferimento è il totale previsto più alto tra le 4 settimane precedenti, senza ricostruire piani vecchi:
  per le settimane del blocco in vigore si deriva da `Plan.program`; per quelle di un blocco già chiuso vale il suo
  `BlockSummary.peakLoad`, che `recordBlockSummary` salva a ogni fine blocco, anche quando un cambio di fase lo interrompe;
  senza blocchi si calcola con le sedute fisse e la settimana attuale. Uno scarico non abbassa il riferimento. La regola:
  `F + C ≤ 1,10 × riferimento`.
  Il calcio è un dato che il generatore non tocca, quindi a cedere è sempre `C`: `buildBlock` toglie prima le serie degli
  accessori, poi quelle dei principali, poi contatti e metri della settimana 1 (e quindi delle derivate), mai sotto i
  pavimenti del § 3.5 e la forza pesante di gambe in stagione. Se nemmeno i pavimenti ci stanno (il calcio previsto sale
  di colpo) la proposta nasce lo stesso con l'avviso «Settimana molto più carica delle precedenti: tengo solo il minimo»;
  R10 non fa mai decadere una proposta. Così il piano non fa scattare da solo l'allarme del 120% (`loadAlert`
  **[codice]**), che resta com'è sul carico registrato.
  - **Dalla pausa al precampionato** la regola fa da rampa da sola: con gli allenamenti di squadra `F` sale e la palestra
    riparte dai pavimenti (con almeno una esposizione di forza), poi cresce di settimana in settimana man mano che il
    riferimento sale; il contenuto del § 2.4 («forza 2 volte») è il punto d'arrivo della rampa. I motivi lo dicono:
    «Con gli allenamenti di squadra la palestra riparte da poco e cresce ogni settimana» **[pratica: nel precampionato il
    carico lo porta la squadra]**.
  - **Dalla transizione allo sviluppo** il riferimento è ancora l'ultima settimana in stagione (entro le 4 precedenti):
    le 3 sedute dello sviluppo ci stanno senza tagli, perché senza calcio il totale resta sotto quello della stagione
    **[ipotesi: con i valori tipici, circa 1.700 UA contro 2.500]**.

In stagione la palestra resta a 2 sedute + 1 facoltativa (`gymPerWeek` 1-3, predefinito 2): il generatore cambia il
contenuto, non il numero. Se la settimana dell'utente viola R1-R7 con le sedute dove sono, la proposta sposta le sedute
nei giorni ammessi (`patch.week`) e lo dice nelle differenze.

**Quali regole si risolvono e quali si validano.** R3, R8, `painGate`, lo stadio del rientro, il fermo per i segnali
d'allarme (§ 3.8), i tetti di contatti e metri e R10 non fanno mai decadere la proposta: `buildBlock` li risolve prima
della validazione, sostituendo al livello d'impatto ammesso (§ 3.7) o riducendo la dose. R1-R7 si risolvono spostando
le sedute; R9 ordinando gli esercizi. `validateWeek` controlla dopo, come rete: una violazione dura che resta è un difetto
del generatore (i test la cercano, § 13.7).

### 3.3 Seduta: costruzione

`buildBlock(input)` per ogni slot della settimana, in quest'ordine, fermandosi quando la durata stimata arriva ai minuti
scelti (`sessionMin`, 30-90, predefinito 60; `sessionDuration` ≤ minuti + 5):

1. riscaldamento sul modello FIFA 11+ prima di ogni seduta con le gambe **[fonte: Thorborg 2017]**, costruito come blocco
   del catalogo (esercizi con `pattern: 'riscaldamento'`): i suoi salti e balzi sono esercizi d'impatto come gli altri,
   **contano nei tetti di contatti** della seduta e della settimana (al massimo 12 contatti per gamba nel riscaldamento) e
   al livello 0 si sostituiscono con varianti senza volo (§ 3.7);
2. qualità principale (sprint e salti in testa, R9);
3. forza pesante di gambe nella seduta B (in stagione almeno un'esposizione a settimana, 2-3 serie da 3-6 a RIR 2-3:
   mantiene forza e sprint **[fonte: Rønnestad 2011]**);
4. qualità secondaria;
5. pavimenti di prevenzione non ancora assegnati nella settimana (§ 3.5), meno quelli coperti dal fisioterapista
   (`physioCoverage` **[codice]**);
6. esercizi del fisioterapista nel loro blocco, come oggi.

Ogni esercizio viene dal catalogo (`data/exercises.ts`) o dagli esercizi del fisioterapista; nessun esercizio inventato.
Un esercizio nuovo per l'utente entra con la fase di ingresso **per esercizio**: le prime 2 esecuzioni con una serie in
meno e un RIR in più (`exerciseIntro`, che estende `introLevel` **[codice]** ai blocchi generati).

### 3.4 Progressioni con i numeri

**Fattori delle settimane** (`WeekDose`, rispetto alla settimana 1; «principali» sono gli esercizi del blocco
principale):

| Settimana | Stagione | Pausa, sviluppo | Precampionato |
|---|---|---|---|
| 1 carico | base: RIR 3, contatti e metri di base | base: RIR 3 | base: RIR 2 |
| 2 carico | RIR −1 (gambe multiarticolari mai sotto 2), contatti e metri × 1,2 | +1 serie sui principali, RIR −1, × 1,2 | × 1,2 |
| 3 carico | RIR come la 2, × 1,44 | +1 serie sui principali, RIR −2 (gambe mai sotto 1), × 1,44 | × 1,44 fino al tetto |
| 4 (nel precampionato l'ultima) | scarico: serie × 0,5 arrotondate in su (minimo 1), RIR +1, contatti e metri × 0,5, intensità mantenuta | scarico come in stagione | rifinitura: serie × 0,6, contatti e metri × 0,6, intensità mantenuta |

Nel precampionato le settimane di carico continuano fino alla penultima (× 1,2 a settimana fino al tetto), senza scarico.
I contatti e i metri non superano mai i tetti del § 3.6; l'aumento tra due settimane di carico resta entro +20% (o +10
contatti sotto i 50); dopo uno scarico il confronto è con l'ultima settimana di carico. Il livello di pliometria cambia
solo tra un blocco e l'altro: al cambio di livello i contatti ripartono dall'80% dell'ultima settimana di carico.

**Arrotondamenti, scritti una volta sola** (li usano `deriveSession`, i test e il lettore):

- serie della settimana k di un esercizio = `max(1, ⌈setsFactor_k × (serie_1 + mainSetsAdd_k)⌉)`; nello scarico
  `mainSetsAdd` è 0 e `setsFactor` 0,5, nella rifinitura 0,6. Con 3 serie lo scarico ne fa 2: la riduzione vera sulla
  seduta è circa il 40-50%, non esattamente la metà;
- ripetizioni degli esercizi d'impatto (contatti) e metri = `max(1, ⌊impactFactor_k × valore_1⌋)`: per difetto, così i
  tetti valgono dopo l'arrotondamento;
- variante ridotta del giorno (§ 3.9): serie × 0,67 all'intero più vicino, minimo 1.

**Forza** (trap bar, affondo bulgaro, squat goblet o alla macchina, hip thrust; panca con manubri a presa neutra,
rematore, lat machine):
- stagione: 2-3 serie da 3-6 (gambe) e 6-10 (parte superiore), RIR 2-3, recuperi 2-3 min, progressione doppia;
- pausa: 3-5 serie da 4-6, RIR 1-3, gambe 2 volte a settimana;
- tra un blocco e l'altro: 1RM stimato +2,5% o più → fascia più pesante (6-10 → 4-6 → 3-5); fermo con buona costanza →
  variante dello stesso schema (trap bar → stacco rumeno con manubri; squat goblet → squat alla macchina) o schema delle
  serie diverso.

**Ipertrofia**: pausa 10-16 serie a settimana per gruppo, 6-15 ripetizioni, RIR 1-3, +2 serie a settimana per gruppo nelle
settimane 1-3 **[fonte: Schoenfeld 2017]**; stagione solo parte superiore, 6-10 serie per gruppo; gambe mai oltre il
pavimento di forza.

**Potenza e pliometria**: in contatti con il suolo (§ 3.6).

**Rapidità** (serve la corsia): accelerazioni 5-20 m da partenze diverse, 6-10 ripetizioni, 60-90 s di recupero, 100-200 m
in tutto; frenate in 3 passi, poi cambi a 45°, 90°, 180° (navetta 5-0-5), 6-8 per lato, una progressione alla volta,
avanti dopo 2 sedute senza dolore **[pratica]**. In stagione richiamo a MD−3, 6-8 ripetizioni.

**Velocità** (serve il campo): allunghi di 60-80 m al 70, 80 e 90% per 2 settimane, poi sprint lanciati da 20 m con 20-30 m
di lancio, 3-6 ripetizioni, 2-4 min di recupero, 60-150 m sopra il 90% a seduta. L'intensità si dà a parole: «forte ma
sciolto» (90%), «quasi al massimo» (95%). Le esposizioni alla velocità massima si associano a meno infortuni ai flessori
**[fonte osservazionale: Malone 2017, calcio gaelico]**.

**Resistenza intermittente**: pausa (sviluppo) 1 uscita continua facile di 25-40 min a RPE 4-5 e 1 intermittente: 15 s
forti e 15 di recupero (2-3 serie da 6-8 min) oppure 4 × 4 min a RPE 8 **[fonte: Buchheit e Laursen 2013]**;
precampionato 15-15 e 30-30 crescenti, poi ripetute di sprint (6 × 20-30 m, 20-25 s di recupero, 2-3 serie). La corsa
sale al massimo del 20% dei minuti a settimana **[fonte osservazionale: Nielsen 2014]**; con dolore sotto il ginocchio nei
14 giorni la stessa seduta si fa in cyclette o ellittica.

**Prevenzione**: Nordic dalla variante assistita alla completa, 2 × 4-6 → 3 × 6 → 3 × 8 nella pausa, 2 × 4-6 una volta in
stagione **[fonte: Petersen 2011; volumi bassi bastano, Cuthbert 2020]**; Copenhagen da leva corta a leva lunga quando
2 × 10 per lato non danno fastidio **[codice: regola già nella seduta A]**; polpacci e soleo 3 × 8-12 pesanti e lenti.

### 3.5 Pavimenti fissi di ogni settimana

Valgono per qualunque scelta, meno quanto copre il fisioterapista.

| Pavimento | Dose minima a settimana | Fonte |
|---|---|---|
| Nordic | 1 volta, 2 serie da 4-6 (2 volte nella pausa e nel precampionato) | dimezza gli infortuni ai flessori **[fonte: van Dyk 2019]** |
| Copenhagen | 1 volta, 2 serie per lato | −41% di problemi all'inguine nel calcio dilettantistico **[fonte: Harøy 2019]** |
| polpacci in piedi e soleo da seduto, pesanti | 2 volte | il soleo è il muscolo che spinge di più nella corsa **[fonte: Dorn 2012]**; per la tibia le prove sono deboli **[pratica]** |
| tibiale anteriore o posteriore | 1 volta | **[pratica]**, per la storia delle zone sotto il ginocchio |
| estensori del polso, se il gomito è tra le zone | 2 volte | Tyler twist **[fonte: Tyler 2010]** |
| forza pesante di gambe (in stagione) | 1 esposizione | **[fonte: Rønnestad 2011]** |

### 3.6 Pliometria a contatti con il suolo e limiti di sicurezza

Ogni atterraggio è un contatto; negli esercizi su una gamba si conta per gamba e vale il lato più carico. I contatti di una
seduta si derivano dagli esercizi (`contactsPerRep` del catalogo × ripetizioni × serie), non si salvano.

| Livello | Esempi | Requisito |
|---|---|---|
| 0 · senza impatto | lanci della palla medica, sprint in cyclette, trap bar veloce al 50-60% | nessuno: sono le alternative quando la tibia blocca gli impatti |
| 1 · atterraggio basso | salto sul box (si scende a piedi), salto verticale con atterraggio fermo, corda a bassa ampiezza | zona sotto il ginocchio entro la soglia degli impatti al mattino |
| 2 · moderato | saltelli elastici a piedi pari, salto in lungo da fermo, balzi laterali con fermata | un blocco intero al livello 1 senza episodi sopra la soglia degli impatti |
| 3 · reattivo | salti in serie sugli ostacolini, saltelli su una gamba, balzi alternati, drop jump da 30 cm | un blocco intero al livello 2 senza episodi, e via libera del fisioterapista se una zona sotto il ginocchio è tra quelle del profilo |

| Fase | Contatti per seduta | A settimana | Livello massimo |
|---|---|---|---|
| stagione | ≤ 30 | ≤ 40 | 2 |
| pausa, sviluppo | ≤ 60 | ≤ 100 | 3 (con il requisito) |
| precampionato | ≤ 50 | ≤ 80 | 3 (con il requisito) |
| rifinitura | ≤ 25 | ≤ 40 | 2 |

I manuali indicano 80-140 contatti a seduta fuori stagione **[fonte: NSCA]**, per atleti senza calcio in parallelo e senza
dolore: qui si sta volutamente sotto **[ipotesi]**. Il calcio porta già migliaia di appoggi: in stagione la pliometria è un
richiamo, non un lavoro di sviluppo.

Freni, in ordine:
0. fermo per i segnali d'allarme (`Plan.impactHold`, § 3.8) → livello 0 in ogni seduta e in ogni piano, finché non c'è un
   via libera nuovo;
1. zona sotto il ginocchio oltre la soglia degli impatti al mattino → livello 0 per la seduta (oggi `painFlagFor` propone
   già le alternative senza volo **[codice]**);
2. dolore sopra la soglia durante la seduta, o +1 il mattino dopo → la seduta successiva resta allo stesso livello con i
   contatti −50%; due volte di fila → livello precedente per il resto del blocco;
3. R8;
4. zona sotto il ginocchio a soglia degli impatti + `PHYSIO_REFERRAL_MARGIN` → rinvio al fisioterapista, come oggi
   **[codice]**, e niente impatti fino al mattino entro soglia.

Il gomito è già gestito (`elbowSwitchFor`, `elbowFriendly` **[codice]**): il generatore sceglie solo varianti adatte quando
il gomito frena.

### 3.7 Esercitazioni nuove per il catalogo

Campi locali di `CatalogExercise` (fuori dal contratto, come `impact` e `startKg` oggi **[codice]**):

```ts
// data/exercises.ts
export type MovementPattern =
  | 'squat' | 'cerniera' | 'affondo' | 'ponte'
  | 'spinta-orizzontale' | 'spinta-verticale' | 'tirata-orizzontale' | 'tirata-verticale'
  | 'flessori' | 'adduttori' | 'polpaccio' | 'soleo' | 'tibiale' | 'polso'
  | 'anti-estensione' | 'anti-rotazione' | 'laterale'
  | 'salto-verticale' | 'salto-orizzontale' | 'reattivo' | 'lancio'
  | 'accelerazione' | 'decelerazione' | 'cambio-direzione' | 'velocita-massima'
  | 'intermittente' | 'aerobico' | 'mobilita' | 'riscaldamento';
export type ExerciseSpace = 'palestra' | 'corsia' | 'campo' | 'casa';

export interface CatalogExercise extends Exercise {
  impact?: boolean;              // esistente: ogni esercizio di corsa, sprint o salto ha impact: true
  startKg?: readonly number[];   // esistente
  elbowSwitch?: { to: string; incrementKg?: number }; // esistente
  pattern?: MovementPattern;     // obbligatorio per ogni esercizio del catalogo (test)
  qualities?: TrainingQuality[];
  impactLevel?: 0 | 1 | 2 | 3;   // assente = 0 solo senza impact; con impact: true e senza livello vale 3 (il più prudente)
  contactsPerRep?: number;       // salti e balzi: contatti per ripetizione (per gamba negli esercizi su una gamba)
  space?: ExerciseSpace;         // assente = 'palestra'
}
```

Ogni esercizio di corsa, sprint e salto ha `impact: true`: `IMPACT_RE` riconosce solo «balz», «salt», «pliometr», «hop»
nel nome **[codice]**, e allunghi o accelerazioni sfuggirebbero al freno della tibia. Gli esercizi esistenti ricevono
`pattern` e `qualities`. **Test di copertura del catalogo**: `impact: true` implica `impactLevel ≥ 1`; un esercizio
d'impatto con schema di salto (`salto-verticale`, `salto-orizzontale`, `reattivo`, `laterale`) ha `contactsPerRep`; uno di
corsa o sprint si conta in metri (`distanceM` nella seduta). Gli esercizi d'impatto che ci sono già ricevono livello e
contatti: `balzi-del-pattinatore` (oggi `impact: true` nel riscaldamento della seduta B, 6-8 per lato **[codice:
`data/sessions.ts`]**) ha livello 2 e 1 contatto per gamba, come i balzi laterali con fermata; senza, varrebbe livello 0 e
zero contatti e passerebbe lo stadio 0 del rientro. Esercizi da aggiungere (37):

| Id | Nome | Categoria | Schema | Qualità | Livello | Contatti per ripetizione | Spazio | Gomito | Alternative, in ordine |
|---|---|---|---|---|---|---|---|---|---|
| `salto-sul-box` | Salto sul box | pliometria | salto-verticale | potenza | 1 | 1 | palestra | sì | salto-verticale-fermo, lancio-palla-medica-dal-basso |
| `salto-verticale-fermo` | Salto verticale con atterraggio fermo | pliometria | salto-verticale | potenza | 1 | 1 | palestra | sì | salto-sul-box, sprint-cyclette |
| `salti-corda` | Salti con la corda | pliometria | reattivo | potenza, rientro | 1 | 1 | casa | sì | pogo-bilaterali, polpacci-esplosivi |
| `pogo-bilaterali` | Saltelli elastici a piedi pari | pliometria | reattivo | potenza | 2 | 1 | palestra | sì | salti-corda, polpacci-esplosivi |
| `salto-in-lungo-fermo` | Salto in lungo da fermo con atterraggio stabile | pliometria | salto-orizzontale | potenza | 2 | 1 | corsia | sì | salto-verticale-fermo, lancio-palla-medica-dal-basso |
| `balzi-laterali-fermata` | Balzi laterali con fermata | pliometria | laterale | potenza, prevenzione | 2 | 1 (per gamba) | palestra | sì | passi-laterali-elastico |
| `salti-ostacolini` | Salti in serie sugli ostacolini | pliometria | reattivo | potenza | 3 | 1 | corsia | sì | pogo-bilaterali |
| `saltelli-una-gamba` | Saltelli su una gamba sul posto | pliometria | reattivo | potenza | 3 | 1 (per gamba) | palestra | sì | pogo-bilaterali |
| `prova-saltello` | Prova del saltello: 10 saltelli su una gamba, poi sull’altra | pliometria | reattivo | rientro | 3 (solo nell'elenco `allowed` dello stadio 2, § 3.8) | fuori dal conteggio | palestra | sì | nessuna: se non si può fare, la prova si rimanda |
| `balzi-alternati` | Balzi alternati | pliometria | salto-orizzontale | potenza | 3 | 1 (per gamba) | campo | sì | salto-in-lungo-fermo |
| `drop-jump-basso` | Drop jump da 30 cm | pliometria | reattivo | potenza | 3 | 1 | palestra | sì | salti-ostacolini |
| `lancio-palla-medica-dal-basso` | Lancio della palla medica dal basso, avanti e indietro | pliometria | lancio | potenza | 0 | – | palestra | sì | sprint-cyclette |
| `lancio-palla-medica-rotazionale` | Lancio rotazionale della palla medica alla parete | pliometria | lancio | potenza | 0 | – | palestra | sì | pallof-press |
| `sprint-cyclette` | Sprint in cyclette da 6-8 secondi | condizionamento | intermittente | potenza, resistenza | 0 | – | palestra | sì | cyclette-intervalli |
| `trap-bar-veloce` | Trap bar veloce al 50-60% | gambe | cerniera | potenza | 0 | – | palestra | no (presa) | hip-thrust-bilanciere |
| `polpacci-esplosivi` | Salite sulle punte veloci alla macchina | prevenzione | polpaccio | prevenzione, potenza | 0 | – | palestra | sì | polpacci-in-piedi-macchina |
| `accelerazioni-10m` | Accelerazioni da 10 m da partenze diverse | sprint | accelerazione | rapidità | 2 | – | corsia | sì | sprint-salita, sprint-cyclette |
| `frenate-tre-passi` | Frenate in tre passi | sprint | decelerazione | rapidità | 2 | – | corsia | sì | affondi-indietro-manubri |
| `cambi-direzione-45-90` | Cambi di direzione a 45° e 90° | sprint | cambio-direzione | rapidità | 2 | – | corsia | sì | frenate-tre-passi |
| `navetta-5-0-5` | Navetta 5-0-5 | sprint | cambio-direzione | rapidità | 2 | – | corsia | sì | cambi-direzione-45-90 |
| `skip-tecnica` | Skip A e B | riscaldamento | riscaldamento | rapidità | 1 | – | corsia | sì | apertura-chiusura-anca-in-marcia |
| `allunghi` | Allunghi progressivi da 60-80 m | sprint | velocita-massima | velocità | 2 | – | campo | sì | sprint-salita |
| `sprint-lanciati-20m` | Sprint lanciati da 20 m | sprint | velocita-massima | velocità | 2 | – | campo | sì | allunghi |
| `sprint-salita` | Sprint in salita da 10-20 m | sprint | accelerazione | rapidità, rientro | 2 | – | campo | sì | accelerazioni-10m |
| `corsa-facile` | Corsa continua facile | condizionamento | aerobico | resistenza | 2 | – | campo | sì | cyclette-facile, ellittica-intervalli |
| `intermittente-15-15` | Corsa intermittente 15-15 | condizionamento | intermittente | resistenza | 2 | – | campo | sì | cyclette-intervalli |
| `ripetute-sprint` | Ripetute di sprint 6 × 20-30 m | sprint | intermittente | resistenza | 2 | – | campo | sì | sprint-cyclette |
| `cammino-corsa` | Cammino e corsa alternati | condizionamento | aerobico | rientro | 2 | – | campo | sì | cyclette-facile |
| `cyclette-facile` | Cyclette facile | condizionamento | aerobico | resistenza, rientro | 0 | – | palestra | sì | ellittica-intervalli |
| `cyclette-intervalli` | Intervalli in cyclette | condizionamento | intermittente | resistenza | 0 | – | palestra | sì | ellittica-intervalli |
| `ellittica-intervalli` | Intervalli in ellittica | condizionamento | intermittente | resistenza | 0 | – | palestra | sì | cyclette-intervalli |
| `copenhagen-isometrico` | Copenhagen in tenuta, leva corta | prevenzione | adduttori | prevenzione, rientro | 0 | – | casa | sì | adduttori-pallone |
| `adduttori-pallone` | Pallone stretto tra le ginocchia | prevenzione | adduttori | rientro | 0 | – | casa | sì | copenhagen-isometrico |
| `ponte-flessori-isometrico` | Ponte sui talloni in tenuta | prevenzione | flessori | rientro | 0 | – | casa | sì | ponte-glutei-una-gamba |
| `leg-curl-scivolando` | Leg curl scivolando a terra | prevenzione | flessori | prevenzione, rientro | 0 | – | casa | sì | leg-curl-seduto |
| `soleo-isometria` | Isometria del soleo a ginocchio piegato | prevenzione | soleo | prevenzione, rientro | 0 | – | palestra | sì | polpacci-seduto |
| `squat-macchina` | Squat alla macchina (hack o pendolo) | gambe | squat | forza, ipertrofia | 0 | – | palestra | sì | leg-press |

Restano fuori: vogatore (la presa prona prolungata carica gli estensori del polso **[pratica]**), lanci al petto con la
palla medica (gomito), esercizi d'isolamento per l'ipertrofia oltre a quelli del catalogo (gli accessori si scelgono tra
quelli esistenti).

`ExerciseCategory` riceve tre valori: `'pliometria' | 'sprint' | 'condizionamento'`; i `Record<ExerciseCategory, …>`
esistenti si completano (`tsc` li segnala). `SessionExercise` riceve le dosi che non sono serie per ripetizioni
(`distanceM`, `workSec`, `effort`, `contactsPerRep`, § 12) ed `estimateItemSec` le stima.

**Registrazione senza carico.** Nel lettore una serie di sprint, intervalli o salti si segna «fatta» con un tocco e il
registro scrive `weightKg: 0` e `reps` uguale alle ripetizioni previste (`repMin`: sprint e salti per serie; per gli
intervalli il numero di ripetute; con `unit: 'secondi'` i secondi previsti, come oggi per le tenute). Il contratto di
`SetLog` non cambia e `doneSets`, che tiene solo le serie con `reps > 0` **[codice: `engine/training.ts`]**, le conta:
statistiche, fase di ingresso, quota dei pavimenti fatti e costanza di `blockReview` vedono le esercitazioni nuove. Le
ripetizioni restano modificabili con lo stepper che c'è già, per chi ne ha fatte meno. Il carico zero non entra nel 1RM
stimato né nel volume in kg.

**Logica di sostituzione** (`substituteFor`, deterministica, in quest'ordine):
1. sicurezza: livello d'impatto ≤ quello permesso (fermo per i segnali d'allarme, dolore, `maxImpactLevel` dello stadio
   del rientro con le sue eccezioni `allowed`, fase), `elbowFriendly` se il gomito frena, tessuto non frenato
   (`gateForExercise` **[codice]**);
2. stesso schema di movimento e stessa qualità;
3. spazio disponibile (`TrainingGoal.spaces`; «palestra» c'è sempre);
4. livello tecnico e d'impatto uguale o più basso;
5. prima le `alternatives` del catalogo nel loro ordine, poi lo stesso schema in ordine di catalogo;
6. carico: dall'ultima volta su quell'esercizio, altrimenti `startKg`; con il dolore vale «sostituisci» (×0,85) **[codice]**;
7. contatti: verso un esercizio senza impatto vanno a 0; tra due esercizi d'impatto non superano quelli dell'originale;
8. se non resta niente l'esercizio salta e la seduta resta; un pavimento di prevenzione passa alla variante «casa».

Senza corsia e senza campo, rapidità e velocità passano alle alternative senza spazio (sprint in cyclette, lanci).

### 3.8 Rientro da infortunio, guidato dal dolore

La regola di base è quella che c'è: dolore entro la soglia, avanti; sopra la soglia o in aumento il mattino dopo, mantieni o
riduci **[fonte: Silbernagel 2007, con soglie più prudenti; codice: `painGate`]**. Il rientro aggiunge stadi per zona
(`Plan.training.rientro`). Si scende da soli; si sale con il criterio, e negli stadi con impatti o corsa anche con il via
libera del fisioterapista (`physioOk`, un interruttore, non una diagnosi).

Ogni stadio ha un livello d'impatto massimo (`maxImpactLevel`) e un elenco di eccezioni (`allowed`); la regola 1 di
`substituteFor` (§ 3.7) li applica a ogni esercizio, riscaldamento compreso, e il test del § 13.7 controlla che nessun
esercizio superi il livello dello stadio fuori da `allowed` (`returnStages.ts`).

Zona sotto il ginocchio (per esempio la tibia; la diagnosi la fanno il fisioterapista o il medico):

| Stadio | `maxImpactLevel` · `allowed` | Contenuto | Criterio per salire |
|---|---|---|---|
| 0 | 0 · – | nessun impatto in palestra; polpacci, soleo, tibiali; cyclette ed ellittica | 7 mattine con il dolore entro la soglia degli impatti |
| 1 | 1 · – | livello 1, al massimo 20 contatti a seduta | 2 sedute senza dolore sopra soglia e mattino dopo non salito |
| 2 | 1 · `cammino-corsa`, `prova-saltello` | livello 1 come nello stadio 1; cammino-corsa a giorni alterni (1 min e 1 min, × 10); la prova del saltello una volta, dietro un tocco nel lettore («Fai la prova del saltello»), solo con `physioOk`: 10 saltelli per gamba, fuori dal conteggio dei contatti | prova senza dolore e via libera del fisioterapista **[pratica: Warden 2014]** |
| 3 | 2 · `corsa-facile` | corsa continua 20-30 min a giorni alterni, livello 2 | 2 settimane senza episodi |
| 4 | 3 · – | accelerazioni, cambi di direzione, livello 3 | via libera del fisioterapista |

**Segnali d'allarme: fermano davvero.** Dolore in un punto preciso dell'osso, dolore a riposo o di notte, saltello su una
gamba doloroso: per una zona sotto il ginocchio sono segni di una possibile frattura da stress **[fonte: Warden 2014]**, e
un testo informativo non basta. Nel foglio del rientro (pagina Obiettivi, § 11.4) e nella pagina Dolore, per ogni zona sotto
il ginocchio, c'è la riga «Ho uno di questi segnali», con i tre segnali elencati sotto. Un tocco (`setImpactHold`):

- scrive `Plan.impactHold = { site, since: oggi }`;
- porta lo stadio del rientro di quella zona a 0 e rimette `physioOk` a `false` (se il rientro non c'è, lo propone come
  qualità secondaria nella prossima proposta di blocco);
- vieta gli impatti (livello 0) in ogni piano e in ogni seduta, quelle fisse comprese, **da subito**: è un freno di sicurezza
  come `painGate`, non una proposta, e vale anche per la seduta di oggi non ancora fatta;
- mostra la riga «Senti il fisioterapista o il medico prima di correre o saltare.» e l'avviso «Impatti fermi» con «Annulla»
  per 5 secondi (come oggi **[codice: `ToastHost`]**), per il tocco sbagliato.

Gli impatti tornano solo con un via libera esplicito: «Il fisioterapista o il medico mi ha dato il via libera»
(`clearImpactHold`), e da lì il rientro riparte dallo stadio 0 con i suoi criteri. In Oggi non compare niente di nuovo: il
dettaglio della palestra usa la frase che c'è già, «Niente balzi e salti oggi» **[codice]**. Non è una diagnosi e l'app non
lo dice mai come tale. Il calcio resta una scelta dell'utente: la riga lo nomina («prima di correre o saltare»), l'app non
lo toglie dal calendario.

Flessori: ponte sui talloni in tenuta → leg curl scivolando → Nordic assistito → Nordic; la velocità solo dall'ultimo
stadio, prima con le salite **[pratica]**. Gomito: isometria (0) → Tyler twist (1) → spinte a presa neutra −15% (2) →
progressione normale (3). Adduttori: pallone in isometria → Copenhagen in tenuta a leva corta → leva corta dinamica →
leva lunga.

### 3.9 Il giorno adattato al controllo del mattino

Le misure soggettive del benessere seguono la risposta all'allenamento meglio di molte misure oggettive **[fonte: Saw
2016]**; le soglie qui sotto non sono validate **[ipotesi]**, per questo la regola è scritta, testata e mostrata.
`dayReadiness(iso, state)` somma i punti:

| Segnale | 0 | 1 | 2 |
|---|---|---|---|
| sonno: il peggiore tra tempo a letto e qualità | ≥ 7 h e qualità ≥ 3 | 6-7 h o qualità 2 | < 6 h o qualità 1 |
| energia (1-10), con meno di 14 controlli | ≥ 6 | 4-5 | ≤ 3 |
| energia, con almeno 14 controlli | ≥ media personale dei 28 giorni − 1 | tra −1 e −2,5 | sotto −2,5 |
| calcio del giorno prima, solo per le sedute con le gambe | carico < 600 UA | ≥ 600 UA (per esempio 90 min a RPE 7) | – |

Somma 0-1 **piena**, 2-3 **ridotta**, 4 o più **minima**. In più: `painGate` a «riduci» → almeno ridotta; una zona sotto il
ginocchio a soglia degli impatti + `PHYSIO_REFERRAL_MARGIN` → minima senza impatti; due notti di fila sotto le 6 ore a
letto → almeno ridotta; controllo mancante → piena, con la regola del dolore dell'ultimo controllo entro 3 giorni, come oggi
(l'app non punisce chi non compila). Nessuna domanda nuova nel controllo del mattino.

| Variante | Blocco principale | Pliometria e sprint | Prevenzione e fisioterapista | Durata |
|---|---|---|---|---|
| piena | come da blocco | come da blocco | come da blocco | come da blocco |
| ridotta | serie × 0,67 all'intero più vicino (minimo 1), RIR +1, nessuna progressione di carico | contatti e metri −50% | invariati | −25/35% |
| minima | niente | niente | pavimenti della settimana non ancora fatti, fisioterapista, mobilità | 15-20 min |

La minima conta come fatta (SPEC § 2, «anche la giornata minima conta» **[codice]**). Nel lettore «Fai la piena» la
ignora; la regola del dolore resta esercizio per esercizio. La variante non si salva: si deriva (`daySession`); si salva solo
`WorkoutLog.variant` a seduta fatta.

**Scarico e settimana più leggera dalla revisione.** Oggi accettarli non cambia niente **[codice]**. Nella fase 2
`deloadProposal` e `loadProposal` hanno `apply: { type: 'weekKind', weekStart, kind }` e l'approvazione scrive
`Plan.weekOverrides[lunedì]`: «scarico» applica i fattori della settimana 4 a tutte le sedute di quella settimana (anche
quelle fisse, senza blocco); «leggera» toglie la seduta facoltativa e porta il resto a RIR ≥ 3. `loadingSince` continua a
contare dagli scarichi accettati. Con un blocco attivo lo scarico anticipato (3 notti sotto 6 ore e dolore in aumento,
regola esistente **[codice]**) sposta lo scarico alla settimana dopo e il blocco riparte da lì; una settimana senza partita
che cade nella settimana 3 o 4 prende lo scarico.

### 3.10 Casi particolari

- **Ripresa dopo una pausa**: 14 giorni o più senza sedute registrate → le prime 2 sedute di ogni esercizio tornano alla
  fase di ingresso con carichi −20% **[pratica]**.
- **Partita giocata poco**: `FootballLog.durationMin` < 45 → richiamo il martedì in coda alla seduta A: cyclette 6 × 1 min
  forte (RPE 8) e 1 facile **[pratica]**.
- **Settimana senza calcio in stagione** (partita rinviata, pausa di Natale): la palestra resta; si aggiunge una seduta K di
  corsa intermittente o cyclette, se la tibia lo permette.

### 3.11 Criteri di fine blocco

La domenica dell'ultima settimana del blocco `blockReview(program, state)` calcola un riepilogo e `nextBlockPlan` propone il
blocco dopo. Numeri:

- **costanza**: sedute fatte su previste (le facoltative non contano) e quota dei pavimenti fatti;
- **carichi**: per ogni schema principale (cerniera, squat o affondo, spinta, tirata) il miglior 1RM stimato delle settimane
  2-3 contro la settimana 1 (o il blocco prima);
- **dolore**: per zona la media, i giorni sopra soglia, la pendenza in punti a settimana, gli episodi «mattino dopo +1»;
- **sonno**: media del tempo a letto e notti sotto le 6 ore;
- **corpo**: variazione settimanale del peso medio e della vita (dalle revisioni).

Tabella di decisione, in ordine (la prima che scatta decide):

| Condizione | Blocco successivo (`verdict`) |
|---|---|
| una zona con media sopra soglia, o ≥ 4 giorni sopra soglia nelle ultime 2 settimane, o pendenza > +0,5 a settimana | `rientro`: rientro per quella zona (secondaria; principale con ≥ 7 giorni sopra soglia), livello d'impatto −1, contatti × 0,5, invito a sentire il fisioterapista |
| costanza < 60% | `meno-ma-fatto`: stesse qualità, una seduta in meno (resta la B con i pavimenti), durata −15 min |
| tempo a letto medio sotto 6 h 30 o ≥ 3 notti corte a settimana | `consolida` senza aumenti di volume; lo scarico resta |
| costanza ≥ 80% e carichi +2,5% o più | `avanza`: fascia più pesante o +1 serie (solo nella pausa), livello di pliometria +1 se il requisito c'è |
| costanza tra 60 e 80% | `consolida`: stesse qualità e stesso volume |
| costanza ≥ 80% e carichi tra −2,5% e +2,5% | `consolida`: variante o schema delle serie diversi, stesso volume |
| carichi sotto −2,5% | `alleggerisci`: volume −20% e una settimana leggera in più |

Dopo 2 blocchi con la stessa principale il motore **propone** (non impone) la successiva nella sequenza accumulo →
trasformazione → realizzazione **[fonte: Issurin 2010]**: in stagione forza → forza e potenza → potenza e rapidità → forza;
nella pausa ipertrofia e forza → forza e potenza → precampionato. Il corpo non cambia il blocco: le calorie seguono le regole
settimanali.

### 3.12 Ingressi e uscite del generatore

```ts
// engine/plan/build.ts
export interface TrainingBuildInput {
  monday: ISODate;              // inizio del blocco
  plan: Plan;                   // settimana, obiettivo, stagione, soglie, programma in vigore
  workoutLogs: readonly WorkoutLog[];
  footballLogs: readonly FootballLog[];
  checkIns: Readonly<Record<ISODate, CheckIn>>;
  physio: AppData['physio'];
  painSites: readonly string[];
  previous?: BlockSummary;      // ultimo blocco concluso
  attempt: number;              // «Un'altra proposta»
}
export interface TrainingBuildResult {
  /** null solo se la settimana non ha nessun giorno ammesso per la palestra (vedi sotto). */
  program: Program | null;
  week?: ScheduleDay[];         // solo se la settimana tipo cambia (fase o regole R1-R7)
  reasons: string[];            // frasi brevi, al massimo 3
  warnings: string[];           // R10 con i soli pavimenti, sedute tolte per mancanza di giorni, obiettivo pronto sostituito
  violations: Violation[];      // dure che restano dopo la risoluzione: sempre vuoto, i test lo controllano
}
export function buildBlock(input: TrainingBuildInput): TrainingBuildResult;
```

Ordine fisso di `buildBlock`: (1) posiziona le sedute con R1-R7, spostandole se serve; una seduta senza un giorno ammesso si
toglie e i suoi pavimenti passano alle sedute che restano; (2) costruisce il contenuto (§ 3.3); (3) risolve freni e dosi:
fermo per i segnali d'allarme, `painGate`, stadio del rientro, R3, R8, tetti di contatti e metri, R10; (4) ordina con R9; (5)
valida con `validateWeek`. Il dolore, la tibia e il carico non fanno mai decadere la proposta: cambiano il contenuto e lo
dicono nei motivi. Una proposta non nasce solo se la settimana non lascia nessun giorno per la palestra (per esempio calcio
tutti i giorni): restano le sedute in vigore e Allenamento lo dice in una riga («Con il calcio di questa settimana non c’è un
giorno per la palestra: tengo le sedute di prima»).

---

## 4. Alimentazione

### 4.1 Prevenzione oncologica come regola di base

La prevenzione vale sempre, come principio di base del piano. **Non è un obiettivo selezionabile** accanto a
ricomposizione, dimagrimento o massa, per quattro motivi: le regole forti costano niente in rendimento e gusti; decidono la
qualità degli alimenti, mentre gli obiettivi decidono energia e macro, quindi si sommano; un interruttore direbbe una cosa
falsa («senza prevenzione vanno bene salumi e alcol»); il beneficio si vede seguendo insieme quasi tutte le raccomandazioni
**[fonte: WCRF CUP Global 2025]**.

Il livello di prova decide come si applica una regola:

- prove oncologiche forti (WCRF «strong», cioè «convincing» o «probable»; IARC gruppo 1): **vincoli** del menù (A1-A5, A6
  per i tumori aerodigestivi, A7, A9);
- linee guida nutrizionali dichiarate come tali, con la loro fonte: **vincoli** anche loro, ma il testo non le presenta mai
  come prevenzione dei tumori (A6 per i 400 g e le porzioni da 80 g dell'OMS, A8 legumi del CREA, A10 zuccheri liberi
  dell'OMS, raccomandazione condizionale per peso e carie);
- prove limitate o solo meccanismo (cotture, bevande calde, aflatossine): **consigli** e coach, mai vincoli;
- preferenze: solo dentro i tetti.

Per un adulto giovane e attivo l'ordine delle leve è: alcol, peso e vita, attività, carne lavorata, fibre e vegetali, carne
rossa; contaminanti e cotture sono precauzioni **[fonte: IARC Q&A vol. 114, stime GBD]**. I testi dell'app non dicono mai
«prevenire il cancro», «superfood», «anticancro», «il pollo protegge», «la griglia è cancerogena»: dicono «ridurre il
rischio» e citano la forza della prova.

**La patch già verificata si applica per prima**, nel passo 0 con un commit dedicato (§ 14.1; 6 file, 610 test su 610 in una
copia **[misura]**): insalata di pasta al posto del riso del mercoledì (il riso scende a 3 pasti), riso lessato in molta
acqua e scolato in tutte le ricette e preparazioni, cotture senza annerire, piano B senza affettati e con la spremuta
contata come zucchero libero, 8 consigli nuovi nella categoria `prevenzione`, coach con quattro voci (prevenzione, alcol,
integratori, proporzioni), 5 test nuovi e i test aggiornati (`MIN_FIBER` 30, `RED_MEAT` con vitello, maiale, agnello e
cavallo, gallette a 0).

### 4.2 Vincoli rigidi del menù

Valgono per la rotazione, per il menù di avvio (tranne dove detto) e per il menù generato; sono controllati da
`validateMenuWeek` (§ 4.10) e dai test.

| N. | Regola | Numero | Fonte |
|---|---|---|---|
| A1 | niente carni lavorate (salumi, affettati, bresaola, fesa arrosto a fette, würstel anche di pollo, salsiccia anche fresca, carne in scatola, ragù pronti di carne) | 0 | WCRF «convincing», CUP 2017: RR 1,16 (1,08-1,26) di colon-retto ogni 50 g al giorno; IARC 2015, gruppo 1: circa +18% ogni 50 g; nessuna dose sicura |
| A2 | niente alcol tra gli ingredienti e nelle proposte | 0 | WCRF; IARC gruppo 1; OMS Europa 2023 («no level is safe») |
| A3 | niente gallette, riso soffiato né altri prodotti di riso; niente riso integrale | 0 | limite UE dell'arsenico inorganico 0,30 mg/kg per gallette e soffiato, 0,25 per l'integrale, 0,15 per il bianco (Reg. UE 2023/915); EFSA 2024 |
| A4 | carne rossa (tutta la carne muscolare di mammifero: manzo, vitello, maiale, agnello, cavallo, capra) | al massimo 1 porzione e **150 g cotti a settimana** | WCRF: fino a circa 350-500 g cotti a settimana in tutto; il menù ne usa un terzo perché i pasti fuori ne aggiungono **[ipotesi]** |
| A5 | riso | al massimo **3 pasti a settimana**, sempre lessato in almeno 6 parti d'acqua e scolato (oppure in due acque) | EFSA 2024 (margini di esposizione bassi); Raab 2009 (−45% con 6:1 e scolatura); Menon 2021 (−73% in due acque) |
| A6 | verdura non amidacea e frutta | almeno **400 g al giorno** (5 porzioni da 80 g), patate escluse | WCRF «probable» per diversi tumori aerodigestivi (prove per singola sede limitate); i 400 g sono anche la raccomandazione OMS, le porzioni da 80 g una convenzione OMS e NHS |
| A7 | fibre | almeno **30 g al giorno**; tetti di 45 g, e di 40 g con il calcio la sera o alla vigilia **[codice]** | WCRF; Reynolds 2019 (certezza GRADE moderata) |
| A8 | legumi | almeno 4 pasti principali a settimana, al massimo una porzione al giorno; nei giorni di calcio solo lenticchie rosse a pranzo, alla vigilia niente legumi a cena **[codice]** | linea guida nutrizionale, non oncologica: CREA 2018, 2-4 porzioni a settimana (per il WCRF i legumi sono «limited – no conclusion») |
| A9 | cereali integrali | in media almeno **90 g al giorno** (pane e fiocchi come si comprano, pasta e cous cous integrali in equivalente secco; farro e orzo perlati non contano) | WCRF CUP: RR 0,83 ogni 90 g al giorno |
| A10 | zuccheri liberi dal menù (aggiunti, miele, sciroppi, succhi e spremute) | meno del **5% delle kcal**, così i dolci programmati stanno sotto il 10% | linea guida nutrizionale: OMS 2015, raccomandazione condizionale sotto il 5% (forte sotto il 10%), per peso e carie, non per il cancro |
| A11 | settimana di avvio | A7 e A9 non valgono: fibre 22-32 g e pane comune, per salire per gradi **[codice]** | scelta clinica dell'app |

Pollame, pesce e uova non hanno un tetto oncologico (WCRF: «no direct evidence» di danno; il pesce è solo «limited-suggestive»
come protezione); i loro numeri sono di varietà (§ 4.10). Il coniglio è carne bianca per il CREA e carne di mammifero per la
definizione IARC: Ritmo lo tratta come bianca e il coach lo dice se glielo chiedono **[inferenza]**.

### 4.3 Tetti settimanali, pasti fuori compresi

Non sono vincoli del menù (l'app non sa tutto quello che si mangia fuori): li misurano la revisione (§ 4.7) e il coach.

| N. | Regola | Numero | Fonte |
|---|---|---|---|
| B1 | carne rossa in tutto | circa **350 g cotti** (3 porzioni); mai oltre 500 g | WCRF |
| B2 | carne lavorata | 0; se capita si conta, senza colpe | WCRF («very little, if any»); IARC |
| B3 | alcol | consiglio 0; ogni unità in meno conta e **mai 5 o più unità nella stessa sera** (un'unità = 12 g di etanolo: una birra da 330 ml, un calice da 125 ml) | WCRF; OMS; ISS PASSI |
| B4 | zuccheri liberi | in tutto meno del 10% delle kcal | OMS 2015 |
| B5 | bevande zuccherate | 0; spremute e succhi non sostituiscono la frutta | WCRF; OMS |
| B6 | riso, anche fuori menù | non tutti i giorni | Livsmedelsverket |

### 4.4 Obiettivi giornalieri

- Verdura e frutta: almeno 5 porzioni, con una porzione di verdura a pranzo e una a cena (punteggio, non vincolo: la cena con
  cous cous e pollo ha 60 g e non si può alzare senza superare il tetto di proteine **[misura]**).
- Fibre: almeno 30 g, già nell'anello dei valori.
- Cereali integrali nella maggior parte dei pasti, **non nel pre-calcio**, dove serve poca fibra.
- Caffè: fino a 400 mg di caffeina al giorno da tutte le fonti, «circa 4-5 espressi» **[fonte: EFSA 2015]**; bevande calde
  non bollenti (sopra i 65 °C IARC 2A). Un solo numero per l'espresso in tutta l'app: `ESPRESSO_CAFFEINE_MG = 80`
  (`data/defaults.ts`, con la fonte nel commento: EFSA 2015, circa 80 mg per un espresso), dichiarato come stima
  dentro un intervallo di 60-110 mg per tazza **[stima: il contenuto varia molto con miscela e preparazione; da
  controllare sulla fonte primaria nell'onda 3A]**.
  Lo usano questo testo e la somma della caffeina degli integratori (§ 9.4).

### 4.5 Cotture

| N. | Regola | Forza |
|---|---|---|
| D1 | amidacei dorati, non bruni (pane tostato, patate, crosta) | precauzione **[fonte: EFSA 2015 sull'acrilammide]** |
| D2 | carne senza parti annerite; padella ben calda per poco con fettine e straccetti, forno a 180-200 °C, umido o vapore per i pezzi grandi; alla griglia marinatura, carne girata spesso, niente fiamma diretta, 1-3 min di microonde prima per i pezzi spessi | precauzione: l'IARC ha dati insufficienti **[fonte: NCI 2017; Smith 2008; Felton 1994]** |
| D3 | riso lessato in molta acqua e scolato (A5) | riduce l'esposizione misurata |
| D4 | frutta secca e crema di arachidi chiuse, al fresco e all'asciutto; via quelle amare, rancide o ammuffite | precauzione (aflatossine: la cottura non le elimina) |
| D5 | bevande calde: aspettare un paio di minuti | precauzione |

Ogni ricetta dichiara le sue cotture (`RECIPE_FACTS`, § 4.8). Il generatore penalizza la carne alla griglia (§ 4.10);
nessuna ricetta di riso usa l'assorbimento (test).

### 4.6 Piano B, consigli e coach

- Piano B al bar: mai affettati; il pollo del panino alla piastra o al forno (la fesa arrosto a fette è un affettato); il toast
  solo al formaggio; la pizza margherita o alle verdure; la spremuta resta «sì» per i carboidrati prima del calcio, ma il
  motivo dice che i suoi zuccheri sono liberi; nessuna opzione con alcol (patch). In più `BarOption.contains` (§ 6.5) per le
  esclusioni.
- Consigli: la categoria `prevenzione` con 8 consigli (patch); ogni testo dice da quale prova viene e non promette protezione.
- Coach: le quattro voci della patch. Una riga in più vieta di proporre gli alimenti esclusi dall'utente (§ 6.5).

### 4.7 Misure nella revisione della domenica

Lo scopo è vedere il modo di mangiare senza appesantire. Tutto va in «Da sapere», senza pulsanti né colpe; lo scalino della
settimana resta uno. Le misure si ricavano dal diario (`preventionMeasures(weekStart, state)`); un pasto stimato da foto o
da un piatto conta per i suoi alimenti, un ordine del bar senza alimenti non conta.

| Misura | Come si ottiene | Riferimento |
|---|---|---|
| carne rossa | grammi cotti dei pasti segnati + domanda «fuori dal menù» (× 150 g cotti a porzione: fuori casa una bistecca, una tagliata o un secondo valgono di solito 150-250 g cotti **[stima]**); il testo lo dice come stima, «circa 450 g su 350» | B1: circa 350 g |
| carne lavorata | alimenti del gruppo `carne-lavorata` nei pasti stimati + domanda | B2: 0 |
| alcol | domanda | B3 |
| verdura e frutta | media delle porzioni al giorno dai pasti segnati (giorni con almeno il 60% dei pasti, come le fibre **[codice: `MIN_DAY_MEAL_SHARE`]**) | 5 porzioni |
| cereali integrali | grammi al giorno in equivalente secco dai pasti segnati | 90 g |
| legumi, pesce, riso | pasti a settimana, sostituzioni comprese | 4; 2-3; al massimo 3 |
| vita | dalle revisioni, tendenza a 4 settimane | sotto 94 cm per gli uomini e 80 cm per le donne (`Profile.sex`), senza aumenti (WCRF; OMS per gli adulti europei) |

**Domande nuove, al massimo tre, da un tocco ciascuna, tutte facoltative** (senza risposta la misura dice «non indicato»):
«Carne rossa fuori dal menù» 0 · 1 · 2 · 3 o più porzioni; «Salumi o carne lavorata» 0 · 1 · 2 · 3 o più volte; «Alcol»
0 · 1-3 · 4-7 · 8 o più unità, e solo se diverso da 0 «In una sera sola, 5 o più?» Sì · No. Le risposte si precompilano
con quanto il diario sa già (pasti stimati con salumi). In vista vanno solo le misure fuori dal riferimento; se sono tutte
dentro, una riga «Prevenzione: tutto nei limiti» con il dettaglio dietro un tocco. Lo scalino nuovo `alcol` («una sera
senza alcol in più») si propone solo se nella settimana compare l'alcol.

### 4.8 Fatti degli alimenti e delle ricette

Dati locali, fuori dal contratto, ciascuno con un test di copertura:

```ts
// data/foodFactsTypes.ts (solo tipi, dall'onda 0: li usano estimateFoods.ts, foodFacts.ts e i motori)
export type FoodGroup =
  | 'carne-rossa' | 'carne-lavorata' | 'pollame' | 'pesce' | 'pesce-grasso' | 'uova' | 'legumi'
  | 'cereale-integrale' | 'cereale-raffinato' | 'patate'
  | 'verdura' | 'frutta' | 'frutta-essiccata' | 'frutta-guscio'
  | 'latticini' | 'condimento' | 'dolce';
export interface FoodFacts {
  group: FoodGroup;
  /** Equivalente secco per A9: grammi di cereale integrale per grammo mangiato (pane e fiocchi 1, pasta integrale cotta circa 0,45). */
  wholeGrainDry?: number;
  /** Prodotto di riso (A3, A5). */
  rice?: boolean;
  /** Zuccheri liberi per 100 g (etichetta o CREA, fonte nel commento); assente = 0. */
  freeSugarG?: number;
  /** Ultra-trasformato (NOVA 4). */
  upf?: boolean;
  /** Stagionalità dei freschi (§ 4.10): `months` = mesi di stagione 1-12; `strict` = fuori da quei mesi non entra. */
  season?: { months: number[]; strict: boolean };
}

// data/estimateFoods.ts (onda 1A)
export const ESTIMATE_FOODS: Food[];
export const ESTIMATE_FOOD_FACTS: Record<string, FoodFacts>;   // tutti gli alimenti di ESTIMATE_FOODS

// data/foodFacts.ts (onda 1B; nell'onda 2 passa a 2A)
export const FOOD_FACTS: Record<string, FoodFacts>;            // tutti gli alimenti di FOODS
/** Fatti di un alimento di FOODS o di ESTIMATE_FOODS: l'unico accesso per motori e test. */
export function factsOf(foodId: string): FoodFacts | undefined;

// data/recipeFacts.ts
export type Cooking = 'crudo' | 'lesso' | 'vapore' | 'umido' | 'forno' | 'padella' | 'griglia' | 'microonde';
export const RECIPE_FACTS: Record<string, { cooking: Cooking[]; riceMethod?: 'scolato' | 'due-acque'; prep?: string[] }>;
//   prep = componenti della preparazione della domenica usati dalla ricetta (solo per le ricette `batch`, § 4.11)
```

I gruppi che oggi stanno in elenchi dei test (`FISH`, `LEGUMES`, `RED_MEAT`, `WHOLE_GRAIN_DRY` **[codice]**) passano qui e i
test li leggono da qui. Restano fuori dalla fase 2 sale, calcio e omega-3 per alimento: il sale non è una regola oncologica
(«limited, no conclusion» sul sale totale) e senza dati affidabili non si cambia niente **[ipotesi: stima
di circa 7 g al giorno, ±30%]**.

### 4.9 Gusti ed esclusioni nel piano

- Un'esclusione è per **alimento** (`Plan.exclusions`, id di `FOODS`), mai per ricetta. Vale da domani: oggi e i giorni
  passati non cambiano.
- Un alimento escluso sparisce da: menù in vigore (sostituzione deterministica in `mealsForDate`, § 6.4), menù generato (H0),
  alternative, spesa (che segue il menù), piano B (`BarOption.contains`), compiti strutturati del coach (validatori) e
  proposte della chat (contesto e prompt; nella chat libera resta solo il divieto del prompt, limite dichiarato).
- I divieti di prevenzione (A1-A3) sono esclusioni fisse, non visibili nella pagina dei gusti e non riattivabili.
- Gruppi di alimenti (tutto il pesce azzurro) e allergie trattate più severamente di un gusto restano fuori da questa fase
  (§ 15).

Interfaccia e regole dei cambi ripetuti: § 6.

### 4.10 Generatore del menù

Moduli: `engine/menuGen/{context,validate,generate,prep}.ts`. `menuGenInput` è l'unico pezzo che legge lo stato;
`validateMenuWeek` e `generateMenuWeek` dipendono solo dai loro ingressi e si testano con ingressi scritti a mano.

**Ingressi**

```ts
interface MenuDayCtx {
  iso: ISODate;
  dayType: DayType;           // effettivo: la vigilia mangia come il calcio
  matchDay: boolean;
  matchEve: boolean;
  eveningFootball: boolean;   // merenda pre-calcio e cena di recupero
  target: MacroTarget;        // dayTargetFor(iso, state)
  carbFloorG?: number;        // 6 g/kg a partita e vigilia
  fiberTargetG: number;       // rampa delle fibre
}
interface MenuGenInput {
  monday: ISODate;
  days: MenuDayCtx[];                    // 7
  month: number;                         // mese del mercoledì della settimana (1-12)
  seed: MenuWeek;                        // ultima settimana approvata, altrimenti la rotazione di quel lunedì
  previous?: MenuWeek;                   // in vigore la settimana prima (stabilità e spesa)
  recentUses: Record<string, number>;    // usi di ogni ricetta nelle 2 settimane prima
  doneRate: Record<string, number>;      // quota di «fatto» per ricetta (familiarità)
  swappedAway: Record<string, number>;   // quante volte l'utente ha cambiato quella ricetta (28 giorni)
  excluded: ReadonlySet<string>;         // esclusioni dell'utente + divieti A1-A3
  weightKg: number;                      // proteine per pasto
  attempt: number;
  maxEvaluations: number;                // 3.000
}
interface MenuGenResult {
  week: MenuWeek;                        // con la preparazione
  status: 'generato' | 'seme' | 'seme-adattato' | 'fuori-limiti';
  violations: Violation[];               // vuoto se valido
  changed: { day: Weekday; slot: MealSlot; from: string; to: string }[];
  products: number;
  cost: number;
  evaluations: number;
}
```

**Vincoli duri, in ordine di priorità** (codici di `Violation.code` tra parentesi):

| Classe | Contenuto | Si allenta? |
|---|---|---|
| H0 · esclusioni e divieti | nessun alimento escluso o vietato (A1-A3) (`escluso`, `vietato`) | mai |
| H1 · contesto del giorno | merenda con tag `pre-calcio` nei giorni con il calcio la sera e cena con tag `recupero`, negli altri giorni no (alla vigilia il pre-calcio è ammesso) (`pre-calcio`, `recupero`); pranzo dei giorni di calcio con fibre ≤ 20 g; vigilia senza legumi a cena; domenica senza ricette da preparazione; partita e vigilia con i 6 g/kg raggiungibili entro `CARB_SCALE_MAX` e kcal entro ±5% (`carboidrati-partita`) **[codice]** | mai |
| H2 · giorno | kcal ±8%; proteine ≥ obiettivo − 10 g (generalizza i 125 g dei test, **[ipotesi]**) e ≤ +25%; carboidrati e grassi entro ±15%; grassi ≥ 20% delle kcal e ≥ obiettivo − 15 g; fibre A7; vegetali A6 (`kcal-giorno`, `proteine-giorno`…) **[codice: `menu.test.ts`]** | solo nel ripiego, e lo si dice |
| H3 · prevenzione settimanale | A4, A5, A8, A9, A10 (`carne-rossa-settimana`, `riso-settimana`, `legumi-settimana`, `integrali-settimana`, `zuccheri-liberi`) | come H2 |
| H4 · spesa | ≤ 40 prodotti (dispensa a parte); un fresco usato almeno per metà confezione nella settimana; un prodotto a lunga conservazione in almeno due pasti o a metà confezione nelle due settimane; un solo yogurt, un solo cereale da colazione, un solo salmone (`prodotti`, `confezione`, `doppione`) **[codice]** | come H2 |
| H5 · stagione | nessun fresco con `season.strict` fuori dai suoi mesi (`fuori-stagione`) | come H2 |
| H6 · varietà | pesce 2-3 pasti; uova 2-3 pasti; legumi ≥ 4 pasti principali; nessuna colazione oltre 3 volte e almeno 3 diverse; nessuno spuntino o merenda oltre 3 volte a settimana e 5 su 14; pranzi e cene: nessuna ricetta oltre 2 volte (da preparazione 3), mai nello stesso pasto tre giorni di fila (`varieta`) | prima di tutte |

Durante la ricerca ogni violazione dura pesa 10.000 (penalità): la ricerca può attraversare stati non validi, il risultato
finale deve averne zero.

**Punteggio** (costo da minimizzare; pesi iniziali da tarare sui casi di prova **[ipotesi]**; il punteggio non si mostra mai
come «rischio»):

| Termine | Costo |
|---|---|
| distanza dalle kcal oltre il 3% | 40 per punto percentuale |
| proteine sotto 0,3 g/kg in colazione, pranzo o cena; sotto 30 g nella cena di recupero **[fonte: Jäger 2017]** | 2 per grammo |
| fibre sotto 35 g | 3 per grammo |
| verdura e frutta sotto 600 g | 3 ogni 50 g |
| pranzo o cena con meno di 80 g di verdura | 2 per pasto |
| integrali sotto 120 g di media | 2 ogni 10 g |
| carne rossa oltre 110 g cotti | 2 ogni 25 g |
| riso oltre 2 pasti | 2 per pasto |
| pesce grasso assente nella settimana | 3 |
| ultra-trasformati oltre il 5% delle kcal | 1 ogni 2% |
| carne alla griglia | 0,5 per pasto |
| prodotti oltre 34 | 10 l'uno |
| prodotti nuovi rispetto alla settimana prima | 2 l'uno |
| pasti principali cambiati rispetto alla settimana prima oltre 5 | 15 × eccesso² |
| ricette da preparazione cambiate oltre 1 | 20 l'una |
| fresco fuori stagione ammesso (○ nella tabella) | 3 per uso |
| frutta di stagione diversa nella settimana | −2 per frutto oltre il primo |
| minuti oltre il tempo del pasto (colazione e spuntini 5, pranzo 15, cena 20, cena di recupero 10) | 1 al minuto |
| ricetta che l'utente ha cambiato di recente | 3 per cambio |
| ricetta segnata spesso «fatto» | −1 |

Le soglie del punteggio (35 g di fibre, 600 g di vegetali, 120 g di integrali) stanno sopra i vincoli: il generatore preferisce
le giornate migliori. La rotazione di oggi ha già 39,5 g di fibre di media, 674-711 g di vegetali e 115-123 g di integrali
**[misura]**.

**Algoritmo** (deterministico: stesso ingresso, stesso menù):

1. **Bacini**: per ogni casella (giorno, pasto) le ricette di quel pasto che passano H0, i vincoli statici di H1 e H5; le
   ricette da preparazione solo dal lunedì al sabato.
2. **Cache dei valori**: valori di ogni ricetta per tipo di giorno a scala 1 (`recipeNutrition` costa circa 2 µs
   **[misura]**); la scala dei carboidrati di partita e vigilia si ricalcola sul giorno toccato con `carbScaleForMeals`.
3. **Partenza**: il seme; le caselle con una ricetta fuori bacino prendono il candidato a costo minore.
4. **Ricerca locale**, con l'ordine dei vicini mescolato da un generatore con seme (`mulberry32(seedOf(lunedì, impronta del
   piano, esclusioni, attempt))`): (a) cambia una casella con un candidato del suo bacino, prima le caselle coinvolte in una
   violazione; (b) scambia due giorni nello stesso pasto. Si accetta la prima mossa che abbassa il costo; a parità si accetta
   con probabilità 0,1 dal generatore. Stop dopo un giro completo senza miglioramenti o a `maxEvaluations`.
5. **Valutazione incrementale**: una mossa ricalcola uno o due giorni e aggiorna per differenza i conteggi della settimana.
6. **Controllo finale completo** con `validateMenuWeek` e `shoppingList` vera.
7. **Ripiego**, in ordine: risultato valido → seme con le sostituzioni delle esclusioni (`seme-adattato`) se valido → seme puro
   senza esclusioni (`seme`: la rotazione passa i test) → il migliore trovato con gli avvisi (`fuori-limiti`, «Senza il tonno
   la spesa sale a 42 prodotti»). H0 e H1 non si violano mai: una casella senza candidati resta vuota e la scheda lo dice.
8. **Preparazione** (§ 4.11) e **differenze** rispetto a ciò che varrebbe senza approvazione.

Quanto cambia: il generatore tiene il 60-70% dei pasti della settimana prima e cambia 3-5 pasti principali più la frutta di
stagione **[ipotesi]**. Più varietà allunga la spesa e toglie le abitudini a chi ha il cibo come punto debole **[fonte: Lally
2010, sulla formazione delle abitudini]**.

**Rampa delle fibre**: obiettivo della settimana = min(35 g, fibre medie misurate la settimana prima + 6 g); senza misura
vale il passo avvio → rotazione di oggi (`FIBER_STEP` = 6 **[codice]**). I legumi salgono per gradi: prima lenticchie rosse
decorticate e hummus, poi 100-150 g di legumi in barattolo sciacquati **[pratica]**.

**Stagionalità** (`FOOD_FACTS.season`). ● in stagione; ○ fuori stagione ma ammesso con costo (serra o conservazione); vuoto =
non entra nel menù generato (`strict`). Senza `season` l'alimento vale tutto l'anno (surgelati, dispensa, mela, banana,
limone, carote, cipolla, patate, insalata in busta). Calendari di stagionalità diffusi per il centro-nord **[pratica, da far
verificare all'utente]**:

| Alimento | G | F | M | A | M | G | L | A | S | O | N | D |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pera | ● | ● | ● | ● | ○ | ○ | ● | ● | ● | ● | ● | ● |
| arancia | ● | ● | ● | ● | ● |  |  |  |  |  | ● | ● |
| clementine | ● | ● | ● |  |  |  |  |  |  |  | ● | ● |
| kiwi | ● | ● | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ | ● | ● |
| rucola | ○ | ○ | ○ | ● | ● | ● | ● | ● | ● | ● | ○ | ○ |
| spinaci novelli | ● | ● | ● | ● | ● | ○ | ○ | ○ | ○ | ● | ● | ● |
| zucchine | ○ | ○ | ○ | ○ | ● | ● | ● | ● | ● | ○ | ○ | ○ |
| pomodorini | ○ | ○ | ○ | ○ | ○ | ● | ● | ● | ● | ○ | ○ | ○ |
| peperoni | ○ | ○ | ○ | ○ | ○ | ● | ● | ● | ● | ○ | ○ | ○ |
| cetriolo | ○ | ○ | ○ | ○ | ● | ● | ● | ● | ● | ○ | ○ | ○ |
| zucca | ● | ○ |  |  |  |  |  |  | ● | ● | ● | ● |
| *mandarini* (nuovo) | ● | ○ |  |  |  |  |  |  |  |  | ● | ● |
| *fragole* (nuovo) |  |  |  | ● | ● | ● |  |  |  |  |  |  |
| *albicocche* (nuovo) |  |  |  |  |  | ● | ● |  |  |  |  |  |
| *pesche* (nuovo) |  |  |  |  |  | ● | ● | ● | ● |  |  |  |
| *anguria* (nuovo) |  |  |  |  |  |  | ● | ● |  |  |  |  |
| *uva* (nuovo) |  |  |  |  |  |  |  |  | ● | ● |  |  |
| *cachi* (nuovo) |  |  |  |  |  |  |  |  |  | ● | ● | ● |
| *finocchi* (nuovo) | ● | ● | ● | ● |  |  |  |  |  | ● | ● | ● |
| *cavolfiore* (nuovo) | ● | ● | ● |  |  |  |  |  |  | ● | ● | ● |
| *cavolo nero* (nuovo) | ● | ● |  |  |  |  |  |  |  |  | ● | ● |

Un alimento con almeno un mese vuoto è `strict` e in quei mesi non entra; gli altri hanno `strict: false` e fuori stagione
pagano il costo. Le ricette di stagione si ricavano dagli ingredienti (`recipeInSeason(recipe, mese)`): una ricetta è di stagione se tutti i suoi
freschi lo sono. Gli scambi di alimento dentro una ricetta a runtime (la mela che diventa pesca) sono scartati: i valori non
sarebbero più verificati dai test. Ogni alimento nuovo conta come prodotto: il generatore ne usa al massimo 2 a settimana.

**Ricette nuove** (in `data/recipes.ts`, con tutti i test delle ricette): da 12 a 16, per dare al generatore varietà di
stagione senza allungare la spesa:

- 5 spuntini o merende di frutta di stagione, trasportabili (pera, clementine o mandarini, arancia, cachi o uva, pesche,
  albicocche o fragole), sul modello yogurt greco, frutto e noci o pane, grana e frutto;
- 2 colazioni con frutta di stagione;
- 3 pranzi o cene d'inverno (cavolfiore, finocchi, cavolo nero o zucca) e 2 d'estate (pomodorini, zucchine, peperoni), di
  cui almeno una con legumi;
- 2 pasti con pesce grasso (sgombro o salmone), di cui uno da preparazione, così il generatore può arrivare a un pesce grasso
  a settimana.

**Spesa**: la stessa `shoppingList` di oggi **[codice]**; le chiavi delle spunte sono gli id degli alimenti, quindi una spesa
già spuntata sopravvive a una rigenerazione.

**Rotazione come seme e ripiego**: la rotazione di due settimane resta il ripiego sempre valido (i test lo garantiscono) e il
seme della prima settimana generata. Il menù di avvio vince su tutto, come oggi.

**Senza approvazione si ripete l'ultima settimana approvata**, non la rotazione: dopo settimane di menù generati tornare alla
rotazione sarebbe il cambio più grande possibile, contro P8 e contro la regola del 60-70% dei pasti tenuti. `menuWeekInForce`
(§ 12.2) dà `Plan.menus` del lunedì; se manca, l'ultima settimana approvata delle 4 precedenti, purché nessun suo fresco
`strict` sia fuori stagione nel mese nuovo (H5; le esclusioni le sostituisce `mealsForDate` come sempre); altrimenti la
rotazione. `DayMeals.source` vale allora `'ripetuto'`. Il controllo è solo H5 perché è l'unico che cambia con il mese: i
tipi di giorno e gli obiettivi li segue già la scala dei carboidrati, come per la rotazione. Il generatore sa quale ripiego
varrebbe e calcola le differenze rispetto a quello (passo 8).

**Quando si genera.** Una volta per settimana, per il lunedì dopo, a partire dal venerdì alle 12:00, al primo di questi
momenti: si apre Settimana (qualunque scheda), oppure l'app torna in primo piano (`visibilitychange`). Mai durante il primo
disegno dopo un avvio a freddo: il calcolo parte dopo il primo disegno (un `setTimeout` lanciato da un effetto), in modo
**sincrono**. Si rigenera solo se cambia la base del menù (§ 5.2) o con «Un’altra proposta». La proposta arriva con la spesa
del sabato (§ 5.3).

**Prestazioni** **[misura su questa macchina; iPhone stimato 2-3 volte più lento, ipotesi]**: `recipeNutrition` 2 µs,
prodotti di una settimana 14 µs, `shoppingList` 1,25 ms; 3.000 valutazioni stanno sotto i 200 ms su iPhone **[ipotesi]**.
`generateMenuWeek` è una funzione sincrona: una sola strada, niente stato «in preparazione», niente annullamento, niente
confronto della base a fine calcolo. Una pausa sotto i 200 ms una volta a settimana, dopo il primo disegno, è accettabile;
se la misura dell'onda 4 (CPU rallentata 4 volte in Chromium, poi l'iPhone, § 14.4) supera i 300 ms, si abbassa
`maxEvaluations` prima di pensare ad altro. Niente Web Worker (la build dell'anteprima in un solo file con un worker è un
rischio non verificato). Nessun test a tempo nella CI: il test controlla il numero di valutazioni.

### 4.11 Preparazione della domenica di un menù generato

- Se il menù generato ha **le stesse ricette da preparazione negli stessi giorni** del seme, tiene i compiti scritti a mano
  del seme, con le loro guide (`PREP_GUIDE` **[codice]**). È il caso normale, perché il costo frena i cambi delle ricette da
  preparazione.
- Altrimenti i compiti si generano da **componenti** (`data/prepComponents.ts`): «riso basmati cotto», «pollo al forno»,
  «ragù di lenticchie», «frittatine», «barrette», «farro cotto», «salmone al forno», «orzo cotto», «vellutata di zucca»,
  «verdure grigliate» e quelli delle ricette nuove. Ogni componente ha titolo, minuti, timer per il lettore della
  preparazione, guida passo passo scritta a mano, una frase di resa con i segnaposto dei giorni e **i suoi giorni in frigo**
  (`fridgeDays`), contati dalla domenica della preparazione:

  | Componente | `fridgeDays` | Fonte |
  |---|---|---|
  | riso, cous cous, farro, orzo cotti | 1 | riso cotto: raffreddare entro un'ora, in frigo al massimo un giorno, per il *Bacillus cereus* **[fonte: FSA; NHS]**; esteso agli altri cereali cotti per prudenza **[pratica]** |
  | pesce cotto (salmone, sgombro) | 2 | **[pratica: prudenza]** |
  | pollo, ragù di legumi, frittatine, vellutate, verdure cotte | 3 | avanzi cotti 3-4 giorni **[fonte: USDA FoodKeeper]**; si tiene il limite basso |
  | barrette e preparati secchi | 7 | **[pratica]** |

  Tutti i componenti cotti hanno nella guida la stessa regola: «Raffredda in fretta e metti in frigo o in freezer entro
  un’ora.» Quelli che vanno in freezer hanno «La sera prima passa in frigo; riscalda una volta sola, fino a quando fuma»
  **[fonte: FSA]**.
- `prepTasksFor(week)`: un compito per componente usato dal lunedì al sabato; **id = id del componente** (le spunte di
  `prepDone` sopravvivono a una rigenerazione); ogni porzione che si mangia oltre i `fridgeDays` del componente va in freezer
  e la resa lo scrive («Per lunedì in frigo; mercoledì e giovedì dal congelatore»); 4-6 compiti e 60-90 minuti, come i test
  di oggi.
- **Anche il seme rispetta le stesse regole.** Oggi il ragù di lenticchie si prepara la domenica e si mangia il giovedì dal
  frigo, al quarto giorno (`s1-ragu`, `s2-ragu` e la loro guida **[codice: `data/menu.ts`]**). Il passo 0 (§ 14.1) lo
  corregge con un commit dedicato, dichiarato nell'istantanea: «Due porzioni in freezer: quella di giovedì passa in frigo
  mercoledì sera». È l'unico compito del seme fuori regola: riso e pollo vanno già in frigo solo per il lunedì e il resto in
  freezer **[codice: `PREP_GUIDE`]**.
- Un'esclusione che toglie una ricetta da preparazione dal menù in vigore toglie i compiti che servivano solo a quella
  ricetta; un compito condiviso resta.

---

## 5. Proposte e storico

### 5.1 Un solo oggetto per ogni piano nuovo

Blocco, menù della settimana, obiettivi e ritorno a una versione sono tutti una `PlanProposal` (§ 12): una **toppa** sul
piano (`PlanPatch`: i soli campi che cambiano), le **differenze** (`DiffItem[]`, le prime 5 in vista), i **motivi** (al
massimo 3 frasi del motore, dai numeri), gli eventuali **avvisi** (solo quando un vincolo non si può rispettare, per esempio
per le esclusioni) e l'eventuale **passaggio del coach** (`CoachPass`). Un solo ciclo di vita, un solo foglio
(`PlanProposalSheet`), un solo modo di tornare indietro.

Stati: `aperta` → `approvata` | `scartata` | `superata`. Non esiste uno stato «in preparazione»: il motore produce la proposta
in modo sincrono (sotto 0,2 s) e il coach, se c'è, lavora sopra una proposta già aperta.

### 5.2 Identità, base e superamento

- **Una base per tipo** (`planBasis(kind, state)`, impronta con `hashString` **[codice: `lib/id.ts`]**), fatta solo delle
  parti del piano che quel tipo di proposta legge:

  | Tipo | Base |
  |---|---|
  | `blocco` | `Plan.week`, `training`, `season`, `program`, `weekOverrides`, `impactHold`, `Profile.painSites`, esercizi del fisioterapista |
  | `menu` | lunedì, tipi di giorno della settimana (`Plan.week`, `program`, `weekOverrides`), `targets`, `goalDeltaKcal`, esclusioni, mese |
  | `obiettivi` | `Profile.goal`, `targets`, `goalDeltaKcal`, `training` |
  | `ritorno` | la versione di partenza e i campi che la sua toppa tocca |

  Pesate, diari, controlli del mattino, sedute registrate e spunte non sono nella base: una pesata nuova non cambia né l'id
  né lo stato della proposta aperta, e non fa ripartire la rifinitura del coach.
- `id` = impronta di tipo, `effectiveFrom`, base e `attempt`: rigenerare con la stessa base non duplica. «Un’altra
  proposta» rifà il calcolo con `attempt + 1`.
- **Si genera una volta**, al momento previsto (§ 5.3), e si rigenera solo se la base del suo tipo cambia o con «Un’altra
  proposta». All'apertura del foglio, se la base è cambiata, la proposta diventa `superata` e se ne calcola una nuova: la
  scheda dice «Aggiornata con le ultime modifiche». Una proposta con una base diversa da quella del piano non si può
  approvare. Le risposte del coach per una proposta già superata si ignorano.
- Una sola proposta aperta per tipo e per data d'inizio; una nuova dello stesso tipo supera la vecchia.
- `approvableUntil`: ultimo giorno in cui si può approvare. Per un menù è la domenica prima di `effectiveFrom`; per un
  blocco è il giorno prima del primo giorno in cui sedute o tipo di giorno cambierebbero (con la settimana predefinita, il
  lunedì della partita). Dopo quel giorno la proposta aperta diventa `superata` e vale il ripiego (§ 3.1, § 4.10).
- Restano le ultime 3 proposte decise per tipo (si rileggono dalla revisione); le altre si tolgono. Lo storico vive nelle
  versioni.

### 5.3 Quando nascono e dove si incontrano

| Proposta | Quando nasce | Dove l'utente la incontra |
|---|---|---|
| menù della settimana dopo | dal venerdì alle 12:00, quando si apre Settimana o l'app torna in primo piano, dopo il primo disegno (§ 4.10) | Settimana › Spesa (card in cima) e Settimana › Menù della settimana dopo; quindi dentro la spesa del sabato |
| blocco nuovo | domenica dell'ultima settimana del blocco; cambio di fase dalle date; cambio di obiettivo di allenamento; scarico anticipato | revisione della domenica (proposta con area `piano`); card in cima ad Allenamento finché è aperta |
| obiettivi | l'utente cambia corpo o qualità nella pagina Obiettivi e tocca «Vedi la proposta» | subito, dalla pagina |
| ritorno | «Torna a questa versione» nello storico | subito, dallo storico |

**Il menù non si approva da solo.** Il sabato la lista della spesa mostra il **menù in vigore** (ripetuto, rotazione o
approvato) con sopra la proposta: «Menù nuovo: cambiano 4 pasti, 37 prodotti · Vedi». Spuntare la lista non approva niente;
non esiste una lista «da approvare». Se lunedì la proposta non è approvata si ripete l'ultima settimana approvata (§ 4.10) e
niente si blocca. La voce «Spesa» del sabato in Oggi dice nel suo dettaglio «Prima guarda il menù nuovo» finché la proposta è
aperta (solo testo).

**Approvare dopo aver fatto la spesa.** Se la proposta si approva quando per quel lunedì ci sono già spunte
(`shoppingChecked[lunedì]` non vuoto), la spesa cambia e non tutto è in casa. Lo stato è scritto:

- prima di approvare, il sottotitolo della proposta dice «Dopo la spesa: servono 3 prodotti in più»;
- dopo, in Settimana › Spesa compare in cima il gruppo «Da comprare in più»: la differenza tra la `shoppingList` nuova e
  quella del menù di prima, cioè i prodotti che prima non c'erano e quelli che salgono di almeno una confezione; le spunte
  degli alimenti comuni restano (le chiavi sono gli id degli alimenti **[codice]**). Il gruppo sparisce quando è tutto
  spuntato o con «Annulla».

### 5.4 Approvazione e «Annulla»

- `approveProposal(id, today)`, in una sola transazione: `before = beforeOf(plan, profile, patch)` salvato nella proposta,
  `plan = applyPatch(...)`, versione aggiunta all'archivio (§ 12.5; i menù no, § 5.5), stato `approvata`. `effectiveFrom` è sempre almeno domani o il lunedì dopo: oggi e
  i giorni passati non cambiano mai.
- Avviso con «Annulla» per 5 secondi (come oggi **[codice: `ToastHost`]**): riapplica `before` e toglie la versione.
- Dopo l'approvazione di un blocco che cambia i tipi di giorno, la proposta di menù aperta diventa `superata` e si rigenera.
- Approvare una proposta di area `piano` dalla revisione è la stessa azione (`Proposal.apply.type === 'planProposal'`).

### 5.5 Storico e ritorno al precedente

- Le versioni (`PlanVersion`) si scrivono per blocchi, obiettivi e ritorni, al massimo 24 (le più vecchie escono). Ogni
  versione tiene due toppe con i soli campi toccati: `before`, i valori di prima dell'approvazione, e `after`, la toppa
  applicata. Servono a due cose diverse:
  - **«Annulla»** (5 secondi dopo l'approvazione, § 5.4) riapplica `before` della proposta appena approvata e toglie la
    versione;
  - **«Torna a questa versione»** (`restoreTo(version, state)`) crea una proposta `ritorno` con `patch = version.after` e le
    differenze calcolate rispetto al piano di oggi: tornano i campi come li aveva messi quella versione. I campi che quella
    versione non toccava restano come sono; il foglio lo mostra, perché le differenze sono calcolate sul piano attuale.
- I menù hanno già il loro storico in `Plan.menus` (le settimane approvate, per lunedì, tenute 52 settimane): non generano
  versioni.
- Pagina **Storico del piano** (da Impostazioni › Obiettivi e da Allenamento › «Blocchi precedenti»): elenco per mese
  («Blocco forza e potenza · dal 9 novembre», «Obiettivi: più rapido», «Menù 16-22 novembre»), quella in vigore segnata. Tocco →
  foglio con le differenze rispetto a oggi e «Torna a questa versione» (per un menù «Usalo la prossima settimana»): nasce una
  proposta `ritorno` (o `menu`) dal giorno dopo (o dal lunedì dopo), che si approva come le altre. Lo storico si accoda e non
  si riscrive.

### 5.6 Rifinitura del coach

- Parte da sola dopo la nascita di una proposta di blocco o di menù se c'è la chiave, c'è rete e `Settings.coachRefine` non è
  `false` (predefinito acceso; interruttore in Impostazioni › Coach, «Rifinitura delle proposte»).
- Lavora in sottofondo; la proposta del motore è già apribile. Nel foglio: «Il coach sta rifinendo la proposta» con le righe
  del motore in vista. Se l'utente decide prima, la chiamata si annulla (`AbortController`): niente costi per una risposta
  che non servirebbe.
- Se nel frattempo la proposta è stata superata, la risposta si scarta senza applicarla (il costo è già speso: per questo la
  base non contiene pesate e diari, § 5.2).
- Ogni ritocco si applica su una copia, si rivalida e si tiene solo se non aggiunge violazioni dure; gli altri finiscono in
  `rejected` con il messaggio della violazione. Ordine fisso (quello del coach): il risultato è deterministico a parità di
  risposta. La proposta diventa `source: 'motore+coach'`; il foglio mostra «Ritocchi del coach (3)» e dentro «Non accettati
  (1)» con il motivo del codice, dietro un tocco.
- Errore o rifiuto: la proposta resta quella del motore, con una riga «Il coach non ha risposto: vale la proposta del motore».

---

## 6. Alternative e «Non mi piace»

### 6.1 «Cambia»: alternative con valori simili

`mealAlternatives(entry, ctx, limit = 3)` in `engine/similar.ts`, offline e deterministica. Serve il foglio della ricetta
(`RecipeSheet`, aperto da Oggi e da Settimana) e il foglio dei cambi (`SwapSheet`), al posto dell'ordinamento di oggi
(`swapOptions` ordina solo per `swaps` e per ordine dell'archivio **[codice]**).

1. **Filtro**: stesso pasto; H0 (esclusioni e divieti); contesto del giorno (H1: pre-calcio, recupero, vigilia, pranzo dei
   giorni di calcio); stagione `strict`; niente ricette da preparazione (la loro porzione esiste solo nei giorni previsti);
   nessuna ricetta che porterebbe la settimana oltre un tetto di H3 (per esempio una seconda carne rossa).
2. **Banda dei valori**, alla porzione del giorno (la scala dei carboidrati la dà lo strato 1 del § 6.4, mai `dayCarbScale`
   dentro una sostituzione): |Δ kcal| ≤ 10%, proteine ≥ −10%, fibre ≥ −20%.
3. **Ordine**: quota di alimenti già nella spesa di questa settimana (e già spuntati: sono in casa), poi distanza dei valori,
   poi minuti, poi familiarità (`doneRate`), poi id.
4. Tre in vista, «Tutte» per il resto (come `ALT_SHOWN` oggi **[codice]**). Se nessuna ricetta entra nella banda, la banda si
   allarga a ±20% e il foglio lo dice in una riga.

### 6.2 «Non mi piace» su un ingrediente

- Nel foglio della ricetta, sotto gli ingredienti, un collegamento discreto «Qualcosa non ti piace?». Apre i `Chip` degli
  ingredienti (senza dispensa: olio, sale, spezie, aglio) e la riga «Lo tolgo da menù, alternative, spesa, piano B e consigli
  del coach. Lo riattivi da Impostazioni › Gusti.» con «Togli dal piano».
- Conferma: `addExclusion(foodId, 'non-mi-piace', domani)`. Avviso: «Tolto il tonno: cambiano 2 pasti da domani» con
  «Annulla». Oggi e i giorni passati non cambiano.
- L'esclusione è per sempre, finché l'utente non la riattiva in **Impostazioni › Gusti** (pagina nuova): «Non mangio» con le
  righe degli esclusi e «Riattiva»; «Aggiungi un alimento» con la ricerca nell'archivio. Vuota: «Quando un alimento non ti
  piace, toccalo nella ricetta: sparisce da tutto il piano.»

### 6.3 Cambi ripetuti: l'app chiede, non decide

- `DayLog.swapPlanned[slot]` salva la ricetta prevista al momento del cambio (`swapRecipe` la riceve da chi chiama): così i gusti
  si imparano senza ricostruire il menù di allora.
- Un cambio da X a Y conta per ogni alimento di X che non è in Y (dispensa esclusa). `tasteSignals(state, oggi)` deriva per
  ogni alimento i cambi e le volte in cui era previsto negli ultimi 28 giorni; niente si salva (P5).
- Si chiede quando un alimento è stato cambiato **almeno 3 volte in 28 giorni e almeno nel 60% delle volte in cui era
  previsto**, non è escluso e non è stato chiesto negli ultimi 56 giorni (`Plan.tasteAsked`).
- La domanda arriva solo nel momento dell'azione: in testa alle alternative di un pasto che contiene quell'alimento, un
  `Callout` neutro: «Il tonno lo cambi spesso: 3 volte in 4 settimane. Lo tolgo dal piano?» con «Toglilo» e «Tienilo».
  «Toglilo» = esclusione con origine `cambi-ripetuti`; «Tienilo» segna la data in `tasteAsked`. Mai altrove, mai da sola.

### 6.4 L'esclusione nel menù in vigore

Oggi `dayCarbScale` chiama `mealsForDate` **[codice: `engine/nutrition.ts`]**: se `mealsForDate` sostituisse chiamando
`mealAlternatives`, che filtra alla porzione del giorno e quindi chiede `dayCarbScale`, il calcolo chiamerebbe se stesso
all'infinito. Per questo due strati, ciascuno calcolato solo da quello sotto:

1. **strato 1, menù previsto senza sostituzioni** (`plannedMealsForDate(iso, plan)`): la ricetta di `menuWeekInForce` per
   ogni pasto. Lo usano la scala di base del giorno (`baseCarbScale`, la regola di oggi applicata allo strato 1), i
   conteggi della settimana per i tetti di H3 e l'ordinamento per spesa delle alternative;
2. **strato 2, sostituzioni** (`weekSubstitutions(monday, plan)`): per una settimana intera, giorno per giorno dal lunedì e
   pasto per pasto in ordine fisso (colazione, spuntino, pranzo, merenda, cena), una ricetta con un alimento escluso (nei
   giorni da `since`) diventa la prima di `mealAlternatives`, calcolata con la scala dello strato 1 e con i conteggi della
   settimana aggiornati dalle sostituzioni già fatte. Il risultato si memorizza per (lunedì, riferimento del piano).

`mealsForDate` (unico punto, **[codice]**) dà lo strato 2 con gli scambi dell'utente sopra; `dayCarbScale` resta com'è ma
legge `mealsForDate`, cioè lo strato 2 già deciso: la catena finisce sempre (`dayCarbScale` → `mealsForDate` →
`weekSubstitutions` → strato 1). `MealEntry` riceve `excludedFrom?: string` (la ricetta tolta). Se una casella non ha alternative valide resta vuota: Oggi mostra il pasto con il
dettaglio «Scegli tu: proteine, un carboidrato, verdura» (lo schema di `PRE_SHOPPING_DETAIL` **[codice]**) e il piano B. La pagina Gusti avvisa quando un'esclusione lascia giorni sotto
un vincolo («Senza il pane integrale alcuni giorni hanno meno fibre»).

### 6.5 Piano B, coach, consigli

- `BarOption.contains?: string[]` (alimenti dell'archivio, campo locale in `data/barPlanB.ts`): le opzioni con un alimento
  escluso non compaiono.
- Coach: il contesto dice «Esclusi dall’utente: tonno, finocchi»; il prompt di sistema vieta di proporli; i validatori dei
  compiti strutturati li scartano (`escluso`).
- I consigli del giorno non nominano alimenti specifici dell'archivio come obbligatori: nessun filtro necessario.

---

## 7. Foto dei piatti

### 7.1 Da dove si scatta

- **Oggi**: tocco lungo o «…» su un pasto → il foglio della voce (`ItemActionsSheet` **[codice]**) ha una riga in più,
  «Fotografa il piatto», accanto a «Piano B al bar». Compare solo con la chiave del coach; senza rete resta con il sottotitolo
  «Serve la rete» e apre il foglio nello stato senza rete (§ 7.6).
- **Il tocco apre il selettore direttamente.** Safari su iPhone apre un `<input type="file">` solo dentro un gesto
  dell'utente: un `click()` lanciato da un effetto dopo il rendering di un foglio viene bloccato. Per questo la riga
  «Fotografa il piatto» è un `<label>` collegato all'input nascosto dentro `ItemActionsSheet`: il tocco sulla riga è il
  gesto. Il foglio della voce resta aperto mentre il selettore è su; scelto il file (`change`), si chiude e si apre `mealLog`
  già nella lettura. Se l'utente annulla il selettore non succede niente e resta il foglio della voce: nessuno stato vuoto da
  gestire. Lo stesso vale per «Scatta di nuovo» e «Ho la confezione» (§ 9.3), che sono anche loro `<label>`. Da verificare
  su iPhone (§ 14.4).
- **Coach**: sotto un messaggio dell'utente con una foto di oggi, il collegamento «Metti nel diario» apre lo stesso foglio dalla
  lettura, con il pasto più vicino all'ora non ancora segnato (cambiabile). Si usa la foto da 1.024 px se è ancora in memoria,
  altrimenti quella conservata da 720 px **[codice: `lib/image.ts`]**.
- Selettore: `<input type="file" accept="image/*">` **senza** `capture`, così su iPhone si sceglie tra fotocamera e libreria
  **[ipotesi da verificare sul telefono]**; la chat tiene il suo `capture="environment"`.

### 7.2 Lettura

Compito strutturato `foto-piatto` (§ 10.2): il coach riconosce alimenti, grammi, confidenza, cottura, olio probabile,
somiglianza al pasto previsto e un nome per il piatto. La lettura è una chiamata a sé, non un turno della chat: la cronologia
non cambia e la foto non si rimanda a ogni domanda. Timeout 45 s; fasi «ragiona» e «scrive» come nella chat **[codice]**.

### 7.3 Calcolo dei valori: il motore, non il coach

- **Alimento dell'archivio** (`foodId` di `FOODS`): i valori li calcola il motore dai valori per 100 g di `foods.ts` per i grammi
  confermati. I numeri del coach si ignorano sempre.
- **Alimento di sola stima** (`data/estimateFoods.ts`, mai nel menù né nella spesa): pizza margherita, cornetto vuoto e farcito,
  tramezzino, panino al prosciutto cotto, piadina farcita, toast, lasagna, cotoletta, patatine fritte, tiramisù, gelato,
  focaccia, prosciutto crudo e cotto, salame, mozzarella, hamburger, sushi, kebab e simili (25-35 voci), con valori per 100 g da
  tabelle CREA o BDA-IEO e la fonte nel commento, `FOOD_FACTS` compresi (i salumi hanno gruppo `carne-lavorata`: la revisione li
  conta). Si appoggia ai valori di `BAR_OPTIONS` dove c'è già una stima **[codice]**.
- **Fuori archivio**: il coach dà i valori per 100 g e il codice li controlla: kcal tra 0 e 900; proteine, carboidrati, grassi e
  fibre ≥ 0 e insieme ≤ 100 g; coerenza di Atwater |4P + 4C + 9G + 2F − kcal| ≤ 15% delle kcal + 10 (la convenzione di
  `foods.ts` **[codice]**). Fuori dai limiti l'alimento resta senza valori e la scheda chiede di sceglierne uno dall'archivio.
- Grammi tra 1 e 1.500 per alimento, al massimo 12 alimenti (lo stesso numero nel validatore, nella normalizzazione e nei
  piatti; a 12 «Aggiungi un alimento» non compare); pasto oltre 3.000 kcal scartato (tetto di `normalizeBarMeal`
  **[codice]**); oltre 1.800 o sotto 100 kcal la scheda chiede conferma in una riga.
- Porzioni di vegetali dai grammi degli alimenti con `vegPortionG`.
- **Olio e condimenti**, dove le foto sbagliano di più: domanda obbligatoria a scelta singola, «Olio e condimenti»: Niente ·
  Un filo (5 g) · Un cucchiaio (10 g) · Due cucchiai (20 g), preselezionata dal coach («Il coach dice: un cucchiaio») o senza
  preselezione se il coach risponde «non so». Con cottura «fritto» si aggiunge olio assorbito pari all'8% del peso
  dell'alimento fritto, e la riga lo dice **[ipotesi: in letteratura l'assorbimento varia molto, circa dal 5 al 15%]**. I
  condimenti visibili (grana, burro, maionese, pesto) sono alimenti della lista.
- **Incertezza dichiarata**: kcal arrotondate a 10, grammi a 5. Con almeno un alimento a confidenza bassa che pesa più del 25%
  delle kcal, i totali mostrano un intervallo (±25%): «circa 820 kcal (620-1.020)». Gli errori della stima da foto
  sull'energia sono spesso del 20-40% **[ipotesi: ordine di grandezza da verificare]**.

### 7.4 La scheda

Foglio `mealLog` (`size="large"`), sempre annullabile: niente si salva prima della conferma.

| Passo | Cosa vede l'utente |
|---|---|
| scelta | il selettore del telefono, aperto dal tocco sulla riga del foglio della voce (§ 7.1); il foglio `mealLog` si apre solo con una foto scelta |
| lettura | miniatura della foto, «Il coach guarda il piatto…», «Annulla» |
| scheda | in alto i totali (kcal grandi in Barlow, sotto proteine, carboidrati, grassi, fibre, con `NumberTicker`); l'elenco degli alimenti con nome, porzione a mano per l'archivio («1 pugno e mezzo · ≈ 225 g», `portionPhrase` **[codice]**) e stepper dei grammi (passi di 10 g sotto i 100 g, di 25 g sopra); un punto «?» sugli alimenti a confidenza bassa; «Aggiungi un alimento» (ricerca nell'archivio); la domanda sull'olio; una riga «Conta come il pranzo previsto · Cambia» oppure «Conta come pasto sostituito · Cambia» (§ 7.5) |
| conferma | pulsante «Segna il pranzo»; senza la scelta dell'olio il pulsante dice «Scegli l’olio» e porta lì (nessun pulsante disattivato) |
| fatto | il foglio diventa «Segnato: 720 kcal» con il campo «Salva tra i miei piatti» (nome proposto dal coach) e «Salva» · «No, grazie»; avviso con «Annulla» |

### 7.5 Conferma: cosa entra nel diario

La conferma scrive in una sola transazione (`setEatenMeal`) un `EatenMeal` (§ 12) in `DayLog.barMeals[slot]` (stesso campo, tipo
allargato: compatibile con i backup e con i tre lettori) e lo stato della voce `pasto:<slot>`:

| La foto o il piatto salvato è… | Stato della voce | `asPlanned` | Valori del giorno, revisione, coach |
|---|---|---|---|
| il pasto previsto | `fatto` | `true` | valgono i valori della stima al posto di quelli della ricetta |
| un altro pasto | `sostituito` | assente | valgono i valori della stima (come oggi per il bar) |

Perché: con «sostituito» l'aderenza conta 0,5 **[codice: `dayAdherence`]** e un pasto previsto fotografato, o segnato con un
piatto salvato che è proprio quel pasto, verrebbe punito. «Previsto» si decide così:

- **foto dal pasto di Oggi**: sì se il coach risponde «sì» o se `matchesPlanned` del motore trova almeno il 60% degli alimenti
  non di dispensa della ricetta prevista;
- **foto dalla chat**: sì solo con entrambi;
- **piatto salvato** (§ 8.2, offline): sì se `matchesPlanned` trova nel piatto almeno il 60% degli alimenti non di dispensa
  della ricetta prevista (stesso `foodId`).

In tutti i casi la scheda mostra «Conta come il pranzo previsto · Cambia» oppure «Conta come pasto sostituito · Cambia», e la
riga «Cambia» inverte la scelta.

Regola del pasto stimato (cambia `store.ts`): un `EatenMeal` vale con la voce `sostituito`, oppure con la voce `fatto` e
`asPlanned`; in tutti gli altri casi si toglie (`normalizeBarMeals(raw, status)`, `setItemStatus`). `eatenMeal(log, slot)` in
`engine/nutrition.ts` applica la regola ed è l'unico accessorio dei tre lettori (`dayNutritionDetail` con `onlyDone`, `dayIntake`,
il coach).

Una seconda foto dello stesso pasto sostituisce la prima; la scheda lo dice in testa («Sostituisce la stima di prima: 640
kcal»). «Annulla» rimette stato, nota e stima di prima (`restoreMeal`).

### 7.6 Errori, tutti con un'uscita utile

| Stato | Testo | Azioni |
|---|---|---|
| senza rete | «Serve la rete per leggere la foto.» | «I miei piatti» (se ce ne sono), «Piano B al bar», «Chiudi» |
| senza chiave | la riga «Fotografa il piatto» non compare | |
| modello senza uscita strutturata | la riga non compare | |
| chiave non valida, limite, credito, rete | i testi di `ERRORS` in `lib/claude.ts` **[codice]** | «Riprova» quando ha senso |
| rifiuto | «Il coach non può leggere questa foto. Prova con un’altra inquadratura.» | «Riprova», «Chiudi» |
| non è cibo (`outcome: 'non-cibo'`) | «Non vedo un piatto in questa foto.» | «Scatta di nuovo», «Chiudi» |
| foto illeggibile (`outcome: 'illeggibile'`) | «La foto non si legge bene. Scatta di nuovo, con più luce e il piatto intero.» | «Scatta di nuovo», «Chiudi» |
| tempo scaduto (45 s, `AbortController`) | il testo di rete di `ERRORS` **[codice]** | «Riprova», «Chiudi» |
| risposta non valida o incompleta | «La lettura non è venuta bene.» | «Riprova» (una seconda chiamata, poi solo «Chiudi») |

### 7.7 Cosa si conserva

La foto della stima non si salva: resta in memoria finché il foglio è aperto. Il diario tiene alimenti, grammi e valori; il
piatto salvato tiene una miniatura da 96 px (§ 8). La pagina Informazioni e privacy lo dice in una riga.

---

## 8. I miei piatti

### 8.1 Nascono da una stima confermata

Dopo «Segna» (§ 7.4) l'utente può salvare il piatto con un nome (proposto dal coach, modificabile, una riga di 40 caratteri).
Il piatto (`MyDish`, § 12) tiene gli alimenti con i grammi della porzione normale, collegati all'archivio quando si può
(`foodId`), i valori ricalcolati dal motore, le porzioni di vegetali, il pasto in cui è nato e una miniatura (ritaglio quadrato
al centro, 96 × 96 px, JPEG qualità 0,6, circa 3-5 KB **[ipotesi, da misurare]**; `thumbnail(dataUrl, 96)` in `lib/image.ts`).
Comporre un piatto a mano senza foto resta fuori da questa fase.

### 8.2 Si usano offline, senza costi

- Dal foglio della voce di un pasto in Oggi, riga «I miei piatti» (solo se ce n'è almeno uno) → foglio `mealLog` in modo piatti.
- Elenco: miniatura 44 pt, nome, «640 kcal · P 38 g» della porzione normale. **I più usati in cima**: usi contati dal diario
  (`dishUsage(dayLogs)`: i pasti con `dishId`), poi i più recenti; prima quelli nati nello stesso pasto. Campo di ricerca oltre
  8 piatti.
- Tocco su un piatto → `Segmented` Metà · Normale · Abbondante (× 0,5, × 1, × 1,5, tutto in proporzione, condimenti compresi;
  la volta dopo è già scelta l'ultima porzione) con i valori ricalcolati sotto e la riga «Conta come la cena prevista ·
  Cambia» o «Conta come pasto sostituito · Cambia» (§ 7.5) → «Segna la cena». L'`EatenMeal` ha `source: 'piatto'`, `dishId` e
  `portion`; la voce diventa `fatto` con `asPlanned` quando il piatto è il pasto previsto (`matchesPlanned`, § 7.5),
  altrimenti `sostituito`.
- Funziona senza rete e senza chiave.

### 8.3 Modifica ed eliminazione

«Modifica» nell'intestazione del foglio: rinomina, grammi (lo stesso editor della scheda della foto), elimina con conferma nella
pagina (niente `confirm()`). Eliminare un piatto non tocca il diario, che tiene la sua copia dei valori. Oltre 60 piatti il
foglio suggerisce di eliminare quelli mai usati.

### 8.4 Pronti per entrare nel menù più avanti

`dishReadyForMenu(dish)`: tutti gli alimenti collegati all'archivio, tranne condimenti sotto il 5% delle kcal.
`dishAsRecipe(dish)`: lo trasforma in una `Recipe` in grammi (unità `g`). Il collegamento al menù e alla spesa resta fuori da
questa fase; i dati sono già nella forma giusta.

### 8.5 Backup e spazio

I piatti stanno in `AppData.dishes` (stato caldo, circa 0,8 KB l'uno **[ipotesi]**); le miniature in `AppData.dishThumbs`,
nell'archivio freddo (§ 12.5). Entrambi vanno nel backup. Con `storageFull()` l'avviso che c'è già nomina anche le miniature.

---

## 9. Integratori

Oggi un integratore si scrive a mano: nome, dose in testo libero, momento e nota (`Supplement`, `SupplementEditor.tsx`
**[codice]**). Con la fase 2 l'utente non inserisce valori: li conosce il catalogo, con le fonti. Un integratore scritto a mano
continua a funzionare come oggi.

### 9.1 Il catalogo

**Sorgente**: `scripts/data/supplement-catalog.json` (49 voci, 465 sinonimi, 103 fonti, solo dati confermati o corretti da
due verifiche avversarie sulle fonti primarie), copiato identico nel repository nel passo 0 (§ 14.1) e da lì fonte di
verità; i testi e le fonti per voce, in chiaro, stanno in `docs/fase2/catalogo-integratori.md`. Unica modifica rispetto alla
copia: dose predefinita ed etichetta della vitamina D (sotto). Lo script `scripts/build-supplement-catalog.mjs` (onda 3A) scrive tre
file:

| File | Contenuto | Peso **[misura]** | Caricamento |
|---|---|---|---|
| `src/data/supplementCatalog.ts` | campi numerici e di regola: identità, sinonimi, categoria, unità, conversioni, `countsAs`, `contains`, posizione, dosi, limiti, massimi italiani, prese, calendario, momento, pasto, seduta, `withFood`, `withFat`, esami richiesti; `CATALOG_VERSION = 1`, `catalogById` | circa 41 KB (7,7 KB compressi) | con l'app (timeline, coach, controlli) |
| `src/data/supplementCatalogText.ts` | testi: prove, quando serve, cautele, interazioni, note sportive e oncologiche, antidoping, fonti, nota sul momento, testi degli esami | circa 93 KB | a richiesta, dal foglio dell'integratore |
| `src/data/supplementCatalogIds.ts` | `CATALOG_IDS` (insieme dei 49 id) e `CATALOG_VERSION` | sotto 1 KB | con l'app: lo usa `normalizeData` (§ 9.7). Lo scrive a mano l'onda 0A dal JSON, con un test che lo confronta col JSON; dall'onda 3A lo rigenera lo script |

`supplementCatalog.test.ts` rifà i controlli dello script di origine: id unici; da 2 a 4 opzioni di dose in ordine, con la
predefinita tra le opzioni; opzioni entro il limite superiore e il massimo per prodotto, salvo tre eccezioni dichiarate
(creatina 5 g, ferro 60 mg, glucosammina 1.500 mg, ciascuna con il motivo nell'etichetta dell'opzione); sinonimi senza doppioni
tra voci; tipografia; i due file generati coincidono con il JSON.

```ts
// src/data/supplementCatalog.ts (tipi; i testi stanno in CatalogText)
import type { DoseUnit, Supplement, SupplementSchedule } from '../domain/types';   // definiti una volta sola, § 12.1
export type SupplementCategory = 'vitamina' | 'minerale' | 'sport' | 'acidi-grassi' | 'proteine' | 'sonno' | 'altro';
export type SupplementStance = 'utile' | 'situazionale' | 'su-indicazione' | 'non-serve' | 'sconsigliato';
export interface CatalogDose { amount: number; unit: DoseUnit; label?: string }
export interface CatalogLimit {
  amount: number; unit: DoseUnit; source: string;
  kind: 'UL' | 'safe-level' | 'senza-rischi-fino-a';
  /** Su che cosa si calcola: tutte le fonti, solo integratori, solo forme aggiunte, solo forma preformata. */
  scope: 'totale' | 'integratori' | 'forme-aggiunte' | 'preformata';
  note?: string;
}
export interface CatalogEntry {
  id: string; name: string; aliases: string[]; category: SupplementCategory; unit: DoseUnit;
  conversions?: Record<string, number>;                         // vitamina D: { UI: 0.025 }
  countsAs?: { id: string; factor: number; note: string }[];    // calcifediolo → vitamina D × 2,5
  contains?: string[];                                          // composti: nutrienti da leggere in etichetta
  stance: SupplementStance;
  defaultDose: CatalogDose; doseOptions: CatalogDose[];
  upperLimit: CatalogLimit | null;
  formLimits?: { form: string; amount: number; unit: DoseUnit; source: string }[];
  itMax: { amount: number; unit: DoseUnit; source: string; note?: string } | null; // massimo per prodotto in Italia
  perIntakeMax?: CatalogDose; dosesPerDay?: number;
  schedule: SupplementSchedule; timing: Supplement['timing'];
  slot?: 'spuntino' | 'merenda';
  workout?: { when: 'prima' | 'dopo' | 'durante'; minutes: number };
  withFood: boolean | null; withFat: boolean;
  needsTest: { required: boolean; exams: string[] } | null;
}
export interface CatalogText {
  timingNote?: string; testWhen?: string; interference?: string;
  evidence: { level: 'forte' | 'moderata' | 'limitata' | 'insufficiente' | 'sfavorevole'; ais: 'A' | 'B' | 'C' | 'D' | null; summary: string };
  whenUseful: string; cautions: string[]; interactions: string[]; sportNotes: string; cancerNotes: string | null;
  antidoping: { risk: 'basso' | 'medio' | 'alto'; note: string };
  sources: { label: string; url: string }[];
}
```

**Contenuto**: 17 vitamine (dalla D al complesso B e al multivitaminico), 8 minerali, omega-3, 4 proteine e aminoacidi, 13
integratori per lo sport (creatina, caffeina, beta-alanina, nitrati, bicarbonato, elettroliti, carboidrati, collagene,
citrullina, HMB, ZMA, amarena, pre-workout), 2 per il sonno, 4 altri (curcuma, glucosammina, probiotici e la voce
`gruppo-d-ais` per booster, brucia grassi e sostanze a rischio doping, che non si aggiunge senza conferma esplicita). Il
catalogo distingue il **limite superiore** (UL EFSA o SCF, oppure il livello sicuro, limite fisiologico cronico, con il suo
ambito) dal **massimo per prodotto in Italia** (Ministero della Salute, limite di etichetta: per il magnesio 450 mg contro un
UL da integratori di 250 mg). Non contiene marchi.

**Vitamina D, contraddizione risolta.** L'app oggi la blocca come «da definire con l’esame» **[codice: `DEFAULT_SUPPLEMENTS`]**.
Le linee guida non chiedono l'esame per una dose di mantenimento: Endocrine Society 2024 sconsiglia il dosaggio di routine e la
Nota AIFA 96 dice che non è uno screening; l'esame serve per dosi oltre 50 µg (2.000 UI), malassorbimento o farmaci. La stessa
linea guida, tra i 19 e i 74 anni, sconsiglia l'integrazione empirica sopra la DRI (600 UI) **[fonte: Endocrine Society 2024,
raccomandazione condizionale]**: per coerenza con la fonte citata la **dose predefinita è 15 µg** (600 UI, «fabbisogno EFSA,
Endocrine Society 2024»). 25 µg resta tra le opzioni con la sua etichetta, «1000 UI · atleti da autunno a primavera (IOC)»: la
tabella sull'immunità del consenso IOC 2018 raccomanda 1.000 UI al giorno da autunno a primavera, con un sostegno giudicato
«moderate» **[fonte: Maughan 2018, IOC, verificata sul testo]**. Nella copia del catalogo nel repository cambiano quindi solo
`defaultDose` della vitamina D e l'etichetta dell'opzione da 15 µg («600 UI · fabbisogno EFSA, Endocrine Society 2024»), con
il motivo in una nota del JSON. Non previene i tumori (VITAL nullo sull'incidenza): il
catalogo lo dice nelle note oncologiche.

### 9.2 Aggiungere un integratore senza scrivere dati

Foglio `supplement` in tre passi: cerca, dose, riepilogo.

**Cerca**. `searchCatalog(query, catalog, limit = 6)` confronta la query normalizzata (minuscole; β → beta, α → alfa, ω →
omega; accenti tolti; «vit.» → vitamina, «mcg» e «ug» → µg, «omega3» → omega 3; tutto ciò che non è lettera o cifra diventa
spazio) con nome e sinonimi:

| Corrispondenza | Punti |
|---|---|
| uguale al nome o a un sinonimo | 100 |
| il nome o un sinonimo inizia con la query (almeno 2 caratteri) | 80 |
| tutte le parole della query, in qualunque ordine | 60 |
| una parola a distanza di modifica 1 da una parola del sinonimo (parole di almeno 5 lettere) | 40 |

A parità vincono le posizioni più utili (utile, situazionale, poi le altre), poi il nome più corto; i composti salgono sopra i
singoli nutrienti («vitamina B» mostra prima il complesso B). **Query composte**: si divide sempre su «+», «&» e « con »; su
« e » solo se la parte a destra non è una lettera sola e ogni parte ottiene almeno 80 punti, perché «e» è anche la vitamina
(«vitamina e», «vit. e e selenio»). Se ogni parte ha un risultato da 80 o più, il primo risultato è un prodotto composto con
quei componenti alle dosi predefinite, marcati «stima». Esempi nel test 40: «vitamina e» → vitamina E; «vitamina c e
vitamina e» → composto con C ed E; «magnesio e potassio» → composto.
Senza risultati sopra 40: «Non lo conosco ancora. Fotografa l’etichetta o scrivilo a mano.» Sempre visibile «Ho la confezione»
(foto dell'etichetta, solo con la chiave). Ogni risultato mostra nome, categoria e una pillola con la posizione («Utile», «In
situazioni precise», «Solo su indicazione», «Di solito non serve», «Sconsigliato»).

**Dose**. Scelte a tasselli (`CompactChoice` **[codice: `features/impostazioni/components/controls.tsx`]**), una per opzione del catalogo, con la predefinita già
scelta e la sua etichetta in piccolo («600 UI · fabbisogno EFSA, Endocrine Society 2024»). «Altra dose» apre «Leggila
dall’etichetta» (consigliata) o un campo numerico con l'unità della voce e, se ci sono conversioni, il selettore dell'unità
(«2000 UI = 50 µg»). Frequenza «Al giorno · A settimana · Al mese» solo per vitamina D e calcifediolo. Dosi per peso (bicarbonato,
caffeina con il tetto di 3 mg/kg **[fonte: AIS]**) dal peso di riferimento (`referenceWeightKg` **[codice]**), mostrate in
grammi. `formatDose(entry, amount)` scrive il testo di `Supplement.dose` che oggi l'utente scriveva a mano: timeline,
calendario e coach non cambiano.

**Riepilogo**. Momento proposto dal catalogo («Con la colazione: la vitamina D si assorbe meglio con un pasto che contiene
grassi»), cambiabile; avvisi; «Salva». Al salvataggio: oltre il massimo per prodotto, informazione («Più del massimo ammesso in
Italia per un integratore: è un prodotto estero?»); oltre il limite superiore da solo, conferma (§ 9.4); unità non convertibile,
errore con l'unità attesa.

### 9.3 Foto dell'etichetta letta dal coach

1. «Ho la confezione» apre fotocamera o libreria e accetta fino a 2 foto (fronte e tabella), ridotte da `prepareImage`
   **[codice]**. Le foto non si salvano.
2. Compito strutturato `etichetta` (§ 10.2): composizione per dose, colonna usata, dosi al giorno, frequenza, avvertenze e
   certificazioni stampate.
3. `validateLabelReading(reading, catalog)` controlla ogni componente:

| Codice | Regola | Esito |
|---|---|---|
| `struttura` | numeri finiti > 0, enum validi | scarta il componente o tutta la lettura |
| `voce` | `catalogId` esistente; se null, `searchCatalog(nome + forma)` con almeno 80 punti | riconosciuto, oppure «non riconosciuto» con il nome letto (descritto, senza limiti) |
| `unita` | convertibile nell'unità della voce (µg, mg, g; UI con le conversioni; mmol per i nitrati) | converte, oppure riga incerta |
| `forma-e` | vitamina E in UI. **Per i limiti** si usa la stessa base dell'UL EFSA, che vale per tutte le forme stereoisomeriche dell'α-tocoferolo (massa) **[fonte: EFSA 2024]**: naturale × 0,67 mg, sintetica (dl-, all-rac-) × 0,91 mg, forma ignota × 0,91 (il fattore più prudente) **[fonte: equivalenze USP dell'UI]**. I fattori del catalogo su base 2R (naturale 0,67, sintetica 0,45 **[fonte: IOM 2000, esempi LPI]**) restano solo nel testo informativo: «400 UI sintetiche: circa 364 mg per il limite, 180 mg di attività» | converte e lo dice |
| `colonna` | per dose × dosi al giorno; per 100 g con la dose in grammi | tutto «al giorno»; senza dosi al giorno chiede «Quante ne prendi al giorno?» 1 · 2 · 3 |
| `plausibile` | oltre 10 volte il maggiore tra limite superiore e massimo italiano | «Valore insolito: controlla la riga» (di solito µg letti come mg) |
| `itmax`, `ul`, `forma-limite`, `bassa-certezza` | come in § 9.4 | informazione, conferma, avviso, riga evidenziata |

4. Conferma: «Ho letto questo. È giusto?», una riga per componente (voce riconosciuta, quantità al giorno, punto colorato se
   incerta), gli avvisi, il momento. «È giusto» salva; una riga sbagliata si tocca e si corregge tra le opzioni della voce o con
   un numero. La conferma non salta i controlli.
5. Salvataggio: `catalogId` della voce principale (il primo componente riconosciuto, o la voce composta che li contiene),
   `product` con la composizione completa, `amount` della voce principale.

### 9.4 Somma degli apporti e limiti

- `dailyComponents(s, catalog, iso)`: componenti al giorno nell'unità della voce (dal prodotto letto, altrimenti dalla dose
  scelta; `countsAs` aggiunge il contributo convertito). Calendario: `giornaliero` tutti i giorni; `giorni-alterni` dalla data di
  inizio; `con-la-seduta` i giorni con palestra o calcio; `periodi` dentro il periodo. Le dosi a settimana o al mese contano
  nel giorno della presa per il giorno peggiore e come 1/7 o 1/30 per la media.
- `supplementTotals(plan, catalog)`: per nutriente media giornaliera sulla settimana tipo e giorno peggiore. Gli UL di vitamine e
  minerali sono cronici: si confronta la **media**; caffeina (400 mg EFSA) e massimi per presa: il **giorno peggiore**. Alla
  caffeina si somma il caffè (`Plan.coffeePerDay`, chiesto solo quando si aggiunge un prodotto con caffeina) ×
  `ESPRESSO_CAFFEINE_MG` (80 mg, la stessa costante del § 4.4); il testo dice «circa», perché un espresso sta tra 60 e 110 mg.
  I 107 mg della regola sul sonno (`sonno:caffeina`) sono un'altra cosa: la dose dello studio, non il contenuto di una tazza.
- Livelli: **oltre** = totale degli integratori ≥ 100% del limite; **vicino** = ≥ 70% se il limite vale per tutte le fonti (il
  cibo si aggiunge), ≥ 90% se vale per i soli integratori **[ipotesi di progetto]**. Ritmo non ha i micronutrienti dei cibi: per
  i limiti «totale» il testo dice sempre «dagli integratori 9,5 mg su 12; il cibo si aggiunge».
- `checkSupplements(state, catalog): SupplementCheck[]`:

| Codice | Quando | Gravità |
|---|---|---|
| `ul:<id>` | totale oltre il limite | conferma |
| `vicino:<id>` | totale vicino al limite | informazione |
| `forma:niacina` | acido nicotinico, o forma ignota, oltre 10 mg | avviso |
| `itmax:<id>:<supId>` | un prodotto oltre il massimo italiano | informazione |
| `presa:<id>` | una presa oltre `perIntakeMax` (calcio oltre 500 mg, beta-alanina oltre 1,6 g) | avviso con la proposta di dividere |
| `esame:<id>` | `needsTest.required` senza esame né prescrizione | conferma |
| `fumo:beta-carotene` | beta-carotene con `Profile.smoker` «sì» o «ex» (chiesto una volta, solo allora) | conferma |
| `gruppo-d` | voce `gruppo-d-ais` o antidoping a rischio alto | conferma |
| `sconsigliato:<id>` | posizione «sconsigliato» | avviso |
| `cancro:<id>` | acido folico da 800 µg, vitamina E da 400 UI, beta-carotene da 20 mg, selenio da 200 µg (avviso); B12 oltre 55 µg (informazione: solo un sospetto osservazionale) **[fonte: AFPPS, NORVIT/WENBIT, SELECT, ATBC, CARET, Brasky 2017]** | avviso o informazione |
| `sonno:caffeina:<data>` | presa di caffeina a meno di 8,8 h dal letto con fino a 107 mg, o meno di 13,2 h oltre **[fonte: Gardiner 2023]** | avviso sul giorno |
| `vitc:adattamenti` | vitamina C da integratori di almeno 1 g al giorno **[fonte: Paulsen 2014; AIS]** | avviso |
| `omega3:fa` | EPA+DHA oltre 1 g al giorno da più di 12 settimane **[fonte: Gencer 2021, popolazione diversa]** | informazione |
| `ferro:distanza` | ferro con calcio o caffè nello stesso momento | avviso (i promemoria li separano già) |

- «Conferma» chiede al salvataggio «Aggiungilo lo stesso» o «Annulla»; fino alla conferma l'integratore non entra nella
  giornata. La conferma si salva in `acknowledged` con il codice e non torna finché il codice non cambia. «Avviso» e
  «informazione» compaiono nella scheda e nell'elenco, mai come finestre. Avvisa, non blocca: può esserci una prescrizione
  (`reason: 'prescrizione'` toglie «di solito non serve»).
- In Impostazioni › Integratori, sotto l'elenco, la card «Quanto prendi in tutto» elenca solo i nutrienti in più di un prodotto
  o vicini al limite («Vitamina B6 · 11,7 mg su 12 mg», barra sul limite, prodotti e fonte dietro un tocco); se tutto è sotto il
  70%, una riga: «Nessun nutriente vicino ai limiti». Il piede dell'elenco dice: «Nessun integratore previene i tumori: servono
  per una carenza o su indicazione del medico.»

### 9.5 Promemoria con il pasto

`supplementMoments(iso, state, catalog)` sostituisce il raggruppamento per `timing` in `buildTimeline` **[codice]**:

1. **Quali**: attivi, con dose, nel calendario del giorno, non in attesa di conferma.
2. **Dove**, prima regola che vale: `workout` e una seduta oggi (palestra, calcio, fisioterapista) → ora della seduta meno i
   minuti, o la sua fine; `slot` → l'orario di quel pasto; altrimenti `timing`, come oggi.
3. **Grassi**: con `withFat` e meno di 10 g di grassi nella ricetta del pasto scelto, il promemoria va nel pasto con più grassi
   tra pranzo e cena **[ipotesi: lo studio confrontava un pasto con il 30% delle kcal da grassi con uno senza]**. Le colazioni
   di Ritmo hanno 15-18 g di grassi alla porzione del giorno di palestra e vanno bene **[misura]**.
4. **Distanze**: ferro a più di 2 ore da caffè e latticini (allo spuntino se la colazione ha latte, yogurt, ricotta o cappuccino);
   calcio mai con il ferro; zinco mai con il ferro ad alte dosi.
5. **Più prese**: 2 prese a colazione e cena; 4 a colazione, pranzo, merenda e cena (beta-alanina).
6. **Nessuna voce nuova in Oggi (P6).** Restano solo le voci di oggi, con gli stessi id: `integratori`, `integratori:pranzo`,
   `integratori:cena`, `integratori:sera` (i segni dei giorni passati non cambiano). Le prese che cadono altrove diventano
   **righe nel dettaglio di una voce che c'è già**:
   - legate alla seduta (`workout`): una riga nel dettaglio della voce della palestra, del calcio o del fisioterapista,
     «Prima, alle 16:00: collagene 15 g con un frutto», «Dopo: proteine 25 g»;
   - allo spuntino o alla merenda (`slot`, oppure spostate dalle distanze del punto 4, come il ferro): una riga nel
     dettaglio di quel pasto, «Con lo spuntino: ferro, lontano dal caffè».

   Queste prese si segnano insieme al «fatto» della voce che le ospita. Il dettaglio delle voci `integratori…` è l'elenco di
   oggi più la regola solo se serve («con un frutto, lontano dal caffè»).
7. `minima:integratori`, il calendario (`ics.ts`, una riga nella descrizione dell'evento che ospita la presa) e il coach usano
   gli stessi momenti.

### 9.6 Esami

- **Prima di cominciare**: con `needsTest.required` (ferro, rame, calcifediolo) il salvataggio chiede «Hai un esame che lo
  indica?»: «Me l’ha prescritto il medico» (`reason: 'prescrizione'`), «Sì, ho l’esame» (esame, data, valore facoltativo in
  `Supplement.test`), «No» (una frase sul perché e «Aggiungilo lo stesso»).
- **Esami facoltativi** (vitamina D, B12, omega-3, B6, zinco): nella scheda la riga «Esame utile se…». Nessun promemoria di
  routine.
- **Lettura del risultato**, solo con soglie verificate: 25(OH)D secondo la Nota AIFA 96 (sotto 12 ng/mL carenza; sotto 20 con
  farmaci o malassorbimento; sotto 30 nell'osteoporosi da trattare; nmol/L convertiti con 1 ng/mL ≈ 2,5 nmol/L). Testo solo
  informativo: «La dose la decide il medico». Gli altri valori si salvano e vanno al coach senza soglie nostre.
- **Esami falsati**: «Esami del sangue in vista?» nell'elenco degli integratori mostra gli integratori attivi che falsano un
  esame (creatina: la creatinina sale davvero e il filtrato può risultare sottostimato **[fonte: Antonio 2021]**; biotina e
  composti con biotina: immunodosaggi falsati) con un testo copiabile per il medico («Prendo creatina monoidrato 3 g al giorno
  dal 1º marzo»).
- **Revisione**: `reviewAt` (ferro a 3 mesi o alla data del medico, omega-3 index a 12 settimane, fine dei periodi) riporta la
  scheda nella riga «Da completare» di Oggi, che esiste già **[codice]**.
- Nessuna pagina Esami: l'esame vive nell'integratore a cui serve.

### 9.7 Migrazione e predefiniti

- **Nessuna dose cambia da sola.** `normalizeData` tiene i campi nuovi solo se validi (`catalogId` esistente, `amount` finito e
  maggiore di 0 con un'unità ammessa, almeno un componente valido); se un campo non è valido si scarta e l'integratore torna
  «scritto a mano».
- `migrateSupplement(s, catalog)` restituisce una proposta: un risultato da 80 o più → voce proposta; più risultati → domanda
  («Quali proteine?» tra siero, caseina e vegetali, con «Fotografa l’etichetta» per prima); nessuno → resta scritto a mano. `parseDose(s.dose, entry)` legge
  «5 g», «1000 UI», «1-2 g di EPA+DHA» (l'opzione più vicina all'estremo basso), «2 capsule» (→ foto), «da definire» (→ dose
  predefinita).
- La voce «Rivedi gli integratori: ora conosco le dosi giuste» prende il posto, nella riga «Da completare» di Oggi, del
  promemoria della dose da definire (`supplementDoseDue` **[codice]**): non è una riga in più né una card. Si apre anche da
  Impostazioni › Integratori. Una domanda per integratore con la proposta
  già scelta: «Usa questa dose», «Tieni la tua», «Fotografa l’etichetta». A revisione finita `catalogVersion` si segna e la voce
  non torna finché il catalogo non cambia versione.
- Predefiniti per i nuovi utenti (`data/defaults.ts`), stessi id di oggi con `catalogId`: `creatina` 3 g (etichetta italiana e
  claim UE; l'AIS indica 3-5 g), `omega3` 600 mg di EPA+DHA (mantenimento AIS 500-600 mg), `vitamina-d` 15 µg (§ 9.1), tutti
  con la colazione.
- `normalizeData` riconosce un `catalogId` con `CATALOG_IDS` (`data/supplementCatalogIds.ts`, § 9.1), che esiste dall'onda 0:
  la normalizzazione non aspetta l'onda 3A e non dipende dal catalogo grande.

### 9.8 Fuori da questa fase

Riconoscimento di prodotti fuori catalogo con la ricerca web del coach (richiede la ricerca abilitata nella console
dell'organizzazione della chiave e costa per ricerca; i componenti non riconosciuti di un'etichetta restano «descritti» senza
limiti); pagina Esami; banca dati dei marchi; micronutrienti degli alimenti.

---

## 10. Coach

### 10.1 Forma delle chiamate strutturate

Unico punto di rete: `lib/claudeTasks.ts`, che riusa `loadSdk`, `classifyError`, `modelSupport`, `FALLBACK_BETA` e `imageBlock`
di `lib/claude.ts` (da esportare) **[codice]**.

```ts
const stream = client.beta.messages.stream({
  model,                                                     // 'claude-opus-5-5' predefinito
  max_tokens: task.maxTokens,                                // il pensiero conta nei max_tokens
  ...(support.fallback ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
  system: [
    { type: 'text', text: task.system, cache_control: { type: 'ephemeral' } },  // stabile, oltre 512 token
    { type: 'text', text: context },                                             // variabile
  ],
  messages: [{ role: 'user', content: [...images.map(imageBlock), { type: 'text', text: request }] }],
  ...(support.adaptiveThinking ? { thinking: { type: 'adaptive' as const } } : {}),
  output_config: { ...(support.effort ? { effort: task.effort } : {}), format: { type: 'json_schema', schema: task.schema } },
}, { signal });
const final = await stream.finalMessage();
// stop_reason 'refusal' → rifiuto; 'max_tokens' → incompleta; altrimenti JSON.parse del testo → task.validate
```

Fatti su cui si regge **[doc]**:
- `output_config` accetta `effort` e `format` insieme (`BetaOutputConfig` nell'SDK 1.3.0); l'uscita strutturata funziona con lo
  streaming e con il pensiero;
- su Claude Opus 5.5 il pensiero non si spegne, l'effort predefinito è `medium` (va scritto sempre) e `tool_choice` forzato
  restituisce 400: niente strumenti forzati, si usa l'uscita strutturata;
- gli schemi non accettano `minimum`, `maximum`, `minLength`, `maxLength` né vincoli complessi sugli array; ogni oggetto ha
  `additionalProperties: false`; i limiti numerici li controlla il codice;
- uno schema nuovo ha un costo di compilazione alla prima richiesta e poi resta in cache 24 ore: gli `enum` vanno bene solo con
  elenchi fissi (id dell'archivio degli alimenti, id del catalogo degli integratori, che cambiano solo con una versione
  dell'app); i candidati che cambiano a ogni chiamata vanno nel testo come stringhe e li controlla il validatore;
- l'uscita strutturata non è compatibile con le citazioni (400);
- `stop_reason: 'refusal'` si controlla prima del contenuto, come fa già `streamCoachReply` **[codice]**;
- cache del prompt: prefisso minimo 512 token su Opus 5.5, durata 5 minuti, scrittura 1,25 volte il prezzo d'ingresso, lettura
  0,20 $ per milione. Le foto arrivano a ore di distanza: la cache aiuta solo i «Riprova».

`modelSupport` riceve `structuredOutputs` (vero su Opus 5.5, 5, 4.8, Sonnet 5.5 e 5, Haiku 5.5 e 4.5, famiglia Fable). Senza,
le righe che usano un compito strutturato non compaiono. La combinazione di `output_config.format` con `fallbacks: 'default'` è
da provare con una chiave vera prima dell'onda 1 (§ 15): se non regge, i compiti strutturati partono senza fallback e il
rifiuto resta gestito.

```ts
type TaskResult<T> =
  | { ok: true; value: T; warnings: string[]; model: string | null; fallback: boolean; usage: CoachUsageDelta }
  | { ok: false; kind: CoachErrorKind | 'rifiuto' | 'incompleta' | 'non-valida'; message: string };
export function runStructuredTask<T>(task: StructuredTask<T>, opts: TaskOptions): Promise<TaskResult<T>>;
```

### 10.2 Compiti nuovi

| Compito | Quando | Effort **[ipotesi, da misurare su 20 casi veri]** | `max_tokens` | Ingresso | Uscita | Validazione principale | Senza rete o chiave |
|---|---|---|---|---|---|---|---|
| `foto-piatto` (A) | scatto dal pasto o «Metti nel diario» | `medium`; `low` se la qualità regge | 8.000 | foto 1.024 px; pasto, tipo di giorno, ricetta prevista con gli alimenti; elenco dell'archivio e delle sole stime nel prompt di sistema | schema 10.3 | id esistenti; grammi 1-1.500; ≤ 12 alimenti; `per100g` solo fuori archivio e con Atwater; esclusi ammessi (è ciò che si è mangiato) | la riga non compare o dice «Serve la rete»; restano i miei piatti e il piano B |
| `etichetta` (F) | «Ho la confezione» | `medium`; `low` se la qualità regge | 8.000 (una sola nuova prova a 16.000 con `max_tokens`) | 1-2 foto; voce del catalogo se scelta | schema 10.4 | § 9.3 | dose dal catalogo o numero dall'elenco |
| `blocco` (C) | dopo la nascita di una proposta di blocco | `medium` | 16.000 | scheletro del motore, candidati per esercizio già filtrati per sicurezza, ultime 8 sedute in breve, dolore per zona, obiettivo e fase | schema 10.5 | ogni ritocco rivalidato con `validateWeek`; id solo tra i candidati; ≤ 8 ritocchi | proposta del motore |
| `menu` (C) | dopo la nascita di una proposta di menù | `low` | 8.000 | settimana generata, fino a 6 candidati validi per casella, gusti dedotti (cambi, esclusioni) | schema 10.6 | `validateMenuWeek` dopo ogni ritocco, in ordine; ≤ 4 ritocchi | proposta del motore |

Il coach non può: salvare niente; dare i valori di un alimento dell'archivio; cambiare fase, qualità, obiettivi, minimo di
carboidrati o proteine; usare nel menù alimenti fuori archivio o esclusi; aggiungere impatti con la tibia ferma; superare i
limiti; togliere i pavimenti o il fisioterapista; scendere sotto RIR 2 per le gambe in stagione; sbloccare uno stadio del rientro;
cambiare dosi di integratori; fare diagnosi.

### 10.3 Schema della foto

```json
{
  "type": "object", "additionalProperties": false,
  "required": ["outcome", "items", "cooking", "oil", "matchesPlanned", "dishName", "note"],
  "properties": {
    "outcome": { "type": "string", "enum": ["piatto", "non-cibo", "illeggibile"] },
    "items": { "type": "array", "items": {
      "type": "object", "additionalProperties": false,
      "required": ["label", "foodId", "grams", "confidence", "role", "per100g"],
      "properties": {
        "label": { "type": "string" },
        "foodId": { "anyOf": [{ "type": "string", "enum": ["<id di FOODS e di ESTIMATE_FOODS, fissi per versione>"] }, { "type": "null" }] },
        "grams": { "type": "number" },
        "confidence": { "type": "string", "enum": ["bassa", "media", "alta"] },
        "role": { "type": "string", "enum": ["alimento", "condimento"] },
        "per100g": { "anyOf": [{ "type": "null" }, { "type": "object", "additionalProperties": false,
          "required": ["kcal", "proteinG", "carbG", "fatG", "fiberG"],
          "properties": { "kcal": { "type": "number" }, "proteinG": { "type": "number" }, "carbG": { "type": "number" },
                          "fatG": { "type": "number" }, "fiberG": { "type": "number" } } }] }
      } } },
    "cooking": { "type": "string", "enum": ["crudo", "bollito", "vapore", "forno", "padella", "griglia", "fritto", "misto", "non-so"] },
    "oil": { "type": "string", "enum": ["niente", "filo", "cucchiaio", "due-cucchiai", "non-so"] },
    "matchesPlanned": { "type": "string", "enum": ["si", "in-parte", "no", "non-so"] },
    "dishName": { "type": "string" },
    "note": { "type": "string" }
  }
}
```

Tutti i campi sono richiesti, con `null` dove manca il dato: una forma sola da validare. Il prompt di sistema (stabile, in
cache) contiene le regole e l'elenco `id · nome · stato in cui si pesa` dell'archivio e delle sole stime: grammi nello stato in
cui si mangia (riso cotto, legumi sgocciolati), olio non visibile solo in `oil`, nessun valore per gli alimenti dell'archivio,
`per100g` solo fuori archivio, nome del piatto in due-quattro parole italiane, nessun consiglio.

### 10.4 Schema dell'etichetta

```json
{
  "type": "object", "additionalProperties": false,
  "required": ["outcome", "reason", "productName", "form", "serving", "servingsPerDay", "frequency", "components", "labelWarnings", "certifications"],
  "properties": {
    "outcome": { "type": "string", "enum": ["letta", "parziale", "illeggibile", "non-integratore"] },
    "reason": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
    "productName": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
    "form": { "type": "string", "enum": ["compresse", "capsule", "polvere", "gocce", "liquido", "bustine", "gommose", "altro"] },
    "serving": { "type": "object", "additionalProperties": false, "required": ["amount", "unit", "text"],
      "properties": { "amount": { "type": "number" },
        "unit": { "type": "string", "enum": ["compressa", "capsula", "bustina", "misurino", "g", "mL", "goccia", "dose"] },
        "text": { "type": "string" } } },
    "servingsPerDay": { "anyOf": [{ "type": "number" }, { "type": "null" }] },
    "frequency": { "type": "string", "enum": ["giorno", "settimana", "mese", "non-indicata"] },
    "components": { "type": "array", "items": { "type": "object", "additionalProperties": false,
      "required": ["name", "form", "amount", "unit", "basis", "catalogId", "confidence"],
      "properties": {
        "name": { "type": "string" },
        "form": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
        "amount": { "type": "number" },
        "unit": { "type": "string", "enum": ["µg", "mg", "g", "UI", "UFC", "mL", "mmol"] },
        "basis": { "type": "string", "enum": ["per-dose", "per-dose-giornaliera", "per-100-g"] },
        "catalogId": { "anyOf": [{ "type": "string", "enum": ["<49 id del catalogo>"] }, { "type": "null" }] },
        "confidence": { "type": "string", "enum": ["alta", "media", "bassa"] } } } },
    "labelWarnings": { "type": "array", "items": { "type": "string" } },
    "certifications": { "type": "array", "items": { "type": "string", "enum": ["informed-sport", "informed-choice", "koelner-liste", "altra"] } }
  }
}
```

Prompt di sistema: trascrivere, non consigliare; per ogni principio attivo nome, forma chimica se scritta, quantità e unità; la
colonna della dose giornaliera se c'è; µg per mcg, UI per IU; per i minerali l'elemento, non il sale; per gli omega-3 EPA e DHA
separati, non l'olio; `catalogId` solo se corrisponde, senza indovinare la forma; confidenza bassa per cifre sfocate, mai
completare cifre che non si vedono; avvertenze parola per parola; solo le certificazioni che si vedono.

### 10.5 Schema del blocco

```json
{
  "type": "object", "additionalProperties": false, "required": ["summary", "edits"],
  "properties": {
    "summary": { "type": "string" },
    "edits": { "type": "array", "items": { "anyOf": [
      { "type": "object", "additionalProperties": false, "required": ["op", "slot", "week", "exerciseId", "with", "reason"],
        "properties": { "op": { "const": "sostituisci" }, "slot": { "type": "string" },
          "week": { "anyOf": [{ "type": "integer" }, { "type": "null" }] },
          "exerciseId": { "type": "string" }, "with": { "type": "string" }, "reason": { "type": "string" } } },
      { "type": "object", "additionalProperties": false, "required": ["op", "slot", "week", "exerciseId", "sets", "reason"],
        "properties": { "op": { "const": "serie" }, "slot": { "type": "string" },
          "week": { "anyOf": [{ "type": "integer" }, { "type": "null" }] },
          "exerciseId": { "type": "string" }, "sets": { "type": "integer" }, "reason": { "type": "string" } } },
      { "type": "object", "additionalProperties": false, "required": ["op", "slot", "order", "reason"],
        "properties": { "op": { "const": "ordine" }, "slot": { "type": "string" },
          "order": { "type": "array", "items": { "type": "string" } }, "reason": { "type": "string" } } },
      { "type": "object", "additionalProperties": false, "required": ["op", "slot", "exerciseId", "note"],
        "properties": { "op": { "const": "nota" }, "slot": { "type": "string" },
          "exerciseId": { "type": "string" }, "note": { "type": "string" } } }
    ] } }
  }
}
```

`serie` vale ±1 rispetto allo scheletro; `ordine` non può spostare sprint e salti dopo la forza né Nordic e Copenhagen prima
(R9); `sostituisci` solo verso un candidato elencato per quell'esercizio; `week` null = tutte le settimane.

### 10.6 Schema del menù

```json
{
  "type": "object", "additionalProperties": false, "required": ["summary", "edits"],
  "properties": {
    "summary": { "type": "string" },
    "edits": { "type": "array", "items": { "type": "object", "additionalProperties": false,
      "required": ["day", "slot", "recipeId", "reason"],
      "properties": { "day": { "type": "string", "enum": ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato", "domenica"] },
        "slot": { "type": "string", "enum": ["colazione", "spuntino", "pranzo", "merenda", "cena"] },
        "recipeId": { "type": "string" }, "reason": { "type": "string" } } } }
  }
}
```

Il giorno è un nome, non un intero: `Weekday` ha 0 = lunedì **[codice: `weekdayOf`]**, e un intero lascerebbe al modello il
dubbio tra 0-6 e 1-7. Il validatore traduce il nome in `Weekday` (`MenuEdit.day`); un `enum` di stringhe è ammesso
dall'uscita strutturata **[doc]**.

### 10.7 Validazione e ripiego

- I validatori non lanciano mai eccezioni e non accettano mai valori fuori dai limiti, con qualunque JSON (test a proprietà).
- Ritocchi: copia, applicazione, nuova validazione; se aggiungono una violazione dura finiscono in `rejected` con il
  `message` della violazione; gli altri si applicano nell'ordine ricevuto.
- Testi del coach (sintesi, motivi): `tidyReply` **[codice]**, al massimo 140 caratteri per motivo e 280 per la sintesi,
  tagliati a parola; stessa tipografia dell'app.
- Ripiego: ogni funzione con il coach ha il percorso del solo motore, tranne la lettura delle foto (decisione dell'utente).
  Rifiuto, risposta incompleta o non valida: per le foto un «Riprova» (una seconda chiamata), per le proposte vale il motore.

### 10.8 Costi

Prezzi di Claude Opus 5.5: 4 $ per milione di token in ingresso, 20 $ in uscita, 0,20 $ per le letture dalla cache **[doc]**. Una
foto da 1.024 × 768 vale circa 1.000-1.100 token **[ipotesi: commento di `lib/image.ts`, da verificare con `countTokens`]**.

| Compito | Ingresso | Uscita, pensiero compreso | A chiamata **[ipotesi]** | Al mese |
|---|---|---|---|---|
| foto | circa 4.000 (foto, sistema di circa 2.500, contesto) | 1.200-2.700 | 4-7 centesimi | 2,5-4,5 $ con due foto al giorno || etichetta | 4.000-5.000 | 800-2.000 | 3-6 centesimi | una tantum |
| blocco | 8.000-12.000 | 3.000-6.000 | 10-17 centesimi | circa 0,15 $ |
| menù | 5.000-7.000 | 1.500-3.000 | 5-9 centesimi | 0,2-0,4 $ |

`Settings.coachUsage` registra per mese i token veri dall'`usage` delle risposte (chat compresa): la pagina del coach mostra
«Questo mese: circa 3,20 $» per i modelli di cui il codice conosce il prezzo, altrimenti i token. La stima della pagina di
attivazione (oggi 7-12 $ al mese **[codice]**) diventa «7-12 $ al mese con la chat, 3-5 $ in più con due foto al giorno».

### 10.9 Contesto e prompt della chat

- Prompt di sistema (`COACH_SYSTEM_PROMPT`): le quattro voci di prevenzione della patch; il divieto di proporre gli alimenti
  esclusi; «Non cambi il piano: proponi; i cambi passano dalle proposte dell’app»; sugli integratori «Non fai diagnosi e non
  prescrivi farmaci. Sugli integratori usi solo i dati del catalogo riportati nel contesto (dosi, limiti, prove, fonti) e non ne
  proponi di nuovi di tua iniziativa. Rimanda al medico per ferro, calcifediolo, la correzione di una carenza e le dosi oltre i
  massimi.»; sulla creatina «il peso può salire di 1-2 kg per l’acqua nei muscoli (AIS), meno con 3 g al giorno senza carico
  (UEFA)» al posto di «0,5-1 kg» **[codice: riga da correggere]**.
- Contesto (`buildCoachContext`): esclusioni; fase, blocco («settimana 2 di 4, carico»), variante di oggi e perché; per ogni
  integratore nome, dose, momento, posizione del catalogo e controlli attivi; l'esame collegato a un integratore (nome, data,
  valore); i pasti stimati di oggi con la provenienza. Le zone di dolore restano solo nel contesto, mai nel prompt di sistema
  **[codice]**.

---

## 11. Interfaccia

### 11.1 Dove vive ogni funzione

| Funzione | Ingresso | Superficie | Nuova? |
|---|---|---|---|
| foto del piatto (A) | Oggi › tocco lungo o «…» sul pasto › «Fotografa il piatto»; Coach › «Metti nel diario» | foglio `mealLog`, modo foto | foglio nuovo; una riga nel foglio della voce; un collegamento nella chat |
| i miei piatti (B) | stesso foglio della voce › «I miei piatti» (con almeno un piatto) | foglio `mealLog`, modo piatti | foglio nuovo; una riga |
| cambia il pasto (D) | foglio della ricetta › Alternative; Settimana › Menù › cambio | `RecipeSheet`, `SwapSheet` | ordinamento nuovo |
| non mi piace (D) | foglio della ricetta › «Qualcosa non ti piace?» | dentro `RecipeSheet` | blocco dietro un tocco |
| gusti (D) | Impostazioni › Piano › Gusti | pagina nuova | sì |
| obiettivi su tre livelli (C) | Impostazioni › Piano › Obiettivi | pagina nuova; la pagina di oggi «Obiettivi» si chiama «Calorie e macro» | sì |
| proposta (C) | revisione, Allenamento, Settimana, Obiettivi, Storico | foglio `planProposal` | sì |
| storico del piano (C) | Impostazioni › Obiettivi › «Storico del piano»; Allenamento › «Blocchi precedenti» | pagina nuova | sì |
| giorno adattato (C) | lettore della seduta; dettaglio della palestra in Oggi | testo e un `Callout` nel lettore | no |
| menù della settimana dopo (C) | Settimana › Spesa (dal venerdì) e Menù della settimana dopo | card annidata e punto ambra sui pasti cambiati | in parte |
| misure della prevenzione (E) | Progressi › revisione | righe in «Da sapere» e tre domande | in parte |
| integratori (F) | Impostazioni › Piano › Integratori | pagina rifatta + foglio `supplement` | in parte |
| rifinitura e costi del coach | Impostazioni › Coach | un interruttore e una riga | in parte |

### 11.2 Oggi: cosa cambia e cosa no

Non cambiano: struttura, card, anello, Adesso, timeline, tracker, consiglio del giorno, numero di elementi interattivi in
vista (test, § 13.10). Cambiano solo:

- il dettaglio di un pasto con una stima dice la provenienza: «Dalla foto · 720 kcal», «Il mio piatto: pasta al pesto · 640
  kcal» (il bar resta com'è);
- il dettaglio della palestra dice la variante quando non è piena: «Seduta B ridotta · 40 min»; con un blocco attivo il titolo
  resta quello della seduta;
- il foglio della voce di un pasto ha al massimo due righe in più, solo quando servono: «Fotografa il piatto» (un `<label>`
  che apre il selettore, § 7.1) e «I miei piatti»;
- la riga «Da completare» può proporre «Rivedi gli integratori» al posto del promemoria della dose da definire;
- il dettaglio della spesa del sabato dice «Prima guarda il menù nuovo» quando una proposta è aperta;
- l'avviso al salvataggio del controllo del mattino, se la variante non è piena, dice perché: «Seduta B ridotta: 5 h 50 a letto
  ed energia bassa»;
- il dettaglio della palestra, del calcio o di uno spuntino può avere una riga di integratori («Prima, alle 16:00: collagene
  15 g»), solo per chi ne ha uno legato a quel momento (§ 9.5): nessuna voce nuova.

### 11.3 Fogli nuovi

**`mealLog`** (`size="large"`, modi `foto` e `piatti`): passi, stati e testi in § 7.4, § 7.6 e § 8.2.

**`planProposal`** (`size="large"`):
- titolo e sottotitolo: «Nuovo blocco dal 9 novembre» · «4 settimane · forza, poi potenza»; «Menù 16-22 novembre» · «Cambiano 4
  pasti · 37 prodotti»; «Nuovi obiettivi da domani» · «Dimagrimento: −350 kcal, mai a partita e vigilia»;
- «Cosa cambia»: `ListGroup` con le prime 5 differenze (icona dell'area, etichetta, «prima → dopo» in `t-footnote`), poi
  `Disclosure` «Tutte le differenze (12)»;
- «Perché»: 2-3 righe dai motivi («Carichi +4%, tibia stabile, costanza 85%»);
- con il coach: `Disclosure` «Ritocchi del coach (3)», dentro «Non accettati (1)» con il motivo del codice; durante la
  rifinitura una riga «Il coach sta rifinendo la proposta»;
- con avvisi: `Callout` warn;
- piede: «Approva» (primario), «Tieni il piano attuale» (secondario); per blocchi e menù anche «Un’altra proposta»;
- stati: superata → si ricalcola e dice «Aggiornata con le ultime modifiche»; approvata → avviso «Nuovo blocco da lunedì» con
  «Annulla».

**`supplement`**: tre passi (cerca, dose, riepilogo), lettura dell'etichetta, conferme (§ 9).

### 11.4 Pagine nuove o rifatte

**Impostazioni › Obiettivi** (nuova, al posto della riga «Obiettivi per tipo di giorno», che diventa «Calorie e macro»):
- «Corpo»: quattro righe a scelta singola, come gli obiettivi pronti (Ricomposizione, Dimagrimento, Massa, Mantenimento: un
  `Segmented` a quattro voci lunghe non entra a 360 px), con la riga sull'effetto sotto la voce scelta («−350 kcal al giorno,
  mai a partita e vigilia»). La scelta dell'obiettivo esce dal Profilo, che tiene il collegamento «Obiettivi».
- «Allenamento»: gli obiettivi pronti compatibili con la fase come righe a scelta singola, con principale e secondaria nel
  sottotitolo; l'ultima è «Scegli tu» con due `Select`; sotto, una riga su quali si sbloccano in un'altra fase, e con R8
  attiva la riga del § 2.3 sotto quelli con potenza o rapidità. Con «Rientro»: la zona (tra quelle del profilo), lo stadio,
  solo per gli stadi con impatti o corsa «Il fisioterapista ha dato il via libera» e, per le zone sotto il ginocchio, la riga
  «Ho uno di questi segnali» (§ 3.8).
- «Tempo e spazi»: minuti per seduta (stepper 30-90), sedute in stagione (1-3), `Chip` Corsia di 15-20 m · Campo o parco · Casa.
- «Stagione»: «Ultima partita», «Prima partita della prossima stagione», «Settimane di precampionato» (3-8); si salvano subito
  («Date salvate»).
- In fondo, solo se corpo, allenamento o tempo sono cambiati rispetto al piano: «Vedi la proposta». Uscire senza approvare
  lascia tutto com'era, con una riga «Proposta in attesa». Poi la riga «Storico del piano».

**Impostazioni › Gusti** (nuova): § 6.2. **Impostazioni › Integratori** (rifatta): elenco come oggi con la pillola della
posizione, card «Quanto prendi in tutto», «Esami del sangue in vista?», «Aggiungi» che apre il foglio `supplement`; un
integratore scritto a mano mostra «Scritto a mano · Riconoscilo». **Impostazioni › Coach**: «Rifinitura delle proposte»
(`Toggle`) e «Questo mese: circa 3,20 $» (§ 10.8). **Storico del piano** (nuova): § 5.5.

### 11.5 Settimana, Allenamento, Progressi, Coach

- **Settimana**: nella Spesa dal venerdì e nel Menù della settimana dopo una card annidata «Menù nuovo · cambiano 4 pasti, 37
  prodotti» con «Vedi»; i pasti cambiati nella striscia del menù hanno un punto ambra finché la proposta è aperta; la
  preparazione segue il menù in vigore; dopo un'approvazione a spesa già fatta, il gruppo «Da comprare in più» in cima alla
  Spesa (§ 5.3).
- **Allenamento**: card in cima solo con una proposta aperta («Nuovo blocco pronto · Vedi cosa cambia»); accanto a «Questa
  settimana» una pillola «Settimana 2 di 4 · carico» (o «scarico», «rifinitura»); in fondo la riga «Blocchi precedenti». Lettore
  della seduta: con la variante ridotta o minima un `Callout` neutro nell'introduzione («Oggi ridotta: 5 h 50 a letto ed energia
  bassa») con «Fai la piena». Gli sprint, gli intervalli e i salti si segnano «fatta» per serie, con le ripetizioni previste
  già scritte (§ 3.7). «Ho poco tempo» non entra in questa fase (§ 14.5): nessuno l'ha chiesto e aggiungerebbe un comando.
- **Progressi › revisione**: misure della prevenzione e tre domande (§ 4.7); alla fine di un blocco il riepilogo (costanza,
  carichi, dolore, sonno, corpo) e la proposta del blocco dopo, con «Vedi» che apre il foglio.
- **Coach**: «Metti nel diario» sotto le foto di oggi.

### 11.6 Testi chiave

| Dove | Testo |
|---|---|
| riga del foglio della voce | Fotografa il piatto · I miei piatti |
| lettura | Il coach guarda il piatto… |
| olio | Olio e condimenti: Niente · Un filo · Un cucchiaio · Due cucchiai |
| previsto | Conta come il pranzo previsto · Cambia |
| conferma | Segna il pranzo · Scegli l’olio |
| dopo la conferma | Segnato: 720 kcal · Salva tra i miei piatti |
| piatti, porzione | Metà · Normale · Abbondante |
| non mi piace | Qualcosa non ti piace? · Togli dal piano |
| esclusione | Tolto il tonno: cambiano 2 pasti da domani · Annulla |
| cambi ripetuti | Il tonno lo cambi spesso: 3 volte in 4 settimane. Lo tolgo dal piano? · Toglilo · Tienilo |
| proposta | Approva · Tieni il piano attuale · Un’altra proposta |
| spesa | Menù nuovo · cambiano 4 pasti, 37 prodotti · Vedi · Dopo la spesa: servono 3 prodotti in più · Da comprare in più |
| segnali d'allarme | Ho uno di questi segnali · Senti il fisioterapista o il medico prima di correre o saltare. · Il fisioterapista o il medico mi ha dato il via libera |
| allenamento | Nuovo blocco pronto · Vedi cosa cambia · Settimana 2 di 4 · carico |
| giorno adattato | Oggi ridotta: 5 h 50 a letto ed energia bassa · Fai la piena |
| integratori | Nuovo integratore · Cerca: nome, sostanza o sigla · Ho la confezione · Quanto ne prendi · Quanto prendi in tutto |
| oltre il limite | Con questo arrivi a 14 mg di vitamina B6 al giorno dagli integratori: l’UL EFSA è 12 mg. · Aggiungilo lo stesso · Annulla |
| migrazione | Rivedi gli integratori: ora conosco le dosi giuste. |

Tutti i testi seguono SPEC § 3: italiano, maiuscola solo sulla prima parola, apostrofo tipografico, virgolette basse, niente
trattino lungo, niente esclamazioni (`check-typography.mjs --strict` **[codice]**).

### 11.7 Anteprime e screenshot

`?overlay=mealLog|planProposal|supplement` apre i fogli nuovi con i dati di esempio (in `app/boot.ts`, come gli altri
**[codice]**); `?coach=finto` usa risposte registrate al posto della rete per i flussi Playwright. Dati di esempio: 3 piatti
senza miniatura, un blocco attivo alla settimana 2, nessuna esclusione, integratori dal catalogo, una proposta di menù aperta il
venerdì e il sabato.

---

## 12. Contratto dei dati

Regole: ogni campo nuovo in un tipo esistente è **facoltativo**; i tipi nuovi possono avere campi obbligatori, ma tutte le
sezioni che li contengono sono facoltative. `types.ts` lo tocca solo l'onda 0, una volta per tutta la fase. Ogni aggiunta va in
«Modifiche al contratto» di `docs/SPEC.md`.

### 12.1 Aggiunte a `src/domain/types.ts`

```ts
// ───────────────────────── Pasti stimati e piatti (A, B) ─────────────────────────

export type MealSource = 'bar' | 'foto' | 'piatto';
export type Portion = 0.5 | 1 | 1.5;
export type OilChoice = 'niente' | 'filo' | 'cucchiaio' | 'due-cucchiai';
export type EstimateConfidence = 'bassa' | 'media' | 'alta';

/**
 * Un alimento di un pasto stimato, nello stato in cui si mangia (stessa convenzione di Food.per100g). Forma compatta: sta
 * nello stato caldo, che si riscrive a ogni tocco. Con `foodId` il nome viene da FOODS o da ESTIMATE_FOODS; `label` e
 * `per100g` ci sono solo fuori archivio. La confidenza serve solo nella scheda prima della conferma (`EstimateDraft`, tipo
 * locale di engine/estimate.ts) e non si salva.
 */
export interface EstimatedItem {
  /** Alimento di FOODS o di ESTIMATE_FOODS; assente = fuori archivio. */
  foodId?: string;
  grams: number;
  /** Solo fuori archivio: nome letto, una riga di 40 caratteri al massimo. */
  label?: string;
  /** Solo fuori archivio: valori per 100 g del coach, passati dai controlli del codice. */
  per100g?: Nutrients;
  role?: 'condimento';
}

/** Pasto mangiato con valori stimati (bar, foto, piatto salvato). È la forma di DayLog.barMeals. */
export interface EatenMeal {
  label: string;
  nutrients: Nutrients;
  vegPortions?: number;
  /** Assente = 'bar' (pasti salvati prima della fase 2). */
  source?: MealSource;
  items?: EstimatedItem[];
  oil?: OilChoice;
  /** Era il pasto previsto: la voce resta «fatto» e valgono questi valori al posto della ricetta. */
  asPlanned?: boolean;
  dishId?: string;
  portion?: Portion;
}

export interface MyDish {
  id: string;
  name: string;
  /** Pasti in cui proporlo per primo (quello in cui è nato). */
  slots: MealSlot[];
  /** Porzione normale. */
  items: EstimatedItem[];
  /** Valori della porzione normale, ricalcolati dal motore a ogni salvataggio. */
  nutrients: Nutrients;
  vegPortions: number;
  createdAt: string;
  source: 'foto';
  lastPortion?: Portion;
}

// DayLog, campi cambiati o nuovi:
//   barMeals?: Partial<Record<MealSlot, EatenMeal>>;     // superinsieme della forma di oggi
//   /** Ricetta prevista al momento di un cambio (per imparare i gusti). */
//   swapPlanned?: Partial<Record<MealSlot, string>>;

// ───────────────────────── Gusti (D) ─────────────────────────

export interface FoodExclusion {
  /** Id di FOODS. */
  foodId: string;
  /** Primo giorno senza l'alimento (domani al momento della scelta). */
  since: ISODate;
  origin: 'non-mi-piace' | 'cambi-ripetuti' | 'impostazioni';
}

// ───────────────────────── Obiettivi, stagione, programma (C) ─────────────────────────

export type TrainingQuality =
  | 'forza' | 'potenza' | 'rapidita' | 'velocita' | 'resistenza' | 'ipertrofia' | 'prevenzione' | 'rientro';
export type SeasonPhase = 'stagione' | 'pausa' | 'precampionato';
export type SeasonStage = 'stagione' | 'transizione' | 'sviluppo' | 'generale' | 'specifico' | 'rifinitura';
export type TrainingSpace = 'corsia' | 'campo' | 'casa';

export interface ReturnPlan {
  /** Una di Profile.painSites. */
  site: string;
  stage: 0 | 1 | 2 | 3 | 4;
  since: ISODate;
  /** Via libera del fisioterapista per lo stadio attuale (necessario per gli stadi con impatti o corsa). */
  physioOk?: boolean;
}

/** Livello 2 degli obiettivi. */
export interface TrainingGoal {
  /** Obiettivo pronto (§ 2.3); assente = scelta libera. */
  presetId?: string;
  primary: TrainingQuality;
  secondary?: TrainingQuality;
  rientro?: ReturnPlan;
  /** Minuti per seduta (30-90, predefinito 60). */
  sessionMin?: number;
  /** Sedute di palestra a settimana in stagione (1-3, predefinito 2). */
  gymPerWeek?: number;
  spaces?: TrainingSpace[];
}

/** Livello 3: fatti, non scelte. */
export interface SeasonCalendar {
  lastMatch?: ISODate;
  firstMatch?: ISODate;
  /** 3-8, predefinito 5. */
  preseasonWeeks?: number;
}

export type BlockWeekKind = 'carico' | 'scarico' | 'rifinitura';

/** Fattori di una settimana del blocco rispetto alla settimana 1. */
export interface WeekDose {
  /** Serie in più sugli esercizi del blocco principale (0, 1). */
  mainSetsAdd: number;
  /** Moltiplicatore delle serie, arrotondato in su, minimo 1 (scarico 0,5; rifinitura 0,6). */
  setsFactor: number;
  /** Ripetizioni di riserva in più (negativo = più vicino al cedimento), sempre dentro i limiti del § 3.4. */
  rirDelta: number;
  /** Moltiplicatore di contatti e metri. */
  impactFactor: number;
}

/** Blocco in vigore. Le settimane 2… si derivano (engine/plan/program.ts). */
export interface Program {
  blockId: string;
  /** Lunedì di inizio. */
  start: ISODate;
  weeks: BlockWeekKind[];
  /** Stessa lunghezza di `weeks`. */
  dose: WeekDose[];
  phase: SeasonPhase;
  stage: SeasonStage;
  primary: TrainingQuality;
  secondary?: TrainingQuality;
  /** Sedute della settimana 1 per slot ('A', 'B', 'C', 'K', 'R'). */
  sessions: Record<string, WorkoutSession>;
  /** Ritocchi del coach accettati: si applicano dopo la derivazione della settimana. */
  edits?: PlanEdit[];
}

/** Ritocco piccolo e verificabile a una seduta. `week` assente = tutte le settimane. */
export type PlanEdit =
  | { op: 'sostituisci'; slot: string; week?: number; exerciseId: string; with: string; reason: string }
  | { op: 'serie'; slot: string; week?: number; exerciseId: string; sets: number; reason: string }
  | { op: 'ordine'; slot: string; order: string[]; reason: string }
  | { op: 'nota'; slot: string; exerciseId: string; note: string };

/** Ritocco del coach a un menù generato: solo ricette tra le candidate di quella casella. */
export interface MenuEdit {
  day: Weekday;
  slot: MealSlot;
  recipeId: string;
  reason: string;
}

// Plan, campi nuovi (tutti facoltativi):
//   exclusions?: FoodExclusion[];
//   /** Alimento → giorno in cui l'utente ha risposto «Tienilo». */
//   tasteAsked?: Record<string, ISODate>;
//   training?: TrainingGoal;
//   season?: SeasonCalendar;
//   /** Settimana tipo in stagione, salvata all'inizio della pausa e riproposta al precampionato. */
//   seasonWeek?: ScheduleDay[];
//   program?: Program;
//   /** Settimane scaricate o alleggerite dalla revisione, per lunedì. */
//   weekOverrides?: Record<ISODate, 'scarico' | 'leggera'>;
//   /** Menù approvati, per lunedì: vincono sulla rotazione (tenuti 52 settimane). */
//   menus?: Record<ISODate, MenuWeek>;
//   /** Differenza di kcal dell'obiettivo del corpo rispetto al dispendio stimato (negativa = deficit). */
//   goalDeltaKcal?: number;
//   /** Caffè al giorno, per la caffeina degli integratori. */
//   coffeePerDay?: number;
//   /** Fermo per i segnali d'allarme (§ 3.8): livello d'impatto 0 ovunque finché un via libera esplicito non lo toglie. */
//   impactHold?: { site: string; since: ISODate };

// ───────────────────────── Proposte e versioni ─────────────────────────

export type PlanChangeKind = 'blocco' | 'menu' | 'obiettivi' | 'ritorno';
export type PlanProposalStatus = 'aperta' | 'approvata' | 'scartata' | 'superata';

/** Parti del piano che una proposta sostituisce. `null` = togli (torna alla rotazione, alle sedute fisse…). */
export interface PlanPatch {
  week?: ScheduleDay[];
  seasonWeek?: ScheduleDay[] | null;
  program?: Program | null;
  menus?: Record<ISODate, MenuWeek | null>;
  training?: TrainingGoal | null;
  targets?: Plan['targets'];
  /** Obiettivo del corpo (Profile.goal). */
  goal?: Goal;
  goalDeltaKcal?: number | null;
}

export interface DiffItem {
  area: 'pasto' | 'spesa' | 'seduta' | 'esercizio' | 'settimana' | 'carico' | 'obiettivo' | 'calorie';
  /** Più alto = più importante: la scheda mostra le prime cinque. */
  weight: number;
  /** «Mercoledì, cena», «Seduta B». */
  label: string;
  before?: string;
  after?: string;
}

export interface CoachPass {
  status: 'in-corso' | 'fatto' | 'errore';
  at: string;
  model?: string;
  summary?: string;
  applied: (PlanEdit | MenuEdit)[];
  rejected: { edit: PlanEdit | MenuEdit; reason: string }[];
  /** Testo dell'errore, già pronto per l'interfaccia. */
  message?: string;
}

export interface PlanProposal {
  /** Impronta degli ingressi più `attempt`. */
  id: string;
  kind: PlanChangeKind;
  status: PlanProposalStatus;
  createdAt: string;
  decidedAt?: string;
  effectiveFrom: ISODate;
  /** Ultimo giorno in cui si può approvare (§ 5.2); assente = il giorno prima di effectiveFrom. */
  approvableUntil?: ISODate;
  /** Impronta delle parti del piano che il suo tipo legge (planBasis, § 5.2). */
  basis: string;
  attempt?: number;
  title: string;
  subtitle?: string;
  patch: PlanPatch;
  diff: DiffItem[];
  reasons: string[];
  warnings?: string[];
  source: 'motore' | 'motore+coach';
  coach?: CoachPass;
  /** Valori di prima, scritti all'approvazione: servono ad «Annulla». */
  before?: PlanPatch;
}

export interface PlanVersion {
  id: string;
  at: string;
  effectiveFrom: ISODate;
  kind: Exclude<PlanChangeKind, 'menu'>;
  title: string;
  /** Valori dei campi toccati prima dell'approvazione: li usa «Annulla». */
  before: PlanPatch;
  /** La toppa applicata, con i soli campi toccati: «Torna a questa versione» la ripropone (restoreTo, § 5.5). */
  after: PlanPatch;
  proposalId?: string;
}

/** Riepilogo di un blocco concluso (§ 3.11). */
export interface BlockSummary {
  blockId: string;
  from: ISODate;
  to: ISODate;
  primary: TrainingQuality;
  secondary?: TrainingQuality;
  verdict: 'avanza' | 'consolida' | 'alleggerisci' | 'meno-ma-fatto' | 'rientro';
  adherence: number;
  /** Totale previsto più alto delle settimane del blocco, in UA (calcio previsto + quota controllabile): riferimento di R10. */
  peakLoad?: number;
}

export interface Planner {
  proposals: PlanProposal[];
  /** Al massimo gli ultimi 12. */
  blocks?: BlockSummary[];
}

// ───────────────────────── Integratori (F) ─────────────────────────

export type DoseUnit = 'µg' | 'mg' | 'g' | 'mL' | 'UFC' | 'mg/kg' | 'compressa' | 'bustina' | 'dose';
export type LabelUnit = 'µg' | 'mg' | 'g' | 'UI' | 'UFC' | 'mL' | 'mmol';
export type SupplementSchedule = 'giornaliero' | 'giorni-alterni' | 'con-la-seduta' | 'periodi';

export interface SupplementComponent {
  /** Voce del catalogo riconosciuta; senza, il componente è solo descritto. */
  catalogId?: string;
  name: string;
  form?: string;
  /** Al giorno. */
  amount: number;
  unit: LabelUnit;
}

export interface SupplementProduct {
  label?: string;
  servingText?: string;
  components: SupplementComponent[];
  /** 'stima' = composto scelto dalla ricerca, con le dosi predefinite delle voci, finché non si legge l'etichetta. */
  source: 'etichetta' | 'stima';
  readAt: ISODate;
  labelWarnings?: string[];
  certifications?: Array<'informed-sport' | 'informed-choice' | 'koelner-liste' | 'altra'>;
}

// Supplement (esistente: id, name, dose, timing, note?, active), campi nuovi:
//   catalogId?: string;
//   amount?: { amount: number; unit: DoseUnit; per?: 'giorno' | 'settimana' | 'mese' };
//   product?: SupplementProduct;
//   schedule?: SupplementSchedule;
//   period?: { from: ISODate; to: ISODate };
//   slot?: MealSlot;
//   workout?: { when: 'prima' | 'dopo' | 'durante'; minutes: number };
//   dosesPerDay?: number;
//   reason?: 'mantenimento' | 'prescrizione' | 'carenza' | 'sport' | 'periodo';
//   test?: { exam: string; date: ISODate; value?: number; unit?: string };
//   reviewAt?: ISODate;
//   acknowledged?: string[];
//   catalogVersion?: number;

// Profile, campo nuovo:
//   /** Chiesto solo quando un prodotto contiene beta-carotene. */
//   smoker?: 'mai' | 'ex' | 'si';

// ───────────────────────── Allenamento ─────────────────────────

// ExerciseCategory: tre valori in più
//   | 'pliometria' | 'sprint' | 'condizionamento'

// SessionExercise, campi nuovi:
//   distanceM?: number;      // sprint e allunghi: metri per ripetizione
//   workSec?: number;        // intervalli: secondi di lavoro (restSec c'è già)
//   effort?: string;         // «RPE 8», «forte ma sciolto»: intensità senza cronometro
//   contactsPerRep?: number; // pliometria (predefinito dal catalogo)

// WorkoutLog, campi nuovi:
//   blockId?: string;
//   weekIndex?: number;
//   variant?: 'piena' | 'ridotta' | 'minima';

// ───────────────────────── Revisione ─────────────────────────

// WeeklyReview, campi nuovi o allargati:
//   outside?: { redMeat?: 0 | 1 | 2 | 3; processed?: 0 | 1 | 2 | 3; alcoholUnits?: '0' | '1-3' | '4-7' | '8+'; binge?: boolean };
//   step?: { id: … | 'alcol'; title: string };

// Proposal (revisione della domenica):
//   area: … | 'piano';
//   apply?: …
//     | { type: 'planProposal'; id: string }
//     | { type: 'weekKind'; weekStart: ISODate; kind: 'scarico' | 'leggera' };

// ───────────────────────── Coach, impostazioni, pannelli, stato ─────────────────────────

export interface CoachUsageMonth {
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

// Settings, campi nuovi:
//   /** Rifinitura del coach sulle proposte con rete e chiave (assente = sì). */
//   coachRefine?: boolean;
//   /** Token per mese ('2026-11'), dalle risposte dell'API. */
//   coachUsage?: Record<string, CoachUsageMonth>;

// Overlay, tre tipi nuovi:
//   | { type: 'mealLog'; date: ISODate; slot: MealSlot; mode: 'foto' | 'piatti'; chatMessageId?: string }
//   | { type: 'planProposal'; id: string }
//   | { type: 'supplement'; supplementId?: string }

// AppData, sezioni nuove:
//   dishes?: MyDish[];
//   /** Archivio freddo: data URL JPEG da 96 px per id del piatto. */
//   dishThumbs?: Record<string, string>;
//   planner?: Planner;
//   /** Archivio freddo: al massimo 24. */
//   planVersions?: PlanVersion[];
```

Tipi locali dei motori, fuori dal contratto: `CatalogExercise` (allargato, § 3.7), `MovementPattern`, `ExerciseSpace`, `FoodFacts`,
`RecipeFacts`, `PrepComponent` (con `fridgeDays`, § 4.11), `ReturnStage` (con `maxImpactLevel` e `allowed`, § 3.8),
`EstimateDraft` (la scheda prima della conferma, con la confidenza), `EnergyState`, `ProposalState`, `MenuGenInput`,
`MenuGenResult`, `Violation`, `CatalogEntry`, `CatalogText`, `NutrientTotal`, `SupplementCheck`, `Readiness`, `BlockReview`,
`StructuredTask`. `Violation` è unico per tutti i validatori:

```ts
export interface Violation {
  /** 'kcal-giorno', 'prodotti', 'carne-rossa-settimana', 'escluso', 'fuori-stagione', 'contatti-seduta', 'R2'… */
  code: string;
  hard: boolean;
  where?: { day?: Weekday; slot?: MealSlot | string; key?: string };
  value?: number;
  limit?: number;
  /** In italiano: lo legge l'utente nella scheda e il coach nel motivo dello scarto. */
  message: string;
}
```

### 12.2 Risolutori unici (firme congelate dall'onda 0)

```ts
// engine/menu.ts
/**
 * Settimana di menù in vigore nella data: Plan.menus del suo lunedì; altrimenti l'ultima approvata delle 4 settimane prima,
 * se nessun fresco strict è fuori stagione nel mese (dall'onda 2A, § 4.10); altrimenti la rotazione. Nell'onda 0, quando
 * Plan.menus è sempre vuoto, è Plan.menus o la rotazione: la firma non cambia.
 */
export function menuWeekInForce(iso: ISODate, plan: Pick<Plan, 'startDate' | 'menus'>): MenuWeek | undefined;
/** Compiti della preparazione della domenica prima di `monday`, con le esclusioni applicate. */
export function prepInForce(monday: ISODate, plan: Plan): PrepTask[];
/** Strato 1 del § 6.4: le ricette previste nella data, senza sostituzioni né scambi. */
export function plannedMealsForDate(iso: ISODate, plan: Plan): DayMeals;
/** Strato 2 del § 6.4: sostituzioni delle esclusioni di una settimana, memorizzate per (lunedì, piano). Onda 0: vuoto. */
export function weekSubstitutions(monday: ISODate, plan: Plan): Partial<Record<ISODate, Partial<Record<MealSlot, string>>>>;
// mealsForDate(iso, state, rotation?) resta con la stessa firma: strato 2 più gli scambi dell'utente; aggiunge
// DayMeals.source: 'avvio' | 'rotazione' | 'approvato' | 'ripetuto' e MealEntry.excludedFrom?.

// engine/energy.ts
/** Deficit (negativo) o surplus in vigore: Plan.goalDeltaKcal, altrimenti ricavato (§ 2.1). */
export function goalDeltaOf(plan: Plan, profile: Profile, reviews: readonly WeeklyReview[]): number;
/** Differenza di kcal dell'obiettivo della data rispetto a Plan.targets dopo le regole per data del § 2.1 (≥ 0: si rimette). */
export function dayEnergyDelta(iso: ISODate, state: EnergyState): number;
/** Correzione della revisione tagliata ai limiti: deficit mai oltre 500 kcal né oltre il 20% del dispendio del tipo di giorno. */
export function clampKcalCorrection(value: number, plan: Plan, profile: Profile, reviews: readonly WeeklyReview[]): number;

// engine/plan/proposals.ts (funzioni pure del ciclo di vita, onda 0A)
export function planBasis(kind: PlanChangeKind, state: ProposalState): string;
export function proposalId(kind: PlanChangeKind, effectiveFrom: ISODate, basis: string, attempt: number): string;
export function applyPatch(plan: Plan, profile: Profile, patch: PlanPatch): { plan: Plan; profile: Profile };
export function beforeOf(plan: Plan, profile: Profile, patch: PlanPatch): PlanPatch;
export function isSuperseded(p: PlanProposal, state: ProposalState, today: ISODate): boolean;

// engine/plan/program.ts
/** Seduta di uno slot nella data: senza Plan.program SESSIONS[slot] (con weekOverrides), altrimenti la settimana derivata. */
export function sessionFor(slot: string, iso: ISODate, plan: Pick<Plan, 'program' | 'weekOverrides'>): WorkoutSession | undefined;
export interface DaySession { session: WorkoutSession; variant: 'piena' | 'ridotta' | 'minima'; reasons: string[] }
/** sessionFor + controllo del mattino + regola del dolore. */
export function daySession(slot: string, iso: ISODate, state: TrainingState): DaySession | null;

// engine/nutrition.ts
/** Pasto stimato che vale per la voce (§ 7.5), o null. */
export function eatenMeal(log: DayLog | undefined, slot: MealSlot): EatenMeal | null;
/** Scala dei carboidrati di un insieme di ricette (la regola di dayCarbScale su ricette date). */
export function carbScaleForMeals(recipes: (Recipe | undefined)[], dayType: DayType, target: MacroTarget, carbFloorG?: number): number;

// engine/exclusions.ts
export function excludedFoods(plan: Pick<Plan, 'exclusions'>, iso?: ISODate): ReadonlySet<string>;
export function recipeAllowed(recipe: Recipe, excluded: ReadonlySet<string>): boolean;

// engine/timeline.ts: gymDuration(sessionId, state, iso?) accetta la data; con la data passa da daySession.
```

Regola per i 31 punti che leggono `SESSIONS[...]` fuori dai test **[misura]**: chi mostra o esegue la seduta di una data passa da
`sessionFor` o `daySession`; chi usa solo il nome di uno slot (editor della settimana, benvenuto) tiene `SESSIONS`. I cinque
punti che leggono `menuWeekFor(…, plan.startDate)` per la preparazione **[codice: timeline, shopping, PrepTab, SettimanaScreen,
seed]** passano a `menuWeekInForce` e `prepInForce`.

### 12.3 Azioni dello store

Si aggiungono a `useApp` in `state/store.ts` (onda 0), con questi nomi e firme:

```ts
// pasti stimati e piatti
setEatenMeal: (date: ISODate, slot: MealSlot, meal: EatenMeal, opts?: { note?: string }) => void;  // scrive anche lo stato della voce (§ 7.5)
mealSnapshot: (date: ISODate, slot: MealSlot) => MealSnapshot;  // tipo esportato da store.ts: { status?, note?, meal?, swap? }
restoreMeal: (date: ISODate, slot: MealSlot, snap: MealSnapshot) => void;                         // per «Annulla»
saveDish: (dish: MyDish, thumb?: string) => void;
updateDish: (id: string, patch: Partial<Pick<MyDish, 'name' | 'items' | 'slots' | 'lastPortion'>>) => void;  // ricalcola i valori
deleteDish: (id: string) => void;
// setBarMeal resta, come alias con source 'bar'.
// swapRecipe(date, slot, recipeId | null, plannedId?): con plannedId scrive DayLog.swapPlanned.

// sicurezza (§ 3.8)
setImpactHold: (site: string, today: ISODate) => void;   // stadio del rientro a 0 e physioOk a false nella stessa transazione
clearImpactHold: () => void;                             // solo dal via libera esplicito

// gusti
addExclusion: (foodId: string, origin: FoodExclusion['origin'], since: ISODate) => void;
removeExclusion: (foodId: string) => void;
markTasteAsked: (foodId: string, date: ISODate) => void;

// proposte
saveProposal: (p: PlanProposal) => void;              // upsert; supera le aperte dello stesso tipo e inizio
updateCoachPass: (id: string, pass: CoachPass, patch?: PlanPatch) => void;
approveProposal: (id: string, today: ISODate) => { versionId?: string } | null;  // null se superata o base diversa
rejectProposal: (id: string) => void;
undoApproval: (proposalId: string) => void;
recordBlockSummary: (s: BlockSummary) => void;
// applyProposal gestisce anche 'planProposal' (= approveProposal) e 'weekKind' (scrive Plan.weekOverrides);
// con 'kcalDelta' taglia la correzione con clampKcalCorrection e scrive Plan.goalDeltaKcal (goalDeltaOf + correzione),
// anche quando il campo mancava (§ 2.1).
// approveProposal salva nella versione sia before (beforeOf) sia after (la toppa applicata); «Torna a questa versione»
// passa da restoreTo (onda 0B), che crea una proposta 'ritorno' da approvare come le altre.

// integratori e coach
acknowledgeSupplementCheck: (supplementId: string, code: string) => void;
recordCoachUsage: (month: string, delta: CoachUsageMonth) => void;
```

Le azioni del dominio che una schermata usa da sola (per esempio salvare una bozza di obiettivi) restano nel modulo della
schermata con `useApp.setState`, come chiede SPEC § 6 **[codice]**.

### 12.4 Normalizzazione

- `DATA_VERSION` 4, senza migrazioni di valori (`migrateData` porta solo il numero). Motivo: un'app vecchia che importasse un backup
  nuovo perderebbe in silenzio piatti, proposte e versioni; con la versione 4 lo rifiuta con il messaggio che c'è già
  **[codice: `parseBackup`]**.
- Funzioni nuove in `store.ts`, tutte tolleranti (scartano le voci illeggibili, tengono i campi sconosciuti come oggi):
  - `normalizeEatenMeal` (estende `normalizeBarMeal`: tetti di oggi, kcal ≤ 3.000, macro ≤ 300 g; `items` al massimo 12 come
    nel § 7.3, grammi 1-1.500, `label` e `per100g` solo senza `foodId`, etichetta su una riga di 40 caratteri, `per100g` con i
    limiti del § 7.3; `source`, `oil`, `portion` tra i valori ammessi) e `normalizeBarMeals(raw, status)` con la regola del
    § 7.5;
  - `normalizeDishes` (id unici, nome non vuoto, almeno un alimento, valori ricalcolati dagli alimenti);
  - `normalizeThumbs` (solo `data:image/jpeg;base64,`, al massimo 12 KB, solo per piatti esistenti);
  - `normalizePlanner` (stati sconosciuti scartati; un passaggio del coach «in-corso» al riavvio diventa «errore»; al massimo 3
    decise per tipo; `blocks` al massimo 12, `peakLoad` finito e ≥ 0 o tolto);
  - `normalizePlanVersions` (al massimo 24, ordinate per data; una versione senza `after` valido si scarta, perché non si
    potrebbe ripristinare);
  - in `normalizePlan`: `normalizeExclusions` (chiavi uniche e non vuote, `since` valida), `normalizeMenus` (chiavi solo lunedì,
    7 giorni, id di ricetta come testo, 52 settimane), `normalizeProgram` (forma di `WorkoutSession`; `weeks` e `dose` della stessa
    lunghezza, da 1 a 8; altrimenti il campo sparisce e tornano le sedute fisse), `normalizeSeason`, `normalizeTraining` (qualità
    ammesse, coppie vietate tolte), `normalizeWeekOverrides`, `goalDeltaKcal` tra −500 e +500, `impactHold` (con un sito non
    vuoto resta; una `since` non valida diventa `startDate`: nel dubbio un fermo di sicurezza non si toglie);
  - in `normalizeDayLogs`: `swapPlanned` come `recipeSwaps`;
  - integratori: § 9.7.
- `DATA_KEYS` e `pickData` comprendono le sezioni nuove, anche quelle fredde: il backup è completo.

### 12.5 Archivio freddo, backup, dati di esempio

- **Archivio freddo**: `dishThumbs` e `planVersions` stanno sotto la chiave `ritmo:v1:archivio`, in un oggetto con la sua
  versione (`{ version: 1, dishThumbs, planVersions }`). `persistedData` li toglie dal blob caldo, come fa già con le foto della
  chat **[codice]**. Motivo: il blob caldo si riscrive a ogni tocco. Ordine all'avvio, per non perdere niente:
  1. `merge` di `persist` (oggi `merge: (persisted, current) => ({ ...current, ...normalizeData(persisted) })` **[codice:
     `state/store.ts`]**) legge l'archivio **in modo sincrono** da `localStorage` e lo fonde prima di normalizzare: lo stato
     idratato contiene già miniature e versioni;
  2. solo dopo l'idratazione (`onRehydrateStorage`) si alza il segnale `archiveLoaded` e si registra il `subscribe` che
     scrive l'archivio quando cambiano i riferimenti di `dishThumbs` o `planVersions`;
  3. lo scrittore non scrive mai finché `archiveLoaded` è falso e non sovrascrive mai una sezione con `undefined`: una
     sezione si svuota solo con le azioni esplicite (`resetAll`, `clearDemo`, `importData`, eliminazione di un piatto).
  Un archivio illeggibile o con una `version` sconosciuta non si sovrascrive: si tiene com'è, l'app parte senza miniature e
  versioni e Informazioni lo dice in una riga.
- **Bilancio dopo un anno** **[ipotesi per estrapolazione dalle misure]**: stato caldo circa 450 KB + menù 70 KB + blocco
  10 KB + proposte 50 KB + piatti 30 KB + alimenti dei pasti fotografati 110-150 KB in forma compatta (due foto al giorno,
  circa 6 alimenti da 25 byte; nella forma lunga con etichette e valori per 100 g sarebbero 0,5-0,8 MB), cioè circa 0,75 MB;
  archivio freddo 160-200 KB di miniature e 200-500 KB di versioni (con `before` e `after`). L'onda 4 lo misura su uno stato
  sintetico di un anno; se lo stato caldo supera 1 MB, gli `items` dei pasti più vecchi di 90 giorni passano all'archivio
  freddo e nel diario restano i totali.
- **Backup**: `createBackup` e `pickData` comprendono tutto; `BackupSummary` conta piatti, versioni e proposte aperte
  (`summarizeData`); `parseBackup` accetta fino alla versione 4. `loadDemo`, `clearDemo`, `importData` e `resetAll` puliscono anche
  l'archivio freddo.
- **Dati di esempio**: § 11.7. Il blocco e la proposta di esempio si costruiscono con i motori veri, deterministici.

---

## 13. Test e criteri di accettazione

Si aggiungono ai 610 test di oggi (605 più i 5 della patch di prevenzione **[misura]**). Ogni onda finisce con `tsc`, tutti i test
verdi, `check-typography.mjs --strict`, la build dell'anteprima e gli screenshot.

### 13.1 Compatibilità e stato

1. **Istantanea di compatibilità** (`engine/compat.test.ts`, onda 0): sui dati di esempio senza i campi nuovi, per 28 giorni,
   timeline, valori del giorno, spesa, sedute, durate, proposte della revisione e contesto del coach coincidono prima e dopo la
   fase 2. La base si prende dopo il passo 0 (§ 14.1), con la patch di prevenzione e il ragù del seme in freezer già dentro;
   si aggiorna solo per i cambi voluti e dichiarati (gli integratori predefiniti per i nuovi utenti). I dati di esempio sono in ricomposizione senza correzioni accettate: i limiti
   dell'energia del § 2.1 non li cambiano.
2. `normalizeData(pickData(s))` uguale a `s` per stati generati a caso con le sezioni nuove (test a proprietà); andata e ritorno
   del backup completo, archivio freddo compreso.
3. Lo stato caldo (`persistedData`) non contiene mai miniature né versioni.
4. `parseBackup` rifiuta un backup con versione 5 e accetta i backup 1-4; un backup della versione 3 importato non perde niente.
55. Archivio freddo: avvio con un archivio pieno → nessuna scrittura dell'archivio prima della fusione, miniature e versioni
    intatte dopo due ricariche; una sezione `undefined` nello stato non cancella mai quella salvata; un archivio con `version`
    sconosciuta non si sovrascrive.
56. Materiali: `supplementCatalogIds.test.ts` fallisce se `scripts/data/supplement-catalog.json` manca o se `CATALOG_IDS` non
    coincide con i suoi id.

### 13.2 Determinismo

5. Ogni motore nuovo chiamato due volte con gli stessi ingressi dà risultati profondamente uguali.
6. Un test legge i sorgenti di `src/engine/plan/**`, `src/engine/menuGen/**`, `engine/similar.ts`, `engine/exclusions.ts`,
   `engine/prevention.ts`, `engine/estimate.ts`, `engine/dishes.ts`, `engine/supplements.ts`, `engine/energy.ts` e fallisce se
   trova `Date.now`, `new Date()` senza argomenti o `Math.random`.
7. Stessa base → stesso id di proposta; `attempt` diverso → id diverso, proposta comunque valida. Una pesata, una seduta
   registrata, un controllo del mattino o una spunta nuovi non cambiano né l'id né lo stato della proposta aperta e non fanno
   ripartire la rifinitura; un'esclusione nuova supera la proposta di menù ma non quella di blocco.

### 13.3 Proposte

8. `applyPatch(applyPatch(p, x), beforeOf(p, x))` = `p` per ogni toppa (proprietà).
9. Ritorno a una versione: approvare A, poi B, poi «Torna a questa versione» su A (`restoreTo`) → i campi toccati da A tornano
   come li aveva messi A (`after`); «Annulla» subito dopo l'approvazione di B riapplica il `before` di B ed è un'azione
   separata.
10. Una proposta con una base diversa da quella del piano non si approva; una sola aperta per tipo e inizio.
11. Approvare non cambia mai oggi né i giorni passati. Con la settimana predefinita una proposta di blocco della domenica si
    approva ancora il lunedì e il martedì è `superata` (`approvableUntil`); una proposta di menù non si approva più dal
    lunedì.

### 13.4 Prevenzione e menù

12. La rotazione e il menù di avvio passano `validateMenuWeek`; i test di `menu.test.ts` diventano chiamate al validatore, con gli
    stessi numeri.
13. Menù generati per 52 lunedì × 4 obiettivi del corpo × 3 fasi × 6 insiemi di esclusioni (nessuna, le più frequenti, alimenti
    presenti in molte ricette: pane integrale, yogurt greco, grana, miele): il risultato è valido o è un ripiego con gli avvisi;
    mai un alimento escluso o vietato in un pasto, nella spesa, nelle alternative o nel piano B; mai un fresco `strict` fuori
    stagione; prodotti ≤ 40.
14. A1-A10 su ogni menù generato e sulla rotazione (proprietà): niente carni lavorate, alcol, prodotti di riso; carne rossa ≤ 1 e
    ≤ 150 g cotti; riso ≤ 3 pasti e sempre scolato; vegetali ≥ 400 g; fibre 30-45 (40); legumi ≥ 4; integrali ≥ 90 g di media;
    zuccheri liberi < 5%.
15. Il costo del menù generato non è mai più alto di quello del seme (il generatore non peggiora la rotazione).
16. Preparazione generata: 4-6 compiti, 60-90 minuti, ogni ricetta da preparazione coperta, id stabili tra due rigenerazioni
    dello stesso menù; con le stesse ricette da preparazione del seme, gli stessi compiti scritti a mano. Nessun componente si
    mangia dal frigo oltre i suoi `fridgeDays`, nei compiti generati e in quelli scritti a mano del seme (una tabella del test
    collega ogni compito del seme ai suoi componenti).
17. `evaluations` ≤ `maxEvaluations` su ogni caso; nessun test a tempo nella CI (il tempo si misura nell'onda 4, § 4.10).
57. Ripiego del lunedì: senza approvazione vale l'ultima settimana approvata delle 4 precedenti se passa H5 nel mese nuovo
    (`source: 'ripetuto'`), altrimenti la rotazione; il menù di avvio vince su tutto.
18. Ogni alimento ha i suoi `FOOD_FACTS`; ogni ricetta i suoi `RECIPE_FACTS`; nessuna ricetta di riso con l'assorbimento.
19. Misure della revisione: un pasto stimato con salumi conta in B2; un ordine del bar senza alimenti non conta; 2 porzioni di
    carne rossa fuori dal menù valgono 300 g cotti e il testo dice «circa».

### 13.5 Gusti e alternative

20. Un'esclusione vale da `since` e mai prima: oggi e i giorni passati non cambiano (valori, aderenza, spesa spuntata).
21. `mealAlternatives`: tutte nella banda dei valori, nel contesto del giorno, senza ricette da preparazione né esclusi, senza
    sforare i tetti della settimana; ordinate come nel § 6.1; deterministiche.
22. `tasteSignals`: la domanda compare solo con le soglie del § 6.3 e mai entro 56 giorni da un «Tienilo».
23. La sostituzione nel menù in vigore non dipende dalla spesa né da `dayCarbScale`: con un contatore di chiamate nel test la
    profondità resta limitata (strato 1 → strato 2 → `dayCarbScale`, mai indietro); due chiamate danno lo stesso risultato; con
    un'esclusione che tocca più giorni le sostituzioni rispettano i tetti di H3 della settimana.

### 13.6 Foto e piatti

24. Per gli alimenti dell'archivio i valori salvati sono sempre quelli di `foods.ts` per i grammi confermati, anche se il coach
    manda `per100g`.
25. Valori per 100 g fuori dai limiti o incoerenti con Atwater oltre la tolleranza → scartati.
26. Niente si salva senza conferma; la conferma scrive stima e stato insieme; la tabella del § 7.5, per le foto e per i piatti
    salvati: per ogni combinazione di stato e `asPlanned`, `eatenMeal` e `normalizeBarMeals` concordano; un piatto salvato che
    contiene il 60% degli alimenti della ricetta prevista è `fatto` con `asPlanned`; «Annulla» rimette tutto com'era. Gli
    alimenti salvati sono in forma compatta (`label` e `per100g` solo fuori archivio).
27. `scaleDish` è lineare; `dishUsage` conta solo i diari con un `dishId` esistente; i piatti più usati vengono prima.
28. Miniature: solo JPEG, al massimo 12 KB.

### 13.7 Allenamento

29. Per ogni posizione della partita (dal lunedì alla domenica) e per 20 settimane tipo di prova la proposta nasce sempre,
    nessuna seduta generata viola R1-R9 e R10 è rispettata, o c'è il suo avviso quando i pavimenti da soli la superano;
    `violations` è sempre vuoto.
30. Ogni settimana ha i pavimenti del § 3.5, meno quelli coperti dal fisioterapista; in stagione almeno un'esposizione di forza
    pesante di gambe, salvo dolore che la frena o rientro di una zona della gamba.
31. Contatti per seduta e a settimana entro la tabella della fase; aumento ≤ 20% (≤ 10 sotto i 50); livello mai cambiato dentro
    un blocco.
32. Arrotondamenti del § 3.4, come uguaglianze: per ogni esercizio, serie dello scarico = `max(1, ⌈0,5 × serie_1⌉)` e della
    rifinitura = `max(1, ⌈0,6 × serie_1⌉)`; ripetizioni d'impatto e metri = `max(1, ⌊fattore × valore_1⌋)`. Sul totale della
    seduta, serie dello scarico ≤ 0,5 × serie della settimana 3 + 1 per esercizio.
33. Durata stimata ≤ minuti scelti + 5; nessun esercizio fuori dal catalogo o dal fisioterapista; ogni esercizio nello spazio
    disponibile; ogni esercizio di corsa, sprint o salto riconosciuto da `isImpactExercise`; ogni esercizio del catalogo ha
    `pattern`.
34. Gambe multiarticolari mai sotto RIR 2 in stagione. R10, previsto contro previsto: per ogni settimana del blocco `F + C` ≤
    1,10 × il totale previsto più alto delle 4 settimane prima, oppure `C` ai soli pavimenti con l'avviso. Casi fissi: in
    stagione **senza nessun calcio registrato** la proposta nasce uguale a quella con il calcio registrato; il precampionato
    generato dopo 6 settimane di pausa, con e senza calcio registrato, nasce sempre, con la palestra della prima settimana ai
    pavimenti e in crescita le settimane dopo; lo sviluppo dopo la transizione nasce con 3 sedute.
35. Giorno adattato: la tabella del § 3.9 caso per caso; controllo mancante → piena; `painGate` «riduci» → mai piena; la minima
    tiene sempre i pavimenti non fatti e il fisioterapista.
36. Fine del blocco: ogni riga della tabella del § 3.11; costanza < 60% → sedute e durata mai in aumento; dolore in peggioramento
    → livello d'impatto mai in aumento e contatti ≤ 0,5 × blocco prima; senza `physioOk` mai uno stadio con impatti o corsa.
37. `weekOverrides`: uno scarico accettato dalla revisione cambia davvero le sedute di quella settimana, anche senza blocco.
38. Energia: deficit mai oltre 500 kcal o il 20%; zero a partita e vigilia; ≤ 250 nelle condizioni del § 2.1; carboidrati ≥ 6 g/kg
    a partita e vigilia (test esistenti **[codice: `nutrition.test.ts`]**); proteine ≥ 0,3 g/kg nei pasti principali come costo.
    **Dimagrimento senza `goalDeltaKcal`** (i piani di oggi): nessun deficit a partita e vigilia; con una correzione da −150
    accettata sopra le −350 il deficit arriva al tetto (−500, o il 20% del dispendio del tipo di giorno se è meno) e la
    revisione non ne propone un'altra; due correzioni accettate di fila non lo superano mai; ricomposizione e mantenimento senza correzioni: obiettivi
    della data identici a oggi.
58. Obiettivi pronti: per ogni obiettivo pronto e ogni fase della sua colonna «Fasi», `normalizeTraining` lo tiene e
    `buildBlock` non dà violazioni di compatibilità; al cambio di fase un obiettivo non ammesso è sostituito e la differenza lo
    dice.
59. Rientro: nessun esercizio, riscaldamento compreso, sopra il `maxImpactLevel` dello stadio, tranne quelli del suo `allowed`;
    la prova del saltello compare solo nello stadio 2 con `physioOk`, una volta, e non entra nei contatti.
60. Segnali d'allarme: «Ho uno di questi segnali» → stadio 0, `physioOk` falso, livello 0 in ogni seduta da subito, quella di
    oggi compresa, e nelle sedute fisse senza blocco; gli impatti tornano solo con `clearImpactHold`; un `impactHold` con `since`
    non valida resta dopo `normalizeData`.
61. Fine del blocco senza approvazione: dopo 6 settimane senza approvare c'è almeno uno scarico, e contatti e metri non superano
    mai quelli della settimana 2; a un cambio di fase senza approvazione valgono le sedute fisse.
62. Catalogo d'impatto: ogni esercizio con `impact: true` ha `impactLevel ≥ 1`; ogni salto o balzo ha `contactsPerRep`;
    `balzi-del-pattinatore` ha livello 2; i salti del riscaldamento entrano nei tetti di contatti.
63. Registrazione senza carico: una seduta K o di pliometria segnata tutta «fatta» dal lettore vale il 100% in costanza e nei
    pavimenti di `blockReview` (`doneSets` le conta).
64. R8 con la settimana predefinita (partita lunedì, calcetto mercoledì, allenamento giovedì) e una zona sotto il ginocchio
    sopra soglia negli ultimi 14 giorni: venerdì senza impatti, la proposta nasce con varianti di livello 0 e la pagina
    Obiettivi mostra la riga del § 2.3.

### 13.8 Integratori

39. Catalogo: i controlli del § 9.1.
40. Ricerca: «vit d3» → vitamina D; «omega 3», «olio di pesce», «fish oil» → omega-3; «vitamina B» → complesso B primo, poi B12;
    «D3 + K2» → composto con vitamina D e K; «vitamina e» → vitamina E; «vitamina c e vitamina e» → composto con C ed E;
    «magnesio e potassio» → composto; «tribulus» → `gruppo-d-ais`; «xyz» → nessun risultato.
41. `parseDose`: «5 g»; «1-2 g di EPA+DHA» → 1.000 mg; «2000 UI» → 50 µg; «Dose da definire con l’esame» → da definire; «2
    capsule» → foto.
42. Conversioni: UI → µg (vitamina D); vitamina E naturale e sintetica, con i fattori del limite (0,67 e 0,91) distinti da quelli
    del testo: 400 UI sintetiche → 364 mg per il limite → `ul:vitamina-e` (conferma) e `cancro:vitamina-e`; forma ignota come la
    sintetica; mmol → mg (nitrati); calcifediolo × 2,5. Caffeina: 3 caffè al giorno × `ESPRESSO_CAFFEINE_MG` = 240 mg.
43. Totali: B6 da complesso B (10 mg) più elettroliti (2 mg) → oltre i 12 mg; magnesio 250 mg più ZMA → oltre (solo integratori);
    vitamina D 25.000 UI a settimana → media 89 µg, vicino; ferro a giorni alterni → media metà, giorno peggiore pieno.
44. Controlli: niacina 54 mg senza forma → `forma:niacina`; ferro senza esame → `esame:ferro`; beta-carotene con `smoker: 'ex'` →
    conferma; caffeina 200 mg alle 20:00 con il letto alle 23:15 → `sonno:caffeina`; vitamina C 1.000 mg → `vitc:adattamenti`;
    acido folico 800 µg → `cancro:acido-folico`.
45. Momenti: vitamina D con una colazione da 5 g di grassi → pranzo; ferro con il cappuccino a colazione → riga nel dettaglio
    dello spuntino; collagene nel giorno di palestra alle 17:00 → riga «Prima, alle 16:00» nel dettaglio della palestra, nel
    giorno di riposo → riga nel dettaglio della merenda; beta-alanina → 4 prese; caffeina in un giorno senza seduta → nessuna
    riga; nessun id di voce nuovo nella timeline; gli id di oggi restano.
46. Migrazione: i tre predefiniti di oggi → creatina 5 g (proposta 3 g), omega-3 1-2 g (proposta 600 mg), vitamina D da definire
    (proposta 15 µg); «Proteine» → domanda; nessuna dose cambia senza conferma.
47. Etichette (risposte registrate, niente rete): vitamina D3 in gocce; complesso B estero «B-100» → `itmax` e `ul:vitamina-b6`;
    multivitaminico con beta-carotene; etichetta sfocata → `bassa-certezza`; foto di un piatto → `non-integratore`; vitamina D in
    mg invece di µg → `plausibile`; risposta troncata e rifiuto.

### 13.9 Coach

48. Validatori a prova di caso: JSON casuale o malformato non fa mai eccezioni e non viene mai accettato fuori dai limiti (test a
    proprietà).
49. Un ritocco con un id fuori dai candidati, o che aggiunge una violazione dura, finisce in `rejected` con il motivo; gli altri si
    applicano nell'ordine ricevuto.
50. `runStructuredTask` con un client finto: rifiuto, `max_tokens`, JSON non valido, rete assente, interruzione → l'esito giusto,
    mai un'eccezione non gestita; `usage` registrato.

### 13.10 Interfaccia

51. Oggi: sui dati di esempio, alle 08:00, 13:00 e 21:00, il numero di elementi interattivi in vista non cresce rispetto alla fase
    1 (conteggio negli screenshot automatici). Lo stesso con un profilo di prova che ha un integratore legato alla seduta
    (collagene prima della palestra) e il ferro: le loro prese sono righe di dettaglio, non voci.
52. Nessun pulsante disattivato nei componenti nuovi (ricerca di `disabled` con le eccezioni annotate).
53. Screenshot a 360 e 390 px, tema scuro e chiaro, di tutti i fogli e le pagine nuove; nessuno scorrimento orizzontale.
54. Flussi Playwright con il coach finto: foto dal pranzo → olio → «Segna il pranzo» → «Salva tra i miei piatti» → il giorno dopo,
    offline, «I miei piatti» → «Abbondante» → «Segna»; «Non mi piace» → il pasto di domani cambia e la spesa con lui; sabato:
    menù nuovo → «Approva» → la spesa cambia → «Annulla» → torna; sabato con la spesa già spuntata: «Dopo la spesa: servono 3
    prodotti in più» → «Approva» → «Da comprare in più» in cima alla Spesa; domenica a fine blocco: proposta nella revisione →
    «Approva» → pillola «Settimana 1 di 4»; «creatina» aggiunta in tre tocchi; revisione degli integratori; «Fotografa il
    piatto» con il selettore annullato → resta il foglio della voce, nessun foglio vuoto.

### 13.11 Criteri di accettazione per funzione

- **A**: dal pasto di Oggi a «Segnato» servono solo il foglio della voce, «Fotografa il piatto», lo scatto, la scelta dell'olio e
  «Segna» (i grammi si ritoccano se si vuole); i valori del giorno, la revisione e il
  coach usano la stima; senza chiave la riga non c'è; senza rete l'utente trova un'uscita utile; niente si salva da solo.
- **B**: un piatto salvato si segna offline in 3 tocchi dal foglio della voce («I miei piatti», il piatto, «Segna»); i più usati in cima; nel backup con la miniatura.
- **C**: con date, obiettivi e storico qualunque, anche senza calcio registrato, il blocco e il menù proposti nascono e passano
  tutti i limiti; il dolore e il carico cambiano il contenuto, non fanno sparire la proposta; ogni proposta mostra le
  differenze e si approva, si scarta, si annulla e si ritrova nello storico; senza rete tutto funziona tranne la rifinitura;
  senza i campi nuovi l'app è quella di oggi.
- **D**: un ingrediente tolto non ricompare in nessun punto del piano dal giorno dopo finché non si riattiva; le alternative
  hanno valori simili e prima gli stessi prodotti; l'app chiede dopo i cambi ripetuti e non toglie niente da sola.
- **E**: A1-A10 valgono su ogni menù; la revisione mostra le misure fuori dal riferimento e al massimo tre domande facoltative.
- **F**: aggiungere un integratore del catalogo non chiede di scrivere numeri; dosi, momento, limiti ed esami vengono dal catalogo
  con le fonti; la somma avvisa oltre i limiti e chiede conferma; i promemoria seguono i pasti; nessuna dose cambia in silenzio.

---

## 14. Piano di costruzione

### 14.1 Regole

- Al massimo **2 agenti alla volta**. Ogni agente modifica solo i file della sua area; un file di un'altra area si chiede
  all'integrazione.
- `domain/types.ts` lo scrive l'onda 0, tutto il § 12.1, una volta sola. Dopo si aggiungono solo tipi locali dei motori.
- Le firme del § 12.2 e del § 14.3 non cambiano dopo l'onda in cui nascono; l'implementazione dietro una firma può crescere
  nell'onda indicata (per esempio `menuWeekInForce` nell'onda 2A).
- Ogni onda finisce con `npm run typecheck`, `npm test`, `node scripts/check-typography.mjs --strict`,
  `node scripts/check-privacy.mjs --strict`, `npm run build:preview`, screenshot e un commit.
- **Privacy come controllo, non come promessa.** `scripts/check-privacy.mjs` legge i file tracciati da git (`git ls-files`) e
  fallisce se trova: percorsi assoluti di una macchina (`/tmp/`, `/home/`, `/root/`, `/Users/`), indirizzi email, identificativi <!-- privacy-ok -->
  di sessione, oppure una delle parole dell'elenco privato. Come per la tipografia, una riga con il segno `privacy-ok` non si
  controlla: serve solo alle righe che descrivono gli schemi, come quella sopra, e lo script stesso. L'elenco privato (dati dell'utente: misure, orari, abitudini,
  prodotti, zone) **non sta mai nel repository**: lo legge dal percorso in `RITMO_PRIVACY_WORDS` o da
  `~/.config/ritmo/privacy-words.txt`. Senza elenco lo script controlla solo gli schemi generici e lo dice; con `--strict`
  senza elenco fallisce, così nessuna onda si chiude senza il controllo completo.
- **Dopo il passo 0 nessuna onda dipende da file fuori dal repository.** Lo scratchpad della sessione è temporaneo: in
  un'altra sessione, nel cloud o dopo una pulizia non c'è più.

**Passo 0 · Materiali (l'orchestratore, da solo, prima dell'onda 0).** In quest'ordine, ciascun punto con il suo commit:

1. scrive l'elenco privato fuori dal repository e `scripts/check-privacy.mjs`, e lo lancia su questo file e sui materiali
   da copiare; corregge quello che segnala;
2. **patch di prevenzione**: `git apply --check` sull'HEAD del momento, `git apply`, `npm test` con i 610 test verdi, commit
   dedicato («Ritmo: prevenzione oncologica nel menù»). Se il check non passa, il passo si ferma: la patch non si adatta a
   mano;
3. **ragù del seme in freezer** (§ 4.11): `s1-ragu`, `s2-ragu` e la loro guida in `data/menu.ts`, con un test che nessun
   compito del seme si mangi dal frigo oltre i giorni del suo componente; commit dedicato;
4. **dati nel repository**: `scripts/data/supplement-catalog.json` (copia del catalogo con la sola dose predefinita della
   vitamina D cambiata, § 9.1), `docs/fase2/prevenzione-fonti.md` (fonti e numeri della prevenzione) e
   `docs/fase2/catalogo-integratori.md` (testi e fonti per voce), tutti passati dal controllo della privacy e senza percorsi
   assoluti; questo file; commit. Le bozze di lavoro non si copiano: dove servivano, il loro contenuto è già qui.

Se un materiale del passo 0 non c'è più, il piano si ferma e lo dice: il catalogo e la patch non si ricostruiscono a memoria.

### 14.2 Onde

| Onda | Agente | Area di file | Dipende da | Consegna |
|---|---|---|---|---|
| 0 | **0A · Fondamenta 2** (parte per primo; il suo primo commit è `domain/types.ts` più `engine/plan/proposals.ts`) | `domain/types.ts`; `engine/plan/proposals.ts` (funzioni pure: `planBasis`, `proposalId`, `applyPatch`, `beforeOf`, `isSuperseded`); `state/store.ts` (normalizzazione, versione 4, archivio freddo del § 12.5, azioni del § 12.3, `applyProposal` con i limiti); `engine/energy.ts` (§ 2.1) e il suo uso in `dayTargetFor`; `data/defaults.ts` (vitamina D 15 µg, `ESPRESSO_CAFFEINE_MG`); `data/supplementCatalogIds.ts` e il suo test; `data/foodFactsTypes.ts` e `data/estimateFoods.ts` vuoto (solo le esportazioni, per 1A e 1B); `lib/backup.ts`; `app/OverlayHost.tsx` e `app/boot.ts` (tre pannelli con segnaposto); `engine/menu.ts` (`menuWeekInForce`, `prepInForce`, `plannedMealsForDate`, `weekSubstitutions` che per ora non sostituisce, `DayMeals.source`); `engine/plan/program.ts` (solo `sessionFor` e `daySession` di compatibilità, `weekOverrides`); i 31 punti di `SESSIONS[...]` e i 5 di `menuWeekFor`; `engine/nutrition.ts` (`eatenMeal`, `carbScaleForMeals`) e i tre lettori; `engine/review.ts` (`apply` di scarico e settimana leggera, tetto delle correzioni); `engine/compat.test.ts`; `demo/seed.ts`; «Modifiche al contratto» in `docs/SPEC.md` | passo 0 | contratto dei tipi; risolutori che a campi vuoti danno l'app di oggi; limiti dell'energia anche per i piani di oggi |
| 0 | **0B · Proposte e coach** (parte dopo il primo commit di 0A) | `engine/rng.ts`; `engine/plan/diff.ts` (`diffMenus`, `diffPrograms`, `diffWeeks`, `diffTargets`, `topDiff`, `restoreTo`); `lib/claudeTasks.ts` ed esportazioni minime da `lib/claude.ts` (`modelSupport.structuredOutputs`, `usage`); `features/piano/{PlanProposalSheet,StoricoPage,actions,useProposals}.ts(x)` | tipi e `proposals.ts` di 0A | ciclo di vita completo provato con proposte finte; chiamata strutturata provata con un client finto |
| 1 | **1A · Pasti (A, B)** | `engine/estimate.ts`, `engine/dishes.ts`, `data/estimateFoods.ts` (`ESTIMATE_FOODS` e `ESTIMATE_FOOD_FACTS`, con il test di copertura), `engine/coachTasks/photo.ts`, `lib/image.ts` (`thumbnail`), `features/pasti/**`, `oggi/components/ItemActionsSheet.tsx` (due righe, il `<label>` del § 7.1), dettagli dei pasti in `engine/timeline.ts`, `coach/components/Messages.tsx` («Metti nel diario») | 0A, 0B | A e B completi |
| 1 | **1B · Gusti e prevenzione (D, E)** | `data/foodFacts.ts` (`FOOD_FACTS` di `FOODS` e `factsOf`, che legge anche `ESTIMATE_FOOD_FACTS`), `data/recipeFacts.ts`, `engine/exclusions.ts`, `engine/prevention.ts`, `engine/similar.ts`, `weekSubstitutions` in `engine/menu.ts`, `data/barPlanB.ts` (`contains`), `coach/BarPlanBSheet.tsx`, `coach/barPick.ts`, `engine/coachContext.ts` (esclusioni), `settimana/RecipeSheet.tsx`, `settimana/SwapSheet.tsx`, `impostazioni/pages/GustiPage.tsx` e la sua riga, misure e domande in `engine/review.ts` e `progressi/ReviewSheet.tsx`. Le misure su alimenti di sola stima (B2) si provano con fatti iniettati: i fatti veri di 1A arrivano con l'integrazione dell'onda | 0A | esclusioni ovunque, «Cambia», domande, misure |
| 2 | **2A · Menù generato** | `engine/menuGen/**`, `data/prepComponents.ts`, `data/foodFacts.ts` e `data/recipeFacts.ts` (ceduti da 1B per l'onda 2: stagionalità, cotture e `prep` degli alimenti e delle ricette nuove), `engine/menu.ts` (ripetizione dell'ultima settimana approvata, § 4.10), `data/menu.ts` (`PREP_GUIDE` per componente), `data/menu.test.ts` (sul validatore), `data/recipes.ts` e `data/foods.ts` (ricette e alimenti nuovi), `settimana/{MenuTab,ShoppingTab,PrepTab,PrepPlayer}.tsx` («Da comprare in più» compreso), `settimana/useMenuProposal.ts` | 1B, 0B | menù della settimana dopo come proposta, preparazione generata |
| 2 | **2B · Allenamento generato** | `engine/plan/{season,week,program,limits,readiness,blockReview,returnStages,build}.ts`, `engine/training.ts` (fermo per i segnali d'allarme nel freno degli impatti), `data/exercises.ts`, `data/sessions.ts`, `features/allenamento/**`, `engine/timeline.ts` (`gymDuration` con la data), `impostazioni/pages/ObiettiviPage.tsx` (la pagina di oggi con lo stesso nome diventa `MacroPage.tsx`, «Calorie e macro»; la nuova `ObiettiviPage.tsx` è quella del § 11.4), `impostazioni/pages/ProfiloPage.tsx` (obiettivo tolto), `impostazioni/pages/SalutePages.tsx` (la riga dei segnali nella pagina Dolore), le righe in `ImpostazioniScreen.tsx`, l'avviso del controllo del mattino in `oggi/CheckInSheet.tsx`, `engine/targets.ts` (obiettivi per tipo di giorno delle proposte di obiettivi) | 0A, 0B | blocchi, giorno adattato, obiettivi su tre livelli, segnali d'allarme |
| 3 | **3A · Integratori (F)** | `scripts/build-supplement-catalog.mjs`, `data/supplementCatalog{,Text}.ts` e test, `data/supplementCatalogIds.ts` (da qui lo genera lo script), `engine/supplements.ts`, `engine/coachTasks/label.ts`, `impostazioni/components/SupplementEditor.tsx` e il foglio `supplement`, la pagina degli integratori (`IntegratoriPage` in `impostazioni/pages/PianoPages.tsx`), `engine/timeline.ts` (`supplementMoments`, righe di dettaglio), `engine/ics.ts`, le righe degli integratori in `engine/coachContext.ts`. `scripts/data/supplement-catalog.json` si legge, non si cambia | 0A, 0B | catalogo, dosi, etichetta, somma, promemoria, esami, migrazione |
| 3 | **3B · Coach del piano e revisione** | `engine/coachTasks/{block,menu}.ts`, `features/piano/coachPass.ts`, `engine/review.ts` (area `piano`, fine blocco), `progressi/areas.ts`, `progressi/ReviewSheet.tsx` (fine blocco), `impostazioni/pages/CoachPage.tsx` (rifinitura, uso del mese), il resto del contesto del coach in `engine/coachContext.ts`, pasti stimati con la provenienza compresi (dopo 3A, in fila sullo stesso file) | 2A, 2B | rifinitura con scarti visibili, revisione di fine blocco, costi veri |
| 4 | **Integrazione** (un agente) | `docs/SPEC.md`, `docs/UI.md`, parametri delle anteprime, flussi Playwright con il coach finto, conteggio degli elementi di Oggi, prestazioni con la CPU rallentata 4 volte in Chromium, bilancio dello spazio su uno stato sintetico di un anno (§ 12.5), test con i fatti veri delle sole stime nelle misure della revisione, dati di esempio rifiniti | tutte | fase 2 chiusa |

Se 0A è troppo grande si divide in 0A1 (tipi, `proposals.ts`, stato, archivio, backup, pannelli, `energy.ts`) e 0A2 (risolutori,
31 punti, istantanea), in fila; 0B parte dopo il primo commit di 0A1. In ogni onda i due agenti non hanno file in comune,
tranne dove la tabella dice «in fila»; un file ceduto da un'onda alla successiva ha un solo proprietario per onda.

### 14.3 Firme congelate tra le onde

```ts
// onda 0
sessionFor(slot: string, iso: ISODate, plan: Pick<Plan, 'program' | 'weekOverrides'>): WorkoutSession | undefined;
daySession(slot: string, iso: ISODate, state: TrainingState): DaySession | null;
menuWeekInForce(iso: ISODate, plan: Pick<Plan, 'startDate' | 'menus'>): MenuWeek | undefined;
prepInForce(monday: ISODate, plan: Plan): PrepTask[];
eatenMeal(log: DayLog | undefined, slot: MealSlot): EatenMeal | null;
carbScaleForMeals(recipes: (Recipe | undefined)[], dayType: DayType, target: MacroTarget, carbFloorG?: number): number;
runStructuredTask<T>(task: StructuredTask<T>, opts: TaskOptions): Promise<TaskResult<T>>;
plannedMealsForDate(iso: ISODate, plan: Plan): DayMeals;
weekSubstitutions(monday: ISODate, plan: Plan): Partial<Record<ISODate, Partial<Record<MealSlot, string>>>>;
planBasis(kind: PlanChangeKind, state: ProposalState): string;
proposalId(kind: PlanChangeKind, effectiveFrom: ISODate, basis: string, attempt: number): string;
applyPatch(plan: Plan, profile: Profile, patch: PlanPatch): { plan: Plan; profile: Profile };
beforeOf(plan: Plan, profile: Profile, patch: PlanPatch): PlanPatch;
isSuperseded(p: PlanProposal, state: ProposalState, today: ISODate): boolean;
goalDeltaOf(plan: Plan, profile: Profile, reviews: readonly WeeklyReview[]): number;
dayEnergyDelta(iso: ISODate, state: EnergyState): number;
clampKcalCorrection(value: number, plan: Plan, profile: Profile, reviews: readonly WeeklyReview[]): number;
restoreTo(version: PlanVersion, state: ProposalState, today: ISODate): PlanProposal;          // 0B
// onda 1
excludedFoods(plan: Pick<Plan, 'exclusions'>, iso?: ISODate): ReadonlySet<string>;
recipeAllowed(recipe: Recipe, excluded: ReadonlySet<string>): boolean;
mealAlternatives(entry: MealEntry, ctx: AlternativeCtx, limit?: number): Recipe[];
weekPreventionStats(meals: PlannedMeal[], ctx: PreventionCtx): PreventionStats;
resolveEstimate(raw: PhotoReading, ctx: EstimateCtx): EstimateDraft;
// onda 2
validateMenuWeek(week: MenuWeek, ctx: MenuValidationCtx): Violation[];
generateMenuWeek(input: MenuGenInput): MenuGenResult;                    // sincrona, una sola strada (§ 4.10)
prepTasksFor(week: MenuWeek): PrepTask[];
validateWeek(plan: Plan, program: Program, week: number, ctx: TrainingCtx): Violation[];
plannedLoad(monday: ISODate, plan: Plan): { football: number; controllable: number };   // R10, previsto
buildBlock(input: TrainingBuildInput): TrainingBuildResult;
// onda 3
searchCatalog(query: string, catalog: readonly CatalogEntry[], limit?: number): CatalogHit[];
supplementTotals(plan: Plan, catalog: readonly CatalogEntry[]): NutrientTotal[];
checkSupplements(state: SupplementState, catalog: readonly CatalogEntry[]): SupplementCheck[];
supplementMoments(iso: ISODate, state: TimelineState, catalog: readonly CatalogEntry[]): SupplementMoment[];
```

### 14.4 Prima dell'onda 1, con l'utente

- Una chiamata reale con la chiave dell'utente, con il suo consenso: `output_config` con `effort` e `format` insieme a
  `fallbacks: 'default'`; `countTokens` di una foto da 1.024 px; 20 foto di piatti e 20 etichette per scegliere l'effort.
- Su iPhone, nella app installata: il `<label>` del § 7.1 apre il selettore di `<input type="file" accept="image/*">` senza
  `capture` (fotocamera e libreria), l'annullamento lascia il foglio della voce, il `change` apre la lettura; il tempo di
  `generateMenuWeek` dopo il primo disegno.
- L'utente controlla la tabella della stagionalità, i giorni in frigo dei componenti della preparazione (§ 4.11) e la dose
  predefinita della vitamina D (15 µg, con 25 µg tra le opzioni, § 9.1).

### 14.5 Fuori da questa fase

Piatti composti a mano e piatti nel menù e nella spesa; ricerca web per gli integratori fuori catalogo; pagina Esami; gruppi di
alimenti ed esclusioni per allergia; sale, calcio e omega-3 per alimento; domanda sulle gambe nel controllo del mattino; test del
salto in lungo; modalità vacanza e «Sposta la seduta»; «Ho poco tempo» nel lettore della seduta (compressione a minuti: serve un
contratto, un campo in `WorkoutLog` e i test, e nessuno l'ha chiesto); alternative chieste al coach in testo libero; chiave del
coach su un server; archivio in IndexedDB; Web Worker.

---

## 15. Domande aperte

Solo quelle che cambiano il progetto. Per ognuna vale la raccomandazione finché l'utente non risponde.

1. **Foto del pasto previsto.** Se fotografa il pranzo del menù, la voce resta «fatto» con i valori della foto, oppure conta
   sempre come «sostituito»? *Raccomandazione: «fatto» con i valori della foto (§ 7.5); con «sostituito» l'aderenza di un pasto
   mangiato come previsto scenderebbe a metà.*
2. **Menù del sabato.** Ogni menù nuovo si approva a mano, oppure le modifiche piccole (solo frutta di stagione, al massimo un
   pasto) passano da sole con un avviso? *Raccomandazione: sempre a mano (§ 5.3), come chiede la regola «ogni piano nuovo è una
   proposta»; se non approva si ripete l'ultima settimana approvata, se è di stagione, e niente si blocca (§ 4.10).*
3. **Rifinitura del coach.** Automatica su ogni proposta di blocco e di menù quando c'è rete (circa 0,5 $ al mese), o solo su
   richiesta? *Raccomandazione: automatica, con l'interruttore in Impostazioni › Coach (§ 5.6).*
4. **Obiettivo del corpo.** Oggi si cambia nel Profilo e vale subito; nella fase 2 diventa una proposta dalla pagina Obiettivi,
   con le calorie per tipo di giorno ricalcolate e mostrate prima di valere. Va bene? *Raccomandazione: sì (§ 2.1).*
5. **Allergie o intolleranze.** C'è qualche alimento da trattare più severamente di un gusto (anche nel piano B e nelle risposte
   libere del coach)? *Raccomandazione: se no, bastano le esclusioni per alimento; se sì, serve una classe «allergia» con
   controlli anche sui piatti fotografati, da progettare prima dell'onda 1.*
6. **Domande della prevenzione nella revisione.** Tre domande facoltative da un tocco (carne rossa e salumi fuori dal menù,
   alcol) o nessuna? *Raccomandazione: le tre domande (§ 4.7); senza, le misure di alcol e pasti fuori, le prime due leve, non
   esistono.*
7. **Esami e coach.** Il valore di un esame collegato a un integratore può entrare nel contesto del coach? *Raccomandazione: sì,
   solo quello collegato (§ 10.9), con una riga nella scheda che lo dice.*
8. **Uscita strutturata con i fallback** (verifica tecnica con la chiave dell'utente, § 14.4). Se `output_config.format` e
   `fallbacks: 'default'` non stanno insieme, i compiti strutturati partono senza fallback o con la chat come ripiego?
   *Raccomandazione: senza fallback; un rifiuto resta gestito con «Riprova» e il percorso del solo motore.*
9. **Vitamina D predefinita.** 15 µg (600 UI, fabbisogno EFSA, coerente con la Endocrine Society 2024) o 25 µg (1.000 UI, IOC
   2018 per gli atleti da autunno a primavera, sostegno «moderate»)? *Raccomandazione: 15 µg predefiniti con 25 µg tra le
   opzioni (§ 9.1): chi ha già una dose sua la tiene con «Tieni la tua».*
10. **Conservazione della preparazione.** Cereali cotti 1 giorno, pesce 2, pollo, legumi e frittatine 3, il resto in freezer
    (§ 4.11): troppo prudente per l'uso di casa? *Raccomandazione: tenerli; costano solo un passaggio dal freezer al frigo la
    sera prima, e il riso cotto è il caso con più prove.*
11. **Palestra nella prima settimana di precampionato.** Con R10 previsto contro previsto, quando la squadra si allena 3 o più
    volte la palestra riparte dai pavimenti e cresce ogni settimana (§ 3.2). Va bene, o l'utente preferisce tenere 2 sedute di
    forza fin da subito, accettando un salto del carico? *Raccomandazione: la rampa; la forza torna piena entro 2-3 settimane e
    il salto del carico nella prima settimana è il momento più rischioso per la tibia.*
12. **Segnali d'allarme.** Il fermo degli impatti (§ 3.8) si toglie solo con un via libera esplicito: va bene anche se l'utente
    lo tocca per sbaglio? *Raccomandazione: sì; l'avviso con «Annulla» per 5 secondi copre lo sbaglio, poi serve il via libera,
    perché qui un falso allarme costa una settimana di cyclette e un falso via libera una frattura da stress.*

---

## 16. Correzioni della revisione modificate o rifiutate

Le correzioni accettate così come proposte sono già nel testo. Qui solo quelle cambiate o respinte, con il motivo.

| Punto | Proposta del revisore | Decisione | Motivo |
|---|---|---|---|
| R10 (§ 3.2) | vincolo sulla sola quota controllabile, +10%; registrato solo con l'80% del calcio registrato; rampe scritte a parte | **modificata**: `F + C ≤ 1,10 ×` il totale previsto più alto delle 4 settimane prima, sempre previsto contro previsto; il calcio è fisso e cede solo `C` | una regola sola copre stagione, calcio non registrato e cambi di fase: la rampa del precampionato nasce dalla regola, quella dello sviluppo non serve |
| deficit ricavato (§ 2.1) | `GOAL_DELTA_KCAL` più le correzioni, oppure `targets` meno `computeTargets` a obiettivo neutro | **prima strada** | la seconda dipende dal peso e dall'età di oggi, non solo dall'obiettivo: darebbe un deficit che non c'è |
| conservazione (§ 4.11) | i compiti scritti a mano del seme restano identici | **respinta per il ragù** | il seme stesso mangia il ragù dal frigo al quarto giorno: si corregge nel passo 0, con il test che lo controlla |
| strati del menù (§ 6.4) | `dayCarbScale` legge lo strato 1 | **modificata**: le sostituzioni usano la scala dello strato 1, `dayCarbScale` legge lo strato 2 già deciso | la catena finisce lo stesso e il minimo di 6 g/kg si calcola sul pasto che si mangia davvero |
| serie senza carico (§ 3.7) | ripetizioni previste, oppure `SetLog.kind` | **prima strada** | nessun cambio di contratto e `doneSets` resta com'è |
| selettore su iPhone (§ 7.1) | `<label>` più lo stato «Nessuna foto scelta» | **solo il `<label>`** | il foglio della voce resta aperto mentre il selettore è su: annullare non lascia nessun foglio vuoto da gestire |
| vitamina E (§ 9.3) | fattore della base dell'UL; nel test «400 UI sintetiche → vicino al limite» | **accettata con i numeri corretti** | sulla base dell'UL EFSA (tutte le forme stereoisomeriche, in massa) 400 UI sintetiche sono circa 364 mg: oltre i 300, quindi `ul`, non «vicino» |
| A6 (§ 4.2) | conta soprattutto l'OMS | **respinta in parte** | il WCRF giudica «probable» la protezione per diversi tumori aerodigestivi, che per il WCRF è prova forte; all'OMS vanno i 400 g e la porzione da 80 g |
| giorno nello schema del menù (§ 10.6) | `enum` di interi 0-6 e «0 = lunedì» nel prompt | **modificata**: `enum` di nomi dei giorni | toglie l'ambiguità alla fonte invece di affidarla al prompt |
| fine blocco (§ 3.1) | approvazione con decorrenza da oggi se nessuna seduta è fatta | **respinta**; al suo posto `approvableUntil` | «oggi non cambia mai» (§ 5.4, test 11) vale per tutte le proposte; con la settimana predefinita il giorno in più c'è lo stesso |
| vitamina D (§ 9.1) | controllare la citazione IOC prima dell'onda 3A | **già fatta** | la tabella sull'immunità del consenso IOC 2018 dice 1.000 UI al giorno da autunno a primavera, sostegno «moderate»: l'etichetta resta |
| carne rossa fuori menù (§ 4.7) | 150 g, oppure due scelte da un tocco | **150 g** | una domanda con meno tocchi; il testo dice «circa» |
| segnali d'allarme (§ 3.8) | «Oggi non cambia» | **interpretata**: niente di nuovo nella schermata Oggi, ma il fermo vale da subito | un freno di sicurezza che aspetta domani lascerebbe i salti nella seduta di oggi |
| integratori nella normalizzazione (§ 14.2) | parametro `isKnownCatalogId` oppure JSON in 0A | **la seconda, ridotta**: `data/supplementCatalogIds.ts` con i soli id | la normalizzazione non dipende dal catalogo grande e il file pesa meno di 1 KB |
