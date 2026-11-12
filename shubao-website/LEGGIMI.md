# 曙宝 Shubao: sito della community

Sito a pagina unica del token community 曙宝 (Shubao, 슈바오) su BNB Chain, costruito sul brief in `BRIEF.md`.

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
4. **La sua storia:** testi approvati e fatti verificati del brief (171 g, oltre 9 kg, 220.000 voti, 42%, significato del nome, carattere). Le sorelle non vengono citate, come da scelta editoriale.
5. **Community takeover:** cosa significa CTO, senza attaccare il team precedente.
6. **Come comprare:** quattro passaggi generici e avviso anti-truffa.
7. **Link ufficiali:** X, Telegram, DexScreener, BscScan, PancakeSwap. Il vecchio account `x.com/ShuBaobnb` non c'è.
8. **Footer:** disclaimer completo di non affiliazione.

## Immagini

Le illustrazioni in `assets/img/` sono quelle originali del progetto precedente: acquerelli generati con AI, senza foto di Everland o di agenzie. Le icone in `assets/icons/` e l'anteprima social `assets/og.jpg` sono ricavate da quelle illustrazioni.

## Pubblicare

- **Cloudflare Pages o Netlify:** trascina la cartella `shubao-website` nella pagina di caricamento manuale. Non serve nessun comando di compilazione.
- **Vercel:** importa il progetto e indica `shubao-website` come cartella principale, senza comandi di build.
- **Dominio:** non usare "everland" nel nome.

Dopo aver scelto il dominio, in `index.html` va cambiata la riga `og:image`, mettendo l'indirizzo completo (per esempio `https://dominio.xyz/assets/og.jpg`). Così l'anteprima su X e Telegram funziona.

## Da fare prima di andare online

1. **Link PancakeSwap.** Aprirlo e controllare che preselezioni 曙宝. Nel brief è segnato come da verificare.
2. **Traduzioni.** Far rileggere a un madrelingua cinese e coreano, in `js/i18n.js`. Le parti non approvate nel brief le ho tradotte io.
3. **Logo.** Quando sarà disponibile `icon_square.png`, decidere se sostituire l'icona attuale del cucciolo illustrato in `assets/icons/`. Attenzione: è una foto, quindi valgono le regole del brief su diritti e watermark.
4. **Dominio e pubblicazione.** Vedi sopra.
5. **Dopo la pubblicazione.** Seguire la sezione 10 del brief: bio di X, supporto DexScreener e ticket Fomo.

Supply, tasse e liquidità bloccata non compaiono sul sito, perché non sono ancora verificati.
