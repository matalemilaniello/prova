# Catalogo degli integratori di Ritmo

Data: 2 novembre 2026. 49 voci, 465 sinonimi, 103 fonti distinte.

La fonte di verità è `scripts/data/supplement-catalog.json`. Questo file ne riporta gli stessi dati in forma leggibile; è stato generato da uno script di lavoro che controllava anche:

- id unici;
- da 2 a 4 opzioni di dose, in ordine, con la dose predefinita tra le opzioni;
- opzioni entro il limite superiore e il massimo per prodotto, salvo tre eccezioni dichiarate;
- sinonimi senza doppioni tra voci diverse;
- tipografia del repository (apostrofo ’, virgolette « », niente trattino lungo).

Il file non contiene dati personali.

## Come è costruito

- **Fonti.** Due ricerche: vitamine e minerali; sport e altri integratori diffusi. Due verifiche avversarie hanno riaperto le fonti primarie. Nel catalogo entrano solo dati **confermati** o **corretti** dalle verifiche; dove la verifica ha corretto, vale la correzione (elenco più sotto).
- **Due limiti diversi, da non confondere.**
  - Il **limite superiore** è l'UL EFSA/SCF, oppure il safe level o la dose senza rischi quando EFSA non fissa un UL. È un limite fisiologico, cronico. Di ogni limite il catalogo dice l'ambito: da tutte le fonti, solo integratori, solo forme aggiunte o solo forma preformata.
  - Il **massimo per prodotto in Italia** è la dose giornaliera ammessa per un singolo integratore dal Ministero della Salute. È un limite di etichetta, non di sicurezza. Serve anche a riconoscere un prodotto estero.
  - Esempio: per il magnesio il massimo italiano (450 mg) supera l'UL EFSA da integratori (250 mg).
- **Citazioni.** Ogni affermazione porta la fonte tra parentesi. «Inferenza» segna i ragionamenti nostri, non presenti nella fonte. Le fonti secondarie sono dichiarate.
- **Prove.** Il livello (forte, moderata, limitata, insufficiente, sfavorevole) misura la forza delle prove per l'uso descritto in «Quando serve», non per l'uso generico. Per questo la B12 ha prove «forti» (corregge una carenza) e insieme la posizione «solo su indicazione». «Sfavorevole» vuol dire danni dimostrati da RCT o da sintesi autorevoli.
- **Posizione.** Il consiglio per un adulto sano che si allena: utile, in situazioni precise, solo su indicazione, di solito non serve, sconsigliato.

## Convenzioni sulla dose predefinita

La dose predefinita è quella che l'app propone quando l'utente non ha l'etichetta. Non è una prescrizione. La dose vera, quando c'è, la dà l'etichetta letta dal coach.

1. **Integratori con prove sportive** (creatina, caffeina, omega-3, collagene, nitrati, beta-alanina, carboidrati): si usa la dose dei protocolli AIS, IOC e UEFA, entro il massimo italiano quando esiste.
   - Creatina: 3 g/die. È l'etichetta italiana e il claim UE, ed è dentro i 3–5 g dell'AIS.
2. **Vitamine e minerali senza indicazione di routine:** il fabbisogno di riferimento EFSA (PRI o AI) arrotondato.
   - Magnesio: sotto l'UL da integratori.
   - Ferro, rame e calcifediolo: l'app chiede l'esame prima della dose.
3. **Vitamina D: 15 µg (600 UI).** È il fabbisogno EFSA e il tetto dell'integrazione empirica per Endocrine Society 2024; 25 µg (1000 UI), la dose IOC per gli atleti da autunno a primavera, resta tra le opzioni (docs/FASE2.md § 9.1).
   - La ricerca proponeva 25 µg come predefinita; la specifica l'ha abbassata a 15 µg per coerenza con la linea guida citata, che suggerisce in modo condizionale di non andare oltre il fabbisogno negli adulti sani sotto i 75 anni.
   - Tutte e tre le opzioni (15, 25 e 50 µg) sono entro il massimo italiano e a metà o meno dell'UL.
