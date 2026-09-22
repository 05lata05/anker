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

Poi si inquadra il QR con Expo Go (Android) o con la fotocamera (iOS). Notifiche
locali, microfono, export e import funzionano solo lì: nel browser sono inerti.

Per costruire il sito statico da pubblicare:

```bash
npm run build:web
```

Il sottopercorso si passa nell'ambiente — `ANKER_BASE_URL=anker npm run build:web`
— e va scritto **senza barra iniziale**: Git Bash traduce i valori che cominciano
per `/` in percorsi Windows, e il sito ne esce bianco senza un errore in console.

Il progetto è su **Expo SDK 54**, non sull'ultimo. Expo Go supporta un solo SDK
alla volta — quello della sua versione più recente installabile sul dispositivo
— e un iPhone che non può aggiornare Expo Go oltre l'SDK 54 rifiuta il QR di un
progetto più nuovo. Prima di alzare l'SDK, verificare quale supporta il telefono
su cui l'app deve girare davvero.

Per rigenerare le icone dopo aver cambiato i colori del genere:

```bash
node scripts/make-icons.mjs
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

In `patches/expo-sqlite+16.0.10.patch` c'è la correzione di un bug a monte che
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

La patch corregge anche un secondo punto della stessa funzione: il timeout
dell'attesa sincrona è di un milione di iterazioni quando `Atomics.pause` è
disponibile e di un miliardo quando non lo è — mille volte più stretto nei
browser recenti, cioè qualche decina di millisecondi. Con 348 item qualsiasi
query sull'intero catalogo lo sfondava.

La stessa patch tocca un secondo file, `web/wa-sqlite/AccessHandlePoolVFS.js`.
Il VFS persistente tiene il database su OPFS e all'avvio riapre gli handle di
tutti i file del pool; lo faceva con `Promise.all`, cioè tutti insieme. WebKit
fallisce le `createSyncAccessHandle()` concorrenti con «UnknownError: The
operation failed for an unknown transient reason (e.g. out of memory)», che non
c'entra con la memoria. L'effetto era che su Safari il primo avvio andava — la
cartella è vuota e il pool viene creato in sequenza — e dal secondo in poi no.
Ora gli handle si aprono uno alla volta, con qualche riprova breve.

La patch viene riapplicata da `patch-package` nel `postinstall`. Non serve su
iOS e Android, dove SQLite è nativo: serve per poter sviluppare e verificare nel
browser. Quando expo-sqlite correggerà i bug a monte, questa patch e la
dipendenza `patch-package` si possono togliere.

## La versione web su GitHub Pages

`.github/workflows/pubblica-web.yml` costruisce il sito a ogni push e lo
pubblica su GitHub Pages. Pages va acceso una volta a mano, in
**Settings > Pages > Source > GitHub Actions**: il token del workflow può
pubblicare su un sito esistente, ma non crearne uno. L'indirizzo che ne esce si apre dal telefono e si
aggiunge alla schermata Home: diventa un'icona che parte a tutto schermo, senza
PC acceso e senza Expo Go.

Perché funzioni serviva risolvere un problema che sembrava insormontabile.
`expo-sqlite` sul web parla con il worker SQLite attraverso una
`SharedArrayBuffer`, che i browser espongono solo a un documento *cross-origin
isolated*; per esserlo servono due intestazioni di risposta che GitHub Pages
non permette di configurare:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

`public/coi-serviceworker.js` le aggiunge da dentro il browser: il service
worker si interpone sulla navigazione, rifà la richiesta e riscrive le
intestazioni prima che il documento venga valutato. Al primo caricamento il
worker non controlla ancora la pagina, quindi ne provoca una ricarica; da lì in
poi è trasparente.

Intercetta **solo** le richieste di navigazione. Intercettare tutto funziona,
ma ogni file farebbe un giro in più dentro il worker, e `expo-sqlite` apre il
database con un'attesa sincrona che scade in qualche decina di millisecondi:
con il salto in più la prima query arrivava fuori tempo massimo e l'app si
fermava su «Impossibile preparare il database», in modo intermittente.

`404.html` è una copia di `index.html`. Le rotte con parametro (`/item/42`) non
hanno un file corrispondente e un hosting statico risponderebbe 404 a chi le
apre o ricarica; GitHub Pages serve `404.html`, che contiene l'app intera e
legge l'indirizzo da sé. `public/.nojekyll` impedisce a GitHub di scartare
`_expo/`, dove sta tutto il bundle.

La ricarica che il service worker provoca non è innocua, ed è costata il
primo avvio su iPhone. Il worker SQLite tiene aperti gli handle OPFS del
database; se la pagina viene ricaricata mentre li tiene, il caricamento
successivo li ritrova bloccati e Safari fallisce con «the operation failed for
an unknown transient reason (e.g. out of memory)» — che non ha niente a che
vedere con la memoria. Chrome rilascia gli handle abbastanza in fretta da
nasconderlo. Due misure, insieme:

- `getDatabase` non apre il database su una pagina non isolata. Non perché
  l'apertura fallirebbe comunque, ma perché fallisce *dopo* aver preso gli
  handle. Sulla prima passata non si tocca niente e si aspetta la ricarica.
- La ricarica avviene una volta sola, quando il worker diventa attivo, e mai
  su una pagina già isolata — nemmeno quando esce una versione nuova del
  worker, che subentrerà da sé alla navigazione seguente.

L'apertura riprova tre volte con attesa crescente: due schede aperte sulla
stessa app si contendono gli stessi file, ed è una condizione che passa.

Il primo avvio è lento: si scaricano circa 2 MB di bundle e la pagina si
ricarica una volta, quando il service worker prende il controllo. Dalla
seconda volta parte subito.

**Non c'è ancora una cache offline.** Il service worker riscrive le
intestazioni ma non conserva niente: i dati stanno in locale, i file
dell'app no. Senza rete l'app si apre solo se il browser ha ancora in cache
il bundle, e non è una garanzia.

Cosa si perde rispetto a Expo Go o a un'app vera:

- **Le notifiche locali non esistono.** Il promemoria del ripasso lampo è una
  notifica programmata, e quell'API sul web non c'è: il ripasso si vede solo
  aprendo l'app. È la perdita più seria, perché la seconda esposizione a
  90-120 minuti è metà del metodo.
- **Export e import del database non funzionano.** Usano `expo-file-system`,
  che sul web non ha un filesystem da toccare. I dati vivono nello spazio del
  browser e non hanno una copia di sicurezza.
- I dati stanno nello spazio del sito. Aggiungere l'app alla schermata Home
  protegge da buona parte delle politiche di pulizia di Safari, ma resta
  archiviazione di browser, non di app.

**Verificato su Chrome headless, non su iPhone.** Isolamento, persistenza del
database fra riavvii e istradamento delle rotte con parametro sono stati
provati automaticamente su Chrome, prima contro un server locale senza
intestazioni e poi contro il sito pubblicato su GitHub Pages. Su Safari
di iOS non è stato provato: i service worker e `SharedArrayBuffer` ci sono da
anni, ma il VFS che `expo-sqlite` usa sul web poggia su IndexedDB, e Safari lì
ha storicamente le sue stranezze.

## Limitazioni note

**La UI non è stata verificata su iOS e Android.** Onboarding, sessione, home,
progressi, dettaglio item e impostazioni sono stati percorsi end-to-end nel
browser, ma su dispositivo reale no. In particolare export e import del
database usano API native che sul web non fanno nulla di utile: sono l'unica
parte scritta e mai eseguita. Per provarli servono `npm start` e un telefono
con Expo Go o una dev build.

**Il confronto prosodico dello shadowing è di tempo, non di intonazione.**
Dell'utente si misura l'inviluppo di ampiezza dal livello del microfono; della
voce di riferimento no, perché è sintesi vocale di sistema — esce
dall'altoparlante e non passa da un buffer leggibile, e non esiste un file da
cui pre-calcolare una traccia. Quello che si confronta è durata, ritmo in
sillabe al secondo e numero di pause. Un confronto del contorno punto per punto
richiede registrazioni di parlanti reali, che i contenuti non hanno.

**Registrazione e riproduzione non sono state verificate.** Il microfono è
bloccato nel browser usato per la verifica: è stata provata solo la
degradazione (permesso negato → messaggio esplicito, auto-valutazione ancora
disponibile, sessione che prosegue). Registrazione, inviluppo e A/B vanno
provati su telefono, come export, import e notifiche.

**Il ripasso lampo è verificato dai test, non a occhio.** Sei test di
integrazione coprono la finestra dei 90-120 minuti, il fatto che rispondere non
tocchi lo stato FSRS e che alimenti comunque il profilo errori. Nel browser è
stato visto solo lo stato vuoto: aspettare un'ora e mezza non era praticabile.

**Il livello stimato dal placement è una stima grossolana.** Venti domande di
riconoscimento non misurano il livello di nessuno. Serve solo a decidere da
dove cominciare, e gli item dati per noti partono con una scadenza di quattro
giorni proprio perché l'errore si scopra subito.

## Stato

| Fase | Contenuto | Stato |
| --- | --- | --- |
| A | Scaffolding, schema DB, seed, test di setup | fatto |
| B | Motore `core/` completo | fatto |
| C | Session player a 5 fasi | fatto |
| D | Home, progressi, dettaglio item, impostazioni, onboarding | fatto |
| E | Audio: shadowing, registrazione, A/B, TTS | fatto |
| F | 348 item, 26 lezioni, trasformazioni, rifinitura | fatto |

Dopo le sei fasi sono stati chiusi i buchi che rendevano l'app non usabile tutti
i giorni: il **ripasso lampo** (la seconda esposizione era programmata nel
database e non la presentava nessuno), la **notifica locale** che lo richiama,
gli **streak freeze** che ora si consumano davvero, il feedback aptico,
l'error boundary, l'icona e la rimozione di dieci dipendenze mai usate.

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

`content/a1/` contiene 348 item e 26 dialoghi, un file per argomento. Sono
divisi così perché un singolo JSON da trecento item non si rilegge e non si
corregge: chi deve sistemare un plurale nel vocabolario del cibo non deve
scorrere anche i trasporti. La validazione resta sull'insieme, perché i
riferimenti delle lezioni attraversano i file.

Ogni sostantivo porta articolo e plurale — è un vincolo verificato dai test, non
una convenzione. Trentatré item portano `transformations`: coppie autorizzate
per il gradino «riscrivi al perfetto» della Fase 4. Non vengono generate, perché
per correggerle bisogna conoscere la forma attesa.

I `freqRank` sono stime d'ordine di grandezza sul tedesco parlato, non ranghi
presi da un corpus licenziato: servono al selettore i+1 per ordinare. I testi
tedeschi sono scritti in fase di sviluppo e **vanno sottoposti a revisione
madrelingua prima di qualsiasi rilascio**.
