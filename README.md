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

## Stato

| Fase | Contenuto | Stato |
| --- | --- | --- |
| A | Scaffolding, schema DB, seed, test di setup | fatto |
| B | Motore `core/` completo | da fare |
| C | Session player a 5 fasi | da fare |
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

## Contenuti

I `freqRank` in `content/a1.seed.json` sono stime d'ordine di grandezza sul
tedesco parlato, non ranghi presi da un corpus licenziato: servono al selettore
i+1 per ordinare. I testi tedeschi sono scritti in fase di sviluppo e vanno
sottoposti a revisione madrelingua prima di qualsiasi rilascio.