4. **Opzioni sopra un limite**, ammesse solo con il motivo nell'etichetta dell'opzione:
   - creatina 5 g (AIS 3–5 g, sopra l'etichetta italiana);
   - ferro 60 mg (solo su prescrizione: il safe level non vale per la terapia);
   - glucosammina 1500 mg (farmaco con ricetta).

## Campi di `scripts/data/supplement-catalog.json`

Richiesti:

- **Identità:** `id`, `name`, `aliases` (sinonimi italiani, inglesi, chimici e forme), `category`.
- **Dose:**
  - `unit` è l'unità di riferimento: tutte le dosi sono in questa unità;
  - `defaultDose { amount, unit, label? }`;
  - `doseOptions` (2–4).
- **Limite:** `upperLimit { amount, unit, source, kind, scope, note? }` oppure `null`.
  - `kind`: `UL`, `safe-level` (ferro) oppure `senza-rischi-fino-a` (omega-3 e caffeina, valori EFSA che non sono UL).
  - `scope`: `totale`, `integratori`, `forme-aggiunte` o `preformata`.
- **Quando e come:** `timing` (colazione, pranzo, cena, sera); `withFood` (`true` con un pasto, `false` lontano dai pasti, `null` indifferente o nessuna indicazione); `withFat`.
- **Esami:** `needsTest` è `null` oppure `{ required, exams, when, interference? }`. `required` vale `true` quando l'esame va fatto prima di cominciare. `interference` descrive gli esami che il prodotto falsa.
- **Testi:** `evidence { level, ais, summary }`, `whenUseful`, `cautions`, `interactions`, `sportNotes`, `cancerNotes`, `antidoping { risk, note }`, `sources [{ label, url }]`.

Aggiuntivi, facoltativi. Servono alla somma degli apporti e ai promemoria:

| Campo | Significato | Voci |
|---|---|---|
| `stance` | posizione: `utile`, `situazionale`, `su-indicazione`, `non-serve`, `sconsigliato` | tutte |
| `itMax` | massimo giornaliero per prodotto in Italia (Ministero) | 27 voci |
| `conversions` | unità dell'etichetta → unità di riferimento | vitamina D (UI), vitamina E (UI naturale e sintetica), nitrati (mmol) |
| `countsAs` | conta come un'altra voce, con un fattore | calcifediolo → vitamina D × 2,5 |
| `contains` | prodotto composto: i nutrienti da leggere in etichetta | complesso B, multivitaminico, elettroliti, ZMA, pre-workout |
| `formLimits` | limite diverso per una forma | niacina: acido nicotinico 10 mg |
| `perIntakeMax` | massimo per singola presa | calcio, caffeina, beta-alanina, proteine |
| `dosesPerDay` | prese al giorno | beta-alanina 4; HMB, curcuma e amarena 2 |
| `schedule` | `giornaliero`, `giorni-alterni`, `con-la-seduta`, `periodi` | tutte |
| `slot` | pasto più preciso di `timing` | ferro (spuntino), collagene (merenda) |
| `workout` | prima, durante o dopo la seduta, con i minuti | caffeina, nitrati, bicarbonato, collagene, proteine e altri |
| `timingNote` | come prenderlo, in una frase | 12 voci |

## Correzioni delle verifiche recepite

**Vitamine e minerali**

- **D3 o D2.** La D3 è più efficace anche con la dose giornaliera (Tripkovic 2017). È superata la frase per cui con la dose giornaliera «l'effetto si perde».
- **IOC sulla vitamina D.** I 1000 UI/die da autunno a primavera vengono dalla tabella sull'immunità. Per la popolazione generale l'IOC indica da 800 a 1000–2000 UI.
- **Boli di vitamina D.** Aggiunti D-Health 2022 (boli mensili senza beneficio) e Sanders 2010 (megaboli annuali, più cadute e fratture).
- **Niacina.** L'epatotossicità grave compare con 3–9 g/die per mesi o anni, con casi isolati a 0,5–0,75 g. È corretta la frase «oltre 500 mg».
- **Vitamina C e adattamenti.** Il dato di Gomez-Cabrera 2008 (p=0,014) e i marcatori molecolari vengono dai ratti. Lo studio non è usato come prova sull'uomo.
- **Vitamina C e raffreddore.** Nella popolazione generale le persone sono 10.708, con RR 0,97 (0,94–1,00); 11.306 era il totale.
- **Vitamina C e calcoli.** Le coorti sono due (Thomas 2013 e Ferraro 2016), non una.
- **Gelatina con vitamina C (Shaw 2017).** Anche il placebo conteneva la vitamina C: lo studio non valuta la vitamina C.
- **Vitamina E.** L'UL non si applica a chi prende anticoagulanti o antiaggreganti. Aggiunto l'ictus emorragico (Schürks 2010).
- **Vitamina K2.** Già 10–20 µg/die di MK-7 abbassano l'INR (Theuwissen 2013).
- **Magnesio e diarrea.** I numeri sono riportati con i controlli: 11% contro 10% e 37% contro 14%.
- **Calcio e infarto.** È un segnale non confermato (NOF/ASPC 2016), non un aumento accertato.
- **B6.** Aggiunta la decisione TGA 2025.
- **Folati.** Aggiunto Ebbing 2009 come controparte sperimentale di Brasky 2017.
- **Nicotinamide.** Aggiunto ONTRANS 2023 (nessun beneficio nei trapiantati).
- **Multivitaminico.** Aggiunto COSMOS 2022.
- **Rame.** Aggiunto l'UL di 5 mg.
- **Ferro e ora della giornata.** Aggiunto McCormick 2019.
- **Zinco.** Aggiunta l'interazione con tetracicline e chinoloni.

**Sport e altri integratori**

- **Creatina ed esami.** La creatinina sale davvero e può far sottostimare il filtrato. Non è un «falso aumento» (Antonio 2021).
- **Omega-3 e fibrillazione atriale.** Anche fino a 1 g/die l'aumento è significativo (HR 1,12, 1,03–1,22). Il gruppo oltre 1 g/die comprende solo trial con 1,8–4 g/die in pazienti cardiovascolari.
- **Proteine.** Il punto di rottura a 1,62 g/kg ha un IC di 1,03–2,20; gli autori suggeriscono circa 2,2 g/kg per il massimo guadagno.
- **Bicarbonato.** L'UEFA l'ha tolto perché non si usa nel calcio d'élite, non per prove negative.
- **Collagene.** Esiste un RCT sull'epicondilite (Scaturro 2025), molto debole. Praet 2019 è finanziato dal produttore. La revisione JFMK 2026 riguarda adulti sani, non la tendinopatia. Dose AIS: minimo 20 g.
- **Probiotici.** La Cochrane 2022 non riguarda atleti. Negli atleti i benefici sono sui sintomi riferiti.
- **Melatonina.** Il limite precedente di 5 mg e i medicinali da 2 mg vengono da NutraIngredients 2013, non da Quotidiano Sanità.
- **Amarena.** «Nessun beneficio dimostrato nel calcio», non «nessun beneficio».
- **Caffeina.** È nel programma di monitoraggio WADA 2026, solo in gara. Dal 2026 è monitorato anche l'ecdisterone. I 107 mg di Gardiner si riferiscono a 250 mL di caffè filtro.
- **Curcumina.** Aggiunta l'ADI EFSA di 3 mg/kg per il colorante E 100.

## Voci escluse e perché

Questi prodotti passano dalla via «fuori catalogo» (coach, stesse regole):

- **Dati di dose non verificati:**
  - aminoacidi essenziali (EAA): nessuna classificazione AIS e nessuna dose verificata;
  - carnitina e condroitina: solo il massimo ministeriale (1000 mg e 500 mg);
  - cromo: solo il massimo ministeriale, 250 µg da fonte secondaria.
- **Prodotti composti non studiati come tali:** olio di fegato di merluzzo (vitamina A, vitamina D e omega-3).
- **Voci AIS non trattate dalle ricerche:** glicerolo, chetoni, NAC, membrana del guscio d'uovo, carnitina, quercetina, echinacea, glutammina.

## Incertezze

**Fonti non lette sull'originale**

- **Ministero della Salute.** Il sito ha un controllo anti-bot.
  - Vitamine e minerali: è verificata la revisione 2018; la 2021 solo da una riproduzione (cambia il cromo).
  - «Altri nutrienti»: è letta la revisione 9/2019; una revisione del 2022 esiste ma non si è potuta aprire.
  - I limiti di creatina, caffeina, melatonina, BCAA, HMB e glucosammina vanno ricontrollati a mano sull'elenco in vigore.
- **Nota AIFA 96.** Viene da una riproduzione, controllata con il comunicato AIFA 2023.
- **Altre fonti secondarie:** iodio OSNAMI; ashwagandha (regolatori europei); curcuma (avvertenza 2019, circolare 2022 non verificata); melatonina; piombo nelle proteine vegetali.

**Valori da ricontrollare**

- **Niacina.** L'ambito dell'UL della nicotinamide (solo forme aggiunte) non è stato ricontrollato sul testo SCF.
- **Vitamina E.** Le conversioni da UI (0,67 mg per l'UI naturale, 0,45 mg per la sintetica) vengono dagli esempi LPI.
- **Vitamine A, E e K.** Il campo «con grassi» viene dalla fisiologia delle vitamine liposolubili. Nessuno studio specifico è stato letto in questa ricerca.
- **Dosi predefinite.** Seguono le convenzioni dichiarate sopra; le dosi tipiche dei prodotti in commercio non sono state verificate. Lo stesso vale per opzioni senza fonte diretta: B12 50 µg, vitamina C 200 mg, magnesio 200 mg, selenio 50 µg, potassio 500 mg e 1000 mg, citrullina 6 g. Sono scelte prudenti dentro i limiti, segnate come inferenza.

**Prove deboli o non trasferibili**

- **Popolazioni diverse dall'uso in Ritmo.**
  - Omega-3 e fibrillazione atriale: pazienti cardiovascolari anziani.
  - Calcio, vitamina D e fratture da stress: reclute donne.
  - Ferro a giorni alterni: donne con riserve basse.
- **Studi piccoli o con conflitti d'interesse:**
  - collagene: studi piccoli e finanziati dai produttori;
  - creatina e capelli: un solo RCT;
  - ashwagandha: soli trial indiani, numeri incoerenti.
- **Caffeina nell'espresso italiano.** La soglia di Gardiner va ricalcolata sul contenuto reale, che le fonti lette non misurano (l'AIS riporta 107 mg in media, da 25 a 214, per l'espresso australiano).
- **Nessun RCT** su vitamina D, calcio, magnesio o collagene nella sindrome da stress tibiale mediale.

## Sintesi

| Integratore | Posizione | Prove | Dose predefinita | Limite superiore | Massimo per prodotto |
|---|---|---|---|---|---|
| Vitamina D | in situazioni precise | moderata · AIS A | 15 µg | 100 µg (UL, da tutte le fonti) | 50 µg |
| Calcifediolo | solo su indicazione | limitata | 10 µg | – | – |
| Vitamina B1 (tiamina) | di solito non serve | insufficiente | 1,1 mg | – | 25 mg |
| Vitamina B2 (riboflavina) | di solito non serve | insufficiente | 1,6 mg | – | 25 mg |
| Niacina (vitamina B3) | di solito non serve | insufficiente | 18 mg | 900 mg (UL, solo forme aggiunte) | 54 mg |
| Acido pantotenico (vitamina B5) | di solito non serve | insufficiente | 5 mg | – | 18 mg |
| Vitamina B6 | di solito non serve | insufficiente | 1,7 mg | 12 mg (UL, da tutte le fonti) | 10 mg |
| Biotina (vitamina B7, H o B8) | di solito non serve | insufficiente | 40 µg | – | 450 µg |
| Acido folico (folati) | solo su indicazione | forte · AIS A | 200 µg | 1000 µg (UL, solo forme aggiunte) | 400 µg |
| Vitamina B12 | solo su indicazione | forte | 4 µg | – | 1000 µg |
| Complesso B | di solito non serve | insufficiente | 1 compressa | – | – |
| Vitamina C | in situazioni precise | limitata · AIS B | 200 mg | – | 1000 mg |
| Vitamina E | sconsigliato | sfavorevole · AIS C | 13 mg | 300 mg (UL, da tutte le fonti) | 60 mg |
| Vitamina A | di solito non serve | insufficiente | 750 µg | 3000 µg (UL, solo forma preformata) | 1200 µg |
| Beta-carotene | sconsigliato | sfavorevole | 4,5 mg | – | 7,5 mg |
| Vitamina K | di solito non serve | insufficiente | 70 µg | – | 200 µg |
| Multivitaminico | di solito non serve | insufficiente · AIS B | 1 compressa | – | – |
| Magnesio | di solito non serve | insufficiente · AIS C | 200 mg | 250 mg (UL, solo integratori) | 450 mg |
| Zinco | solo su indicazione | limitata · AIS A | 10 mg | 25 mg (UL, da tutte le fonti) | 15 mg |
| Rame | solo su indicazione | insufficiente | 1 mg | 5 mg (UL, da tutte le fonti) | 2 mg |
| Ferro | solo su indicazione | forte · AIS A | 30 mg | 40 mg (safe level, da tutte le fonti) | 30 mg |
| Calcio | in situazioni precise | limitata · AIS A | 500 mg | 2500 mg (UL, da tutte le fonti) | 1200 mg |
| Selenio | sconsigliato | sfavorevole | 50 µg | 255 µg (UL, da tutte le fonti) | 100 µg |
| Iodio | di solito non serve | insufficiente | 150 µg | 600 µg (UL, da tutte le fonti) | 225 µg |
| Potassio | di solito non serve | insufficiente | 500 mg | – | – |
| Omega-3 (EPA e DHA) | in situazioni precise | limitata · AIS B | 600 mg | 5000 mg (senza rischi fino a, solo integratori) | – |
| Proteine del siero del latte (whey) | in situazioni precise | moderata · AIS A | 25 g | – | – |
| Caseina | in situazioni precise | limitata · AIS A | 30 g | – | – |
| Proteine vegetali in polvere | in situazioni precise | moderata · AIS A | 25 g | – | – |
| Aminoacidi ramificati (BCAA) | di solito non serve | insufficiente · AIS C | 5 g | – | 5 g |
| Creatina monoidrato | utile | forte · AIS A | 3 g | – | 3 g |
| Caffeina | in situazioni precise | forte · AIS A | 200 mg | 400 mg (senza rischi fino a, da tutte le fonti) | 200 mg |
| Beta-alanina | in situazioni precise | moderata · AIS A | 6,4 g | – | – |
| Nitrati (succo di barbabietola) | in situazioni precise | moderata · AIS A | 500 mg | – | – |
| Bicarbonato di sodio | in situazioni precise | moderata · AIS A | 200 mg/kg | – | – |
| Elettroliti (sali minerali) | in situazioni precise | moderata · AIS A | 1 bustina | – | – |
| Carboidrati per lo sport | in situazioni precise | forte · AIS A | 30 g | – | – |
| Collagene o gelatina | in situazioni precise | limitata · AIS B | 20 g | – | – |
| Citrullina | di solito non serve | insufficiente | 3 g | – | – |
| HMB | di solito non serve | insufficiente · AIS C | 3 g | – | 3 g |
| ZMA | di solito non serve | insufficiente | 1 dose | – | – |
| Amarena (tart cherry) | di solito non serve | insufficiente · AIS B | 60 mL | – | – |
| Pre-workout | sconsigliato | insufficiente | 1 dose | – | – |
| Melatonina | in situazioni precise | limitata | 1 mg | – | 1 mg |
| Ashwagandha | sconsigliato | limitata | 600 mg | – | – |
| Curcuma (curcumina) | in situazioni precise | limitata · AIS B | 1000 mg | – | – |
| Glucosammina | di solito non serve | insufficiente | 500 mg | – | 500 mg |
| Probiotici (fermenti lattici) | in situazioni precise | limitata · AIS B | 10 miliardi UFC | – | – |
| Booster, brucia grassi e sostanze a rischio doping | sconsigliato | sfavorevole · AIS D | 1 dose | – | – |

## Schede

### Vitamine

#### Vitamina D · `vitamina-d`

| | |
|---|---|
| Posizione | in situazioni precise |
| Prove | moderata · AIS A |
| Dose predefinita | 15 µg (600 UI · fabbisogno EFSA, Endocrine Society 2024) |
| Opzioni | 15 µg (600 UI · fabbisogno EFSA, Endocrine Society 2024); 25 µg (1000 UI · atleti da autunno a primavera (IOC)); 50 µg (2000 UI · massimo per un integratore in Italia) |
| Limite superiore | 100 µg (UL, da tutte le fonti; EFSA 2023 (LOAEL 250 µg/die da 2 RCT, fattore di incertezza 2,5)) |
| Massimo per prodotto in Italia | 50 µg |
| Quando | colazione; ogni giorno |
| Cibo | con un pasto che contenga grassi |
| Conversioni | 1 UI = 0,025 µg |
| Esami | non di routine: 25(OH)D sierica |

- **Prove.** AIS gruppo A tra i supplementi medici (per correggere una carenza). Negli atleti insufficienti la 25(OH)D sale, ma nessuno dei 7 studi con misure di prestazione ha mostrato effetti in 12 settimane (Farrokhyar 2017, 13 RCT, 532 atleti). Endocrine Society 2024: negli adulti sani sotto i 75 anni non integrare oltre i fabbisogni (raccomandazione condizionale).
- **Quando serve.** Esposizione solare scarsa (da autunno a primavera, lavoro al chiuso), carenza accertata, malassorbimento. Senza esame: dose di mantenimento da 15 a 25 µg/die. Correggere una carenza è compito del medico: l’IOC cita 50.000 UI a settimana per 8–16 settimane o 10.000 UI/die «con attento monitoraggio», oltre l’UL.
- **Come prenderlo.** Con un pasto che contiene grassi: picco di D3 +32% rispetto a un pasto senza grassi (Dawson-Hughes 2015). Le colazioni di Ritmo hanno 15–18 g di grassi (24–31% delle kcal) e vanno bene; con una colazione senza grassi meglio pranzo o cena. L’ora del giorno non conta.
- **Esami.** Non di routine negli adulti sani (Endocrine Society 2024; Nota AIFA 96: il dosaggio «non deve essere inteso come procedura di screening»). Serve prima di dosi oltre 50 µg (2000 UI), con malassorbimento, farmaci che interferiscono o osteopatie. Soglie della Nota 96: sotto 12 ng/mL (30 nmol/L) carenza; sotto 20 ng/mL con farmaci o malassorbimento; sotto 30 ng/mL nell’osteoporosi da trattare. 1 ng/mL ≈ 2,5 nmol/L.
- **Attenzione.** Meglio la dose giornaliera dei boli: 60.000 UI al mese senza beneficio sulla mortalità (D-Health 2022); 500.000 UI una volta l’anno aumentano cadute (RR 1,15) e fratture (RR 1,26) (Sanders 2010).
- **Attenzione.** Effetto critico dell’UL: ipercalciuria persistente, che «può essere» un segno precoce di eccesso (EFSA 2023). Nel VITAL, con 2000 UI/die, nessun eccesso di ipercalcemia.
- **Attenzione.** Meglio la D3 della D2: alza di più la 25(OH)D anche con la dose giornaliera (Tripkovic 2017).
- **Attenzione.** Gocce e flaconcini prescritti a settimana o al mese si registrano con la loro frequenza: per l’UL conta la media giornaliera.
- **Interazione.** Insieme al calcio, con i diuretici tiazidici: rischio di ipercalcemia (LPI).
- **Sport.** IOC 2018: 1000 UI/die di D3 da autunno a primavera nella tabella sull’immunità («moderate support, further support required»); per la popolazione generale da 800 a 1000–2000 UI/die. Fratture da stress: 2000 mg di calcio + 800 UI di D per 8 settimane, −20% in reclute donne (Lappe 2008), risultato non trasferibile con certezza a un calciatore uomo. Nessun RCT sulla sindrome da stress tibiale mediale.
- **Prevenzione oncologica.** VITAL (2000 UI/die per 5,3 anni): incidenza di cancro HR 0,96 (0,88–1,06). Keum 2019: mortalità per cancro RR 0,87 (0,79–0,96), soprattutto con dosi giornaliere; con boli mensili nessun beneficio (D-Health, HR 1,15, 0,96–1,39). WCRF: non come prevenzione; eccezione solo per esposizione solare scarsa.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [EFSA NDA Panel 2023, UL della vitamina D](https://doi.org/10.2903/j.efsa.2023.8145); [EFSA, Dietary Reference Values, summary report (2017)](https://www.efsa.europa.eu/sites/default/files/2017_09_DRVs_summary_report.pdf); [Ministero della Salute, apporti massimi di vitamine e minerali negli integratori, revisione 2018](https://www.nutrientiesupplementi.it/norme-sicurezza/item/download/6_80fbdef7198cd2089c022e48d2ce2249); [Demay et al., linea guida Endocrine Society 2024](https://doi.org/10.1210/clinem/dgae290); [Nota AIFA 96 (riproduzione del testo)](https://www.torrinomedica.it/note-aifa/nota-96-aifa/); [Dawson-Hughes et al., J Acad Nutr Diet 2015](https://doi.org/10.1016/j.jand.2014.09.014); [Tripkovic et al., Am J Clin Nutr 2017](https://doi.org/10.3945/ajcn.116.138693); [Manson et al., VITAL, NEJM 2019](https://doi.org/10.1056/NEJMoa1809944); [Keum et al., Ann Oncol 2019](https://doi.org/10.1093/annonc/mdz059); [D-Health, Lancet Diabetes Endocrinol 2022](https://doi.org/10.1016/S2213-8587(21)00345-4); [Sanders et al., JAMA 2010](https://doi.org/10.1001/jama.2010.594); [Farrokhyar et al., Sports Med 2017](https://doi.org/10.1007/s40279-017-0749-4); [Lappe et al., J Bone Miner Res 2008](https://doi.org/10.1359/jbmr.080102); [Maughan et al., consensus IOC, BJSM 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/)

#### Calcifediolo · `calcifediolo`

| | |
|---|---|
| Posizione | solo su indicazione |
| Prove | limitata |
| Dose predefinita | 10 µg (vale 25 µg (1000 UI) di vitamina D) |
| Opzioni | 5 µg (vale 12,5 µg (500 UI) di vitamina D); 10 µg (vale 25 µg (1000 UI) di vitamina D) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | non fissato |
| Quando | colazione; ogni giorno |
| Cibo | indifferente o nessuna indicazione |
| Conta come | `vitamina-d` × 2,5 |
| Esami | prima di cominciare: 25(OH)D sierica |

- **Prove.** Metabolita della vitamina D: per l’UL EFSA conta 2,5 volte la D3, fino a 10 µg/die. Questa ricerca non ha valutato studi clinici specifici.
- **Quando serve.** Su indicazione del medico. Non si sceglie da soli.
- **Esami.** In Italia è anche un farmaco su prescrizione, dopo l’esame. Il calcifediolo è la 25(OH)D stessa: l’esame va letto sapendo che lo prendi.
- **Attenzione.** L’app lo converte in vitamina D (×2,5) e lo somma alle altre fonti per il controllo dell’UL di 100 µg.
- **Interazione.** Le stesse della vitamina D (calcio con diuretici tiazidici).
- **Sport.** Nessun dato specifico negli sportivi in questa ricerca.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [EFSA NDA Panel 2023, UL della vitamina D](https://doi.org/10.2903/j.efsa.2023.8145)

#### Vitamina B1 (tiamina) · `vitamina-b1`

| | |
|---|---|
| Posizione | di solito non serve |
| Prove | insufficiente |
| Dose predefinita | 1,1 mg (≈ fabbisogno a 2800 kcal (PRI 0,1 mg/MJ)) |
| Opzioni | 1,1 mg (≈ fabbisogno a 2800 kcal); 25 mg (massimo per un integratore in Italia) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | 25 mg |
| Quando | colazione; ogni giorno |
| Cibo | indifferente o nessuna indicazione |

- **Prove.** Nessun UL per la «tossicità estremamente bassa» (SCF). Nessuna prova di benefici sulla prestazione in chi non è carente. IOC 2018: prove buone per la prestazione solo per caffeina, creatina, nitrati, bicarbonato e forse β-alanina.
- **Quando serve.** Carenza (alcol, malassorbimento). Con una dieta varia non serve.
- **Sport.** Nessuna prova di benefici sulla prestazione in chi non è carente. IOC 2018: prove buone per la prestazione solo per caffeina, creatina, nitrati, bicarbonato e forse β-alanina.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [EFSA/SCF, Tolerable Upper Intake Levels for Vitamins and Minerals (2006)](https://www.efsa.europa.eu/sites/default/files/efsa_rep/blobserver_assets/ndatolerableuil.pdf); [EFSA, Dietary Reference Values, summary report (2017)](https://www.efsa.europa.eu/sites/default/files/2017_09_DRVs_summary_report.pdf); [Ministero della Salute, apporti massimi di vitamine e minerali negli integratori, revisione 2018](https://www.nutrientiesupplementi.it/norme-sicurezza/item/download/6_80fbdef7198cd2089c022e48d2ce2249); [Maughan et al., consensus IOC, BJSM 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/)

#### Vitamina B2 (riboflavina) · `vitamina-b2`

| | |
|---|---|
| Posizione | di solito non serve |
| Prove | insufficiente |
| Dose predefinita | 1,6 mg (fabbisogno dell’uomo (PRI)) |
| Opzioni | 1,6 mg (fabbisogno dell’uomo (PRI)); 25 mg (massimo per un integratore in Italia) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | 25 mg |
| Quando | colazione; ogni giorno |
| Cibo | indifferente o nessuna indicazione |

- **Prove.** Nessun UL: l’assorbimento si satura e 400 mg/die negli studi sull’emicrania non hanno dato effetti avversi gravi (SCF). EFSA considera l’attività fisica già coperta dal fabbisogno.
- **Quando serve.** Carenza accertata. Con una dieta varia non serve.
- **Sport.** Nessuna prova di benefici sulla prestazione in chi non è carente. IOC 2018: prove buone per la prestazione solo per caffeina, creatina, nitrati, bicarbonato e forse β-alanina.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [EFSA/SCF, Tolerable Upper Intake Levels for Vitamins and Minerals (2006)](https://www.efsa.europa.eu/sites/default/files/efsa_rep/blobserver_assets/ndatolerableuil.pdf); [EFSA, Dietary Reference Values, summary report (2017)](https://www.efsa.europa.eu/sites/default/files/2017_09_DRVs_summary_report.pdf); [Ministero della Salute, apporti massimi di vitamine e minerali negli integratori, revisione 2018](https://www.nutrientiesupplementi.it/norme-sicurezza/item/download/6_80fbdef7198cd2089c022e48d2ce2249)

#### Niacina (vitamina B3) · `niacina`

| | |
|---|---|
| Posizione | di solito non serve |
| Prove | insufficiente |
| Dose predefinita | 18 mg (≈ fabbisogno di un adulto attivo, come nicotinamide (PRI 1,6 mg NE/MJ)) |
| Opzioni | 18 mg (≈ fabbisogno, come nicotinamide); 54 mg (massimo per un integratore in Italia (forma non specificata)) |
| Limite superiore | 900 mg (UL, solo forme aggiunte; SCF 2002 (nicotinamide, 12,5 mg/kg)) |
| Limite per la forma acido nicotinico | 10 mg (SCF 2002 (flushing già a 30 mg/die, fattore di incertezza 3)) |
| Massimo per prodotto in Italia | 54 mg (forma non specificata) |
| Quando | colazione; ogni giorno |
| Cibo | con un pasto |

- **Prove.** Nessuna indicazione nelle persone sane. Gli UL dipendono dalla forma: acido nicotinico 10 mg/die, nicotinamide 900 mg/die.
- **Quando serve.** Carenza accertata. Con una dieta varia non serve.
- **Come prenderlo.** Con il pasto: il flushing dell’acido nicotinico è più marcato a stomaco vuoto (SCF).
- **Attenzione.** Acido nicotinico: flushing già a 30 mg/die; epatotossicità grave con 3–9 g/die per mesi o anni, spesso a rilascio prolungato, e solo casi isolati a 0,5–0,75 g/die (SCF).
- **Attenzione.** Un prodotto italiano può avere fino a 54 mg di niacina: se è acido nicotinico supera l’UL di 5 volte. La forma si legge in etichetta.
- **Attenzione.** L’UL della nicotinamide non vale in gravidanza e allattamento.
- **Sport.** Nessuna prova di benefici sulla prestazione in chi non è carente. IOC 2018: prove buone per la prestazione solo per caffeina, creatina, nitrati, bicarbonato e forse β-alanina.
- **Prevenzione oncologica.** Nicotinamide 500 mg due volte al giorno per 12 mesi: −23% di nuovi tumori cutanei non melanoma (IC 4–38%) in persone con almeno 2 tumori precedenti (ONTRAC 2015), nessun beneficio dopo la sospensione e nessun beneficio nei trapiantati (ONTRANS 2023). Non è un’indicazione per la popolazione generale, e 1000 mg/die superano l’UL.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [EFSA/SCF, Tolerable Upper Intake Levels for Vitamins and Minerals (2006)](https://www.efsa.europa.eu/sites/default/files/efsa_rep/blobserver_assets/ndatolerableuil.pdf); [EFSA, Dietary Reference Values, summary report (2017)](https://www.efsa.europa.eu/sites/default/files/2017_09_DRVs_summary_report.pdf); [Ministero della Salute, apporti massimi di vitamine e minerali negli integratori, revisione 2018](https://www.nutrientiesupplementi.it/norme-sicurezza/item/download/6_80fbdef7198cd2089c022e48d2ce2249); [Chen et al., ONTRAC, NEJM 2015](https://doi.org/10.1056/NEJMoa1506197); [ONTRANS, NEJM 2023](https://doi.org/10.1056/NEJMoa2203086)

#### Acido pantotenico (vitamina B5) · `acido-pantotenico`

| | |
|---|---|
| Posizione | di solito non serve |
| Prove | insufficiente |
| Dose predefinita | 5 mg (fabbisogno (AI)) |
| Opzioni | 5 mg (fabbisogno (AI)); 18 mg (massimo per un integratore in Italia) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | 18 mg |
| Quando | colazione; ogni giorno |
| Cibo | indifferente o nessuna indicazione |

- **Prove.** Nessun UL: diarrea solo a 10–20 g/die (SCF).
- **Quando serve.** Con una dieta varia non serve.
- **Sport.** Nessuna prova di benefici sulla prestazione in chi non è carente. IOC 2018: prove buone per la prestazione solo per caffeina, creatina, nitrati, bicarbonato e forse β-alanina.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [EFSA/SCF, Tolerable Upper Intake Levels for Vitamins and Minerals (2006)](https://www.efsa.europa.eu/sites/default/files/efsa_rep/blobserver_assets/ndatolerableuil.pdf); [EFSA, Dietary Reference Values, summary report (2017)](https://www.efsa.europa.eu/sites/default/files/2017_09_DRVs_summary_report.pdf); [Ministero della Salute, apporti massimi di vitamine e minerali negli integratori, revisione 2018](https://www.nutrientiesupplementi.it/norme-sicurezza/item/download/6_80fbdef7198cd2089c022e48d2ce2249)

#### Vitamina B6 · `vitamina-b6`

| | |
|---|---|
| Posizione | di solito non serve |
| Prove | insufficiente |
| Dose predefinita | 1,7 mg (fabbisogno dell’uomo (PRI)) |
| Opzioni | 1,7 mg (fabbisogno dell’uomo (PRI)); 10 mg (massimo per un integratore in Italia) |
| Limite superiore | 12 mg (UL, da tutte le fonti; EFSA 2023 (50 mg/die da studio caso-controllo con fattore 4; 11,7 mg dal cane)) |
| Massimo per prodotto in Italia | 10 mg |
| Quando | colazione; ogni giorno |
| Cibo | indifferente o nessuna indicazione |
| Esami | non di routine: piridossal-5'-fosfato (PLP) plasmatico |

- **Prove.** Nessuna indicazione nelle persone sane; il rischio è superare l’UL sommando più prodotti.
- **Quando serve.** Carenza accertata. Con una dieta varia non serve.
- **Esami.** Solo con formicolii o intorpidimento, o dopo dosi alte prolungate. EFSA usa 30 nmol/L come soglia di adeguatezza.
- **Attenzione.** Neuropatia periferica: relazione «ben consolidata»; l’UL si supera solo con l’uso regolare di integratori ad alte dosi (EFSA 2023).
- **Attenzione.** I complessi «B-50» e «B-100» venduti all’estero hanno 50–100 mg di B6 per compressa: 4–8 volte l’UL.
- **Attenzione.** La B6 c’è anche in elettroliti, ZMA e multivitaminici: l’app somma tutti i prodotti. AIS: la neuropatia può comparire anche sotto i 50 mg/die.
- **Attenzione.** Alcune fonti (LPI) riportano ancora il vecchio UL EFSA di 25 mg, superato dal 2023.
- **Attenzione.** Australia (TGA, 2025): oltre 50 mg/die solo in farmacia dal 1/6/2027, oltre 200 mg con ricetta; 250 segnalazioni di effetti avversi.
- **Sport.** Nessuna prova di benefici sulla prestazione in chi non è carente. IOC 2018: prove buone per la prestazione solo per caffeina, creatina, nitrati, bicarbonato e forse β-alanina.
- **Prevenzione oncologica.** Negli uomini, B6 da integratori singoli oltre 20 mg/die per 10 anni: cancro del polmone HR 1,82 (1,25–2,65), più marcato nei fumatori; nessuna associazione nelle donne né con i multivitaminici (coorte VITAL, Brasky 2017; solo osservazionale).
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [EFSA NDA Panel 2023, UL della vitamina B6](https://doi.org/10.2903/j.efsa.2023.8006); [Ministero della Salute, apporti massimi di vitamine e minerali negli integratori, revisione 2018](https://www.nutrientiesupplementi.it/norme-sicurezza/item/download/6_80fbdef7198cd2089c022e48d2ce2249); [Linus Pauling Institute, vitamina B6](https://lpi.oregonstate.edu/mic/vitamins/vitamin-B6); [TGA, decisione finale sulla vitamina B6 (2025)](https://www.tga.gov.au/news/safety-updates/medicines-containing-vitamin-b6-pyridoxine-pyridoxal-or-pyridoxamine); [Brasky et al., J Clin Oncol 2017](https://doi.org/10.1200/JCO.2017.72.7735); [AIS Sports Supplement Framework, gruppo A](https://www.ausport.gov.au/ais/nutrition/supplements/group_a)

#### Biotina (vitamina B7, H o B8) · `biotina`

| | |
|---|---|
| Posizione | di solito non serve |
| Prove | insufficiente |
| Dose predefinita | 40 µg (fabbisogno (AI)) |
| Opzioni | 40 µg (fabbisogno (AI)); 450 µg (massimo per un integratore in Italia) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | 450 µg |
| Quando | colazione; ogni giorno |
| Cibo | indifferente o nessuna indicazione |
| Esami | nessuno da fare; ne falsa alcuni (vedi sotto) |

- **Prove.** Nessun UL per mancanza di dati.
- **Quando serve.** Con una dieta varia non serve.
- **Esami falsati.** Ad alte dosi falsa gli immunodosaggi streptavidina-biotina (ormoni tiroidei e riproduttivi, troponina), verso l’alto o verso il basso (FDA 2017 e 2019): dillo al medico e al laboratorio prima degli esami.
- **Attenzione.** Il problema delle dosi alte, molto sopra quelle dei multivitaminici, sono gli esami del sangue falsati.
- **Sport.** Nessuna prova di benefici sulla prestazione in chi non è carente. IOC 2018: prove buone per la prestazione solo per caffeina, creatina, nitrati, bicarbonato e forse β-alanina.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [Linus Pauling Institute, biotina](https://lpi.oregonstate.edu/mic/vitamins/biotin); [EFSA/SCF, Tolerable Upper Intake Levels for Vitamins and Minerals (2006)](https://www.efsa.europa.eu/sites/default/files/efsa_rep/blobserver_assets/ndatolerableuil.pdf); [Ministero della Salute, apporti massimi di vitamine e minerali negli integratori, revisione 2018](https://www.nutrientiesupplementi.it/norme-sicurezza/item/download/6_80fbdef7198cd2089c022e48d2ce2249)

#### Acido folico (folati) · `acido-folico`

| | |
|---|---|
| Posizione | solo su indicazione |
| Prove | forte · AIS A |
| Dose predefinita | 200 µg (≈ fabbisogno: 200 µg con il cibo valgono circa 340 µg DFE (PRI 330)) |
| Opzioni | 200 µg (≈ fabbisogno (PRI 330 µg DFE)); 400 µg (massimo per un integratore in Italia) |
| Limite superiore | 1000 µg (UL, solo forme aggiunte; EFSA 2023). Solo acido folico e sali di 5-MTHF; il folato degli alimenti non conta. |
| Massimo per prodotto in Italia | 400 µg |
| Quando | colazione; ogni giorno |
| Cibo | indifferente o nessuna indicazione |
| Esami | non di routine: B12 sierica o olotranscobalamina |

- **Prove.** Corregge la carenza di folati (AIS gruppo A tra i supplementi medici). Nessuna indicazione nelle persone sane.
- **Quando serve.** Gravidanza o sua programmazione, anemia da carenza di folati, su indicazione medica. Un uomo che mangia verdura, legumi e cereali integrali di solito non ne ha bisogno.
- **Esami.** Prima di un uso prolungato, per non mascherare una carenza di B12 (inferenza dall’effetto critico dell’UL).
- **Attenzione.** Effetto critico dell’UL: può mascherare l’anemia da carenza di B12 mentre i sintomi neurologici progrediscono (EFSA 2023).
- **Sport.** Nessuna prova di benefici sulla prestazione in chi non è carente. IOC 2018: prove buone per la prestazione solo per caffeina, creatina, nitrati, bicarbonato e forse β-alanina.
- **Prevenzione oncologica.** EFSA 2023: prove insufficienti per un nesso causale con cancro del colon-retto o della prostata, in un senso o nell’altro. RCT norvegesi con 0,8 mg di acido folico + 0,4 mg di B12: cancro HR 1,21, mortalità per cancro HR 1,38, mortalità totale HR 1,18 (Ebbing 2009).
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [EFSA NDA Panel 2023, UL dei folati](https://doi.org/10.2903/j.efsa.2023.8353); [EFSA, Dietary Reference Values, summary report (2017)](https://www.efsa.europa.eu/sites/default/files/2017_09_DRVs_summary_report.pdf); [Ministero della Salute, apporti massimi di vitamine e minerali negli integratori, revisione 2018](https://www.nutrientiesupplementi.it/norme-sicurezza/item/download/6_80fbdef7198cd2089c022e48d2ce2249); [Ebbing et al., JAMA 2009](https://doi.org/10.1001/jama.2009.1622); [AIS Sports Supplement Framework, gruppo A](https://www.ausport.gov.au/ais/nutrition/supplements/group_a)

#### Vitamina B12 · `vitamina-b12`

| | |
|---|---|
| Posizione | solo su indicazione |
| Prove | forte |
| Dose predefinita | 4 µg (fabbisogno (AI)) |
| Opzioni | 4 µg (fabbisogno (AI)); 50 µg (sotto i 55 µg del segnale osservazionale negli uomini); 1000 µg (dose per correggere una carenza (Cochrane 2018); massimo per un integratore in Italia) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | 1000 µg |
| Quando | colazione; ogni giorno |
| Cibo | indifferente o nessuna indicazione |
| Esami | non di routine: B12 sierica, olotranscobalamina (holoTC), acido metilmalonico (MMA), omocisteina |

- **Prove.** Per bocca, 1000–2000 µg/die correggono i livelli come l’intramuscolo, senza differenze clinicamente rilevanti (Cochrane 2018, qualità «low»). Nessuna indicazione in chi non è carente.
- **Quando serve.** Dieta vegana o vegetariana stretta, malassorbimento, farmaci che riducono l’assorbimento, età avanzata, carenza accertata. Un onnivoro che mangia carne, pesce, uova e latticini di solito raggiunge il fabbisogno con la dieta (inferenza; assunzioni osservate negli adulti UE 4,2–8,6 µg/die).
- **Esami.** Con un’indicazione (dieta, farmaci, sintomi) o per decidere se continuare. EFSA valuta lo stato con holoTC, MMA e omocisteina insieme.
- **Attenzione.** Nessun UL («No defined adverse effects»): 1–5 mg ogni due settimane o al mese per anni senza effetti avversi, in studi non disegnati per cercarli (SCF).
- **Attenzione.** Con 1000 µg per bocca se ne assorbe circa l’1% (≈10 µg) per diffusione passiva (LPI).
- **Attenzione.** Le forme «attive» (metil-, adenosil-) non hanno prove di superiorità nelle persone sane: la cianocobalamina viene convertita (LPI).
- **Interazione.** Inibitori di pompa a lungo termine: riducono il rilascio della B12 dal cibo, non dagli integratori (LPI).
- **Interazione.** Metformina: riduce l’assorbimento, con rilevanza clinica non chiara (LPI).
- **Sport.** Nessuna prova di benefici sulla prestazione in chi non è carente. IOC 2018: prove buone per la prestazione solo per caffeina, creatina, nitrati, bicarbonato e forse β-alanina.
- **Prevenzione oncologica.** Negli uomini, B12 da integratori singoli oltre 55 µg/die per 10 anni: cancro del polmone HR 1,98 (1,32–2,97), più marcato nei fumatori; nessuna associazione nelle donne né con i multivitaminici (VITAL, Brasky 2017; osservazionale, possibile confondimento). WCRF: eccezione solo oltre i 50 anni con malassorbimento.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [EFSA, Overview on Tolerable Upper Intake Levels, versione 11 (2025)](https://www.efsa.europa.eu/sites/default/files/2024-05/ul-summary-report.pdf); [EFSA, Dietary Reference Values, summary report (2017)](https://www.efsa.europa.eu/sites/default/files/2017_09_DRVs_summary_report.pdf); [Ministero della Salute, apporti massimi di vitamine e minerali negli integratori, revisione 2018](https://www.nutrientiesupplementi.it/norme-sicurezza/item/download/6_80fbdef7198cd2089c022e48d2ce2249); [Wang et al., Cochrane 2018 (B12 per bocca o intramuscolo)](https://doi.org/10.1002/14651858.CD004655.pub3); [Linus Pauling Institute, vitamina B12](https://lpi.oregonstate.edu/mic/vitamins/vitamin-B12); [Brasky et al., J Clin Oncol 2017](https://doi.org/10.1200/JCO.2017.72.7735); [WCRF/AICR, raccomandazione sugli integratori](https://www.wcrf.org/research-policy/evidence-for-our-recommendations/do-not-use-supplements-for-cancer-prevention/)

#### Complesso B · `complesso-b`

| | |
|---|---|
| Posizione | di solito non serve |
| Prove | insufficiente |
| Dose predefinita | 1 compressa (la dose giornaliera in etichetta) |
| Opzioni | 1 compressa; 2 compresse |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | non fissato |
| Quando | colazione; ogni giorno |
| Cibo | indifferente o nessuna indicazione |
| Da leggere in etichetta | `vitamina-b1`, `vitamina-b2`, `niacina`, `acido-pantotenico`, `vitamina-b6`, `biotina`, `acido-folico`, `vitamina-b12` |
| Esami | nessuno da fare; ne falsa alcuni (vedi sotto) |

- **Prove.** Nessuna prova di benefici sulla prestazione in chi non è carente. IOC 2018: prove buone per la prestazione solo per caffeina, creatina, nitrati, bicarbonato e forse β-alanina.
- **Quando serve.** Nessuna indicazione di routine in chi mangia vario. Per valutarlo serve sapere che cosa contiene: si legge l’etichetta.
- **Come prenderlo.** Nessuna prova su orari specifici; che le vitamine B di sera tolgano il sonno è un’ipotesi aneddotica.
- **Esami falsati.** Se contiene biotina ad alte dosi può falsare alcuni esami del sangue (vedi biotina).
- **Attenzione.** Le dosi cambiano moltissimo tra prodotti: da controllare B6 (UL 12 mg), forma della niacina (acido nicotinico: UL 10 mg), acido folico (UL 1000 µg) e biotina (esami del sangue).
- **Attenzione.** Un prodotto italiano rispetta i massimi ministeriali (B6 fino a 10 mg); quelli esteri («B-50», «B-100») superano spesso l’UL della B6.
- **Sport.** Nessuna prova di benefici sulla prestazione in chi non è carente. IOC 2018: prove buone per la prestazione solo per caffeina, creatina, nitrati, bicarbonato e forse β-alanina.
- **Prevenzione oncologica.** Il segnale osservazionale su B6 e B12 riguarda integratori singoli ad alte dosi negli uomini, non i multivitaminici (Brasky 2017).
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [EFSA NDA Panel 2023, UL della vitamina B6](https://doi.org/10.2903/j.efsa.2023.8006); [EFSA/SCF, Tolerable Upper Intake Levels for Vitamins and Minerals (2006)](https://www.efsa.europa.eu/sites/default/files/efsa_rep/blobserver_assets/ndatolerableuil.pdf); [Ministero della Salute, apporti massimi di vitamine e minerali negli integratori, revisione 2018](https://www.nutrientiesupplementi.it/norme-sicurezza/item/download/6_80fbdef7198cd2089c022e48d2ce2249); [Linus Pauling Institute, vitamina B6](https://lpi.oregonstate.edu/mic/vitamins/vitamin-B6); [Brasky et al., J Clin Oncol 2017](https://doi.org/10.1200/JCO.2017.72.7735)

#### Vitamina C · `vitamina-c`

| | |
|---|---|
| Posizione | in situazioni precise |
| Prove | limitata · AIS B |
| Dose predefinita | 200 mg (copre il fabbisogno con margine, lontano da 1 g) |
| Opzioni | 100 mg (≈ fabbisogno dell’uomo (PRI 110 mg)); 200 mg (copre il fabbisogno con margine); 500 mg (dentro gli 0,25–1 g dell’IOC per sforzi estremi); 1000 mg (massimo per un integratore in Italia; dose che negli studi attenua gli adattamenti) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | 1000 mg |
| Quando | colazione; ogni giorno |
| Cibo | indifferente o nessuna indicazione |

- **Prove.** Raffreddori: nessuna prevenzione nella popolazione generale (10.708 persone, RR 0,97, 0,94–1,00), durata −8% negli adulti; dimezzati in chi fa sforzi fisici estremi (5 RCT, 598 maratoneti, sciatori e soldati, RR 0,48, 0,35–0,64). Iniziarla dopo i sintomi non serve (Cochrane 2013).
- **Quando serve.** Assunzione bassa di frutta e verdura, ma meglio correggere la dieta: 1–2 porzioni ricche di vitamina C bastano per il fabbisogno. Periodi di sforzi fisici estremi (IOC 0,25–1 g/die). Con il collagene bastano 50 mg (AIS).
- **Attenzione.** Nessun UL (EFSA 2004): fino a circa 1 g/die in aggiunta alla dieta senza disturbi intestinali, 3–4 g/die danno effetti gastrointestinali acuti; sopra 1 g/die l’assorbimento in più è trascurabile.
- **Attenzione.** 1 g/die attenua alcuni adattamenti all’allenamento: con 235 mg di vitamina E, VO2max uguale al placebo ma marcatori mitocondriali (COX4, PGC-1α) aumentati solo con placebo (Paulsen 2014); nella forza, massa invariata e alcuni guadagni ridotti. AIS: l’uso cronico «may impair physiological adaptation».
- **Attenzione.** Calcoli renali: negli uomini le compresse da circa 1000 mg si associano a circa il doppio di calcoli (Thomas 2013) e l’associazione si ritrova in una seconda coorte (Ferraro 2016). Prove osservazionali.
- **Interazione.** Aumenta molto l’assorbimento del ferro non eme (LPI): utile con il ferro prescritto, da evitare ad alte dosi nell’emocromatosi.
- **Sport.** AIS gruppo B. IOC: alte dosi di singoli antiossidanti, soprattutto C ed E, possono attenuare gli adattamenti; non è chiaro negli atleti molto allenati. UEFA: sconsiglia dosi alte di vitamine C ed E. Lo studio su gelatina e vitamina C (Shaw 2017) non valuta la vitamina C, presente anche nel placebo.
- **Prevenzione oncologica.** WCRF: integratori ad alte dosi non raccomandati per prevenire il cancro; la vitamina C non è tra le eccezioni.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [EFSA/SCF, Tolerable Upper Intake Levels for Vitamins and Minerals (2006)](https://www.efsa.europa.eu/sites/default/files/efsa_rep/blobserver_assets/ndatolerableuil.pdf); [EFSA, Dietary Reference Values, summary report (2017)](https://www.efsa.europa.eu/sites/default/files/2017_09_DRVs_summary_report.pdf); [Ministero della Salute, apporti massimi di vitamine e minerali negli integratori, revisione 2018](https://www.nutrientiesupplementi.it/norme-sicurezza/item/download/6_80fbdef7198cd2089c022e48d2ce2249); [Hemilä e Chalker, Cochrane 2013 (vitamina C e raffreddore)](https://doi.org/10.1002/14651858.CD000980.pub4); [Paulsen et al., J Physiol 2014 (endurance)](https://doi.org/10.1113/jphysiol.2013.267419); [Paulsen et al., J Physiol 2014 (forza)](https://doi.org/10.1113/jphysiol.2014.279950); [Thomas et al., JAMA Intern Med 2013](https://doi.org/10.1001/jamainternmed.2013.2296); [Ferraro et al., Am J Kidney Dis 2016](https://doi.org/10.1053/j.ajkd.2015.09.005); [AIS Sports Supplement Framework, gruppo B](https://www.ausport.gov.au/ais/nutrition/supplements/group_b); [Maughan et al., consensus IOC, BJSM 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/); [Collins et al., UEFA expert group statement, BJSM 2021](https://doi.org/10.1136/bjsports-2019-101961); [WCRF/AICR, raccomandazione sugli integratori](https://www.wcrf.org/research-policy/evidence-for-our-recommendations/do-not-use-supplements-for-cancer-prevention/)

#### Vitamina E · `vitamina-e`

| | |
|---|---|
| Posizione | sconsigliato |
| Prove | sfavorevole · AIS C |
| Dose predefinita | 13 mg (fabbisogno dell’uomo (AI)) |
| Opzioni | 13 mg (fabbisogno dell’uomo (AI)); 60 mg (massimo per un integratore in Italia) |
| Limite superiore | 300 mg (UL, da tutte le fonti; EFSA 2024 (conferma il valore SCF)). Non si applica a chi prende anticoagulanti o antiaggreganti, aspirina compresa, né in prevenzione secondaria cardiovascolare. |
| Massimo per prodotto in Italia | 60 mg |
| Quando | colazione; ogni giorno |
| Cibo | con un pasto che contenga grassi |
| Conversioni | 1 UI-naturale = 0,67 mg; 1 UI-sintetica = 0,45 mg |

- **Prove.** USPSTF 2022: raccomandazione D contro la vitamina E per prevenire malattie cardiovascolari e cancro («moderate certainty» di nessun beneficio netto). SELECT: più cancro della prostata.
- **Quando serve.** Quasi mai nelle persone sane: la carenza è rara.
- **Attenzione.** Effetto critico dell’UL: coagulazione alterata e rischio di sanguinamento (EFSA 2024).
- **Attenzione.** Ictus emorragico: RR 1,22 (1,00–1,48), un caso in più ogni 1250 persone trattate (meta-analisi di RCT, Schürks 2010).
- **Interazione.** Anticoagulanti e antiaggreganti, aspirina compresa: rischio di sanguinamento.
- **Sport.** AIS gruppo C. Con la vitamina C attenua gli adattamenti (Paulsen 2014). IOC: «no support» per l’immunità.
- **Prevenzione oncologica.** SELECT (34.887 uomini, 400 UI/die di all-rac-α-tocoferil acetato): cancro della prostata HR 1,17 (IC 99% 1,004–1,36), +1,6 casi ogni 1000 anni-persona.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [EFSA NDA Panel 2024, UL della vitamina E](https://doi.org/10.2903/j.efsa.2024.8953); [Ministero della Salute, apporti massimi di vitamine e minerali negli integratori, revisione 2018](https://www.nutrientiesupplementi.it/norme-sicurezza/item/download/6_80fbdef7198cd2089c022e48d2ce2249); [Klein et al., SELECT, JAMA 2011](https://doi.org/10.1001/jama.2011.1437); [USPSTF 2022, JAMA](https://doi.org/10.1001/jama.2022.8970); [Schürks et al., BMJ 2010](https://doi.org/10.1136/bmj.c5702); [Paulsen et al., J Physiol 2014 (endurance)](https://doi.org/10.1113/jphysiol.2013.267419); [AIS Sports Supplement Framework, gruppo C](https://www.ausport.gov.au/ais/nutrition/supplements/group_c)

#### Vitamina A · `vitamina-a`

| | |
|---|---|
| Posizione | di solito non serve |
| Prove | insufficiente |
| Dose predefinita | 750 µg (fabbisogno dell’uomo (PRI, µg RE)) |
| Opzioni | 750 µg (fabbisogno dell’uomo (PRI)); 1200 µg (massimo per un integratore in Italia) |
| Limite superiore | 3000 µg (UL, solo forma preformata; EFSA 2024). Solo vitamina A preformata (retinolo ed esteri); vale per tutti gli adulti. |
| Massimo per prodotto in Italia | 1200 µg (µg RE totali) |
| Quando | colazione; ogni giorno |
| Cibo | con un pasto che contenga grassi |

- **Prove.** Nessuna indicazione nelle persone sane che mangiano vario.
- **Quando serve.** Carenza accertata.
- **Attenzione.** Effetto critico dell’UL: teratogenicità; il limite vale anche per uomini e donne in post-menopausa (EFSA 2024).
- **Attenzione.** Il fegato al massimo una volta al mese, per non superare l’UL con la dieta (EFSA 2024).
- **Attenzione.** 1 µg RE = 1 µg di retinolo = 6 µg di β-carotene (EFSA).
- **Sport.** Nessuna prova di benefici sulla prestazione in chi non è carente. IOC 2018: prove buone per la prestazione solo per caffeina, creatina, nitrati, bicarbonato e forse β-alanina.
- **Prevenzione oncologica.** CARET: 30 mg di β-carotene + 25.000 UI di retinil palmitato in fumatori ed esposti all’amianto, cancro del polmone RR 1,28 (1,04–1,57), studio interrotto in anticipo.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [EFSA NDA Panel 2024, UL della vitamina A e del β-carotene](https://doi.org/10.2903/j.efsa.2024.8814); [EFSA, Dietary Reference Values, summary report (2017)](https://www.efsa.europa.eu/sites/default/files/2017_09_DRVs_summary_report.pdf); [Ministero della Salute, apporti massimi di vitamine e minerali negli integratori, revisione 2018](https://www.nutrientiesupplementi.it/norme-sicurezza/item/download/6_80fbdef7198cd2089c022e48d2ce2249); [Omenn et al., CARET, NEJM 1996](https://doi.org/10.1056/NEJM199605023341802)

#### Beta-carotene · `beta-carotene`

| | |
|---|---|
| Posizione | sconsigliato |
| Prove | sfavorevole |
| Dose predefinita | 4,5 mg (copre da solo il fabbisogno di vitamina A (750 µg RE)) |
| Opzioni | 4,5 mg (copre il fabbisogno di vitamina A); 7,5 mg (massimo per un integratore in Italia come unica fonte di vitamina A) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | 7,5 mg (come unica fonte di vitamina A (1250 µg RE)) |
| Quando | colazione; ogni giorno |
| Cibo | con un pasto che contenga grassi |

- **Prove.** WCRF: «convincing» che il β-carotene ad alte dosi in integratore aumenta il cancro del polmone in fumatori ed ex fumatori. USPSTF 2022: raccomandazione D, i danni superano i benefici.
- **Quando serve.** Solo per coprire il fabbisogno di vitamina A (EFSA). Il β-carotene degli alimenti non si associa a danni.
- **Attenzione.** EFSA 2024: nessun UL, ma «i fumatori devono evitare» gli integratori con β-carotene.
- **Attenzione.** C’è in molti multivitaminici e negli integratori «abbronzanti»: l’app lo cerca anche lì.
- **Attenzione.** ATBC (29.133 fumatori, 20 mg/die): cancro del polmone +18% (IC 3–36%), mortalità totale +8%. CARET: RR 1,28 e mortalità totale RR 1,17, studio interrotto.
- **Sport.** Nessun ruolo nella prestazione.
- **Prevenzione oncologica.** WCRF «convincing»: aumenta il cancro del polmone nei fumatori ed ex fumatori; «convincing» anche che non ha effetti sostanziali su prostata e tumori cutanei non melanoma.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [EFSA NDA Panel 2024, UL della vitamina A e del β-carotene](https://doi.org/10.2903/j.efsa.2024.8814); [ATBC, NEJM 1994](https://doi.org/10.1056/NEJM199404143301501); [Omenn et al., CARET, NEJM 1996](https://doi.org/10.1056/NEJM199605023341802); [WCRF/AICR, raccomandazione sugli integratori](https://www.wcrf.org/research-policy/evidence-for-our-recommendations/do-not-use-supplements-for-cancer-prevention/); [USPSTF 2022, JAMA](https://doi.org/10.1001/jama.2022.8970); [Ministero della Salute, apporti massimi di vitamine e minerali negli integratori, revisione 2018](https://www.nutrientiesupplementi.it/norme-sicurezza/item/download/6_80fbdef7198cd2089c022e48d2ce2249)

#### Vitamina K · `vitamina-k`

| | |
|---|---|
| Posizione | di solito non serve |
| Prove | insufficiente |
| Dose predefinita | 70 µg (fabbisogno (AI, fillochinone)) |
| Opzioni | 70 µg (fabbisogno (AI)); 200 µg (massimo per un integratore in Italia) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | 200 µg |
| Quando | colazione; ogni giorno |
| Cibo | con un pasto che contenga grassi |

- **Prove.** In donne in post-menopausa con osteopenia, 375 µg/die di MK-7 aggiunti a calcio e vitamina D non hanno cambiato la densità ossea (LPI). L’utilità delle associazioni «D3 + K2» nelle persone sane non è dimostrata. Nessun UL: nessun effetto avverso fino a 10 mg/die di fillochinone in studi piccoli (SCF).
- **Quando serve.** Nessuna indicazione di routine.
- **Interazione.** Anticoagulanti cumarinici (warfarin, acenocumarolo): non aumentare la vitamina K, con il cibo o con integratori, senza il medico (SCF). Già 10–20 µg/die di MK-7 abbassano l’INR in modo clinicamente rilevante (Theuwissen 2013).
- **Sport.** Nessuna prova di benefici sulla prestazione in chi non è carente. IOC 2018: prove buone per la prestazione solo per caffeina, creatina, nitrati, bicarbonato e forse β-alanina.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [EFSA/SCF, Tolerable Upper Intake Levels for Vitamins and Minerals (2006)](https://www.efsa.europa.eu/sites/default/files/efsa_rep/blobserver_assets/ndatolerableuil.pdf); [EFSA, Dietary Reference Values, summary report (2017)](https://www.efsa.europa.eu/sites/default/files/2017_09_DRVs_summary_report.pdf); [Ministero della Salute, apporti massimi di vitamine e minerali negli integratori, revisione 2018](https://www.nutrientiesupplementi.it/norme-sicurezza/item/download/6_80fbdef7198cd2089c022e48d2ce2249); [Theuwissen et al., J Thromb Haemost 2013](https://doi.org/10.1111/jth.12203)

#### Multivitaminico · `multivitaminico`

| | |
|---|---|
| Posizione | di solito non serve |
| Prove | insufficiente · AIS B |
| Dose predefinita | 1 compressa (la dose giornaliera in etichetta) |
| Opzioni | 1 compressa; 2 compresse |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | non fissato |
| Quando | colazione; ogni giorno |
| Cibo | con un pasto che contenga grassi |
| Da leggere in etichetta | `vitamina-a`, `beta-carotene`, `vitamina-d`, `vitamina-e`, `vitamina-k`, `vitamina-c`, `vitamina-b1`, `vitamina-b2`, `niacina`, `acido-pantotenico`, `vitamina-b6`, `biotina`, `acido-folico`, `vitamina-b12`, `calcio`, `magnesio`, `ferro`, `zinco`, `rame`, `selenio`, `iodio` |

- **Prove.** USPSTF 2022: prove insufficienti (I) per prevenire malattie cardiovascolari e cancro. PHS II (14.641 medici uomini, 11,2 anni): cancro totale HR 0,92 (0,86–0,998), nessun effetto su mortalità per cancro, prostata e colon-retto. COSMOS 2022: cancro invasivo HR 0,97 (0,86–1,09). Coorti (Loftfield 2024): nessun beneficio sulla mortalità.
- **Quando serve.** Nessuna indicazione di routine in chi mangia vario. Per valutarlo si legge l’etichetta.
- **Attenzione.** In etichetta da controllare: β-carotene (fumatori), vitamina A preformata, ferro (uomini senza carenza), B6 sommata ad altri prodotti, acido folico.
- **Sport.** AIS gruppo B.
- **Prevenzione oncologica.** WCRF: non usare integratori per prevenire il cancro. Effetto modesto sul cancro totale nel PHS II, non confermato nel COSMOS.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [USPSTF 2022, JAMA](https://doi.org/10.1001/jama.2022.8970); [Gaziano et al., PHS II, JAMA 2012](https://doi.org/10.1001/jama.2012.14641); [COSMOS, Am J Clin Nutr 2022](https://doi.org/10.1093/ajcn/nqac056); [Loftfield et al., JAMA Netw Open 2024](https://doi.org/10.1001/jamanetworkopen.2024.18729); [AIS Sports Supplement Framework, gruppo B](https://www.ausport.gov.au/ais/nutrition/supplements/group_b); [WCRF/AICR, raccomandazione sugli integratori](https://www.wcrf.org/research-policy/evidence-for-our-recommendations/do-not-use-supplements-for-cancer-prevention/)

### Minerali

#### Magnesio · `magnesio`

| | |
|---|---|
| Posizione | di solito non serve |
| Prove | insufficiente · AIS C |
| Dose predefinita | 200 mg |
| Opzioni | 100 mg; 200 mg; 250 mg (UL EFSA da integratori) |
| Limite superiore | 250 mg (UL, solo integratori; SCF 2001 (NOAEL 250 mg per diarrea lieve, fattore 1)). Conta solo integratori, acqua e alimenti addizionati: il magnesio dei cibi è escluso. |
| Massimo per prodotto in Italia | 450 mg (sopra l’UL EFSA: anche un prodotto italiano può superarlo) |
| Quando | sera (coprifuoco); ogni giorno |
| Cibo | indifferente o nessuna indicazione |

- **Prove.** AIS gruppo C: nessun beneficio sulla prestazione negli atleti con apporto adeguato. Crampi: «improbabile» una profilassi utile negli anziani (Cochrane 2020, 11 RCT, 735 persone); nessun RCT sui crampi da esercizio. Sonno: benefici solo in anziani e in gravidanza, con prove di qualità bassa o molto bassa (Mah 2021).
- **Quando serve.** Assunzione bassa documentata o carenza; nel «bone pack» con calcio e vitamina D in caso di fratture da stress (AIS). Prima la dieta: cereali integrali, legumi, frutta secca, cacao.
- **Attenzione.** Diarrea: negli studi sui crampi effetti avversi soprattutto gastrointestinali nell’11% dei trattati (10% nei controlli) fino al 37% (14% nei controlli). La dose divisa in più prese è meglio tollerata (SCF).
- **Attenzione.** Insufficienza renale: rischio serio di ipermagnesiemia.
- **Attenzione.** Le differenze di assorbimento tra le forme (citrato, cloruro e lattato meglio dell’ossido) vengono da studi piccoli.
- **Attenzione.** Il magnesio sierico è circa l’1% delle riserve e non riflette bene lo stato (LPI).
- **Interazione.** Bisfosfonati: a 2 ore di distanza.
- **Interazione.** Antibiotici chinolonici e tetracicline: ne riduce l’efficacia.
- **Interazione.** Inibitori di pompa per almeno 3 mesi: possono causare ipomagnesemia.
- **Interazione.** Diuretici dell’ansa e tiazidici; digossina (LPI).
- **Sport.** Le perdite con il sudore sono «modeste e molto variabili» (EFSA).
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [EFSA/SCF, Tolerable Upper Intake Levels for Vitamins and Minerals (2006)](https://www.efsa.europa.eu/sites/default/files/efsa_rep/blobserver_assets/ndatolerableuil.pdf); [EFSA, Dietary Reference Values, summary report (2017)](https://www.efsa.europa.eu/sites/default/files/2017_09_DRVs_summary_report.pdf); [Ministero della Salute, apporti massimi di vitamine e minerali negli integratori, revisione 2018](https://www.nutrientiesupplementi.it/norme-sicurezza/item/download/6_80fbdef7198cd2089c022e48d2ce2249); [Garrison et al., Cochrane 2020 (magnesio e crampi)](https://doi.org/10.1002/14651858.CD009402.pub3); [Mah e Pitre, BMC Complement Med Ther 2021](https://doi.org/10.1186/s12906-021-03297-z); [Linus Pauling Institute, magnesio](https://lpi.oregonstate.edu/mic/minerals/magnesium); [AIS Sports Supplement Framework, gruppo C](https://www.ausport.gov.au/ais/nutrition/supplements/group_c)

#### Zinco · `zinco`

| | |
|---|---|
| Posizione | solo su indicazione |
| Prove | limitata · AIS A |
| Dose predefinita | 10 mg |
| Opzioni | 10 mg; 15 mg (massimo per un integratore in Italia) |
| Limite superiore | 25 mg (UL, da tutte le fonti; SCF 2002 (NOAEL 50 mg/die sugli indici del rame, fattore 2)) |
| Massimo per prodotto in Italia | 15 mg (adulti) |
| Quando | cena; ogni giorno |
| Cibo | con un pasto |
| Esami | non di routine: zinco plasmatico (poco sensibile), rame e ceruloplasmina con dosi alte e prolungate |

- **Prove.** AIS gruppo A tra i supplementi medici, cioè per correggere una carenza. Raffreddore: prevenzione «little or no effect»; come trattamento forse −2,37 giorni (certezza bassa), con più effetti avversi non gravi (RR 1,34, certezza moderata; Cochrane 2024).
- **Quando serve.** Carenza accertata. Una dieta ricca di legumi e cereali integrali (fitati) richiede più zinco dal cibo, non un integratore (EFSA: PRI da 9,4 a 16,3 mg secondo i fitati).
- **Esami.** Per decidere se serve; con dosi alte, per controllare il rame.
- **Attenzione.** Carenza di rame con dosi alte: segni già con 60 mg/die totali per 10 settimane (LPI).
- **Attenzione.** Le pastiglie per il raffreddore portano spesso oltre l’UL per qualche giorno.
- **Attenzione.** IOC: dosi alte di zinco possono ridurre la funzione immunitaria.
- **Attenzione.** Nausea e gusto metallico.
- **Interazione.** Ferro ad alte dosi a stomaco vuoto ne riduce l’assorbimento, con il cibo no; 600 mg di calcio con un pasto lo hanno dimezzato in un piccolo studio (LPI).
- **Interazione.** Tetracicline e chinoloni: a 2 ore di distanza (LPI).
- **Sport.** IOC: lo zinco ad alte dosi è sconsigliato.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [EFSA/SCF, Tolerable Upper Intake Levels for Vitamins and Minerals (2006)](https://www.efsa.europa.eu/sites/default/files/efsa_rep/blobserver_assets/ndatolerableuil.pdf); [EFSA, Dietary Reference Values, summary report (2017)](https://www.efsa.europa.eu/sites/default/files/2017_09_DRVs_summary_report.pdf); [Ministero della Salute, apporti massimi di vitamine e minerali negli integratori, revisione 2018](https://www.nutrientiesupplementi.it/norme-sicurezza/item/download/6_80fbdef7198cd2089c022e48d2ce2249); [Nault et al., Cochrane 2024 (zinco e raffreddore)](https://doi.org/10.1002/14651858.CD014914.pub2); [Linus Pauling Institute, zinco](https://lpi.oregonstate.edu/mic/minerals/zinc); [Maughan et al., consensus IOC, BJSM 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/)

#### Rame · `rame`

| | |
|---|---|
| Posizione | solo su indicazione |
| Prove | insufficiente |
| Dose predefinita | 1 mg |
| Opzioni | 1 mg; 2 mg (massimo per un integratore in Italia) |
| Limite superiore | 5 mg (UL, da tutte le fonti; SCF 2003 (NOAEL 10 mg/die sulla funzione epatica, fattore 2)). EFSA 2023: dose giornaliera accettabile di 0,07 mg/kg di peso. |
| Massimo per prodotto in Italia | 2 mg |
| Quando | cena; ogni giorno |
| Cibo | con un pasto |
| Esami | prima di cominciare: rame, ceruloplasmina |

- **Prove.** Nessuna indicazione nelle persone sane (inferenza da EFSA e LPI).
- **Quando serve.** Carenza da eccesso di zinco o malassorbimento, su indicazione medica.
- **Esami.** Prima di cominciare: serve quasi solo nella carenza da zinco o nel malassorbimento.
- **Sport.** Nessun ruolo nella prestazione.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [EFSA, Overview on Tolerable Upper Intake Levels, versione 11 (2025)](https://www.efsa.europa.eu/sites/default/files/2024-05/ul-summary-report.pdf); [EFSA/SCF, Tolerable Upper Intake Levels for Vitamins and Minerals (2006)](https://www.efsa.europa.eu/sites/default/files/efsa_rep/blobserver_assets/ndatolerableuil.pdf); [EFSA, Dietary Reference Values, summary report (2017)](https://www.efsa.europa.eu/sites/default/files/2017_09_DRVs_summary_report.pdf); [Ministero della Salute, apporti massimi di vitamine e minerali negli integratori, revisione 2018](https://www.nutrientiesupplementi.it/norme-sicurezza/item/download/6_80fbdef7198cd2089c022e48d2ce2249)

#### Ferro · `ferro`

| | |
|---|---|
| Posizione | solo su indicazione |
| Prove | forte · AIS A |
| Dose predefinita | 30 mg (massimo per un integratore in Italia, a giorni alterni) |
| Opzioni | 11 mg (fabbisogno dell’uomo (PRI)); 30 mg (massimo per un integratore in Italia); 60 mg (dose degli studi a giorni alterni: solo su prescrizione) |
| Limite superiore | 40 mg (safe level, da tutte le fonti; EFSA 2024 (safe level, non UL)). Non si applica a chi prende ferro sotto controllo medico per un’anemia. |
| Massimo per prodotto in Italia | 30 mg |
| Quando | spuntino (in mancanza: colazione); a giorni alterni |
| Cibo | indifferente o nessuna indicazione |
| Esami | prima di cominciare: ferritina, saturazione della transferrina, sideremia, recettore solubile della transferrina, emoglobina, MCV, PCR (la ferritina sale con l’infiammazione) |

- **Prove.** Corregge la carenza (AIS gruppo A tra i supplementi medici). IOC: «gli integratori di ferro ad alte dosi non dovrebbero essere assunti se non c’è carenza». A giorni alterni l’assorbimento frazionato è più alto (21,8% contro 16,3%, Stoffel 2017; +40–50% nelle anemiche, Stoffel 2020).
- **Quando serve.** Solo con carenza accertata dagli esami. LPI: gli uomini adulti non dovrebbero prenderlo senza valutazione medica, anche per il rischio di emocromatosi ereditaria. Negli atleti la carenza riguarda circa il 5–11% degli uomini (Sim 2019).
- **Come prenderlo.** Lontano da caffè, tè e latticini (2 ore), con un frutto ricco di vitamina C: nello spuntino del mattino più che a colazione (inferenza dalle interazioni e da McCormick 2019).
- **Esami.** Prima di cominciare e per decidere quanto continuare.
- **Attenzione.** In etichetta conta il ferro elementare: il solfato ferroso eptaidrato ne contiene il 20%, il monoidrato il 33%, il gluconato il 12%, il fumarato il 33% (LPI).
- **Attenzione.** A giorni alterni si danno 14 dosi in 28 giorni: per giorno si assorbe meno ferro, ma con più efficienza. Dividere la dose non serve.
- **Attenzione.** Feci nere: sono l’endpoint del safe level, non un effetto avverso di per sé.
- **Interazione.** Caffè e tè ne riducono «marcatamente» l’assorbimento; calcio e latticini a 2 ore di distanza; la vitamina C lo aumenta molto (LPI).
- **Interazione.** Ad alte dosi a stomaco vuoto riduce l’assorbimento dello zinco (LPI).
- **Sport.** L’esercizio alza l’epcidina, circa 3 ore dopo la seduta: il ferro si assorbe meglio al mattino (McCormick 2019, 16 runner).
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [EFSA NDA Panel 2024, safe level del ferro](https://doi.org/10.2903/j.efsa.2024.8819); [Ministero della Salute, apporti massimi di vitamine e minerali negli integratori, revisione 2018](https://www.nutrientiesupplementi.it/norme-sicurezza/item/download/6_80fbdef7198cd2089c022e48d2ce2249); [Maughan et al., consensus IOC, BJSM 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/); [Stoffel et al., Lancet Haematol 2017](https://doi.org/10.1016/S2352-3026(17)30182-5); [Stoffel et al., Haematologica 2020](https://doi.org/10.3324/haematol.2019.220830); [Linus Pauling Institute, ferro](https://lpi.oregonstate.edu/mic/minerals/iron); [McCormick et al., Med Sci Sports Exerc 2019](https://doi.org/10.1249/MSS.0000000000002026); [Sim et al., Eur J Appl Physiol 2019](https://doi.org/10.1007/s00421-019-04157-y)

#### Calcio · `calcio`

| | |
|---|---|
| Posizione | in situazioni precise |
| Prove | limitata · AIS A |
| Dose predefinita | 500 mg (una presa) |
| Opzioni | 500 mg (una presa (fino a 500 mg per presa)); 1000 mg (2 × 500 mg, con il medico) |
| Limite superiore | 2500 mg (UL, da tutte le fonti; EFSA 2012) |
| Massimo per prodotto in Italia | 1200 mg |
| Massimo per presa | 500 mg |
| Quando | cena; ogni giorno |
| Cibo | con un pasto |

- **Prove.** AIS gruppo A tra i supplementi medici. Calcio 2000 mg + vitamina D 800 UI per 8 settimane: fratture da stress −20% in reclute donne (Lappe 2008). Con bassa disponibilità energetica l’IOC indica 1500 mg/die con 1500–2000 UI di vitamina D.
- **Quando serve.** Quando la dieta non arriva al fabbisogno (PRI 950 mg dai 25 anni, 1000 mg tra 18 e 24): prima i latticini, poi l’integratore per la differenza. Fratture da stress o bassa disponibilità energetica, con il medico.
- **Come prenderlo.** Il carbonato va preso ai pasti; il citrato anche lontano dai pasti (preferibile con gli inibitori di pompa). Lontano dal ferro (LPI).
- **Attenzione.** Calcoli renali: HR 1,17 (1,02–1,34) con 1000 mg di carbonato + 400 UI di D3 (WHI, donne in post-menopausa).
- **Attenzione.** Infarto: segnale da una meta-analisi con calcio senza vitamina D (Bolland 2010, HR 1,31, 1,02–1,67) non confermato; la linea guida NOF/ASPC 2016 giudica, con evidenza di qualità moderata, che entro l’UL non ci sia relazione con il rischio cardiovascolare.
- **Attenzione.** Non esiste un esame dello stato del calcio: la calcemia è regolata e non riflette l’apporto (IOC).
- **Attenzione.** Sindrome latte-alcali con dosi alte e antiacidi.
- **Interazione.** Ferro e zinco: ne riduce l’assorbimento (il ferro a 2 ore di distanza).
- **Interazione.** Levotiroxina, tetracicline, chinoloni, bisfosfonati, sotalolo: ne riduce l’assorbimento.
- **Interazione.** Diuretici tiazidici: rischio di ipercalcemia; digossina (LPI).
- **Sport.** Lappe 2008 è su reclute donne: la trasferibilità a un calciatore uomo non è dimostrata.
- **Prevenzione oncologica.** WCRF: gli integratori di calcio riducono il rischio di cancro del colon-retto, grado «probable», l’unica eccezione alla regola. Per la prostata le diete ricche di calcio sono «limited-suggestive» per un aumento del rischio (fonte secondaria).
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [EFSA, Dietary Reference Values, summary report (2017)](https://www.efsa.europa.eu/sites/default/files/2017_09_DRVs_summary_report.pdf); [EFSA, Overview on Tolerable Upper Intake Levels, versione 11 (2025)](https://www.efsa.europa.eu/sites/default/files/2024-05/ul-summary-report.pdf); [Ministero della Salute, apporti massimi di vitamine e minerali negli integratori, revisione 2018](https://www.nutrientiesupplementi.it/norme-sicurezza/item/download/6_80fbdef7198cd2089c022e48d2ce2249); [Linus Pauling Institute, calcio](https://lpi.oregonstate.edu/mic/minerals/calcium); [Jackson et al., WHI, NEJM 2006](https://doi.org/10.1056/NEJMoa055218); [Bolland et al., BMJ 2010](https://doi.org/10.1136/bmj.c3691); [Kopecky et al., NOF/ASPC, Ann Intern Med 2016](https://doi.org/10.7326/M16-1743); [Lappe et al., J Bone Miner Res 2008](https://doi.org/10.1359/jbmr.080102); [Maughan et al., consensus IOC, BJSM 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/); [WCRF/AICR, raccomandazione sugli integratori](https://www.wcrf.org/research-policy/evidence-for-our-recommendations/do-not-use-supplements-for-cancer-prevention/)

#### Selenio · `selenio`

| | |
|---|---|
| Posizione | sconsigliato |
| Prove | sfavorevole |
| Dose predefinita | 50 µg (sotto il fabbisogno (AI 70 µg), che la dieta copre in parte) |
| Opzioni | 50 µg; 100 µg (massimo per un integratore in Italia) |
| Limite superiore | 255 µg (UL, da tutte le fonti; EFSA 2023 (LOAEL 330 µg/die da SELECT, fattore 1,3)) |
| Massimo per prodotto in Italia | 100 µg |
| Quando | colazione; ogni giorno |
| Cibo | indifferente o nessuna indicazione |

- **Prove.** Cochrane 2018, certezza «high»: nessun beneficio sul cancro; alcuni danni (vedi sotto).
- **Quando serve.** Nessuna indicazione nelle persone sane (inferenza dalle prove).
- **Attenzione.** Effetto critico dell’UL: alopecia (EFSA 2023).
- **Attenzione.** Le noci del Brasile sono molto ricche di selenio: mangiarle ogni giorno può portare oltre l’UL (EFSA 2023).
- **Sport.** Nessun ruolo nella prestazione.
- **Prevenzione oncologica.** Cochrane 2018 (certezza «high»): incidenza di cancro RR 1,01 (0,93–1,10). Più tumori della prostata di alto grado solo in chi partiva con più selenio; diabete di tipo 2 «slightly increased»; più alopecia e dermatite. SELECT (200 µg/die): prostata HR 1,09, non significativo.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [EFSA NDA Panel 2023, UL del selenio](https://doi.org/10.2903/j.efsa.2023.7704); [Vinceti et al., Cochrane 2018 (selenio e cancro)](https://doi.org/10.1002/14651858.CD005195.pub4); [Klein et al., SELECT, JAMA 2011](https://doi.org/10.1001/jama.2011.1437); [Ministero della Salute, apporti massimi di vitamine e minerali negli integratori, revisione 2018](https://www.nutrientiesupplementi.it/norme-sicurezza/item/download/6_80fbdef7198cd2089c022e48d2ce2249)

#### Iodio · `iodio`

| | |
|---|---|
| Posizione | di solito non serve |
| Prove | insufficiente |
| Dose predefinita | 150 µg (fabbisogno (AI)) |
| Opzioni | 150 µg (fabbisogno (AI)); 225 µg (massimo per un integratore in Italia) |
| Limite superiore | 600 µg (UL, da tutte le fonti; SCF 2002 (lievi variazioni del TSH a 1700–1800 µg/die, fattore 3)) |
| Massimo per prodotto in Italia | 225 µg |
| Quando | colazione; ogni giorno |
| Cibo | indifferente o nessuna indicazione |
| Esami | non di routine: TSH |

- **Prove.** L’Italia è iodosufficiente grazie al sale iodato, usato dal 71,5% degli adulti (OSNAMI-ISS 2024, fonte secondaria).
- **Quando serve.** Con il sale iodato, nei limiti del sale, l’integratore non serve (inferenza).
- **Esami.** Solo con un problema alla tiroide.
- **Attenzione.** Gli integratori di alghe (kelp, fucus) hanno un contenuto di iodio variabile e rischio di eccesso.
- **Sport.** Nessun ruolo nella prestazione.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [EFSA/SCF, Tolerable Upper Intake Levels for Vitamins and Minerals (2006)](https://www.efsa.europa.eu/sites/default/files/efsa_rep/blobserver_assets/ndatolerableuil.pdf); [EFSA, Dietary Reference Values, summary report (2017)](https://www.efsa.europa.eu/sites/default/files/2017_09_DRVs_summary_report.pdf); [Ministero della Salute, apporti massimi di vitamine e minerali negli integratori, revisione 2018](https://www.nutrientiesupplementi.it/norme-sicurezza/item/download/6_80fbdef7198cd2089c022e48d2ce2249); [Quotidiano Sanità sullo studio OSNAMI-ISS (2024, fonte secondaria)](https://www.quotidianosanita.it/scienza-e-farmaci/l-italia-iodosufficiente-grazie-alla-promozione-del-sale-iodato-lo-studio-dell-iss/)

#### Potassio · `potassio`

| | |
|---|---|
| Posizione | di solito non serve |
| Prove | insufficiente |
| Dose predefinita | 500 mg |
| Opzioni | 500 mg; 1000 mg |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | non fissato |
| Quando | pranzo; ogni giorno |
| Cibo | indifferente o nessuna indicazione |

- **Prove.** Nessun UL (EFSA 2005). Il fabbisogno (AI 3500 mg) si raggiunge con frutta, verdura, legumi e patate.
- **Quando serve.** Chi mangia poca frutta e verdura deve partire dal cibo, non dall’integratore.
- **Attenzione.** Circa 3 g/die di cloruro di potassio oltre alla dieta non hanno dato effetti avversi negli adulti sani; disturbi gastrointestinali tra 1 e 5 g/die con alcune forme; casi di effetti cardiaci con 5–7 g/die (EFSA 2005).
- **Attenzione.** Rischio con funzione renale ridotta o farmaci che trattengono il potassio (ACE-inibitori, sartani, diuretici risparmiatori di potassio).
- **Attenzione.** Il Ministero non fissa un massimo («non definito»).
- **Sport.** Vedi elettroliti.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [EFSA/SCF, Tolerable Upper Intake Levels for Vitamins and Minerals (2006)](https://www.efsa.europa.eu/sites/default/files/efsa_rep/blobserver_assets/ndatolerableuil.pdf); [EFSA, Dietary Reference Values, summary report (2017)](https://www.efsa.europa.eu/sites/default/files/2017_09_DRVs_summary_report.pdf); [Ministero della Salute, apporti massimi di vitamine e minerali negli integratori, revisione 2018](https://www.nutrientiesupplementi.it/norme-sicurezza/item/download/6_80fbdef7198cd2089c022e48d2ce2249)

### Acidi grassi

#### Omega-3 (EPA e DHA) · `omega-3`

| | |
|---|---|
| Posizione | in situazioni precise |
| Prove | limitata · AIS B |
| Dose predefinita | 600 mg (2 capsule standard · mantenimento AIS (500–600 mg/die)) |
| Opzioni | 300 mg (1 capsula standard (180 mg EPA + 120 mg DHA)); 600 mg (mantenimento AIS (500–600 mg/die)); 1000 mg (stato basso o periodo di infortunio (AIS)); 2000 mg (breve termine con carichi alti (AIS); IOC circa 2 g/die) |
| Limite superiore | 5000 mg (senza rischi fino a, solo integratori; EFSA 2012: fino a 5 g/die di EPA+DHA da integratori senza problemi di sicurezza (non è un UL)) |
| Massimo per prodotto in Italia | non fissato |
| Quando | colazione; ogni giorno |
| Cibo | con un pasto |
| Esami | non di routine: Omega-3 Index |

- **Prove.** AIS gruppo B. IOC: «limited support» contro l’infiammazione e nessuna prova sulle infezioni respiratorie; per il recupero circa 2 g/die, «low risk but unclear» se preferirlo al pesce grasso.
- **Quando serve.** Meno di 2 porzioni di pesce grasso a settimana: l’AIS indica 500–600 mg/die di EPA+DHA tra cibo e integratore. Periodi di carico alto o di infortunio: 1000–2000 mg/die per poco tempo.
- **Come prenderlo.** Con un pasto (AIS). Dopo la saturazione, saltare qualche giorno cambia poco: le membrane mantengono gli acidi grassi in media 2 settimane.
- **Esami.** Facoltativo. AIS: obiettivo sopra l’8%; sotto il 5% servono almeno 1000 mg/die, con effetto in 4–6 settimane; ricontrollare dopo almeno 12 settimane.
- **Attenzione.** In etichetta conta l’EPA+DHA, non i «1000 mg di olio» della capsula: una capsula standard ne ha 300 mg.
- **Attenzione.** Fibrillazione atriale in pazienti cardiovascolari con età media di 65 anni: HR 1,25 (1,07–1,46) nel complesso e 1,12 (1,03–1,22) anche con dosi fino a 1 g/die; +11% per ogni grammo in più (Gencer 2021). Il gruppo oltre 1 g/die comprende solo trial con 1,8–4 g/die. Non si sa se valga per un adulto giovane sano.
- **Attenzione.** IOC: metalli pesanti, sanguinamento, disturbi digestivi, aumento dell’LDL. Gli etil esteri sono la forma meno biodisponibile (AIS).
- **Interazione.** Il sanguinamento è tra i rischi segnalati dall’IOC: con anticoagulanti o antiaggreganti decide il medico (inferenza).
- **Sport.** AIS per gli infortuni: oltre 1000 mg/die. Oli ricchi di EPA: 200–500 mg di EPA per grammo; ricchi di DHA: 500–750 mg di DHA per grammo.
- **Antidoping (rischio basso).** Rischio doping basso; conta la purezza (ossidazione, metalli).
- **Fonti.** [AIS Sports Supplement Framework, gruppo B](https://www.ausport.gov.au/ais/nutrition/supplements/group_b); [Maughan et al., consensus IOC, BJSM 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/); [EFSA, comunicato su EPA e DHA (27/7/2012)](https://www.efsa.europa.eu/en/press/news/120727); [Gencer et al., Circulation 2021](https://doi.org/10.1161/circulationaha.121.055654); [VITAL Rhythm, JAMA 2021](https://doi.org/10.1001/jama.2021.1489)

### Proteine e aminoacidi

#### Proteine del siero del latte (whey) · `proteine-siero`

| | |
|---|---|
| Posizione | in situazioni precise |
| Prove | moderata · AIS A |
| Dose predefinita | 25 g (g di proteine, circa 30 g di polvere) |
| Opzioni | 20 g; 25 g; 30 g; 40 g (massimo per porzione (AIS)) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | non fissato |
| Massimo per presa | 40 g |
| Quando | dopo la seduta; altrimenti colazione; ogni giorno |
| Cibo | indifferente o nessuna indicazione |

- **Prove.** AIS gruppo A (integratore proteico isolato). Con un apporto proteico adeguato non aggiungono benefici: i guadagni di massa magra si appiattiscono intorno a 1,62 g/kg/die (IC 1,03–2,20), e gli autori suggeriscono circa 2,2 g/kg per chi vuole il massimo (Morton 2018, 49 RCT).
- **Quando serve.** Food first (AIS): dopo l’allenamento, per arricchire un pasto povero di proteine, con poco appetito o in viaggio; 1–2 porzioni al giorno.
- **Attenzione.** 30 g di polvere danno circa 21–27 g di proteine: la dose dell’app è in grammi di proteine.
- **Attenzione.** WPC 70–80% di proteine con un po’ di lattosio; WPI circa 90%; l’idrolizzato costa di più con vantaggi minimi (AIS).
- **Attenzione.** Allergeni del latte.
- **Sport.** AIS: 0,3–0,4 g/kg per pasto (15–30 g) in 3–5 occasioni; 1,2–1,6 g/kg/die per chi si allena molto, 1,6–2,4 g/kg in dimagrimento.
- **Antidoping (rischio medio).** I prodotti multi-ingrediente possono contenere ingredienti vietati. AIS: il test sui lotti esclude le sostanze WADA, non i metalli pesanti.
- **Fonti.** [AIS Sports Supplement Framework, gruppo A](https://www.ausport.gov.au/ais/nutrition/supplements/group_a); [Morton et al., BJSM 2018](https://doi.org/10.1136/bjsports-2017-097608); [Maughan et al., consensus IOC, BJSM 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/)

#### Caseina · `caseina`

| | |
|---|---|
| Posizione | in situazioni precise |
| Prove | limitata · AIS A |
| Dose predefinita | 30 g (g di proteine) |
| Opzioni | 20 g; 30 g; 40 g (massimo per porzione (AIS)) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | non fissato |
| Massimo per presa | 40 g |
| Quando | sera (coprifuoco); ogni giorno |
| Cibo | indifferente o nessuna indicazione |

- **Prove.** 20–40 g circa 30 minuti prima di dormire aumentano la sintesi proteica notturna nei giovani (Reis 2021, 9 studi), ma negli studi l’apporto proteico totale non era bilanciato. AIS: manca la prova di un valore specifico della caseina a cena.
- **Quando serve.** Quando le proteine della giornata sono basse. Uno yogurt greco o uno skyr la sera fanno la stessa cosa con il cibo (inferenza).
- **Come prenderlo.** Circa 30 minuti prima di dormire (Reis 2021).
- **Attenzione.** Allergeni del latte.
- **Sport.** Vedi proteine del siero.
- **Antidoping (rischio medio).** I prodotti multi-ingrediente possono contenere ingredienti vietati. AIS: il test sui lotti esclude le sostanze WADA, non i metalli pesanti.
- **Fonti.** [Reis et al., J Sci Med Sport 2021](https://doi.org/10.1016/j.jsams.2020.07.016); [AIS Sports Supplement Framework, gruppo A](https://www.ausport.gov.au/ais/nutrition/supplements/group_a)

#### Proteine vegetali in polvere · `proteine-vegetali`

| | |
|---|---|
| Posizione | in situazioni precise |
| Prove | moderata · AIS A |
| Dose predefinita | 25 g (g di proteine) |
| Opzioni | 20 g; 25 g; 30 g; 40 g (massimo per porzione (AIS)) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | non fissato |
| Massimo per presa | 40 g |
| Quando | dopo la seduta; altrimenti colazione; ogni giorno |
| Cibo | indifferente o nessuna indicazione |

- **Prove.** Simili alle proteine animali su forza e massa magra assoluta (Lim 2021, 16 RCT); sotto i 50 anni le animali danno un po’ più di massa magra (WMD 0,41 kg, 0,08–0,74).
- **Quando serve.** Dieta vegetariana o vegana, intolleranza al latte. Per chi mangia carne e latticini non servono (inferenza).
- **Attenzione.** Valore biologico più basso (pisello, riso, canapa, ceci): si compensa mescolando fonti, aggiungendo leucina o aumentando la porzione. La soia ha alto valore biologico ma meno leucina del siero (AIS).
- **Attenzione.** Piombo: in test statunitensi su 23 prodotti, in media circa 9 volte quello delle proteine del latte (Consumer Reports 2025, fonte secondaria, soglie molto prudenti).
- **Sport.** Vedi proteine del siero.
- **Antidoping (rischio medio).** I prodotti multi-ingrediente possono contenere ingredienti vietati. AIS: il test sui lotti esclude le sostanze WADA, non i metalli pesanti.
- **Fonti.** [Lim et al., Nutrients 2021](https://doi.org/10.3390/nu13020661); [AIS Sports Supplement Framework, gruppo A](https://www.ausport.gov.au/ais/nutrition/supplements/group_a); [NutritionInsight su Consumer Reports 2025 (fonte secondaria)](https://www.nutritioninsight.com/news/protein-powders-heavy-metals-lead-consumer-reports-2025.html)

#### Aminoacidi ramificati (BCAA) · `bcaa`

| | |
|---|---|
| Posizione | di solito non serve |
| Prove | insufficiente · AIS C |
| Dose predefinita | 5 g (massimo per un integratore in Italia) |
| Opzioni | 2,5 g; 5 g (massimo per un integratore in Italia) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | 5 g (somma di leucina, isoleucina e valina) |
| Quando | dopo la seduta; altrimenti colazione; ogni giorno |
| Cibo | indifferente o nessuna indicazione |

- **Prove.** AIS (dal gruppo B al C nel 2025): 5,6 g dopo i pesi aumentano la sintesi proteica «only 22%», meno della metà di quanto ci si aspetta dalle proteine intere; l’effetto sull’indolenzimento richiede circa 16 g/die per almeno 7 giorni contro un placebo senza proteine. IOC sulla leucina: nessun trial a lungo termine.
- **Quando serve.** Con 20–30 g di proteine di qualità a pasto sono superflui. Unico uso indicato dall’AIS: aggiungere 2,5–3 g di leucina a un pasto povero di proteine.
- **Attenzione.** Possono derivare da piume e peli animali trattati (AIS).
- **Attenzione.** Avvertenza ministeriale: non in gravidanza, nei bambini o per periodi prolungati senza sentire il medico.
- **Sport.** Vedi proteine del siero: le proteine intere fanno di più.
- **Antidoping (rischio medio).** I prodotti multi-ingrediente possono contenere ingredienti vietati. AIS: il test sui lotti esclude le sostanze WADA, non i metalli pesanti.
- **Fonti.** [AIS Sports Supplement Framework, gruppo C](https://www.ausport.gov.au/ais/nutrition/supplements/group_c); [Maughan et al., consensus IOC, BJSM 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/); [Ministero della Salute, Altri nutrienti e altre sostanze a effetto nutritivo o fisiologico, revisione 9/2019](https://aeaconsulenzealimentari.it/wp-content/uploads/2021/04/integratori-ad-effetto-nutritivo-e-fisiologico-aggiornamento-settembre-2019.pdf)

### Integratori per lo sport

#### Creatina monoidrato · `creatina`

| | |
|---|---|
| Posizione | utile |
| Prove | forte · AIS A |
| Dose predefinita | 3 g (etichetta italiana e claim UE (3 g/die)) |
| Opzioni | 3 g (etichetta italiana e claim UE (3 g/die)); 5 g (AIS 3–5 g/die; sopra l’etichetta italiana) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | 3 g (per gli sportivi fino a 6 g/die per non più di un mese) |
| Quando | colazione; ogni giorno |
| Cibo | con un pasto |
| Esami | nessuno da fare; ne falsa alcuni (vedi sotto) |

- **Prove.** AIS gruppo A; IOC «good to strong evidence»; UEFA tra le prove più solide. Migliora gli sforzi brevi e intensi ripetuti e gli adattamenti all’allenamento di forza.
- **Quando serve.** Sport con sprint ripetuti e allenamento di forza. Senza carico, 3–5 g/die saturano il muscolo in circa 4 settimane.
- **Come prenderlo.** Con un pasto ricco di carboidrati (AIS). Dopo l’allenamento è un consiglio «prudente» con pochi dati di superiorità: conta prenderla ogni giorno. Sciolta in un liquido si degrada in creatinina: va bevuta subito.
- **Esami falsati.** La creatinina del sangue aumenta davvero, perché la creatina si degrada in creatinina, e può far sottostimare il filtrato renale (eGFR) senza indicare un danno (Antonio 2021): dillo al medico prima degli esami.
- **Attenzione.** Peso: +1–2 kg di acqua, che si perdono in 4–6 settimane dopo la sospensione. UEFA: con dosi basse (2–5 g/die per 28 giorni) l’aumento si può evitare.
- **Attenzione.** Solo il monoidrato ha dati: circa il 99% delle prove di sicurezza ed efficacia riguarda questa forma; per le altre «no scientific reason» (AIS).
- **Attenzione.** Rene, crampi e termoregolazione: preoccupazioni «not supported» (AIS). IOC: nessun effetto negativo sulla salute fino a 4 anni di uso.
- **Attenzione.** Capelli: nessuna differenza su DHT, rapporto DHT/testosterone e capello in un RCT di 12 settimane con 5 g/die (38 uomini allenati); un solo studio, breve.
- **Interazione.** Non insieme a molte fibre o al bicarbonato (AIS).
- **Sport.** Carico facoltativo: 4 × 5 g/die per 5 giorni, poi 3–5 g/die (AIS; IOC circa 20 g/die per 5–7 giorni); il carico porta prima il peso in più e qualche disturbo intestinale. AIS: qualche indicazione di recupero migliore dopo un’immobilizzazione e benefici cognitivi con poco sonno.
- **Antidoping (rischio basso).** Non vietata. Il rischio sta nei prodotti multi-ingrediente: meglio monoidrato puro con lotto certificato.
- **Fonti.** [AIS Sports Supplement Framework, gruppo A](https://www.ausport.gov.au/ais/nutrition/supplements/group_a); [Maughan et al., consensus IOC, BJSM 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/); [Collins et al., UEFA expert group statement, BJSM 2021](https://doi.org/10.1136/bjsports-2019-101961); [Ministero della Salute, Altri nutrienti e altre sostanze a effetto nutritivo o fisiologico, revisione 9/2019](https://aeaconsulenzealimentari.it/wp-content/uploads/2021/04/integratori-ad-effetto-nutritivo-e-fisiologico-aggiornamento-settembre-2019.pdf); [EFSA 2011, claim sulla creatina](https://doi.org/10.2903/j.efsa.2011.2303); [Antonio et al., JISSN 2021](https://doi.org/10.1186/s12970-021-00412-w); [RCT su creatina e capelli, JISSN 2025](https://doi.org/10.1080/15502783.2025.2495229)

#### Caffeina · `caffeina`

| | |
|---|---|
| Posizione | in situazioni precise |
| Prove | forte · AIS A |
| Dose predefinita | 200 mg (plateau AIS (~3 mg/kg)) |
| Opzioni | 100 mg (1 compressa: l’AIS la preferisce ai pre-workout); 200 mg (plateau AIS (~3 mg/kg); massimo per una dose singola (EFSA) e per un integratore in Italia) |
| Limite superiore | 400 mg (senza rischi fino a, da tutte le fonti; EFSA 2015 (adulto sano, da tutte le fonti)) |
| Massimo per prodotto in Italia | 200 mg |
| Massimo per presa | 200 mg |
| Quando | 60 min prima della seduta; altrimenti colazione; solo nei giorni di seduta |
| Cibo | indifferente o nessuna indicazione |

- **Prove.** AIS gruppo A; IOC: +1–8% su lavoro totale e sprint ripetuti nelle prove intermittenti; UEFA tra le prove più solide. Sospenderla prima della gara non aumenta il beneficio (AIS).
- **Quando serve.** Partite e allenamenti importanti, scegliendo tra prestazione e sonno.
- **Attenzione.** Sonno: in media −45 minuti di sonno totale; un caffè filtro da 107 mg va preso almeno 8,8 h prima di andare a letto, un pre-workout da 217,5 mg almeno 13,2 h prima (Gardiner 2023; soglie da un modello con IC ampi). EFSA: già 100 mg vicino all’ora di dormire possono disturbare il sonno.
- **Attenzione.** I caffè della giornata si sommano: fino a 400 mg/die da tutte le fonti (EFSA).
- **Attenzione.** I 200 mg meno di 2 h prima di uno sforzo intenso non pongono problemi in condizioni ambientali normali, non con il caldo (EFSA). Emivita media di circa 4 h (da 2 a 8).
- **Attenzione.** Risposta individuale molto variabile: alcuni non rispondono e altri peggiorano (AIS). Dosi da 9 mg/kg in su non aumentano il beneficio (IOC).
- **Sport.** Fino a 3 mg/kg, in una volta o divisa, fino a un’ora prima o in momenti strategici (AIS). IOC e UEFA: 3–6 mg/kg circa 60 minuti prima, oppure meno di 3 mg/kg prima e durante, all’intervallo, con i carboidrati.
- **Antidoping (rischio basso).** Non vietata: nel programma di monitoraggio WADA 2026 solo in gara. Come compressa a dose nota il rischio è basso; nei pre-workout no.
- **Fonti.** [AIS Sports Supplement Framework, gruppo A](https://www.ausport.gov.au/ais/nutrition/supplements/group_a); [Maughan et al., consensus IOC, BJSM 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/); [Collins et al., UEFA expert group statement, BJSM 2021](https://doi.org/10.1136/bjsports-2019-101961); [EFSA explains risk assessment: Caffeine (2015)](https://www.efsa.europa.eu/sites/default/files/corporate_publications/files/efsaexplainscaffeine150527.pdf); [Gardiner et al., Sleep Med Rev 2023](https://doi.org/10.1016/j.smrv.2023.101764); [Ministero della Salute, Altri nutrienti e altre sostanze a effetto nutritivo o fisiologico, revisione 9/2019](https://aeaconsulenzealimentari.it/wp-content/uploads/2021/04/integratori-ad-effetto-nutritivo-e-fisiologico-aggiornamento-settembre-2019.pdf); [WADA, programma di monitoraggio 2026 (traduzione ufficiale ABCD)](https://www.gov.br/abcd/pt-br/composicao/atletas/substancias-e-metodos-proibidos/2026ProgramadeMonitoramento.pdf)

#### Beta-alanina · `beta-alanina`

| | |
|---|---|
| Posizione | in situazioni precise |
| Prove | moderata · AIS A |
| Dose predefinita | 6,4 g (4 × 1,6 g con i pasti per almeno 4 settimane (AIS)) |
| Opzioni | 1,2 g (mantenimento (AIS)); 6,4 g (4 × 1,6 g con i pasti per almeno 4 settimane (AIS)) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | non fissato |
| Massimo per presa | 1,6 g |
| Quando | colazione; in 4 prese; ogni giorno |
| Cibo | con un pasto |

- **Prove.** AIS gruppo A; IOC «possibly», beneficio di circa 0,2–3% negli sforzi da 30 s a 10 min, più difficile da ottenere negli atleti molto allenati; UEFA: «evidence is contradictory».
- **Quando serve.** Sforzi intensi ripetuti da 30 secondi a 10 minuti. Per un amatore il rapporto costo/beneficio è basso (inferenza).
- **Come prenderlo.** Divisa sui pasti principali e lo spuntino più grande: con il pasto carica di più la carnosina (+64% contro +41%).
- **Attenzione.** Formicolio (parestesia) con dosi a rilascio immediato oltre 800–1600 mg, fino a un’ora; la forma a rilascio prolungato lo riduce. IOC: anche eruzioni cutanee.
- **Attenzione.** Presa in acuto, come nei pre-workout, non ha prove.
- **Attenzione.** La carnosina per bocca non la sostituisce.
- **Attenzione.** Scheda AIS incoerente: 6,4 g/die nel testo e nell’esempio, 6,8 g/die nel riquadro di prescrizione (probabile refuso).
- **Sport.** La carnosina muscolare si perde lentamente, circa 2% a settimana. IOC: circa 65 mg/kg/die in dosi da 0,8–1,6 g ogni 3–4 ore per 10–12 settimane.
- **Antidoping (rischio medio).** Spesso dentro i pre-workout: meglio il prodotto singolo con lotto certificato.
- **Fonti.** [AIS Sports Supplement Framework, gruppo A](https://www.ausport.gov.au/ais/nutrition/supplements/group_a); [Maughan et al., consensus IOC, BJSM 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/); [Collins et al., UEFA expert group statement, BJSM 2021](https://doi.org/10.1136/bjsports-2019-101961)

#### Nitrati (succo di barbabietola) · `nitrati`

| | |
|---|---|
| Posizione | in situazioni precise |
| Prove | moderata · AIS A |
| Dose predefinita | 500 mg (≈ 8 mmol) |
| Opzioni | 350 mg (≈ 6 mmol: minimo efficace (AIS: almeno 5–6 mmol)); 500 mg (≈ 8 mmol); 650 mg (≈ 10 mmol; oltre 12 mmol nessun vantaggio rispetto a 8) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | non fissato |
| Quando | 150 min prima della seduta; altrimenti pranzo; solo nei giorni di seduta |
| Cibo | indifferente o nessuna indicazione |
| Conversioni | 1 mmol = 62 mg |

- **Prove.** AIS gruppo A; IOC: +3–5% nelle prove intermittenti da squadra di 12–40 minuti, più difficile negli atleti molto allenati; UEFA: prove limitate nel calcio, benefici negli amatori.
- **Quando serve.** Prima di partite o sedute intense, 2–3 ore prima, oppure ogni giorno per alcuni giorni. Il cibo può bastare: rucola, spinaci, lattuga, sedano e barbabietola sono nella fascia più alta (oltre 2500 mg/kg), ma le preparazioni casalinghe non garantiscono la dose.
- **Attenzione.** Il colluttorio antibatterico blocca la conversione in nitrito: niente colluttorio nei giorni in cui lo usi (AIS).
- **Attenzione.** Urine e feci rosa: innocue.
- **Attenzione.** I sali di nitrato e soprattutto i nitriti sono pericolosi (metaemoglobinemia): solo cibo o succo.
- **Attenzione.** Disturbi intestinali possibili.
- **Sport.** IOC: 5–9 mmol (310–560 mg) entro 2–3 ore. Oltre circa 12 mmol non fa più di circa 8 mmol (AIS).
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [AIS Sports Supplement Framework, gruppo A](https://www.ausport.gov.au/ais/nutrition/supplements/group_a); [Maughan et al., consensus IOC, BJSM 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/); [Collins et al., UEFA expert group statement, BJSM 2021](https://doi.org/10.1136/bjsports-2019-101961)

#### Bicarbonato di sodio · `bicarbonato`

| | |
|---|---|
| Posizione | in situazioni precise |
| Prove | moderata · AIS A |
| Dose predefinita | 200 mg/kg |
| Opzioni | 200 mg/kg; 300 mg/kg |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | non fissato |
| Quando | 135 min prima della seduta; altrimenti pranzo; solo nei giorni di seduta |
| Cibo | con un pasto |

- **Prove.** AIS gruppo A: efficace negli sforzi da 30 s a 10 minuti, con pochi studi favorevoli negli sport di squadra; IOC: circa 2% negli sprint di circa 60 s. L’UEFA l’ha tolto dall’elenco perché non si usa nel calcio d’élite, non per prove negative.
- **Quando serve.** Da provare prima in allenamento, mai la prima volta in partita.
- **Come prenderlo.** Con un pasto piccolo ricco di carboidrati (circa 1,5 g/kg) 120–150 minuti prima (AIS).
- **Attenzione.** Nausea, mal di stomaco, diarrea e vomito sono frequenti (AIS).
- **Attenzione.** La dose dipende dal peso: l’app la calcola dal peso del controllo del mattino.
- **Sport.** AIS: 200–400 mg/kg; IOC 0,2–0,4 g/kg 60–150 minuti prima.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [AIS Sports Supplement Framework, gruppo A](https://www.ausport.gov.au/ais/nutrition/supplements/group_a); [Maughan et al., consensus IOC, BJSM 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/); [Collins et al., UEFA expert group statement, BJSM 2021](https://doi.org/10.1136/bjsports-2019-101961)

#### Elettroliti (sali minerali) · `elettroliti`

| | |
|---|---|
| Posizione | in situazioni precise |
| Prove | moderata · AIS A |
| Dose predefinita | 1 bustina |
| Opzioni | 1 bustina; 2 bustine |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | non fissato |
| Quando | dopo la seduta; altrimenti cena; solo nei giorni di seduta |
| Cibo | indifferente o nessuna indicazione |
| Da leggere in etichetta | `potassio`, `magnesio`, `vitamina-b6` |

- **Prove.** AIS gruppo A, in situazioni specifiche.
- **Quando serve.** Caldo e grandi perdite di sudore salato, diarrea o gastroenterite (ORS), recupero di un deficit di liquidi: 1,2–1,5 volte il deficit stimato entro 2–4 ore, con sodio (AIS).
- **Attenzione.** Nessun consenso sul valore del sodio durante l’esercizio; l’iponatriemia viene soprattutto dal bere troppo e il sale «may provide a false sense of security» (AIS).
- **Attenzione.** Molti contengono vitamina B6: la neuropatia periferica può comparire anche sotto i 50 mg/die (AIS). L’app la somma agli altri prodotti.
- **Sport.** UEFA: bere 5–7 mL/kg nelle 2–4 ore prima del calcio d’inizio.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [AIS Sports Supplement Framework, gruppo A](https://www.ausport.gov.au/ais/nutrition/supplements/group_a); [Collins et al., UEFA expert group statement, BJSM 2021](https://doi.org/10.1136/bjsports-2019-101961)

#### Carboidrati per lo sport · `carboidrati-sport`

| | |
|---|---|
| Posizione | in situazioni precise |
| Prove | forte · AIS A |
| Dose predefinita | 30 g (≈ 500 mL di bevanda sportiva in una partita (AIS)) |
| Opzioni | 30 g (≈ 500 mL di bevanda sportiva (AIS)); 60 g (30 g dopo il riscaldamento e 30 g all’intervallo (UEFA)) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | non fissato |
| Quando | durante la seduta; altrimenti cena; solo nei giorni di seduta |
| Cibo | indifferente o nessuna indicazione |

- **Prove.** AIS gruppo A: migliorano la prestazione negli sforzi oltre 45–60 minuti, anche con pause; raccomandati dall’UEFA.
- **Quando serve.** Partite e sedute di 60–90 minuti o più: 30–60 g/h per 1–2,5 ore (AIS). Sotto i 45 minuti non servono.
- **Attenzione.** Oltre circa 60 g/h di solo glucosio non c’è beneficio, perché il trasportatore SGLT1 è saturo (AIS).
- **Attenzione.** Erosione dentale con i gel: sciacquare e non lavare i denti per 30 minuti; l’intestino va allenato (AIS).
- **Attenzione.** Sono energia: l’app li conta nei valori del giorno.
- **Sport.** UEFA: 6–8 g/kg di carboidrati il giorno prima, 1–3 g/kg nel pasto 3–4 ore prima del calcio d’inizio, 30–60 g dopo il riscaldamento e di nuovo all’intervallo. Sul risciacquo della bocca le implicazioni per il calcio sono «still unclear».
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [AIS Sports Supplement Framework, gruppo A](https://www.ausport.gov.au/ais/nutrition/supplements/group_a); [Collins et al., UEFA expert group statement, BJSM 2021](https://doi.org/10.1136/bjsports-2019-101961)

#### Collagene o gelatina · `collagene`

| | |
|---|---|
| Posizione | in situazioni precise |
| Prove | limitata · AIS B |
| Dose predefinita | 20 g (minimo probabilmente ottimale (AIS)) |
| Opzioni | 10 g (collagene idrolizzato (IOC: circa 10 g/die)); 15 g (gelatina (Shaw 2017; IOC 5–15 g)); 20 g (minimo probabilmente ottimale (AIS)); 30 g (massimo della dose AIS (20–30 g/die)) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | non fissato |
| Quando | 60 min prima della seduta; altrimenti merenda (in mancanza: pranzo); ogni giorno |
| Cibo | indifferente o nessuna indicazione |

- **Prove.** AIS gruppo B; IOC: «few data», più produzione di collagene e meno dolore «seem possible», benefici funzionali sconosciuti; UEFA: «novel strategy to support tendon repair». Studi piccoli, spesso finanziati dai produttori, con esiti surrogati (PINP, sezione del tendine).
- **Quando serve.** Riabilitazione di tendini e legamenti, insieme agli esercizi, per tutta la durata della riabilitazione (AIS). Va seguito con il diario del dolore.
- **Come prenderlo.** Un’ora prima della seduta di riabilitazione o dell’allenamento; nei giorni senza seduta alla stessa ora (AIS). Il picco degli aminoacidi nel sangue è a 40–60 minuti.
- **Attenzione.** Con circa 50 mg di vitamina C (AIS: non più di 50 mg/die insieme al collagene); basta un frutto ricco di vitamina C, per esempio un kiwi (inferenza).
- **Attenzione.** Gelatina con vitamina C (Shaw 2017, 8 uomini, 3 volte al giorno per 3 giorni): PINP raddoppiato; anche il placebo aveva la vitamina C, quindi l’effetto è della gelatina.
- **Attenzione.** Tendinopatia achillea: peptidi 2 × 2,5 g/die con esercizi per il polpaccio per 3 mesi, VISA-A +12,6 contro +5,3 (Praet 2019, pilota con 20 pazienti, finanziato dal produttore).
- **Attenzione.** Epicondilite laterale: un solo RCT con un multi-ingrediente (5 g di collagene) e senza placebo, 15 pazienti per braccio (Scaturro 2025): prova molto debole. Per il dolore tibiale mediale nessun RCT trovato.
- **Sport.** Revisione 2026 su 8 RCT con 257 adulti sani allenati: sezione del tendine aumentata di più in 3 studi su 4, rigidità migliore solo con 15–30 g/die, nessun effetto sulla forza. Non riguarda la tendinopatia.
- **Antidoping (rischio basso).** La gelatina è un alimento e non richiede test sui lotti (AIS).
- **Fonti.** [AIS Sports Supplement Framework, gruppo B](https://www.ausport.gov.au/ais/nutrition/supplements/group_b); [Maughan et al., consensus IOC, BJSM 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/); [Collins et al., UEFA expert group statement, BJSM 2021](https://doi.org/10.1136/bjsports-2019-101961); [Shaw et al., Am J Clin Nutr 2017](https://doi.org/10.3945/ajcn.116.138594); [Praet et al., Nutrients 2019](https://doi.org/10.3390/nu11010076); [Revisione sistematica, J Funct Morphol Kinesiol 2026](https://doi.org/10.3390/jfmk11010130); [Scaturro et al., Front Rehabil Sci 2025](https://doi.org/10.3389/fresc.2025.1593909)

#### Citrullina · `citrullina`

| | |
|---|---|
| Posizione | di solito non serve |
| Prove | insufficiente |
| Dose predefinita | 3 g (dose minima negli studi) |
| Opzioni | 3 g (dose minima negli studi); 6 g (nessuna prova di un effetto maggiore) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | non fissato |
| Quando | 60 min prima della seduta; altrimenti pranzo; solo nei giorni di seduta |
| Cibo | indifferente o nessuna indicazione |

- **Prove.** Effetto piccolo su forza e potenza, SMD 0,20 (0,01–0,39), con gli IC di ogni singolo studio che includono l’effetto nullo (Trexler 2019, 12 studi, 198 persone, almeno 3 g almeno 30 minuti prima). L’AIS non la classifica.
- **Quando serve.** Nessuna indicazione: effetto piccolo e incerto.
- **Attenzione.** Non compare nell’elenco ministeriale 2019, che però non è esaustivo.
- **Sport.** Studi brevi in laboratorio.
- **Antidoping (rischio medio).** Spesso dentro i pre-workout.
- **Fonti.** [Trexler et al., Sports Med 2019](https://doi.org/10.1007/s40279-019-01091-z); [Ministero della Salute, Altri nutrienti e altre sostanze a effetto nutritivo o fisiologico, revisione 9/2019](https://aeaconsulenzealimentari.it/wp-content/uploads/2021/04/integratori-ad-effetto-nutritivo-e-fisiologico-aggiornamento-settembre-2019.pdf)

#### HMB · `hmb`

| | |
|---|---|
| Posizione | di solito non serve |
| Prove | insufficiente · AIS C |
| Dose predefinita | 3 g (protocollo AIS in due prese) |
| Opzioni | 1,5 g; 3 g (protocollo AIS in due prese; massimo per un integratore in Italia) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | 3 g |
| Quando | colazione; in 2 prese; ogni giorno |
| Cibo | indifferente o nessuna indicazione |

- **Prove.** AIS (dal gruppo B al C): effetto «less than leucine ingestion alone and significantly less than acute whey protein». IOC: effetti piccoli su forza e massa magra; i guadagni «steroid like» non sono stati riprodotti; benefici solo in anziani a letto per 10 giorni.
- **Quando serve.** Nessuna indicazione in chi si allena e mangia abbastanza proteine.
- **Attenzione.** Sicuro nel breve termine fino a circa 6 g/die (AIS).
- **Attenzione.** L’AIS segnala dubbi sull’integrità dei dati di uno studio di 12 settimane sulla forma acida libera.
- **Sport.** Vedi proteine del siero.
- **Antidoping (rischio medio).** Prodotti per la massa: rischio di contaminazione.
- **Fonti.** [AIS Sports Supplement Framework, gruppo C](https://www.ausport.gov.au/ais/nutrition/supplements/group_c); [Maughan et al., consensus IOC, BJSM 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/); [Ministero della Salute, Altri nutrienti e altre sostanze a effetto nutritivo o fisiologico, revisione 9/2019](https://aeaconsulenzealimentari.it/wp-content/uploads/2021/04/integratori-ad-effetto-nutritivo-e-fisiologico-aggiornamento-settembre-2019.pdf)

#### ZMA · `zma`

| | |
|---|---|
| Posizione | di solito non serve |
| Prove | insufficiente |
| Dose predefinita | 1 dose (la dose giornaliera in etichetta) |
| Opzioni | 1 dose; 2 dosi |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | non fissato |
| Quando | sera (coprifuoco); ogni giorno |
| Cibo | indifferente o nessuna indicazione |
| Da leggere in etichetta | `zinco`, `magnesio`, `vitamina-b6` |

- **Prove.** Nessun aumento del testosterone in uomini con zinco adeguato (Koehler 2009). Nessun effetto su sonno o prestazione dopo una deprivazione parziale (Nutrients 2024); in un altro studio con 69 uomini, meno sonno nel gruppo che dormiva 8 ore (Behav Sci 2024).
- **Quando serve.** Nessuna indicazione.
- **Attenzione.** Zinco e B6 delle formule commerciali possono superare gli UL: l’app li somma dall’etichetta.
- **Attenzione.** IOC: dosi alte di zinco possono ridurre la funzione immunitaria.
- **Sport.** Nessun effetto dimostrato.
- **Antidoping (rischio medio).** Prodotto da integratori per la massa: meglio un lotto certificato.
- **Fonti.** [Koehler et al., Eur J Clin Nutr 2009](https://doi.org/10.1038/sj.ejcn.1602899); [ZMA e sonno, Nutrients 2024](https://doi.org/10.3390/nu16020251); [ZMA e sonno, Behav Sci 2024](https://doi.org/10.3390/bs14070622); [Maughan et al., consensus IOC, BJSM 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/)

#### Amarena (tart cherry) · `amarena`

| | |
|---|---|
| Posizione | di solito non serve |
| Prove | insufficiente · AIS B |
| Dose predefinita | 60 mL (concentrato: 2 × 30 mL) |
| Opzioni | 60 mL (concentrato: 2 × 30 mL (AIS, IOC)); 500 mL (succo: 2 × 250 mL (IOC: 250–350 mL due volte)) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | non fissato |
| Quando | colazione; in 2 prese; per periodi |
| Cibo | indifferente o nessuna indicazione |

- **Prove.** AIS gruppo B (polifenoli della frutta). UEFA: le prove non ne sostengono l’uso specifico nel calcio. Nell’unico crossover nel calcio (10 giocatori di 19 anni) nessuna differenza su salto, RSI e indolenzimento (Abbott 2020): assenza di prove, non prova di assenza.
- **Quando serve.** Gare ravvicinate, 4–7 giorni prima e 2–4 dopo (AIS). Nel calcio nessun beneficio dimostrato.
- **Attenzione.** Effetto lassativo (AIS).
- **Attenzione.** Gli studi usano le cultivar Montmorency e Balaton: le amarene sciroppate non sono equivalenti (inferenza: zuccheri).
- **Attenzione.** Sonno: solo prove preliminari (AIS).
- **Sport.** Vedi la sintesi delle prove.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [AIS Sports Supplement Framework, gruppo B](https://www.ausport.gov.au/ais/nutrition/supplements/group_b); [Maughan et al., consensus IOC, BJSM 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/); [Collins et al., UEFA expert group statement, BJSM 2021](https://doi.org/10.1136/bjsports-2019-101961); [Abbott et al., IJSPP 2020](https://doi.org/10.1123/ijspp.2019-0221)

#### Pre-workout · `pre-workout`

| | |
|---|---|
| Posizione | sconsigliato |
| Prove | insufficiente |
| Dose predefinita | 1 dose (la dose in etichetta) |
| Opzioni | 0,5 dosi (mezza dose); 1 dose |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | non fissato |
| Quando | 30 min prima della seduta; altrimenti pranzo; solo nei giorni di seduta |
| Cibo | indifferente o nessuna indicazione |
| Da leggere in etichetta | `caffeina`, `beta-alanina`, `citrullina` |

- **Prove.** Nessuna prova per la miscela. Nei prodotti australiani esaminati dall’AIS la caffeina va da 91 a 387 mg per porzione.
- **Quando serve.** Mai: meglio una compressa di caffeina a dose nota (AIS).
- **Attenzione.** Stimolanti vietati trovati nei pre-workout (UEFA); dosi di caffeina variabili e rischio di sostanze vietate (AIS).
- **Attenzione.** Sonno: un pre-workout da 217,5 mg di caffeina va preso almeno 13,2 ore prima di andare a letto (Gardiner 2023).
- **Attenzione.** Molti ingredienti tipici sono nel gruppo D dell’AIS (DMAA, DMBA, sinefrina, higenamina).
- **Sport.** Vedi caffeina e beta-alanina.
- **Antidoping (rischio alto).** Il prodotto più a rischio insieme a «brucia grassi» e prodotti per la massa (UEFA, AIS).
- **Fonti.** [AIS Sports Supplement Framework, gruppo A](https://www.ausport.gov.au/ais/nutrition/supplements/group_a); [AIS Sports Supplement Framework, gruppo D](https://www.ausport.gov.au/ais/nutrition/supplements/group_d); [Collins et al., UEFA expert group statement, BJSM 2021](https://doi.org/10.1136/bjsports-2019-101961); [Gardiner et al., Sleep Med Rev 2023](https://doi.org/10.1016/j.smrv.2023.101764)

### Sonno

#### Melatonina · `melatonina`

| | |
|---|---|
| Posizione | in situazioni precise |
| Prove | limitata |
| Dose predefinita | 1 mg (addormentamento: 1 mg poco prima di coricarsi (claim UE)) |
| Opzioni | 0,5 mg (jet lag: almeno 0,5 mg prima di coricarsi dal primo giorno di viaggio (claim UE)); 1 mg (addormentamento; massimo per un integratore in Italia) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | 1 mg |
| Quando | sera (coprifuoco); ogni giorno |
| Cibo | indifferente o nessuna indicazione |

- **Prove.** Riduce di poco il tempo per addormentarsi: −7,06 minuti (IC 4,37–9,75) in persone con disturbi primari del sonno (Ferracioli-Oda 2013, 19 studi, 1683 persone). L’AIS non la classifica.
- **Quando serve.** Jet lag. Se si va a letto tardi per il telefono non tocca la causa (inferenza).
- **Come prenderlo.** Poco prima di coricarsi: in Ritmo insieme al coprifuoco del telefono.
- **Attenzione.** Oltre 1 mg/die in Italia non è un integratore: i medicinali UE ne contengono 2 mg; i prodotti esteri da 1,9 mg superano il limite italiano.
- **Attenzione.** UEFA: ogni intervento farmacologico sul sonno va seguito da un medico.
- **Sport.** UEFA: utile per il jet lag.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [Ferracioli-Oda et al., PLoS One 2013](https://doi.org/10.1371/journal.pone.0063773); [Ministero della Salute, Altri nutrienti e altre sostanze a effetto nutritivo o fisiologico, revisione 9/2019](https://aeaconsulenzealimentari.it/wp-content/uploads/2021/04/integratori-ad-effetto-nutritivo-e-fisiologico-aggiornamento-settembre-2019.pdf); [Quotidiano Sanità, nota del Ministero sulla melatonina (2013, fonte secondaria)](https://www.quotidianosanita.it/?p=17714); [NutraIngredients, 26/6/2013 (fonte secondaria)](https://www.nutraingredients.com/Article/2013/06/26/Italy-slashes-maximum-melatonin-levels-from-5mg-per-day-to-1mg); [Collins et al., UEFA expert group statement, BJSM 2021](https://doi.org/10.1136/bjsports-2019-101961)

#### Ashwagandha · `ashwagandha`

| | |
|---|---|
| Posizione | sconsigliato |
| Prove | limitata |
| Dose predefinita | 600 mg (estratto: dose con l’effetto maggiore negli studi) |
| Opzioni | 300 mg (estratto); 600 mg (estratto: effetto maggiore da 600 mg/die) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | non fissato |
| Quando | sera (coprifuoco); ogni giorno |
| Cibo | indifferente o nessuna indicazione |

- **Prove.** Sonno: SMD −0,59 (da −0,75 a −0,42), certezza moderata, effetto maggiore negli insonni e con almeno 600 mg/die (Cheah 2021, 5 RCT, tutti indiani, numeri dei partecipanti incoerenti tra abstract e meta-analisi). L’AIS non la classifica.
- **Quando serve.** Nessuna indicazione nell’app, per i dubbi sulla sicurezza.
- **Attenzione.** Danno epatico: casi con causalità «probable», uno finito con un trapianto (Pharmaceuticals 2023).
- **Attenzione.** Danimarca: vietata nel 2023; RIVM la sconsiglia; ANSES: da evitare con malattie di tiroide, fegato o cuore e in gravidanza. Capi delle agenzie UE (2024): dati di tossicità insufficienti per una dose sicura (fonti secondarie).
- **Attenzione.** Se compaiono segni di problemi al fegato, sospenderla e sentire il medico.
- **Interazione.** Sedativi: da evitare insieme (ANSES, fonte secondaria).
- **Sport.** Nessun dato utile in questa ricerca.
- **Antidoping (rischio medio).** Non vietata; il rischio sta nelle miscele.
- **Fonti.** [Cheah et al., PLoS One 2021](https://doi.org/10.1371/journal.pone.0257843); [Danno epatico da ashwagandha, Pharmaceuticals 2023](https://doi.org/10.3390/ph16081129); [NutritionInsight, regolatori sull’ashwagandha (2024, fonte secondaria)](https://nutritioninsight.com/news/regulatory-update-spotlight-on-international-authorities-response-to-ashwagandha-safety-concerns.html); [Nutraceuticals World, 14/5/2026 (fonte secondaria)](https://www.nutraceuticalsworld.com/ashwagandha-safety-questioned-in-europe-and-india/)

### Altro

#### Curcuma (curcumina) · `curcumina`

| | |
|---|---|
| Posizione | in situazioni precise |
| Prove | limitata · AIS B |
| Dose predefinita | 1000 mg (2 × 500 mg per 2–5 giorni) |
| Opzioni | 500 mg (una presa); 1000 mg (2 × 500 mg) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | non fissato |
| Quando | colazione; in 2 prese; per periodi |
| Cibo | indifferente o nessuna indicazione |

- **Prove.** AIS gruppo B: in una meta-analisi creatinchinasi −48,5 UI/L e indolenzimento −0,5; trasferibilità al campo non chiara; effetti sugli adattamenti all’allenamento «unknown». IOC: «more research is needed».
- **Quando serve.** Al massimo in finestre brevi, per 2–5 giorni dopo una partita molto dura, non come abitudine (inferenza dall’AIS).
- **Attenzione.** Italia: avvertenza obbligatoria in etichetta, sconsigliata con alterazioni della funzione epato-biliare o calcoli delle vie biliari; con farmaci, sentire il medico (Ministero 2019, dopo casi di epatite colestatica).
- **Attenzione.** La piperina ne aumenta la biodisponibilità fino al 2000%; con le formulazioni avanzate aumenta il rischio di doping involontario (AIS). L’AIS segnala problemi di sicurezza oltre 2 g/die.
- **Attenzione.** EFSA: dose giornaliera accettabile di 3 mg/kg per il colorante E 100 (per 70 kg circa 210 mg): le dosi dell’AIS la superano di molte volte.
- **Sport.** AIS: 500–2500 mg di curcumina o 200–1000 mg di curcuminoidi per dose, due volte al giorno per 2–5 giorni.
- **Antidoping (rischio medio).** Formulazioni avanzate: rischio di contaminazione (AIS).
- **Fonti.** [AIS Sports Supplement Framework, gruppo B](https://www.ausport.gov.au/ais/nutrition/supplements/group_b); [Maughan et al., consensus IOC, BJSM 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/); [Quotidiano Sanità, avvertenza del Ministero sulla curcuma (2019, fonte secondaria)](https://www.quotidianosanita.it/governo-e-parlamento/integratori-alla-curcuma-ed-epatite-ministero-uso-sconsigliato-a-chi-ha-problemi-a-fegato-o-vie-biliari-presto-avvertenze-su-etichette/); [EFSA 2010, rivalutazione della curcumina (E 100)](https://doi.org/10.2903/j.efsa.2010.1679)

#### Glucosammina · `glucosammina`

| | |
|---|---|
| Posizione | di solito non serve |
| Prove | insufficiente |
| Dose predefinita | 500 mg (massimo per un integratore in Italia) |
| Opzioni | 500 mg (massimo per un integratore in Italia); 1500 mg (dose dei trial: in Italia è un farmaco con ricetta) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | 500 mg |
| Quando | colazione; ogni giorno |
| Cibo | indifferente o nessuna indicazione |

- **Prove.** Artrosi: negli 8 studi con randomizzazione ben nascosta nessun beneficio su dolore e funzione (Cochrane 2005); il beneficio compare solo con la preparazione Rotta. L’AIS non la classifica.
- **Quando serve.** Nessun razionale per tendini, tibia o gomito (inferenza).
- **Attenzione.** La dose degli integratori italiani è un terzo di quella dei trial.
- **Sport.** Gli studi riguardano l’artrosi, non gli sportivi giovani.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [Towheed et al., Cochrane 2005 (glucosammina)](https://doi.org/10.1002/14651858.CD002946.pub2); [Ministero della Salute, Altri nutrienti e altre sostanze a effetto nutritivo o fisiologico, revisione 9/2019](https://aeaconsulenzealimentari.it/wp-content/uploads/2021/04/integratori-ad-effetto-nutritivo-e-fisiologico-aggiornamento-settembre-2019.pdf)

#### Probiotici (fermenti lattici) · `probiotici`

| | |
|---|---|
| Posizione | in situazioni precise |
| Prove | limitata · AIS B |
| Dose predefinita | 10 miliardi UFC (10 miliardi (IOC e UEFA)) |
| Opzioni | 1 miliardo UFC (1 miliardo); 10 miliardi UFC (10 miliardi (IOC e UEFA)); 40 miliardi UFC (con antibiotici: 5–40 miliardi di L. rhamnosus o S. boulardii (AIS)) |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | non fissato |
| Quando | colazione; per periodi |
| Cibo | indifferente o nessuna indicazione |

- **Prove.** Cochrane 2022 (23 RCT, 6950 persone di tutte le età, non atleti): almeno un’infezione delle alte vie respiratorie RR 0,76 (certezza bassa), durata −1,22 giorni (bassa), uso di antibiotici RR 0,58 (moderata), eventi avversi RR 1,02. Negli atleti l’AIS non trova prove di meno infezioni confermate: i benefici sono sui sintomi riferiti.
- **Quando serve.** Viaggi o periodi con infezioni ricorrenti, iniziando circa 14 giorni prima; antibiotici. Yogurt e kefir sono il primo passo (AIS).
- **Attenzione.** Gli effetti dipendono dal ceppo: conta il ceppo in etichetta, non il genere.
- **Attenzione.** Da evitare con disturbi gastrointestinali ricorrenti (AIS); nessun beneficio sostanziale sui marcatori intestinali da esercizio.
- **Attenzione.** Dal 2020 diversi Lactobacillus hanno nomi nuovi (es. Lacticaseibacillus rhamnosus): l’app riconosce entrambi.
- **Sport.** AIS: dosi studiate da 10⁸ a 10¹⁰ UFC/die per 1–16 settimane.
- **Antidoping (rischio basso).** Ingrediente singolo. Come per ogni integratore, meglio un prodotto con lotto certificato (IOC 2018: contaminazioni anche nei prodotti vitaminici).
- **Fonti.** [AIS Sports Supplement Framework, gruppo B](https://www.ausport.gov.au/ais/nutrition/supplements/group_b); [Cochrane 2022 (probiotici e infezioni respiratorie)](https://doi.org/10.1002/14651858.CD006895.pub4); [Maughan et al., consensus IOC, BJSM 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/); [Collins et al., UEFA expert group statement, BJSM 2021](https://doi.org/10.1136/bjsports-2019-101961)

#### Booster, brucia grassi e sostanze a rischio doping · `gruppo-d-ais`

| | |
|---|---|
| Posizione | sconsigliato |
| Prove | sfavorevole · AIS D |
| Dose predefinita | 1 dose (la dose in etichetta) |
| Opzioni | 1 dose; 2 dosi |
| Limite superiore | nessuno |
| Massimo per prodotto in Italia | non fissato |
| Quando | colazione; ogni giorno |
| Cibo | indifferente o nessuna indicazione |

- **Prove.** AIS gruppo D: vietati o ad alto rischio di contaminazione con sostanze che portano a un controllo positivo. Tribulus, maca e sinefrina non sono nella lista WADA ma compaiono spesso in prodotti multi-ingrediente con ingredienti vietati.
- **Quando serve.** Mai.
- **Attenzione.** Circa il 15% di 634 prodotti di 215 fornitori in 13 paesi conteneva proormoni non dichiarati; bastano quantità minime per un controllo positivo (IOC, UEFA).
- **Attenzione.** L’ecdisterone è nel programma di monitoraggio WADA dal 2026.
- **Sport.** Nessun beneficio dimostrato che giustifichi il rischio.
- **Antidoping (rischio alto).** Controlli anche nello sport amatoriale: il 24,1% dei controlli ministeriali del 2023 era su eventi degli Enti di Promozione Sportiva, e il 56,9% degli atleti controllati dichiarava di usare integratori.
- **Fonti.** [AIS Sports Supplement Framework, gruppo D](https://www.ausport.gov.au/ais/nutrition/supplements/group_d); [Maughan et al., consensus IOC, BJSM 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/); [Collins et al., UEFA expert group statement, BJSM 2021](https://doi.org/10.1136/bjsports-2019-101961); [WADA, programma di monitoraggio 2026 (traduzione ufficiale ABCD)](https://www.gov.br/abcd/pt-br/composicao/atletas/substancias-e-metodos-proibidos/2026ProgramadeMonitoramento.pdf); [Relazione al Parlamento sulla legge 376/2000, anno 2023](https://www.camera.it/temiap/2025/01/20/OCD177-7806.pdf); [Informed Sport, FAQ](https://sport.wetestyoutrust.com/about/frequently-asked-questions)
