# 曙宝 Shubao: sito della community

Sito a pagina unica del token community 曙宝 (Shubao, 슈바오) su BNB Chain, costruito sul brief della community. Il brief non è nel repository, perché contiene note interne.

È un sito statico: HTML, CSS e JavaScript senza installazioni né compilazione. Per vederlo basta aprire `index.html` nel browser, oppure caricare la cartella su un hosting.

## Lingue

Inglese (predefinito), cinese e coreano, con il selettore in alto a destra. La scelta resta salvata nel browser del visitatore. Per aprire direttamente una lingua si aggiunge `?lang=zh` o `?lang=ko` all'indirizzo.

## Dove cambiare le cose

| Cosa | File |
| --- | --- |
| Contratto, coppia e link ufficiali | `js/config.js` |
| Tutti i testi nelle tre lingue | `js/i18n.js` |
| Colori, font e impaginazione | `css/style.css`, con i colori in cima |
| Struttura della pagina | `index.html` |

## Cosa contiene

1. **Hero:** 曙宝 / 슈바오 / Shubao, significato del nome, testi approvati e pulsanti PancakeSwap, DexScreener e Telegram. Il cucciolo è cliccabile e squittisce con un suono sintetizzato.
2. **Contratto:** indirizzo completo con pulsante «Copy» e conferma «Copied».
3. **Dati di mercato:** prezzo, capitalizzazione, liquidità e variazione a 24 ore, letti in tempo reale da DexScreener nel browser del visitatore. Se DexScreener non risponde, la striscia non compare. Nessun numero è scritto a mano nel codice.
4. **La sua storia:** testi approvati e fatti verificati del brief (171 g, oltre 9 kg, 220.000 voti, 42%, significato del nome, carattere). Segue un blocco su dove si trova ora (Panda World di Everland, a Yongin, aperta al pubblico dal 30 ottobre 2026, confermato dalla stampa coreana) e sulla sua popolarità su X, YouTube e social. Le sorelle non vengono citate, come da scelta editoriale.
5. **Community takeover:** cosa significa CTO, senza attaccare il team precedente.
6. **Come comprare:** quattro passaggi generici e avviso anti-truffa.
7. **Link ufficiali:** X, Telegram, DexScreener, BscScan, PancakeSwap. Il vecchio account `x.com/ShuBaobnb` non c'è.
8. **Footer:** disclaimer completo di non affiliazione.

## Immagini

Le illustrazioni in `assets/img/` sono quelle originali del progetto precedente: acquerelli generati con AI, senza foto di Everland o di agenzie. Le icone in `assets/icons/` e l'anteprima social `assets/og.jpg` sono ricavate da quelle illustrazioni.

## Pubblicare

Hosting scelto: **Cloudflare Pages**, gratuito, con indirizzo `https://shubao.pages.dev`.

1. Crea un account gratuito su dash.cloudflare.com.
2. Vai in **Workers e Pages → Crea → Pages → Carica risorse**.
3. Come nome del progetto usa `shubao`, poi trascina la cartella `shubao-website` (o lo zip) e conferma.

Se il nome `shubao` è già preso, Cloudflare assegna un indirizzo diverso. In quel caso in `index.html` vanno aggiornate le righe `og:url`, `og:image` e `canonical`, altrimenti l'anteprima su X e Telegram non compare.

Più avanti si può collegare un dominio proprio, sempre da Cloudflare. Non usare "everland" nel nome.

## Da fare prima di andare online

1. **Link PancakeSwap.** Il formato `swap?outputCurrency=…&chain=bsc` è quello usato normalmente, ma non è stato possibile aprirlo da qui. Dopo la pubblicazione basta un clic per vedere se preseleziona 曙宝.
2. **Traduzioni.** Cinese e coreano sono stati riletti, ma non da un madrelingua. Se nella community c'è qualcuno che li parla, conviene fargli dare un'occhiata a `js/i18n.js`.
3. **Logo.** Quando sarà disponibile `icon_square.png`, decidere se sostituire l'icona attuale del cucciolo illustrato in `assets/icons/`. Attenzione: è una foto, quindi valgono le regole del brief su diritti e watermark.
4. **Pubblicazione.** Vedi sopra.
5. **Dopo la pubblicazione.** Seguire la sezione 10 del brief: bio di X, supporto DexScreener e ticket Fomo.

Supply, tasse e liquidità bloccata non compaiono sul sito, perché non sono ancora verificati.
