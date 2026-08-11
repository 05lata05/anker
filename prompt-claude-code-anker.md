# Prompt per Claude Code — App "ANKER" (apprendimento del tedesco evidence-based)

> Copia tutto il contenuto sotto la riga e incollalo come primo messaggio in Claude Code, in una cartella vuota.

---

# Progetto: ANKER — app mobile per l'apprendimento del tedesco basata sull'evidenza scientifica

Sei l'ingegnere che costruisce **ANKER**, un'app mobile per imparare il tedesco (da italofoni). Il nome viene da "Anker" (ancora): ogni parola viene *ancorata* alla memoria a lungo termine.

Il differenziale del prodotto non è il contenuto: è il **motore didattico**. Deve implementare fedelmente sei principi con forte supporto meta-analitico, che oggi nessuna app combina insieme:

1. **Spaced repetition personalizzato** (non intervalli fissi) — Kim & Webb 2022, effetto medio-grande su 48 esperimenti; Cepeda et al. 2008 sull'intervallo ottimale; Tabibian et al. 2019 (PNAS) sulla personalizzazione.
2. **Retrieval practice produttivo** (richiamo attivo, non riconoscimento passivo) con **feedback immediato**.
3. **Input comprensibile a i+1** (95-98% di token noti).
4. **Output obbligatorio** (Swain): produrre lingua, non solo riconoscerla.
5. **Grammatica esplicita mirata** (Norris & Ortega 2000: l'istruzione esplicita batte quella implicita) + **feedback correttivo** (Li 2010, d≈0,61).
6. **Gamification calibrata sulla costanza**, non sulla performance facile immediata (Sailer & Homner 2020).

Vincolo filosofico da rispettare in ogni decisione di design: **desirable difficulties** (Bjork). L'app NON deve ottimizzare la sensazione di bravura immediata. Se una scelta rende la sessione più facile ma peggiora la ritenzione ritardata, è la scelta sbagliata.

---

## 1. Stack tecnico

- **Expo (React Native) + TypeScript**, `expo-router` per la navigazione.
- **expo-sqlite + Drizzle ORM** — offline-first, nessun backend nell'MVP.
- **ts-fsrs** (implementazione FSRS-5) per lo scheduling. NON implementare SM-2 a mano.
- **Zustand** per lo stato di sessione.
- **expo-av** (registrazione/riproduzione audio), **expo-speech** (TTS tedesco come fallback quando manca l'audio nativo), **expo-haptics**.
- **Reanimated** per micro-animazioni.
- Test: **Vitest** per la logica pura (scheduler, selettore i+1, profilo errori). Questa logica deve vivere in `src/core/` senza dipendenze da React, così è testabile in isolamento.

Struttura cartelle:

```
src/
  core/            # logica pura, testabile, zero React
    scheduler/     # wrapper FSRS, coda, cap giornalieri
    selection/     # selettore input i+1, interleaving, nuovi item
    profile/       # error profile, drill adattivi
    german/        # regole specifiche del tedesco (genere, casi, ordine)
    types.ts
  db/              # schema Drizzle, migrazioni, seed
  features/        # UI per fase di sessione
  app/             # rotte expo-router
content/           # JSON dei contenuti seed
```

---

## 2. Modello dati

Crea lo schema Drizzle con queste tabelle.

**`items`** — unità di apprendimento. L'unità di base è il **chunk**, non la parola isolata (approccio lessicale: Lewis 1993, Pawley & Syder 1983).
```
id, type: 'chunk' | 'noun' | 'verb' | 'pattern'
de, it                       # "Ich hätte gern..." / "Vorrei..."
literal_it                   # glossa letterale, opzionale
audio_path, tts_fallback
gender: 'der'|'die'|'das'|null
plural                       # per i sostantivi
cefr: 'A1'|'A2'|'B1'|'B2'
freq_rank                    # posizione in lista di frequenza
topic
tags: string[]               # es. ['dativ','wechselpraeposition','suffix_ung']
cognate_it, cognate_en       # per il cognate boost
false_friend: boolean
```

**`cards`** — una card per (item × direzione). Ogni item genera più card, sbloccate progressivamente.
```
id, item_id
direction: 'recognition'   # DE → IT
         | 'production'    # IT → DE (scritta)
         | 'listening'     # audio → significato
         | 'speaking'      # IT → DE parlata
         | 'gender'        # solo per i sostantivi: scegli der/die/das
unlocked: boolean
# stato FSRS gestito da ts-fsrs:
stability, difficulty, due, reps, lapses, state, last_review
```

**`reviews`** — log immutabile: `card_id, ts, rating(1-4), latency_ms, was_correct, user_answer`.

**`error_profile`** — per tag: `tag, ema_error_rate, exposures, last_updated`. Media mobile esponenziale (α=0,2). Guida i drill adattivi.

**`lessons`** — testi/dialoghi di input: `id, cefr, topic, text_de, text_it, audio_path, target_item_ids[]`.

**`sessions`** — `date, duration_ms, phases_completed, new_items, reviews_done, accuracy`.

**`settings`** — `daily_goal_min (default 20), max_new_items_per_day (default 6), desired_retention (default 0.88), gender_colors_enabled (default true), tts_speed`.

---

## 3. Il motore: `src/core/`

### 3.1 Scheduler (`core/scheduler/`)

- Wrappa `ts-fsrs`. `desiredRetention` da settings (range consentito 0,80–0,92). Non hardcodare 0,9.
- `getDueQueue(now)`: tutte le card con `due <= now`, ordinate per urgenza (retrievability crescente).
- **Cap adattivo dei nuovi item**: se `dueQueue.length > 60`, riduci i nuovi item del giorno a 0; tra 40 e 60, dimezzali. Motivo: il debito di review uccide la costanza più della lentezza del progresso.
- **Sblocco progressivo delle direzioni**: una card `production` si sblocca solo quando la `recognition` dello stesso item ha `stability > 7 giorni`. La `speaking` si sblocca dopo la `production`. Per i sostantivi, `gender` si sblocca insieme alla `recognition`.
- **Seconda esposizione nello stesso giorno**: ogni item nuovo introdotto viene forzato in coda per un secondo richiamo dopo ~90-120 minuti (spacing intra-giornaliero), fuori dal ciclo FSRS normale. Implementalo come flag `same_day_reinforcement` con schedulazione separata + notifica locale opzionale.

### 3.2 Interleaving (`core/selection/interleave.ts`)

La coda di review NON va presentata raggruppata per argomento. Implementa `interleave(cards)` che:
- alterna topic e tag adiacenti (mai due card con lo stesso `topic` di fila se evitabile);
- garantisce un **gap minimo di 5 card** tra due direzioni dello stesso item (altrimenti la seconda è un ricordo di lavoro, non un recupero dalla memoria a lungo termine);
- mescola i tipi di esercizio.

Eccezione documentata: quando si introduce una **regola grammaticale nuova**, i primi 3 esercizi su quella regola sono in blocco, poi si passa a interleaved (blocking iniziale → interleaving; l'evidenza su questo punto è mista e va isolata dietro un flag `INITIAL_BLOCKING`).

### 3.3 Selettore di input comprensibile (`core/selection/comprehensibleInput.ts`)

`pickLesson(userState)` deve restituire la lezione che massimizza l'apprendimento a i+1:
- calcola per ogni lezione la **copertura nota** = % di token il cui item ha `retrievability > 0.8`;
- scarta le lezioni con copertura < 92% (troppo difficile → ansia, nessuna acquisizione) o > 99% (nessun nuovo apprendimento);
- **target ideale: 95-98%** (soglia Hu & Nation 2000);
- a parità, preferisci la lezione che introduce item con `freq_rank` più basso (più frequenti = più redditizi; legge di Zipf).

### 3.4 Profilo errori e drill adattivi (`core/profile/`)

Ogni risposta sbagliata aggiorna l'EMA dei tag dell'item. Se un tag supera **30% di error rate con ≥8 esposizioni**, l'app inietta nella Fase 3 della sessione successiva un **micro-drill mirato** (4-6 esercizi) su quel tag, con una scheda di regola esplicita.

Esempi di tag che devono attivare drill dedicati in tedesco: `dativ`, `akkusativ`, `wechselpraeposition`, `v2_order`, `verb_final_subordinate`, `adjective_ending`, `gender_das`, `separable_verb`, `perfekt_haben_sein`.

---

## 4. Il loop di sessione (il cuore del prodotto)

Una sessione dura **15-25 minuti**, con 5 fasi in quest'ordine. La durata di ogni fase si adatta al `daily_goal_min`.

### Fase 1 — Richiamo schedulato (35% del tempo)
Card in scadenza dal FSRS, interleaved. Regole non negoziabili:
- **Vietato il multiple-choice come formato dominante.** Almeno il 60% delle card richiede produzione (digitare o parlare). Il riconoscimento a 4 opzioni è consentito solo per la card `gender` e per i primi 3 giorni di vita di un item.
- **Feedback immediato** dopo ogni risposta, con la forma corretta evidenziata e, se l'errore ricade su un tag noto, una riga di spiegazione esplicita ("in tedesco dopo *mit* si usa sempre il dativo → **dem** Auto").
- Rating FSRS: **non chiedere all'utente di autovalutarsi** con 4 bottoni (attrito + inaffidabilità). Deriva il rating da correttezza + latenza:
  - corretto e latenza < 3s → `Easy`
  - corretto e latenza 3-8s → `Good`
  - corretto e latenza > 8s, oppure corretto dopo un suggerimento → `Hard`
  - errato → `Again`

### Fase 2 — Input comprensibile (20%)
Un dialogo o micro-testo di 4-8 battute al livello i+1 selezionato dal motore.
- Audio nativo che parte automaticamente, testo tedesco visibile, traduzione italiana **nascosta di default** (tap per rivelare, riga per riga).
- Tap su una parola sconosciuta → glossa + aggiunta alla coda dei nuovi item.
- Chiude con 2 domande di comprensione in tedesco (non traduzione: comprensione).

### Fase 3 — Nuovi chunk + micro-grammatica esplicita (15%)
- 3-7 nuovi **chunk** (mai parole isolate fuori contesto): `Ich hätte gern einen Kaffee`, non `hätte`.
- Se il chunk introduce un pattern nuovo, mostra una **scheda regola esplicita** di massimo 3 righe + 2 esempi. Focus on Form, non lezioni di grammatica lunghe.
- Qui si innestano i **micro-drill adattivi** generati dal profilo errori.

### Fase 4 — Output e shadowing (25%)
Fase più importante e quella che manca nelle app concorrenti.
- **Shadowing**: l'utente ripete sopra l'audio nativo (2 passaggi: velocità 0,8× poi 1×). Registra, riproduci in A/B con l'originale, e mostra una traccia di confronto del contorno prosodico (anche solo l'inviluppo di ampiezza va bene per l'MVP).
- **Produzione guidata** in scala di difficoltà crescente: completamento → trasformazione (es. "riscrivi al perfetto", "metti al dativo") → produzione libera su prompt.
- **Feedback correttivo** immediato su ogni output: forma corretta + tag dell'errore, con un breve recast esplicito.
- Se il riconoscimento vocale non è disponibile offline, degrada elegantemente su auto-valutazione binaria dopo l'A/B audio (e segnala la limitazione, non fingere una valutazione).

### Fase 5 — Consolidamento (5%)
Riepilogo dei nuovi item, programmazione della seconda esposizione intra-giornaliera, aggiornamento delle metriche.

---

## 5. Moduli specifici per il tedesco (`core/german/`)

### 5.1 Sistema del genere
Il genere è il carico front-loaded principale, ma è largamente predicibile (Köpcke 1982: 90% di un corpus di 1.466 parole spiegato da regole fonologiche/morfologiche/semantiche).

- **Color-coding sistematico** (Arzt 2016: migliora la ritenzione ritardata, ed è la tecnica col miglior rapporto efficacia/costo). Colori costanti in **tutta** l'app, ovunque compaia il sostantivo:
  - `der` = blu `#2563EB`
  - `die` = rosso `#DC2626`
  - `das` = verde `#16A34A`
  - Aggiungi sempre un secondo canale non cromatico (etichetta o icona) per l'accessibilità daltonici.
- Un sostantivo **non esiste mai senza articolo** nel database né nella UI. Mai `Auto`, sempre `das Auto`.
- **Motore di regole di suffisso** (`german/genderRules.ts`) che tagga automaticamente gli item:
  - `-ung, -heit, -keit, -schaft, -tät, -ion, -ie, -ur` → femminile
  - `-chen, -lein, -ment, -um` → neutro (`das Mädchen`)
  - `-ling, -ismus, -or, -er` (agentivi) → maschile
  - `-e` finale ≈ 90% femminile; `-er` ≈ 71-78% maschile (cue probabilistici: presentali come tendenze, non come leggi)
  - **composti = genere dell'ultimo elemento** (regola al 100%)
- **"Regola scoperta"**: quando l'utente ha incontrato ≥5 sostantivi che condividono un suffisso, l'app mostra una carta che esplicita il pattern. Insegnare la regola *dopo* l'esposizione la rende molto più memorabile della regola presentata a freddo.

### 5.2 Casi
Sequenza: **Nominativo + Accusativo → Dativo → Genitivo**. Insegnali **in chunk preposizionali**, non con tabelle astratte: `mit dem Auto`, `für die Frau`, `in die Stadt` vs `in der Stadt`.
Le tabelle esistono come riferimento consultabile, mai come contenuto primario di apprendimento.

### 5.3 Ordine delle parole
Esercizio dedicato a **chip trascinabili** per costruire frasi:
- V2 nelle principali;
- verbo finale nelle subordinate (`weil`, `dass`, `wenn`);
- participio/infinito in fondo (parentesi verbale);
- inversione dopo elemento in prima posizione.

### 5.4 Cognati
Tedesco e inglese condividono circa il 60% delle radici lessicali, e l'italiano ha molti cognati latini nel tedesco colto. Nella fase A1 dai **priorità agli item taggati cognate** (`Haus/house`, `Nation/nazione`) per costruire volume rapido. Marca i **falsi amici** con un badge di avviso permanente (`bekommen ≠ diventare`, `Kalt ≠ caldo`).

---

## 6. Gamification (calibrata, non tossica)

Segui questa regola: **premia la costanza e la ritenzione a lungo termine, mai la performance facile immediata.**

- **Streak** = completare la coda di review del giorno, NON accumulare XP. Chi fa 200 esercizi facili non batte chi fa 20 review dovute.
- Metrica principale in home: **"Ancoraggi"** = numero di item con `stability > 30 giorni`. È l'unica metrica che rappresenta apprendimento reale.
- Metriche secondarie: copertura % rispetto alle prime 2.000 parole per frequenza (target: 2.000 parole ≈ 80% di copertura testuale), livello CEFR stimato, giorni consecutivi.
- **Streak freeze** (2 al mese) — protegge l'abitudine da un giorno perso, che è la prima causa di abbandono.
- **Niente classifiche competitive nell'MVP** e niente notifiche colpevolizzanti.
- Celebra i **successi ritardati** ("hai ricordato *die Verabredung* dopo 42 giorni"), non l'accuratezza della singola sessione.

---

## 7. Schermate da costruire

1. **Onboarding + placement adattivo** — 20-30 item a difficoltà crescente per stimare il livello e pre-popolare lo stato FSRS di ciò che l'utente già sa (evita di far ripartire da `Hallo` chi è A2).
2. **Home** — Ancoraggi, review dovute oggi, streak, un unico bottone grande "Inizia sessione".
3. **Session player** — le 5 fasi con indicatore di progresso; deve essere possibile mettere in pausa e riprendere senza perdere lo stato.
4. **Dettaglio item** — chunk, audio, genere con colore, tag, storico dei review, curva di ritenzione stimata.
5. **Progressi** — Ancoraggi nel tempo, copertura frequenza, mappa di calore dei tag deboli (dove si vede a colpo d'occhio "il tuo dativo è debole").
6. **Impostazioni** — obiettivo giornaliero, nuovi item/giorno, retention desiderata, color-coding on/off, velocità TTS, export/import del database.

**Design**: sobrio, tipografia leggibile, alta densità informativa nelle statistiche e minimalismo assoluto durante la sessione (una card alla volta, zero distrazioni). Dark mode. I colori del genere sono l'unico uso forte del colore.

---

## 8. Contenuti seed

Crea `content/a1.json` con **almeno 300 item** reali di tedesco A1, ordinati per frequenza, coprendo: saluti e presentazioni, numeri e orari, famiglia, cibo e ordinare al ristorante, casa, trasporti, lavoro, tempo libero, acquisti, salute.

Vincoli sui contenuti:
- ogni item è un **chunk usabile**, non un lemma isolato;
- ogni sostantivo ha articolo e plurale;
- ogni item ha tag grammaticali corretti;
- almeno 25 lezioni di input (dialoghi di 4-8 battute) collegate agli item target, così il selettore i+1 ha materiale su cui lavorare.

---

## 9. Test richiesti (Vitest, in `src/core/__tests__/`)

1. Lo scheduler non presenta mai una card `production` di un item la cui `recognition` ha `stability < 7`.
2. Il cap adattivo azzera i nuovi item quando la coda supera 60.
3. `interleave()` garantisce il gap minimo di 5 card tra due direzioni dello stesso item.
4. `pickLesson()` scarta lezioni con copertura fuori dal range 92-99% e preferisce quella con item più frequenti.
5. Il profilo errori attiva il drill esattamente al superamento della soglia (30% con ≥8 esposizioni), non prima.
6. Il motore di genere assegna correttamente i suffissi e restituisce il genere dell'ultimo elemento per i composti.
7. La derivazione del rating FSRS da correttezza+latenza rispetta le quattro soglie.

---

## 10. Piano di lavoro

Procedi in questo ordine, e **fermati dopo ogni fase per mostrarmi cosa hai fatto** prima di continuare:

- **Fase A** — Scaffolding Expo + schema Drizzle + seed di 50 item + test di setup.
- **Fase B** — `core/` completo (scheduler, interleaving, selettore i+1, profilo errori, regole tedesco) con tutti i test verdi. Nessuna UI. Questa è la parte che determina se il prodotto funziona.
- **Fase C** — Session player con le 5 fasi, funzionante end-to-end su contenuti seed.
- **Fase D** — Home, progressi, dettaglio item, impostazioni, onboarding.
- **Fase E** — Audio: shadowing, registrazione, A/B, TTS di fallback.
- **Fase F** — Contenuti completi a 300 item + rifinitura visiva.

Prima di scrivere codice, mostrami un **piano di implementazione** e segnala ogni punto in cui pensi che le mie specifiche siano sbagliate o sotto-specificate. Se una scelta tecnica che propongo (es. ts-fsrs, il rating derivato dalla latenza) ha controindicazioni note, dimmelo invece di implementarla in silenzio.

---

## 11. Cosa NON fare

- Non implementare intervalli fissi tipo Leitner "1-3-7-14 giorni". Lo scheduling deve essere personalizzato per item e per utente.
- Non rendere l'app un quiz a scelta multipla. Senza produzione non c'è apprendimento produttivo (Swain).
- Non insegnare parole isolate senza contesto né sostantivi senza articolo.
- Non aggiungere XP, gemme, vite, valute o pressione competitiva nell'MVP.
- Non ottimizzare per la percentuale di risposte corrette nella sessione: quel numero deve restare intorno all'85-90%, non al 100%. Se è troppo alto, il materiale è troppo facile.
- Non introdurre un backend, account o sincronizzazione cloud nell'MVP. Tutto locale, con export/import del DB.
