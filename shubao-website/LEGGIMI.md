# 曙宝 Shubao: sito della community

Sito a pagina unica del token community 曙宝 (Shubao, 슈바오) su BNB Chain, in quattro lingue: inglese, cinese, coreano e giapponese.

Online: https://shubao-9rh.pages.dev (Cloudflare Pages).

## Come è fatto

Il sito è statico: HTML, CSS e JavaScript, senza framework. Le pagine vengono generate da uno script a partire da un modello e dai testi.

| Cosa | Dove |
| --- | --- |
| Testi in ogni lingua | `i18n/en.json`, `zh.json`, `ko.json`, `ja.json` |
| Contratto, link, video, indirizzo del sito | `tools/site.json` |
| Struttura della pagina | `tools/template.html` |
| Icone SVG | `tools/symbols.svg` |
| Colori, font, impaginazione | `css/style.css` (colori in cima al file) |
| Funzioni interattive | `js/main.js` |
| Pagine generate (da non modificare a mano) | `index.html`, `zh/`, `ko/`, `ja/`, `404.html`, `sitemap.xml`, `robots.txt`, `manifest.webmanifest`, `assets/fonts/` |

## Modificare il sito

1. Cambia il testo in `i18n/*.json` oppure i dati in `tools/site.json`.
2. Rigenera le pagine:
   ```bash
   python3 tools/build.py
   ```
   Lo script scarica da Google Fonts solo i caratteri usati nelle pagine e li salva in `assets/fonts/`. I visitatori quindi non contattano Google e la pagina inglese carica circa 70 KB di font.
3. Prepara la cartella da pubblicare:
   ```bash
   bash tools/dist.sh ../shubao-dist
   ```
4. Pubblica la cartella o il suo zip su Cloudflare: progetto `shubao` → **Create deployment**.

Le risorse grafiche si rigenerano solo se cambiano le illustrazioni:
- `node tools/og.cjs` crea le anteprime social (`assets/og-*.jpg`) e il banner per X. Richiede Playwright.
- `python3 tools/assets.py` crea gli sticker PNG, il codice QR del contratto, le icone e il kit per i meme. Richiede Pillow e qrcode.

## Cosa contiene la pagina

1. **Hero:** 曙宝 / 슈바오 / Shubao, significato del nome, età di Shubao calcolata ogni giorno, etichetta «ora al Panda World», cucciolo cliccabile che squittisce (5 tocchi di fila fanno partire una sorpresa).
2. **Contratto:** copia con un clic, codice QR, pulsante «Aggiungi a MetaMask». Il pulsante si attiva dopo aver letto simbolo e decimali dalla blockchain.
3. **Dati in tempo reale:** prezzo, capitalizzazione, liquidità, variazione, volume e scambi delle ultime 24 ore da DexScreener, più l'offerta totale letta da BNB Chain. Se le fonti non rispondono, la striscia non compare. Nessun numero è scritto a mano.
4. **La sua storia:** testi approvati, numeri chiave che si animano, grafico della crescita, linea del tempo, significato del nome, nota del custode, blocco su dove si trova ora.
5. **Guardala:** video ufficiali di Everland caricati solo al clic (`youtube-nocookie`) e link ai canali ufficiali: YouTube @withEverland e @ppuppatv, Instagram @witheverland.
6. **Community (CTO):** solo in positivo, senza riferimenti al passato.
7. **Grafico DexScreener** incorporato, caricato quando ci si arriva scorrendo.
8. **Come comprare:** quattro passaggi, consiglio sullo slippage, controlli indipendenti (GoPlus, Token Sniffer, holder su BscScan) e regole di sicurezza con link per segnalare truffe.
9. **Kit dei fan:** sticker scaricabili, kit ZIP per i meme (sticker, sticker per Telegram, banner per X, anteprime, cornice per la foto profilo), generatore di immagine profilo nel browser e condivisione su X.
10. **Domande frequenti**, **link ufficiali**, **footer** con il disclaimer completo e il selettore di lingua.
11. **Telefono:** barra fissa in basso con «Copia CA» e «Compra».

Altri dettagli: lingua scelta in automatico da quella del browser (e ricordata quando la cambi), indirizzi separati `/zh/`, `/ko/`, `/ja/`, tag hreflang, dati strutturati, sitemap, pagina 404, manifest per la schermata Home, barra di avanzamento della lettura, foglie animate, rispetto di «riduci movimento».

## Pubblicazione automatica (facoltativa)

Il file `.github/workflows/shubao-cloudflare.yml` pubblica il sito su Cloudflare a ogni modifica salvata su GitHub. Resta spento finché non aggiungi due segreti al repository (GitHub → Settings → Secrets and variables → Actions):

1. `CLOUDFLARE_ACCOUNT_ID`: lo trovi in Cloudflare, nella colonna a destra della pagina Workers e Pages.
2. `CLOUDFLARE_API_TOKEN`: in Cloudflare vai su My Profile → API Tokens → Create Token, scegli il modello «Edit Cloudflare Workers» oppure crea un token con il permesso «Cloudflare Pages: Edit».

Se il progetto Cloudflare non si chiama `shubao`, aggiungi anche la variabile `CLOUDFLARE_PAGES_PROJECT` con il nome giusto.

Consiglio: sposta il sito in un repository suo e privato, per esempio `shubao-website`, invece di tenerlo in `prova`, che è pubblico.

## Statistiche delle visite (facoltative)

Cloudflare Web Analytics è gratuito e non usa cookie. In Cloudflare apri Analytics e log → Web Analytics → Add a site, copia il token e incollalo in `tools/site.json` alla voce `cloudflareAnalyticsToken`, poi rigenera le pagine.

## Dominio

Quando avrete un dominio (per esempio `shubaocto.com`):
1. Collegalo al progetto in Cloudflare: Custom domains → Set up a custom domain.
2. Cambia `siteUrl` in `tools/site.json` e rigenera le pagine. Anteprime social, sitemap e hreflang si aggiornano da sole.

Non usare "everland" nel nome.

## Da controllare

- **Video:** i tre video in `tools/site.json` sono stati trovati con una ricerca e appartengono a serie di Everland (아기판다바오, 전지적 할부지 시점), ma il canale che li ha caricati non è stato verificato. Aprili una volta su YouTube: se il canale non è @withEverland o @ppuppatv, sostituiscili.
- **Link PancakeSwap:** clicca «Buy» e controlla che preselezioni 曙宝.
- **Traduzioni:** cinese, coreano e giapponese sono state rilette, ma non da madrelingua.
- **Bio di X:** il sito invita a controllare che @ShuBaoCto linki il sito, quindi va aggiunto il link nella bio.
- **Supply, tasse, liquidità bloccata:** non sono scritti nel sito. L'offerta totale si legge in tempo reale dalla blockchain, per le tasse il sito rimanda a GoPlus e Token Sniffer.

## Regole da rispettare

- Niente foto o video di Everland copiati sul sito: solo incorporati da YouTube o linkati.
- Niente loghi o marchi di Everland o Samsung C&T, niente "everland" nel dominio.
- Il disclaimer di non affiliazione nel footer deve restare.
- Niente promesse di prezzo e niente dati inventati.
