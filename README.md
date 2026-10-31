# Ritmo

Un'app web installabile su iPhone che **decide per te la giornata**: cosa mangiare, come allenarti intorno alle
partite di calcio, quando posare il telefono e andare a dormire. Tu esegui e segni con un tocco.
La domenica, in 10 minuti, rivedi la settimana e accetti le correzioni proposte.

- **Oggi**: la giornata in ordine di orario, con la prossima cosa da fare in evidenza.
- **Settimana**: menù con porzioni a occhio adattate al tipo di giorno, lista della spesa, preparazione della domenica.
- **Allenamento**: sedute A, B e C con progressione dei carichi, timer di recupero, esercizi del fisioterapista.
- **Coach**: chat con Claude che conosce il tuo piano e la tua giornata, più il piano B al bar (anche offline).
- **Progressi**: peso, sonno, dolori, carico e la revisione della domenica.

Funziona offline e tiene tutti i dati sul telefono.

## Installarla su iPhone

1. Apri **https://matalemilaniello.github.io/prova/** con **Safari**.
2. Tocca il pulsante **Condividi** (il quadrato con la freccia in su).
3. Scorri e scegli **Aggiungi alla schermata Home**, poi **Aggiungi**.
4. Apri Ritmo dall'icona: parte a schermo intero, come un'app, e funziona anche senza rete.

Gli aggiornamenti arrivano da soli: alla riapertura successiva l'app usa la versione nuova.

## Comandi

Serve Node 22.

| comando | cosa fa |
|---|---|
| `npm install` | installa le dipendenze |
| `npm run dev` | server di sviluppo su `http://localhost:5173` |
| `npm run build` | build per GitHub Pages in `dist/` (con service worker e manifest) |
| `npm run build:preview` | anteprima in un unico file `dist-preview/index.html`, senza service worker |
| `npm run preview` | serve la build di `dist/` in locale |
| `npm test` | test dei motori (Vitest) |
| `npm run typecheck` | controllo dei tipi TypeScript |
| `npm run screenshots` | PNG di ogni schermata e pannello in `screenshots/` (390×844, tema scuro e chiaro) |
| `npm run icons` | rigenera le icone in `public/` dal disegno SVG |

Gli screenshot leggono la build in un unico file: esegui prima `npm run build:preview`.
Opzioni: `--only oggi,kit`, `--themes chiaro`, `--out cartella`, `--html percorso`, `--now 18:30`,
`--today 2026-11-10`, `--width 360` (iPhone piccoli), `--full` (anche a tutta altezza), `--strict` (esce con
errore se trova eccezioni o overflow). Ogni vista è controllata anche a 360 px di larghezza. Parametri utili nell'URL: `?demo=1` (dati di esempio), `?theme=chiaro`,
`?overlay=recipe|checkin|session|football|barPlanB`, `?onboarding=1`, `#kit` (catalogo dei componenti).

## Pubblicazione

A ogni push su `main` (o sul ramo di lavoro) GitHub Actions controlla i tipi, esegue i test, fa la build e
pubblica `dist/` sul ramo `gh-pages`. La prima volta, in **Settings → Pages**, scegli come sorgente il ramo
`gh-pages` (cartella `/`).

La build usa `base: '/prova/'`: manifest, icone e service worker sono serviti da `/prova/` e l'app si apre su
`/prova/#oggi`. Per provarla in locale come sarà online: `npm run build` e poi `npm run preview`, quindi apri
`http://localhost:4173/prova/`. Dopo la prima apertura funziona anche senza rete.

## Privacy

- Tutti i dati (profilo, diario, controlli, sedute, chat) restano **solo sul telefono**, nella memoria del browser.
  Nessun server, nessun account, nessun tracciamento.
- Il repository è pubblico: nel codice non ci sono dati personali. I valori predefiniti sono generici e li
  confermi o cambi al primo avvio.
- Il **coach** è l'unica funzione che usa la rete: i messaggi e il contesto della giornata vengono inviati ad
  Anthropic con la tua chiave API personale, salvata solo sul dispositivo. Imposta un limite di spesa nella
  console di Anthropic.
- Dalle impostazioni puoi esportare un backup in JSON, reimportarlo o cancellare tutto.

## Struttura

```
src/
  domain/types.ts   contratto dei dati
  data/             contenuti (alimenti, ricette, menù, esercizi, sedute) e valori predefiniti
  engine/           funzioni pure e testate (date, nutrizione, menù, sonno, timeline, spesa, allenamento…)
  state/            stato persistito (zustand) e hook
  ui/               design system (documentato in docs/UI.md)
  app/              guscio, router a hash, barra delle schede, pannelli
  features/         schermate
  demo/seed.ts      dati di esempio
```

La specifica completa è in `docs/SPEC.md`.
