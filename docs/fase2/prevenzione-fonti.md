# Prevenzione oncologica in Ritmo

Sintesi delle ricerche sulla prevenzione, 2 novembre 2026. Basi:
- due ricerche e due verifiche avversarie sulle fonti primarie;
- lettura di `docs/SPEC.md`, `src/data/{menu,recipes,foods,barPlanB,tips}.ts` e `src/engine/{nutrition,targets,coachContext}.ts`;
- un audit numerico del menù di due settimane, fatto con uno script di lavoro.

Dove la verifica ha corretto una ricerca, vale la correzione. Le inferenze sono marcate **[inferenza]**. Le stime fatte con numeri che l'app non contiene (sale, zuccheri liberi, arsenico) sono marcate **[stima]**.

Nel testo «la patch» indica le modifiche applicate nel commit «Ritmo: prevenzione oncologica nel menù» (6 file, 610 test verdi al momento dell'applicazione). I numeri «oggi» descrivono il menù prima di quel commit.

---

## 1. Evidenze

### Come leggere la tabella
- **WCRF:** convincing e probable insieme fanno l'evidenza "strong", l'unica su cui il WCRF basa le raccomandazioni. Limited-suggestive non basta per una raccomandazione.
- **IARC:** il gruppo misura quanto sono solide le prove, non quanto è grande il rischio.
- **Tipo di studio:** quasi tutto quello che riguarda gli alimenti viene da studi osservazionali. Gli RCT esistono quasi solo per gli integratori.

### Alimenti, bevande e stile di vita

| Fattore | Direzione | Grado (dopo la verifica) | Dose o soglia | Fonte | URL |
|---|---|---|---|---|---|
| Carne lavorata (salumi, affettati, würstel, salsiccia, carne in scatola, preparati e sughi di carne) | Aumenta il colon-retto | WCRF convincing; IARC gruppo 1 (sufficient) | +16% ogni 50 g/die, RR 1,16 (1,08-1,26); IARC circa +18%. Nessuna dose sicura | WCRF CUP colon-retto 2017; IARC Q&A vol. 114 | https://www.wcrf.org/sites/default/files/Colorectal-cancer-report.pdf |
| Carne rossa (tutta la carne muscolare di mammifero: manzo, vitello, maiale, agnello, montone, cavallo, capra) | Aumenta il colon-retto | WCRF probable (era convincing nel CUP 2011); IARC 2A (limited nell'uomo, strong sul meccanismo) | RR 1,12 (1,00-1,25) ogni 100 g/die, **non significativo**. Tetto WCRF: circa 3 porzioni, cioè **350-500 g cotti a settimana** (500 g cotti sono circa 700-750 g crudi) | WCRF Recommendations 2018, pp. 29-31; CUP 2017 | https://www.wcrf.org/wp-content/uploads/2021/01/Recommendations.pdf |
| Pollame e pesce | Nessun danno noto; il pesce forse protegge il colon-retto | WCRF: "no direct evidence" di danno; pesce limited-suggestive come protezione. L'IARC non li ha valutati | Nessun tetto oncologico. CREA: carne bianca 1-3 porzioni da 100 g a settimana, pesce 2-3 da 150 g | WCRF, miti (2021); CREA 2018 | https://www.wcrf.org/about-us/news-and-blogs/5-diet-and-cancer-myths-debunked/ |
| Cottura ad alta temperatura, griglia e brace | Ipotesi di aumento | IARC: "not enough data" per concludere. WCRF, stomaco: griglia e barbecue limited-suggestive (tutti studi giapponesi). Meccanismo: ammine eterocicliche (HCA) e IPA | HCA sopra i 150 °C e con cotture lunghe. In laboratorio le marinature tolgono il 57-88% delle HCA; 1-3 minuti di microonde prima le riducono di 3-9 volte | IARC Q&A 114; WCRF CUP stomaco 2016; NCI 2017; Smith 2008; Felton 1994 | https://www.cancer.gov/about-cancer/causes-prevention/risk/diet/cooked-meats-fact-sheet |
| Alcol | Aumenta bocca, faringe, laringe, esofago squamoso, fegato, colon-retto, seno in postmenopausa | IARC gruppo 1; WCRF convincing (probable per stomaco oltre 45 g e seno in premenopausa); OMS: "No level... is safe" | Nessuna soglia. Colon-retto +7% ogni 10 g/die (RR 1,07; 1,05-1,08). Già 1 bicchiere al giorno: esofago squamoso RR 1,30. Smettere o ridurre abbassa il rischio (IARC Handbook 20A: sufficient per bocca ed esofago) | WCRF 2018; OMS Europa 2023, paragrafo corretto il 17/9/2026; Bagnardi 2013; IARC HB 20A | https://www.who.int/europe/news/item/04-01-2023-no-level-of-alcohol-consumption-is-safe-for-our-health |
| Grasso corporeo | Aumenta 7 sedi (esofago adenocarcinoma, pancreas, fegato, colon-retto, seno in postmenopausa, rene, endometrio) | WCRF convincing | BMI il più basso possibile tra 18,5 e 24,9; non aumentare peso e vita da adulti; vita sotto 94 cm (OMS, uomini europei) | WCRF 2018 | https://www.wcrf.org/wp-content/uploads/2021/01/Recommendations.pdf |
| Attività fisica | Riduce il colon | WCRF convincing (retto: nessuna conclusione) | OMS: 150-300 min moderati o 75-150 vigorosi a settimana, più la forza | WCRF 2018; Bull, BJSM 2020 | https://pubmed.ncbi.nlm.nih.gov/33239350/ |
| Cereali integrali | Riducono il colon-retto | WCRF probable | RR 0,83 (0,78-0,89) ogni 90 g/die (circa 2 fette di pane e una ciotola di cereali). Beneficio sulla mortalità fino a 210-225 g/die | CUP 2017; Aune, BMJ 2016 | https://pubmed.ncbi.nlm.nih.gov/27301975/ |
| Fibra alimentare | Riduce il colon-retto | WCRF probable, giudizio sull'insieme delle prove. La metanalisi dose-risposta **non è significativa**: RR 0,93 (0,87-1,00) ogni 10 g, I² 72%. Reynolds 2019: certezza GRADE moderata | **Almeno 30 g/die da alimenti** (WCRF); OMS almeno 25 g. Massimo beneficio a 25-29 g, forse oltre | WCRF 2018; Reynolds, Lancet 2019 | https://pubmed.ncbi.nlm.nih.gov/30638909/ |
| Verdura non amidacea e frutta | Riducono diversi tumori aerodigestivi | WCRF probable nel complesso (prove per singola sede limitate); colon-retto limited-suggestive, con rischio più alto sotto 100 g/die | **Almeno 400 g/die**, patate escluse (le porzioni da 80 g sono una convenzione OMS e NHS, non del WCRF) | WCRF 2018; OMS | https://www.wcrf.org/research-policy/evidence-for-our-recommendations/wholegrains-veg-fruit-beans/ |
| Legumi | Neutri o benefici (attraverso fibre e pattern) | WCRF limited – no conclusion; fanno parte della raccomandazione sui cibi vegetali | CREA: 2-4 porzioni a settimana da 150 g freschi, surgelati, ammollati o in scatola, oppure 50 g secchi. Nessun tetto | CREA 2018 | https://www.crea.gov.it/documents/59764/0/LINEE-GUIDA+DEFINITIVO.pdf |
| Latticini e calcio, colon-retto | Riducono | WCRF probable (anche per gli integratori di calcio sopra i 200 mg). L'RCT di Baron 2015 con 1.200 mg/die è nullo sugli adenomi | Latticini RR 0,87 ogni 400 g/die; calcio alimentare RR 0,94 ogni 200 mg | CUP 2017; Papier 2025 | https://ora.ox.ac.uk/objects/uuid:f70e5a61-03d2-4d96-b572-f29b9fa5704c |
| Latticini e calcio, prostata | Possibile aumento | WCRF limited-suggestive. Per i latticini **nessuno strato è significativo**; il calcio alimentare lo è solo per i tumori non avanzati | Latticini RR 1,07 ogni 400 g/die; calcio RR 1,05 ogni 400 mg. Né il WCRF né il Codice europeo (ECAC5) danno raccomandazioni | CUP prostata 2014 | https://www.wcrf.org/wp-content/uploads/2021/02/prostate-cancer-report.pdf |
| Frutta a guscio | Possibile riduzione | Osservazionale; il WCRF non dà giudizi | Cancro totale RR 0,85 (0,76-0,94) ogni 28 g/die (8 studi, I² 42%) | Aune, BMC Med 2016 | https://pubmed.ncbi.nlm.nih.gov/27916000/ |
| Caffè | Riduce fegato ed endometrio; non cancerogeno | WCRF probable (protezione); IARC gruppo 3 dal 2016 | Caffeina fino a 400 mg/die (EFSA): circa 4 tazze di caffè filtro, cioè **circa 5 espressi** | WCRF 2018; IARC comunicato 244 | https://www.iarc.who.int/wp-content/uploads/2018/07/pr244_E.pdf |
| Bevande molto calde | Aumentano l'esofago | IARC 2A (limited) | Sopra i 65 °C. Golestan, tè a 60 °C o più: HR 1,41 (1,10-1,81); bere meno di 2 minuti dopo averlo versato: HR 1,51 (1,01-2,26) | IARC vol. 116; Islami 2020 | https://pubmed.ncbi.nlm.nih.gov/30891750/ |
| Cibi conservati sotto sale | Aumentano lo stomaco | WCRF probable, con verdure in salamoia e pesce salato come si preparano in Asia orientale. **Il sale totale è limited – no conclusion** | OMS: meno di 5 g di sale al giorno, soprattutto per la pressione | WCRF CUP stomaco 2016; OMS 2026 | https://www.who.int/news-room/fact-sheets/detail/salt-reduction |
| Zuccheri liberi e bevande zuccherate | Aumento indiretto, attraverso il peso | OMS: <10% delle kcal (strong), <5% (conditional), per peso e carie, non per il cancro. WCRF: non bere bevande zuccherate (evidenza strong sul peso) | Zuccheri liberi: aggiunti, miele, sciroppi, **succhi e spremute** | OMS 2015; WCRF 2018 | https://www.who.int/news/item/04-03-2015-who-calls-on-countries-to-reduce-sugars-intake-among-adults-and-children |
| Aspartame e dolcificanti | Possibile aumento (fegato) | IARC 2B; la dose accettabile di 40 mg/kg resta. OMS 2023: raccomandazione condizionale a non usare dolcificanti per il peso | Oltre 9-14 lattine al giorno per 70 kg | IARC/JECFA 2023; OMS 2023 | https://www.iarc.who.int/wp-content/uploads/2023/07/Aspartame_PR.pdf |
| Ultra-trasformati | Associazioni deboli | Solo studi osservazionali. Lane 2024: nessun tumore in classe I o II; cancro totale HR 1,12 in classe III, GRADE molto bassa. ECAC5: "limit", dentro la raccomandazione sul peso | Circa +10-13% ogni +10% della dieta | Lane, BMJ 2024; ECAC5 | https://pmc.ncbi.nlm.nih.gov/articles/PMC10899807/ |
| Arsenico inorganico (soprattutto dal riso) | Aumenta pelle, vescica, polmone | IARC gruppo 1. EFSA 2024: MOE bassi, "health concern" | Punto di riferimento 0,06 µg/kg/die. Adulti UE: MOE da 2 a 0,4 in media. Limiti UE: riso bianco 0,15 mg/kg; parboiled e integrale 0,25; gallette e riso soffiato 0,30 | EFSA Journal 2024;22(1):8488; Reg. UE 2023/915 | https://pmc.ncbi.nlm.nih.gov/articles/PMC10794945/ |
| Cottura del riso | Riduce l'arsenico | Studi di laboratorio | Acqua 6:1 poi scolata: −45% (basmati); assorbimento: 0%. PBA (5 minuti in acqua bollente, scolare, acqua nuova fino ad assorbimento): −73% sul bianco, −54% sull'integrale. Lavaggio: circa −10% | Raab 2009; Gray 2016; Menon 2021 | https://pubmed.ncbi.nlm.nih.gov/33153748/ |
| Acrilammide | Possibile aumento | IARC 2A (1994: inadequate nell'uomo, sufficient negli animali); EFSA 2015: concern su base animale | Riferimenti UE (non limiti di legge): pane morbido 50 µg/kg, patate fritte 500, caffè tostato 400. Il consiglio: dorato, non bruno | EFSA 2015; Reg. UE 2017/2158; UK FSA | https://www.efsa.europa.eu/en/topics/topic/acrylamide |
| Aflatossine | Aumentano il fegato | IARC gruppo 1; WCRF convincing; EFSA 2020: health concern | A rischio cereali, spezie, arachidi, pistacchi, noci del Brasile, peperoncino, pepe, **frutta essiccata** e fichi. La cottura domestica non le elimina; la tostatura le riduce in media del 47%, che non basta | WCRF 2018; EFSA 2020; Emadi 2022 | https://pubmed.ncbi.nlm.nih.gov/33543987/ |
| Nitriti, nitrati, nitrosammine | Le nitrosammine aumentano il rischio, soprattutto quelle della carne lavorata | EFSA 2023: health concern per le nitrosammine (la carne è il primo contributore). EFSA 2017 sui nitriti: "some evidence" per stomaco e colon-retto, "evidence" per l'NDMA preformata. IARC vol. 94: nitrito o nitrato ingeriti in condizioni di nitrosazione endogena, 2A | Verdure ricche di nitrati: i benefici superano i rischi (EFSA 2008), da non limitare | EFSA 2023;21(3):7884; EFSA 2017 | https://www.efsa.europa.eu/en/efsajournal/pub/7884 |
| Sole | Aumenta la pelle | ECAC5 | "Avoid too much sun exposure... Use sun protection. Never use sunbeds" | ECAC5 | https://cancer-code-europe.iarc.who.int/wp-content/uploads/2025/10/European-Code-Against-Cancer-5th-edition.pdf |
| Pattern WCRF nel suo insieme | Riduce colon-retto e seno in postmenopausa | CUP Global 2025: strong, 170 studi | Il beneficio maggiore si ha seguendo **insieme** la maggior parte delle raccomandazioni | WCRF CUP Global 2025 | https://www.wcrf.org/research-policy/global-cancer-update-programme/dietary-and-lifestyle-patterns/ |
| Dieta mediterranea | Possibile riduzione | WCRF: inadequate information. Morze 2021: certezza moderata solo per mortalità per cancro (RR 0,87) e colon-retto (RR 0,83) | Adesione massima contro minima | Morze, Eur J Nutr 2021 | https://pubmed.ncbi.nlm.nih.gov/32770356/ |

### Integratori (quasi tutti RCT)

| Integratore | Effetto sul cancro | Grado | Dose dei trial | Fonte | URL |
|---|---|---|---|---|---|
| In generale | Non raccomandati per la prevenzione | WCRF 2018 ("High-dose dietary supplements are not recommended for cancer prevention"); ECAC5 li esclude; USPSTF 2022: I statement per multivitaminici e singoli nutrienti | Ammessi per carenze o su indicazione di un professionista | WCRF p. 35; USPSTF 2022 | https://pubmed.ncbi.nlm.nih.gov/35727271/ |
| Beta-carotene | **Aumenta** il polmone nei fumatori | RCT; WCRF convincing nei fumatori; USPSTF D (contro) | ATBC 20 mg: +18%; CARET 30 mg più retinolo: RR 1,28 (1,04-1,57) | NEJM 1994, 1996 | https://pubmed.ncbi.nlm.nih.gov/8127329/ |
| Vitamina E | **Aumenta** la prostata | RCT SELECT (uomini dai 55 anni, dai 50 se afroamericani); USPSTF D | 400 UI/die: HR 1,17 (IC 99% 1,004-1,36), +1,6 casi ogni 1.000 anni-persona | Klein, JAMA 2011 | https://pubmed.ncbi.nlm.nih.gov/21990298/ |
| Selenio | Nessun effetto | RCT SELECT | 200 µg/die: prostata HR 1,09 (IC 99% 0,93-1,27) | Klein 2011 | https://pubmed.ncbi.nlm.nih.gov/21990298/ |
| Vitamina D | Nessun effetto sull'incidenza; forse meno mortalità | RCT VITAL nullo; metanalisi di RCT sulla mortalità; tumori avanzati solo in un'analisi post hoc | 2.000 UI: incidenza HR 0,96 (0,88-1,06). Mortalità RR 0,87 (0,79-0,96) con dose giornaliera. Tumori avanzati HR 0,83 (0,69-0,99), con effetto solo sotto BMI 25 (HR 0,62) | Manson 2019; Keum 2019; Chandler 2020 | https://pubmed.ncbi.nlm.nih.gov/30415629/ |
| Omega-3 | Nessun effetto | RCT VITAL; ipotesi osservazionale sulla prostata (omega-3 nel plasma, non integratori) | 1 g/die: HR 1,03 (0,93-1,13) | Manson 2019; Brasky 2013 | https://pubmed.ncbi.nlm.nih.gov/30415637/ |
| Vitamina C | Nessun effetto | RCT PHS II | 500 mg/die: HR 1,01 (0,92-1,10) | Gaziano, JAMA 2009 | https://pubmed.ncbi.nlm.nih.gov/19066368/ |
| Multivitaminico | Incerto | Un RCT al limite (PHS II, medici anziani, HR 0,92; 0,86-0,998) e uno nullo (COSMOS, HR 0,97; 0,86-1,09) | Dose standard | Gaziano 2012; Sesso 2022 | https://pubmed.ncbi.nlm.nih.gov/35294969/ |
| Acido folico ad alte dosi | Possibile aumento | RCT con segnali di danno; metanalisi non significativa | 1 mg: lesioni avanzate RR 1,67 (1,00-2,80). 0,8 mg più B12: cancro HR 1,21, mortalità per cancro HR 1,38. Vollset: RR 1,06 (0,99-1,13) | Cole 2007; Ebbing 2009; Vollset 2013 | https://pubmed.ncbi.nlm.nih.gov/19920236/ |
| B12 e B6 ad alte dosi | Possibile aumento del polmone negli uomini | Una sola coorte osservazionale: è un'ipotesi | B12 sopra 55 µg/die: HR 1,98 (1,32-2,97); B6 sopra 20 mg: HR 1,82. **Limite massimo EFSA per la B6: 12 mg/die** (per neuropatia, non per il cancro) | Brasky, JCO 2017; EFSA 2023 | https://pmc.ncbi.nlm.nih.gov/articles/PMC10189633/ |
| Creatina | Non valutata | Nessuna classificazione nelle fonti consultate (WCRF, IARC, ECAC5) | Non applicabile | Non applicabile | Non applicabile |

### Ordini di grandezza (IARC, Q&A 114, stime Global Burden of Disease)
Morti per cancro attribuite ogni anno nel mondo:
- tabacco: circa 1 milione;
- alcol: circa 600.000;
- carne lavorata: circa 34.000;
- carne rossa: circa 50.000, se l'associazione fosse causale.

Per un uomo giovane e attivo l'ordine delle leve è questo: alcol, peso e vita, attività, carne lavorata, fibre e vegetali, carne rossa. Contaminanti e cotture sono precauzioni.

### Incertezze sulle evidenze
- **Natura delle prove:** quasi tutti i giudizi sugli alimenti, convincing e probable compresi, vengono da coorti. Confondimento residuo e stime dell'esposizione imprecise sono la regola.
- **Carne rossa:** la metanalisi CUP 2017 non è significativa (RR 1,12; 1,00-1,25). Il giudizio è sceso da convincing (2011) a probable (2017), un dato preso da fonti secondarie. Il CREA (100 g crudi una volta a settimana, "orientativa", "possibile frequenza inferiore") è più prudente del WCRF, ma pensa alla salute in generale, non solo al cancro.
- **Coniglio:** il CREA lo conta come carne bianca. La definizione IARC ("all mammalian muscle meat") lo comprenderebbe. Gli studi riguardano quasi solo manzo e maiale. **[inferenza]** Ritmo lo tratta come bianca e lo segnala come zona grigia.
- **Fibre e colon-retto:** la dose-risposta CUP non è significativa; il probable si regge sull'insieme delle prove.
- **Latticini:** le prove vanno in direzioni opposte per colon-retto e prostata. Né il WCRF né l'ECAC5 danno indicazioni.
- **Cotture:** HCA, IPA, acrilammide e nitrosammine della carne fresca cotta hanno un meccanismo chiaro, ma nessun esito dimostrato nell'uomo. Le riduzioni con marinature e microonde sono misure di laboratorio.
- **Arsenico:** il punto di riferimento EFSA viene da popolazioni con acqua contaminata. L'incertezza dichiarata è ampia (probabilità tra 0,17 e 0,86 che l'esposizione media superi le BMD).
- **Le mie stime di esposizione al riso:** usano la media AGES di 0,089 mg/kg, che comprende anche i prodotti di riso. Il basmati di solito ha meno arsenico (Šlejkovec 2021), quindi sono un tetto, non una misura.
- **Vitamina D:** l'effetto sulla mortalità e sui tumori avanzati è un'ipotesi (metanalisi e analisi post hoc).
- **Supplementi B e omega-3:** i segnali per B12 e B6 (polmone) e per gli omega-3 nel plasma (prostata) sono osservazionali.
- **Ultra-trasformati:** la categoria NOVA è eterogenea e contiene già carne lavorata e bevande zuccherate. La certezza è bassa o molto bassa.
- **Temi non approfonditi nelle ricerche:** mercurio nel pesce, PFAS (EFSA 2020: dose tollerabile di 4,4 ng/kg a settimana superata da parte della popolazione; il pesce è il primo contributore; PFOA è in gruppo 1 IARC), ocratossina A (EFSA 2020: "possible health concern"). Sono segnalati, non tradotti in regole: per ora la risposta è la varietà del pesce e dei cereali.

---

## 2. La carne

### Cosa dicono le evidenze
1. **Il problema vero è la carne lavorata:** WCRF convincing, IARC gruppo 1, +16-18% di colon-retto ogni 50 g al giorno, nessuna dose sicura. In Italia la categoria comprende anche cose che molti credono "magre" o "fresche":
   - la bresaola;
   - la fesa di tacchino o di pollo arrosto a fette in vaschetta;
   - i würstel di pollo;
   - la salsiccia, anche fresca;
   - la carne in scatola;
   - i ragù pronti di carne (l'IARC comprende "meat-based preparations and sauces").
   Il pollo arrosto intero di rosticceria, invece, è carne cotta, non lavorata.
2. **La carne rossa fresca è un rischio più debole e dipende dalla dose.** Il WCRF non chiede di toglierla: "no more than moderate amounts", fino a circa 3 porzioni, cioè 350-500 g cotti a settimana. Il maiale fresco conta come rossa.
3. **Pollo, tacchino, pesce e uova non hanno un tetto oncologico.** Il WCRF scrive "no direct evidence" di danno. Non vuol dire che proteggano: solo il pesce ha un limited-suggestive come protezione dal colon-retto.
4. **Cotture:** l'IARC non ha dati sufficienti per dire che il modo di cuocere cambi il rischio. Griglia e barbecue sono limited-suggestive per lo stomaco, con studi solo giapponesi. Le precauzioni costano niente e sono plausibili, ma vanno presentate come precauzioni.

### Dove sta Ritmo oggi (audit, rotazione di 14 giorni)

| | Oggi | Riferimento |
|---|---|---|
| Carne lavorata | 0 nel menù, nel piano B e nei consigli | 0 (WCRF, ECAC5 "avoid") |
| Carne rossa | 1 porzione a settimana: gli straccetti del sabato, 110 g cotti, pari a circa 143 g crudi con il fattore dell'app (×1,3) o 154-165 g con quello del WCRF (×1,4-1,5) | Il 22-31% del tetto WCRF (350-500 g cotti). Il 40-65% in più della porzione CREA da 100 g crudi, che però è "orientativa" e non oncologica |
| Pollame | 495 g cotti a settimana (4-5 pasti); 440 g con la patch | Nessun tetto oncologico; il CREA indica 1-3 porzioni per la varietà |
| Pesce | 310-360 g a settimana (3 pasti; pesce grasso, il salmone, solo nella settimana 1) | CREA 2-3 da 150 g |
| Uova | 4-5 a settimana | Nessun tetto |

### La proposta per chi vuole continuare a mangiare carne fresca
1. **Carne lavorata: zero nel piano**, con l'elenco italiano esplicito nel coach e nel piano B (vedi §3). Fuori casa, se capita, si conta nella revisione senza colpe.
2. **Carne rossa fresca: una porzione a settimana nel menù**, un palmo, circa 110 g cotti (al massimo 150 g cotti), da girare tra manzo, vitello, maiale (lonza, filetto) e agnello. **Tetto complessivo: circa 350 g cotti a settimana con i pasti fuori**, cioè il limite basso del WCRF e circa 3 porzioni. Il menù ne usa un terzo di proposito: il pranzo della domenica in famiglia, la pizzeria o il ristorante ne aggiungono, e il tetto WCRF vale per tutto quello che si mangia. **[inferenza]**
3. **Carne bianca e pesce come base:** pollo e tacchino 3-4 volte, pesce 2-3 (uno grasso), uova 2-3 pasti, legumi almeno 4 pasti. Le proteine (1,9 g/kg) si raggiungono già oggi senza salire con la rossa.
4. **Tagli magri per la rossa** (fesa, girello, filetto, lonza). Il motivo sono i grassi saturi e la salute cardiovascolare, non il cancro.
5. **Cotture della carne, come precauzione:**
   - padella ben calda per poco tempo con fettine e straccetti (2 minuti, senza annerire), poi forno a 180-200 °C, umido, bollito o vapore per i pezzi grandi;
   - alla griglia o alla brace: marinatura (olio, limone, rosmarino, aglio; birra scura per il maiale), carne girata spesso, niente fiamma diretta né grasso che gocciola sulla brace, 1-3 minuti di microonde prima per i pezzi spessi, parti annerite tolte, sugo dei succhi bruciati non usato.

   Fonti: NCI 2017; Smith 2008; Viegas 2014; Felton 1994. L'IARC ha dati insufficienti, quindi sono precauzioni.
6. **Cosa non dire:** che il pollo "protegge", che la carne alla griglia "è cancerogena", che una bistecca equivale a una sigaretta (vedi §6).

---

## 3. Regole per Ritmo

### Principio di base, non obiettivo selezionabile
**Proposta: la prevenzione vale sempre, come principio di base del piano. Non è un obiettivo da scegliere accanto a ricomposizione, dimagrimento o massa.** I motivi:
1. **Le regole forti costano niente.** Non toccano né il rendimento né i gusti dichiarati: niente carne lavorata, niente alcol, carne rossa moderata, fibre, vegetali, integrali. Coincidono con le linee guida generali (CREA 2018, OMS), quindi non sono una "dieta speciale".
2. **Sono indipendenti dall'obiettivo.** Gli obiettivi di Ritmo decidono l'energia e le macro. La prevenzione decide la qualità e la scelta degli alimenti. Si sommano, non si escludono.
3. **Un interruttore direbbe una cosa falsa.** Dire "spegni la prevenzione" significherebbe che senza di essa vanno bene salumi e alcol. Nessuna versione del piano deve proporli.
4. **Conta il pattern.** Il WCRF CUP Global 2025 trova il beneficio quando si seguono insieme quasi tutte le raccomandazioni: è un modo di mangiare, non una modalità.
5. **Meno scelte, meno attrito.** Per chi ha come punti deboli motivazione e cibo, ogni impostazione in più è un attrito.

Il livello di prova decide **come** si applica una regola:
- prove forti (WCRF strong, IARC gruppo 1): **vincoli** del menù;
- prove limitate o solo meccanismo (cotture, bevande calde, aflatossine): **consigli e coach**, mai vincoli;
- preferenze personali: si scelgono solo dentro i tetti, per esempio "carne rossa nel menù: 0 o 1 porzione" o "riso: 2 o 3 volte".

### A. Vincoli rigidi del menù (rotazione, settimana di avvio, generatore)

| N. | Regola | Numero | Fonte | Stato oggi |
|---|---|---|---|---|
| A1 | Niente carni lavorate in nessuna ricetta | 0 | IARC gruppo 1; WCRF convincing; ECAC5 "avoid" | Rispettata; con la patch c'è anche un test |
| A2 | Niente alcol tra gli ingredienti e nelle proposte | 0 | WCRF "best not to drink"; ECAC5 "avoid"; OMS | Rispettata |
| A3 | Niente gallette, riso soffiato né altri prodotti di riso | 0 | Limite UE 0,30 mg/kg contro 0,15 del riso bianco; Livsmedelsverket; AGES | Rispettata. L'alimento `gallette-riso` resta nel catalogo, inutilizzato |
| A4 | Carne rossa nel menù | Al massimo 1 porzione e **150 g cotti a settimana** (oggi 110 g) | WCRF 350-500 g cotti per tutto ciò che si mangia [inferenza: un terzo al menù] | Rispettata; il test oggi conta solo le porzioni |
| A5 | Riso | **Al massimo 3 pasti a settimana**, sempre **lessato in almeno 6 parti d'acqua e scolato** (oppure PBA). Mai riso integrale per alzare gli integrali | EFSA 2024 (MOE); Raab 2009 (−45%); Menon 2021 (PBA −73%); limite UE integrale 0,25 | **Non rispettata**: 4 pasti, 506-518 g crudi a settimana; due passaggi senza scolare |
| A6 | Verdura non amidacea e frutta | Almeno **400 g/die**, cioè almeno 5 porzioni da 80 g, patate escluse | WCRF; OMS | Rispettata (520-870 g) |
| A7 | Fibre (rotazione) | Almeno **30 g/die** (oggi il test ne chiede 28); il tetto di 40-45 g resta per la pancia | WCRF; Reynolds 2019 | Rispettata (33-45 g) |
| A8 | Legumi | Almeno 4 pasti a settimana, al massimo una porzione al giorno | CREA 2-4 a settimana, senza tetto | Rispettata |
| A9 | Cereali integrali (rotazione) | In media almeno **90 g/die** (pane e fiocchi come si comprano, pasta, riso e cous cous in equivalente secco; farro e orzo perlati non contano) | WCRF CUP: RR 0,83 ogni 90 g | Rispettata (media 115-123 g, minimo 75 g) |
| A10 | Settimana di avvio | A7 e A9 non valgono: fibre 22-32 g e pane comune, per salire per gradi | Scelta clinica dell'app, coerente con "aumentare gradualmente" | Rispettata |

### B. Tetti settimanali, pasti fuori compresi (revisione e coach)

| N. | Regola | Numero | Fonte |
|---|---|---|---|
| B1 | Carne rossa in tutto | Circa **350 g cotti** (3 porzioni); mai oltre 500 g | WCRF |
| B2 | Carne lavorata | 0. Se capita, si conta: il WCRF dice "very little, if any" | WCRF; IARC |
| B3 | Alcol | Consiglio: 0. Se c'è, ogni unità in meno conta e **mai 5 o più unità nella stessa sera** (un'unità sono 12 g di etanolo: una birra da 330 ml, un calice da 125 ml) | WCRF; OMS; ISS PASSI (binge: 5 unità o più); IARC HB 20A |
| B4 | Zuccheri liberi | In tutto meno del 10% delle kcal; dal menù meno del 5%, così i 3 dolci programmati ci stanno | OMS 2015 |
| B5 | Bevande zuccherate | 0; spremute e succhi non sostituiscono la frutta | WCRF; OMS (i succhi sono zuccheri liberi) |
| B6 | Riso, anche fuori menù | Non tutti i giorni | Livsmedelsverket |

### C. Obiettivi giornalieri (Oggi, Settimana)
- Verdura e frutta: almeno 5 porzioni (400 g), con **una porzione di verdura a pranzo e una a cena**. È un punteggio, non un vincolo: oggi una cena ha 60 g, vedi §4. Fonte: WCRF ("in most meals").
- Fibre: almeno 30 g, già nell'anello dei valori. Fonte: WCRF.
- Cereali integrali nella maggior parte dei pasti, ma **non nel pre-calcio**, dove serve poca fibra. Fonte: WCRF; scelta sportiva dell'app.
- Sale: meno di 5 g nei giorni senza calcio. Nei giorni di calcio non c'è un tetto rigido, perché il sodio perso col sudore si reintegra (c'è già il consiglio `acqua-sale`). Fonte: OMS. **[stima]** Oggi l'app non ha i dati del sale: serve il campo (§5).
- Caffè: fino a 400 mg di caffeina, cioè circa 5 espressi; due vanno benissimo. Bevande calde non bollenti. Fonti: EFSA; IARC 2A sopra i 65 °C.

### D. Cotture (ricette, consigli, coach)

| N. | Regola | Numero o criterio | Fonte | Forza |
|---|---|---|---|---|
| D1 | Amidacei dorati, non bruni: pane tostato, patate, crosta | Colore giallo dorato o più chiaro | EFSA 2015; UK FSA; Reg. UE 2017/2158 | Precauzione |
| D2 | Carne senza parti annerite; alla griglia girarla spesso, marinarla, scottarla prima al microonde se spessa | HCA −57/−88% con le marinature; da 3 a 9 volte meno con 1-3 minuti di microonde | IARC (dati insufficienti); NCI; Smith 2008; Felton 1994 | Precauzione |
| D3 | Riso lessato in molta acqua e scolato | Almeno 6 parti d'acqua: −45% di arsenico; PBA −73% | Raab 2009; Menon 2021 | Riduce l'esposizione (misurato) |
| D4 | Frutta secca e crema di arachidi chiuse, al fresco e all'asciutto; buttare quelle amare, rancide o ammuffite | Le tossine non vanno via con la cottura | BfR; Verbraucherzentrale; WCRF | Precauzione |
| D5 | Bevande calde: aspettare un paio di minuti | Sopra i 65 °C | IARC 2A | Precauzione |

### E. Piano B al bar (`src/data/barPlanB.ts`)
- **Mai affettati.** Il pollo del panino va chiesto alla piastra o al forno: la fesa arrosto a fette è un affettato. Il toast va chiesto solo al formaggio, senza prosciutto cotto. Pizza margherita o alle verdure, non salame né salsiccia. Tutto questo è già nella patch.
- **Spremuta:** resta "Sì" per i carboidrati facili prima del calcio, ma il motivo dice che i suoi zuccheri sono liberi (OMS). La frase di oggi, "nessuno zucchero aggiunto", è vera ma fuorviante.
- **Alcol:** nessuna opzione. Il coach risponde a "aperitivo o birra" con la regola B3.

### F. Consigli (`src/data/tips.ts`)
- Nuova categoria `prevenzione`, con l'etichetta "Prevenzione".
- 8 consigli nuovi, già nella patch:
  - carne lavorata;
  - carne rossa, maiale compreso;
  - riso in molta acqua;
  - dorato e non bruciato;
  - alcol;
  - frutta secca;
  - bevande calde;
  - "Nessuna pillola previene i tumori", nella categoria integratori.
- Riscritto `bar-spremuta`.
- I consigli passano da 46 a 54. Ogni testo dice da quale prova viene e non promette protezione.

### G. Coach (`src/engine/coachContext.ts`, `COACH_SYSTEM_PROMPT`)
Oggi la voce sulla prevenzione è giusta ma incompleta. Nella patch diventa quattro voci:
1. **Prevenzione:** elenco italiano delle carni lavorate (bresaola, fesa arrosto a fette, würstel di pollo, salsiccia, ragù pronto); carne rossa con il maiale e il tetto in grammi cotti, pasti fuori compresi; pollame, pesce e uova senza tetto; 400 g di vegetali, 30 g di fibre, integrali, legumi; riso massimo 3 volte, lessato e scolato; cotture; bevande calde.
2. **Alcol:** nessuna dose sicura; ogni bicchiere in meno conta; mai 5 nella stessa sera.
3. **Integratori:** nessuno previene i tumori. Ci sono segnali di danno per beta-carotene, vitamina E e acido folico ad alte dosi, e un sospetto osservazionale per la B12 ad alte dosi. Il coach rimanda al medico.
4. **Proporzioni:** prima alcol, peso e attività, poi il resto. Niente allarmi. Il gruppo 1 IARC non misura quanto è grande il rischio. Niente superfood, dieta alcalina o "zucchero che nutre il tumore".

### H. Revisione della domenica: cosa misurare
Lo scopo è vedere il pattern senza appesantire. Le domande in più sono **al massimo tre**, da un tocco ciascuna. Il resto si ricava dal diario. Tutto va in "Da sapere", senza pulsanti né colpe, e lo scalino della settimana resta uno.

| Misura | Come si ottiene | Riferimento | Esiste già? |
|---|---|---|---|
| Carne rossa fuori dal menù | Domanda: 0 / 1 / 2 / 3 o più porzioni. Si somma ai grammi del menù segnati | B1: circa 350 g cotti | No |
| Carne lavorata fuori dal menù | Domanda: 0 / 1 / 2 / 3 o più volte | B2: 0 | No |
| Alcol | Domanda: unità della settimana e massimo in una sera | B3: 0; mai 5 o più | No |
| Verdura e frutta | Media delle porzioni al giorno dai pasti segnati (come per le fibre, con il 60% dei pasti) | 5 porzioni, 400 g | In parte: i vegetali ci sono nei valori del giorno, non nella revisione |
| Fibre | Già calcolate | 30 g (oggi l'obiettivo è 35) | Sì |
| Cereali integrali | Grammi al giorno dai pasti segnati (serve il campo `wholeGrain`, §5) | Media di 90 g | No |
| Legumi | Pasti a settimana | 4 | No (deducibile) |
| Riso | Pasti a settimana, sostituzioni comprese | Al massimo 3 | No |
| Dolci fuori programma | Già contati | 3 programmati | Sì |
| Vita | Già nei voti (cm) | Sotto 94 cm, senza aumenti nel tempo (WCRF) | Sì: aggiungere la tendenza a 4 settimane |
| Attività | Minuti di calcio e palestra | OMS 150-300 | Sì, nel carico (si può mostrare il confronto con l'OMS) |

Ognuna di queste misure ha un `WeeklyReview.step` possibile. Lo scalino nuovo `alcol` ("una sera senza birra in più") si propone solo se nella settimana compare l'alcol.

---

## 4. Il menù attuale contro le regole

### Numeri (audit numerico; porzioni del tipo di giorno; partita e vigilia con il minimo di 6 g/kg)

| Misura | Settimana 1 | Settimana 2 | Avvio | Regola | Esito |
|---|---|---|---|---|---|
| Fibre, g/die | 33,5-44,6 (media 39,5) | 33,2-44,8 (39,4) | 28,4-34,3 (31,0) | A7 ≥ 30; avvio come rampa | Rispettata |
| Verdura e frutta, g/die | 520-870 (media 711; verdura 333) | 570-770 (674; verdura 329) | 475-675 (584; verdura 269) | A6 ≥ 400 | Rispettata |
| Pranzi e cene con meno di 80 g di verdura | `couscous-pollo-spinaci` (60 g), mercoledì sera | Uguale | Lo stesso piatto lunedì, mercoledì e giovedì | C, come punteggio | Scostamento piccolo, vedi sotto |
| Legumi | 4 pasti, 560 g cotti a settimana | Uguale | 80 g (rampa) | A8 ≥ 4 pasti | Rispettata |
| Integrali, g/die | 75-180 (media 115); quota sui cereali 31% | 75-193 (123); 31% | 0 (pane comune per la rampa) | A9: media ≥ 90 | Rispettata |
| Riso | **4 pasti, 1.332 g cotti, 506 g crudi** | **4 pasti, 1.364 g cotti, 518 g crudi** | 0 | A5 ≤ 3 | **Non rispettata** |
| Arsenico dal solo riso, a 70 kg [stima] | Scolato 0,051 µg/kg/die, MOE 1,2 (ad assorbimento 0,6-0,7) | Uguale | Zero | Da ridurre | Vedi la patch |
| Carne rossa | 110 g cotti, 1 porzione | Uguale | 0 | A4 ≤ 150 g | Rispettata |
| Carne lavorata, gallette | 0 | 0 | 0 | A1, A3 | Rispettata |
| Pollame / pesce / uova a settimana | 495 g / 310 g / 5 | 495 g / 360 g / 4 | 440 g / 820 g / 6 | Nessun tetto oncologico | Ok |
| Latticini, g/die | Media 441 (formaggi 54) | 482 (51) | 275 (32) | Nessuna raccomandazione | Ok, da non alzare |
| Frutta a guscio e arachidi, g/die | 21 | 20 | 24 | Circa 28 g (Aune) | Ok |
| Zuccheri liberi dal menù, g/die [stima] | 11,6 (1,7% kcal; massimo 28,8, cioè 4,2%) | 11,6 (1,7%) | 6,6 (1%) | B4: < 5% | Rispettata, con spazio per i 3 dolci |
| Sale, g/die [stima] | 6,8 (da 3,4 a 9,1) | 7,0 (da 3,6 a 10,1) | 7,9 | C: < 5 g nei giorni senza calcio | **Probabilmente oltre**: mar 4,9 e 7,6; ven 7,4 e 6,4; sab 3,4 e 3,6 |
| Ultra-trasformati probabili, % kcal | Circa 0 | Circa 0 | Circa 0 | Pochi | Ok |
| Griglia o brace | Nessuna | Nessuna | Nessuna | D2 | Ok; restano patate dorate in padella, straccetti in padella rovente e pane tostato quasi ogni giorno |

Altri fatti dall'audit:
- Le stime della ricerca sul riso (370 g crudi) non contavano il fattore dei giorni di calcio né il minimo di partita. Con questi i grammi crudi diventano 506-518.
- Le istruzioni del riso dicono di scolarlo solo in `s1-riso`. Non lo dicono `s2-pollo-riso`, `riso-pollo-curcuma` (unica ricetta di riso cotta sul momento nella rotazione, la domenica), `tacchino-riso-carote`, `pollo-paprika-peperoni` e `bowl-riso-salmone-edamame`. La quantità d'acqua non compare da nessuna parte.
- **Fonti del sale [stima]:**
  - pane: 28%;
  - acqua di cottura salata di pasta, riso e cous cous: 33%;
  - Parmigiano: 6%;
  - tonno e salsa di soia: 3% ciascuno.

  I valori sono miei, presi da etichette e tabelle, con un'incertezza di circa ±30%. Il catalogo non ha il sodio.
- 26 ricette su 60 non entrano nel menù. Nel catalogo restano inutilizzati `gallette-riso`, `confettura`, `muesli`, `fette-biscottate`, `riso-integrale`, `couscous-integrale`, `skyr`, `yogurt-greco-0`, `pera`, `clementine` e `sale`.

### Modifiche applicate (la patch)
Verifica: con la patch applicata, 31 file di test e **610 test su 610** verdi, `tsc` senza errori.

1. **`src/data/recipes.ts`, `riso-pollo-verdure-grigliate`** (mercoledì a pranzo, in entrambe le settimane). L'id resta, come prevede la convenzione del file.
   - **Togli:** `riso-basmati` 2 pugni.
   - **Metti:** `pasta` 2 pugni.
   - **Pollo:** da 1 a **0,5 palmi**. La pasta porta più proteine e la ricetta sarebbe arrivata a 52 g, sopra il tetto di 45 g.
   - **Nome:** "Insalata di pasta con pollo, carote e pomodorini". Passaggi: la pasta si cuoce, si scola al dente e si raffredda sotto l'acqua.
   - **Effetto:** il riso scende a **3 pasti, 364-376 g crudi a settimana**. Il mercoledì le fibre passano da 33,2-33,5 g a 37,0-37,2 g (tetto del calcetto: 40), le kcal sono 2.750 e 2.802 su 2.800, il pollame scende a 440 g a settimana. Il riso resta dove serve una fibra bassa: la cena dopo la partita, il riso saltato del giovedì e la domenica di vigilia.
   - **Arsenico dal solo riso [stima]:** scolato 0,036-0,038 µg/kg/die (**MOE 1,6-1,7**, era 1,2); con il PBA, MOE 3,3-3,4.
2. **`recipes.ts`, istruzioni del riso** in `riso-pollo-curcuma`, `tacchino-riso-carote`, `pollo-paprika-peperoni`, `bowl-riso-salmone-edamame` e `box-riso-pollo-zucchine`: "lessa in molta acqua salata, almeno sei volte il suo peso, e scolalo".
3. **`recipes.ts`, cotture.**
   - `straccetti-manzo-rucola`: "padella ben calda per 2 minuti, senza farli annerire" al posto di "padella rovente"; le patate "finché sono dorate e non brune".
   - `riso-pollo-curcuma`: tolto "(il pepe aiuta ad assorbire la curcuma)". Alle dosi di cucina conta poco, e suggerisce un effetto "da superfood".
4. **`src/data/menu.ts`.**
   - `PREP_GUIDE`: in `s1-riso` "molta acqua salata, almeno sei volte il peso del riso"; in `s2-pollo-riso` aggiunto "poi scolalo".
   - Rese e `recipeIds`: `s1-riso` non serve più il mercoledì; `s1-pollo` e `s2-pollo-riso` parlano di "insalata di pasta".
   - Il commento di testa riporta le regole A4, A5 e A9.
5. **`src/data/barPlanB.ts`:** riscritto il campo `why` di `panino-pollo`, `insalatona`, `toast`, `trancio-pizza` e `spremuta`, come in §3E. Verdetti e valori restano uguali, quindi `barPick` non cambia.
6. **`src/data/tips.ts`:** categoria `prevenzione`, 8 consigli nuovi, `bar-spremuta` riscritto.
7. **`src/engine/coachContext.ts`:** le quattro voci di §3G al posto dell'unica voce sulla prevenzione.
8. **`src/data/menu.test.ts`, test da aggiornare e da aggiungere.**
   - `MIN_FIBER`: da 28 a **30**.
   - `RED_MEAT`: aggiunti vitello, maiale, agnello e cavallo.
   - `MAX_GALLETTE_SNACKS`: da 8 a **0**, con il test "non usa mai gallette di riso".
   - Nuovi:
     - "ha il riso al massimo 3 volte a settimana" (`MAX_RICE_MEALS`);
     - "ha carne rossa per al massimo 150 g cotti a settimana" (`MAX_RED_MEAT_G_WEEK`);
     - "ha in media almeno 90 g di cereali integrali al giorno" (`WHOLE_GRAIN_DRY`, `MIN_WHOLE_GRAIN_G`);
     - "non usano carni lavorate né prodotti di riso soffiato" (`BANNED_FOOD`);
     - "dicono di lessare il riso in molta acqua e di scolarlo", su ricette e guide della preparazione.
   - Sul menù di oggi falliscono 2 dei test nuovi: riso (4 pasti) e istruzioni. Gli altri fissano lo stato attuale.

### Modifiche da fare a parte (non nella patch)
- **`docs/SPEC.md` §8, `MENU_ROTATION`:**
  - aggiungere A4, A5, A7 (30 g) e A9 e il divieto di carni lavorate e prodotti di riso;
  - correggere il testo vecchio "la merenda di quei giorni è il pre-calcio con gallette e banana" e "pasta, riso e gallette alzati": oggi il pre-calcio è con il pane;
  - in §12 riassumere le nuove voci del coach.
- **`src/data/foods.ts`, `pane-integrale`:** nel nome o nell'etichetta di acquisto scrivere "farina integrale al primo posto tra gli ingredienti", così si evita il pane di farina 0 con la crusca. Va verificato che il test dei nomi accetti la frase.
- **`gallette-riso`** (facoltativo): togliere l'alimento da `foods.ts` e da `PIECE_WORDS` e `WHOLE_PIECES` in `engine/nutrition.ts`. Nessuna ricetta lo usa. Le 8 asserzioni sulle porzioni a pezzi in `engine/nutrition.test.ts` vanno spostate su `datteri` o `noci`.
- **Cena `couscous-pollo-spinaci`, 60 g di verdura:** non l'ho cambiata. La ricetta ha già 44,9 g di proteine (tetto 45): aggiungere spinaci o insalata la porta oltre. Nella settimana di avvio un cubetto in più sfonda il tetto di 32 g di fibre del lunedì. Resta come punteggio per il generatore. La giornata ha comunque 260-410 g di verdura.
- **Sale:** nessun cambio prima di avere i dati. Le leve sono tre: pane con meno sale in etichetta, "un pizzico di sale" al posto di "acqua bollente salata" nel cous cous, salsa di soia iposodica. Il beneficio è soprattutto cardiovascolare. Per lo stomaco il WCRF giudica probable i cibi conservati sotto sale, non il sale totale.
- **Integratori, `SupplementEditor.tsx`:** sotto l'elenco una riga fissa, "Nessun integratore previene i tumori: servono per una carenza o su indicazione del medico". Il controllo delle dosi è in §5.
- **Per l'utente, fuori dal repository:**
  - controllare in etichetta se il complesso B contiene acido folico (segnale di danno da 0,8 mg), B6 oltre 12 mg (limite massimo EFSA) o B12 molto alta (500-1.000 µg: è solo un'ipotesi osservazionale, ma senza carenza non serve);
  - vitamina C in compresse: nessun beneficio oncologico (PHS II), e il menù porta già 1-2 kiwi e altra frutta ogni giorno;
  - vitamina D e omega-3: nessun effetto sull'incidenza nei trial. La vitamina D resta per la carenza da esame;
  - creatina: non valutata dalle fonti.

  Il coach e l'app non prescrivono: rimandano al medico.

---

## 5. Vincoli e punteggi per il generatore del menù della fase 2

### Dati da aggiungere al catalogo (`Food`, `Recipe`)
- `Food.group`, uno dei valori:
  - `'carne-rossa' | 'carne-lavorata' | 'pollame' | 'pesce' | 'uova' | 'legumi'`;
  - `'cereale-integrale' | 'cereale-raffinato' | 'patate'`;
  - `'verdura' | 'frutta' | 'frutta-essiccata' | 'frutta-guscio'`;
  - `'latticini' | 'condimento'`.

  Oggi i gruppi si ricavano da elenchi di id nei test.
- `Food.dryFactor`: equivalente secco per gli integrali; pane e fiocchi valgono 1.
- `Food.rice: boolean`.
- `Food.saltG` e `Food.freeSugarG` per 100 g (etichetta o CREA), più `Recipe.cookingSaltG` per l'acqua di cottura.
- `Food.nova` (1-4).
- `Recipe.cooking` (`'crudo' | 'lesso' | 'vapore' | 'umido' | 'forno' | 'padella' | 'griglia'`) e `Recipe.riceMethod` (`'scolato' | 'pba'`). Il generatore rifiuta `assorbimento`.
- `Supplement.dose` strutturata, accanto al testo libero: `{ nutrient, amount, unit: 'mg' | 'µg' | 'UI' | 'g' }[]`. Serve per gli avvisi più sotto.

### Vincoli rigidi (scartano il candidato)

| Vincolo | Valore |
|---|---|
| Carne lavorata, alcol, prodotti di riso soffiato | 0 |
| Carne rossa nel menù | Al massimo 1 porzione e 150 g cotti a settimana (2 porzioni e 250 g solo se l'utente lo chiede nelle preferenze) |
| Riso | Al massimo 3 pasti a settimana; `riceMethod` diverso da assorbimento; mai riso integrale per raggiungere A9 |
| Verdura e frutta | Almeno 400 g ogni giorno |
| Fibre | Almeno 30 g ogni giorno della rotazione; tetti di 45 g e di 40 g con il calcio la sera o alla vigilia (dalla SPEC) |
| Legumi | Almeno 4 pasti a settimana, al massimo 1 al giorno, nessuno a cena alla vigilia (dalla SPEC) |
| Integrali | Media settimanale di almeno 90 g/die |
| Zuccheri liberi dal menù | Meno del 5% delle kcal |
| Vincoli già esistenti | Kcal ±8%, proteine, grassi, spesa ≤ 40 prodotti, preparazione di 60-90 minuti |

### Punteggio (penalità da minimizzare; pesi in proporzione alla forza delle prove)

| Termine | Penalità | Peso |
|---|---|---|
| Fibre sotto 35 g (obiettivo dell'app) | 1 punto ogni grammo che manca | 3 (WCRF probable) |
| Verdura e frutta sotto 600 g | 1 ogni 50 g che mancano | 3 (probable) |
| Pranzo o cena con meno di 80 g di verdura | 1 per pasto | 2 |
| Integrali sotto 120 g/die di media | 1 ogni 10 g | 2 (probable) |
| Carne rossa sopra 110 g cotti | 1 ogni 25 g | 2 (probable) |
| Riso oltre 2 pasti | 2 per pasto | 1 (contaminante, MOE) |
| Pesce fuori da 2-3 pasti | 1 per pasto di scarto | 1 (CREA) |
| Sale sopra 5 g nei giorni senza calcio [quando ci sono i dati] | 1 ogni 0,5 g | 1 (OMS) |
| Ultra-trasformati sopra il 5% delle kcal | 1 ogni 2% | 1 (prove deboli) |
| Cotture `griglia` di carne | 1 per pasto (con il testo di D2 nei passaggi) | 0,5 (precauzione) |

I pesi sono una scelta di progetto **[inferenza]**: misurano quanto conta ogni prova, non producono una stima del rischio. Il generatore non deve mostrare il punteggio come "rischio".

Le soglie dei punteggi (35 g di fibre, 600 g di vegetali, 120 g di integrali) stanno sopra i vincoli, così il generatore preferisce le giornate migliori. Il menù di oggi ha già una media di 39,5 g di fibre, 674-711 g di vegetali e 115-123 g di integrali.

### Regole di contesto
- **Giorni di calcio e vigilia:** la priorità sportiva (poca fibra la sera, carboidrati a 6 g/kg) vince sul punteggio degli integrali. Il riso va preferito proprio lì, e tolto a metà settimana.
- **Settimana di avvio:** A7 e A9 sono sospese; vale la rampa.
- **Pasti sostituiti dall'utente:** le alternative (`swaps`) non devono violare i vincoli rigidi della settimana. Per esempio, una seconda ricetta di carne rossa al posto di una bianca va segnalata con il conto dei grammi.

### Avvisi sugli integratori (con la dose strutturata)

| Nutriente | Soglia | Testo | Fonte |
|---|---|---|---|
| Acido folico | Da 800 µg/die | "Ad alte dosi alcuni trial hanno visto più tumori: parlane con il medico" | AFPPS; NORVIT/WENBIT |
| Vitamina B6 | Oltre 12 mg/die | "Sopra il limite EFSA (neuropatia)" | EFSA 2023 |
| Vitamina B12 | Oltre 55 µg/die | Nota informativa: "solo un sospetto da studi osservazionali; serve solo con una carenza" | Brasky 2017 |
| Vitamina E | Da 400 UI/die | "Nel trial SELECT più tumori della prostata" | SELECT |
| Beta-carotene | Da 20 mg/die | "Più tumori del polmone nei fumatori" | ATBC; CARET |
| Selenio | Da 200 µg/die | "Nessun beneficio nei trial" | SELECT |
| Tutti | Sempre | "Nessun integratore previene i tumori" | WCRF; USPSTF |

**[inferenza]** Per la vitamina D il limite massimo EFSA per gli adulti è di 100 µg (4.000 UI) al giorno. Il dato non è nelle due ricerche e va verificato prima di usarlo come soglia.

### Test della fase 2
- Proprietà su ogni menù generato: tutti i vincoli rigidi, come nei test della patch.
- Confronto con la rotazione attuale: il punteggio del menù generato non peggiora.

---

## 6. Miti e frasi da evitare nei testi dell'app

| Da evitare | Perché | Da dire invece | Fonte |
|---|---|---|---|
| "Superfood", "cibi anticancro", "detox" | Nessun alimento da solo previene il cancro | "Conta il modo di mangiare nel suo insieme" | CRUK 2024; WCRF CUP Global 2025 |
| "Dieta alcalina" | Il pH del sangue (circa 7,4) lo regolano reni e respiro | Non parlarne | CRUK; BDA |
| "Lo zucchero nutre il tumore", "dieta senza zucchero contro il cancro" | Il glucosio nutre tutte le cellule; il legame passa dal peso | "Zuccheri liberi sotto il 10% delle kcal, per il peso e i denti" | CRUK 2023; OMS 2015 |
| "Il miele o lo zucchero di canna sono più sani dello zucchero" | Per l'OMS il miele è zucchero libero; Ritmo lo usa spesso | "Miele e zucchero contano allo stesso modo" | OMS 2015 |
| "Spremuta: nessuno zucchero" | I succhi sono zuccheri liberi | "Un bicchiere ogni tanto, il frutto intero sempre" | OMS 2015 |
| "Gli affettati sono cancerogeni come il fumo" | Il gruppo 1 dice quanto sono certe le prove, non quanto è grande il rischio (34.000 contro circa 1 milione di morti) | "Le prove sono solide: per il colon-retto il rischio sale di circa il 16% ogni 50 g al giorno" | IARC Q&A 114 |
| "La bresaola, la fesa di tacchino o i würstel di pollo sono carne magra, quindi vanno bene" | Sono carne lavorata | "Carne lavorata, anche se magra" | IARC; WCRF |
| "La carne rossa fa venire il cancro" / "va eliminata" | Probable, dipende dalla dose; il tetto è 350-500 g cotti | "Fino a circa 3 porzioni a settimana" | WCRF |
| "Il pollo e il pesce proteggono" | Per il pollame non ci sono prove di danno, che non sono prove di protezione; il pesce è solo limited-suggestive | "Non hanno un tetto per i tumori" | WCRF |
| "La carne alla griglia è cancerogena" | Nell'uomo i dati non bastano | "Precauzione semplice: girala spesso e togli le parti annerite" | IARC Q&A 114 |
| "Un bicchiere di vino rosso fa bene" / "con moderazione non fa niente" | Non esiste una dose sicura per i tumori | "Meno è meglio, zero è il meglio" | OMS; WCRF; ECAC5 |
| "Il caffè fa venire il cancro" | Gruppo 3; protezione probabile per fegato ed endometrio | "Due caffè vanno bene; il problema è la temperatura, non la bevanda" | IARC vol. 116; WCRF |
| "L'aspartame è cancerogeno" | 2B, dose accettabile invariata | "Non serve per il peso: meglio l'acqua" | IARC/JECFA 2023; OMS 2023 |
| "Le vitamine e gli antiossidanti in pillola proteggono" / "la vitamina D previene il cancro" | RCT nulli (C, D, omega-3, selenio) o con danni (beta-carotene, vitamina E) | "Nessuna pillola previene i tumori" | VITAL; SELECT; ATBC; PHS II |
| "Il biologico protegge", "bisogna diventare vegetariani" | Nessuna prova forte | Non dirlo | WCRF 2021; IARC Q&A |
| "I latticini fanno venire il cancro" / "proteggono" | Prove opposte per colon-retto e prostata, nessuna raccomandazione | Non usarli come argomento oncologico | WCRF CUP 2014, 2017 |
| "Gli ultra-processati causano il cancro" | Associazioni deboli, certezza bassa | "Pochi ultra-processati: aiutano il peso e lasciano spazio a cibi migliori" | Lane 2024; ECAC5 |
| "Il sale fa venire il cancro allo stomaco" | Probable per i cibi conservati sotto sale; il sale totale è senza conclusione | "Meno sale per la pressione" | WCRF CUP stomaco 2016; OMS |
| "Spinaci e rucola hanno nitrati pericolosi" | I benefici delle verdure superano i rischi | Non dirlo | EFSA 2008, 2017 |
| "Passa al riso integrale, è più sano" | Ha più arsenico inorganico (limite UE 0,25 contro 0,15) | "Integrali da pane, pasta, avena e farro integrali" | Reg. UE 2023/915 |
| "Tostare la frutta secca elimina le aflatossine" | Le riduce in media del 47%, non basta; la cottura non le elimina | "Chiusa, al fresco, e via quella amara o ammuffita" | Emadi 2022; BfR |
| "Le fibre ti proteggono dal cancro al colon del 7%" | Il dato dose-risposta CUP non è significativo | "Probabilmente riducono il rischio di tumore del colon-retto" | WCRF CUP 2017 |
| "Andare a letto tardi aumenta il rischio di cancro" | Il gruppo 2A IARC riguarda il lavoro a turni di notte, con prove limitate (colon, retto, prostata, seno) | Per il sonno usare argomenti di recupero e infortuni | IARC, elenco per sede 2026 |
| "La creatina fa venire il cancro" | Non valutata; nessuna prova | Non dirlo | WCRF; IARC; ECAC5 |
| "Il pepe aiuta ad assorbire la curcuma", "la curcuma antinfiammatoria" | Vero solo in farmacologia; alle dosi di cucina suggerisce un effetto che non c'è | Tolto nella patch | Non applicabile |
| "Prevenire il cancro", "a rischio zero" | Le regole riducono il rischio, non lo azzerano | "Ridurre il rischio" | WCRF |
| "Carne bianca" per il coniglio senza nota | Bianca per il CREA, di mammifero per l'IARC | Accettabile, con una nota nel coach se lo chiedono | CREA 2018; IARC |

Frasi dell'app corrette dalla patch:
- `tips.ts`, `bar-spremuta`;
- `barPlanB.ts`, `spremuta` ("nessuno zucchero aggiunto"), `panino-pollo` ("carne fresca" senza la distinzione con la fesa arrosto) e `toast`;
- `recipes.ts`, `riso-pollo-curcuma` (curcuma e pepe);
- `coachContext.ts`, la voce sulla prevenzione incompleta.

Restano corrette e da non toccare, con i loro limiti:
- `uova-strapazzate-spinaci`: la vitamina C aiuta ad assorbire il ferro;
- `acqua-sale`: il sale dopo la partita;
- `patate-salmone-affumicato`: il sale del salmone per il sodio perso. È ricetta di sostituzione, non nel menù; il salmone affumicato ha circa 3 g di sale per 100 g e va tenuto occasionale.
