# ANKER

App mobile per imparare il tedesco da italofoni. Il differenziale non è il
contenuto, è il motore didattico: spaced repetition personalizzato, retrieval
produttivo, input a i+1, output obbligatorio, grammatica esplicita mirata,
gamification calibrata sulla costanza.

Specifica di riferimento: [`prompt-claude-code-anker.md`](prompt-claude-code-anker.md).

## Comandi

```bash
npm install
```

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm start
```

Dopo aver modificato `src/db/schema.ts` serve rigenerare le migrazioni:

```bash
npm run db:generate
```

## Struttura

```
src/
  core/            logica pura, testabile, zero React/RN/Expo/Drizzle
    content/       validazione dei pacchetti di contenuto (zod)
    german/        regole specifiche del tedesco
    __tests__/     Vitest
  db/              schema Drizzle, client expo-sqlite, seed, mapper
  app/             rotte expo-router
content/           JSON dei contenuti
drizzle/           migrazioni generate (committare)
```

Il confine tra `core/` e il resto è verificato da un test: se qualcosa dentro
`src/core/` importa React, React Native, Expo o Drizzle, la suite fallisce.

`npm test` esegue due suite: il motore su oggetti in memoria (`src/core`) e il
layer dati contro SQLite vero via `node:sqlite` (`src/db`), che copre
migrazioni, colonne JSON, persistenza dello stato FSRS e ripresa di sessione.

## La patch a `expo-sqlite`

In `patches/expo-sqlite+57.0.1.patch` c'è la correzione di un bug a monte che
rendeva il target web inutilizzabile. Il canale sincrono verso il worker
scriveva la lunghezza del risultato così:

```js
resultArray.set(new Uint32Array([length]), 0);
```

`Uint8Array.prototype.set` converte ogni elemento in un singolo byte, quindi
finiva in memoria solo `length & 0xFF` mentre il lettore ne rileggeva quattro.
Qualsiasi risultato oltre i 255 byte tornava troncato e la deserializzazione
falliva con «Unterminated string in JSON at position N», dove N è
`lunghezza % 256`. Siccome `drizzle-orm/expo-sqlite` usa solo API sincrone,
l'app si fermava alla prima query non banale.

La patch viene riapplicata da `patch-package` nel `postinstall`. Non serve su
iOS e Android, dove SQLite è nativo: serve per poter sviluppare e verificare nel
browser. Quando expo-sqlite correggerà il bug a monte, questa patch e la
dipendenza `patch-package` si possono togliere.

## Limitazioni note

**La UI non è stata verificata su iOS e Android.** Il ciclo di sessione è stato
percorso end-to-end nel browser — richiamo, input, nuovi chunk, produzione,
consolidamento, pausa e ripresa — ma su dispositivo reale no. Per provarlo
servono `npm start` e un telefono con Expo Go o una dev build.

## Stato

| Fase | Contenuto | Stato |
| --- | --- | --- |
| A | Scaffolding, schema DB, seed, test di setup | fatto |
| B | Motore `core/` completo | fatto |
| C | Session player a 5 fasi | fatto |
| D | Home, progressi, dettaglio item, impostazioni, onboarding | da fare |
| E | Audio: shadowing, registrazione, A/B, TTS | da fare |
| F | 300 item + rifinitura | da fare |

## Decisioni prese e loro motivo

Dove il codice si discosta dalla specifica, o dove la specifica lasciava una
scelta aperta, la ragione è nel commento accanto al codice. Le principali:

- **`ts-fsrs` non personalizza i parametri.** Applica i pesi che riceve; non li
  stima dal log dei review. La personalizzazione per-item (stability,
  difficulty) c'è; quella per-utente richiederebbe un ottimizzatore separato e
  circa un migliaio di review. Il campo `settings.fsrs_weights` esiste per
  quando ci sarà, ma finché resta `null` l'app usa i pesi di default e non deve
  raccontare all'utente di essersi adattata a lui.
- **Le card non vengono create al seed.** Nascono quando l'item viene
  introdotto: altrimenti il cap dei nuovi item per giorno non vorrebbe dire
  nulla.
- **`day_log` è una tabella in più** rispetto alla specifica: streak e cap
  adattivo hanno bisogno di sapere cosa è successo nella giornata logica, e
  ricavarlo scandendo `reviews` a ogni avvio è sprecato.
- **La giornata logica inizia alle 04:00 locali**, non a mezzanotte: chi studia
  all'una di notte non deve perdere lo streak per un tecnicismo di calendario.
- **`expo-audio` al posto di `expo-av`**, che è deprecato da SDK 52.
- **Il registro dei tag grammaticali è chiuso.** I tag pilotano i drill
  adattivi: se l'autore dei contenuti può inventarli, l'EMA si frammenta e la
  soglia del drill non scatta mai.
- **Gli step brevi di FSRS sono disattivati** (`enable_short_term: false`). La
  seconda esposizione intra-giornaliera prevista dalla specifica sta a 90-120
  minuti ed è gestita fuori dal ciclo FSRS: lasciare attivi anche gli step di
  1 e 10 minuti significa farli litigare, e un richiamo dopo un minuto è
  memoria di lavoro, non recupero dalla memoria a lungo termine.
- **Le soglie del rating si applicano alla latenza normalizzata**, non a quella
  grezza: sulle card di produzione si scorpora il tempo di battitura, perché
  altrimenti ogni risposta lunga finirebbe `Hard` per motivi meccanici.
- **Il selettore i+1 ha una scala di ripiego.** Senza, con pochi item in memoria
  nessuna lezione raggiunge il 92% di copertura e la Fase 2 resta vuota per
  settimane, proprio quando l'input serve di più.
- **`der` per `dem` non è un typo.** La tolleranza a un carattere di differenza
  non si applica ad articoli, pronomi e preposizioni: lì un carattere è un
  errore di caso, che è esattamente ciò che l'app deve intercettare.
- **Il motore di genere predice, non assegna.** Il genere autorevole resta
  quello dei contenuti; le regole servono a taggare e a generare le carte
  «regola scoperta». Sui composti la confidenza è 0,97 e non 1: la regola è
  certa, la segmentazione no.

## Contenuti

I `freqRank` in `content/a1.seed.json` sono stime d'ordine di grandezza sul
tedesco parlato, non ranghi presi da un corpus licenziato: servono al selettore
i+1 per ordinare. I testi tedeschi sono scritti in fase di sviluppo e vanno
sottoposti a revisione madrelingua prima di qualsiasi rilascio.
