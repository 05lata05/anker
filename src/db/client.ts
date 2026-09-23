/**
 * Istanza SQLite + Drizzle. Unico punto in cui l'app apre il database.
 *
 * L'apertura è asincrona e non sincrona per una ragione concreta: su web
 * expo-sqlite gira su wa-sqlite dentro un worker, e `openDatabaseSync` chiamato
 * al momento dell'import fallisce con un timeout perché il worker non è ancora
 * in piedi. L'apertura asincrona funziona su tutte e tre le piattaforme; quella
 * sincrona no.
 *
 * Questo file importa expo-sqlite: NON può essere importato da `src/core/`.
 */
import { type ExpoSQLiteDatabase, drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import * as schema from './schema';
import { leggiSnapshot, scriviSnapshot } from './webSnapshot';

export const DATABASE_NAME = 'anker.db';

export type Database = ExpoSQLiteDatabase<typeof schema>;

let instance: Database | null = null;
let handle: SQLite.SQLiteDatabase | null = null;
let opening: Promise<Database> | null = null;

/** Quanto si aspetta che il service worker isoli la pagina e la ricarichi. */
const ATTESA_ISOLAMENTO_MS = 20_000;

/**
 * Sul web il database vive in un worker raggiunto tramite `SharedArrayBuffer`,
 * che esiste solo in un documento cross-origin isolated. Su un hosting che non
 * manda le intestazioni è il service worker a procurare l'isolamento, ma non
 * controlla il primo caricamento: lo ottiene e ricarica la pagina.
 *
 * In quella prima passata il database non va toccato. Non perché l'apertura
 * fallirebbe — quello si potrebbe gestire — ma perché fallisce *dopo* aver
 * aperto gli handle OPFS dei file. Al ricaricamento il nuovo worker li trova
 * ancora bloccati dal precedente, e su Safari muore con «the operation failed
 * for an unknown transient reason». Chrome li rilascia abbastanza in fretta da
 * nasconderlo; Safari no, e l'app non partiva affatto sull'iPhone.
 */
function isolamentoInArrivo(): boolean {
  if (Platform.OS !== 'web') return false;
  const isolato = (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated;
  return isolato === false;
}

/**
 * L'apertura può fallire per contesa sui file: un'altra scheda con la stessa
 * app, o il worker del caricamento precedente che non ha ancora mollato la
 * presa. È una condizione che passa da sé, quindi vale la pena riprovare prima
 * di mostrare un errore che l'utente non può risolvere.
 *
 * Si rilancia il PRIMO errore, non l'ultimo. Sul web il worker di expo-sqlite
 * inizializza wa-sqlite e il VFS insieme, e memorizza il primo anche se il
 * secondo fallisce: da lì in poi ogni tentativo muore su «Invalid VFS state»,
 * che descrive lo stato in cui il fallimento precedente ha lasciato il worker
 * e non dice niente sulla causa. Tenendo il primo, l'errore che arriva a
 * schermo è quello vero.
 */
async function apriConRiprove(tentativi = 3): Promise<SQLite.SQLiteDatabase> {
  let primo: unknown;
  for (let i = 0; i < tentativi; i++) {
    try {
      return await SQLite.openDatabaseAsync(DATABASE_NAME, { enableChangeListener: true });
    } catch (errore) {
      primo ??= errore;
      await new Promise((risolvi) => setTimeout(risolvi, 250 * (i + 1)));
    }
  }
  throw primo;
}

/**
 * Una volta passati al ripiego non si torna indietro da soli.
 *
 * Se OPFS tornasse a funzionare — un aggiornamento del browser basta — l'app
 * aprirebbe il database su disco, lo troverebbe vuoto e mostrerebbe un utente
 * senza storia, mentre i suoi dati sono ancora nella copia in IndexedDB.
 * Meglio restare dove i dati sono davvero.
 */
const CHIAVE_RIPIEGO = 'anker-ripiego-memoria';

function ripiegoGiaDeciso(): boolean {
  try {
    return localStorage.getItem(CHIAVE_RIPIEGO) === '1';
  } catch {
    return false;
  }
}

function ricordaRipiego(): void {
  try {
    localStorage.setItem(CHIAVE_RIPIEGO, '1');
  } catch {
    // Senza localStorage si ricomincerà dal tentativo persistente al prossimo
    // avvio: fastidioso, non dannoso.
  }
}

/** Quanto si aspetta dopo un cambiamento prima di riscrivere la copia. */
const RITARDO_SALVATAGGIO_MS = 1_500;

/**
 * Tiene aggiornata la copia in IndexedDB del database in memoria.
 *
 * Si salva poco dopo ogni cambiamento invece che a ogni scrittura: serializzare
 * significa riscrivere il file intero, e farlo per ogni risposta sarebbe
 * sprecato. La finestra di un secondo e mezzo è il prezzo — al massimo si perde
 * l'ultima risposta, e solo se il browser viene ucciso in quell'istante.
 */
function avviaSalvataggio(sqlite: SQLite.SQLiteDatabase): void {
  let sporco = false;
  let inCorso = false;
  let attesa: ReturnType<typeof setTimeout> | null = null;

  const salva = async () => {
    if (inCorso || !sporco) return;
    inCorso = true;
    sporco = false;
    try {
      await scriviSnapshot(await sqlite.serializeAsync());
    } catch (errore) {
      sporco = true; // si riprova al prossimo cambiamento
      console.warn('[db] salvataggio della copia fallito:', errore);
    } finally {
      inCorso = false;
    }
  };

  SQLite.addDatabaseChangeListener(() => {
    sporco = true;
    if (attesa) clearTimeout(attesa);
    attesa = setTimeout(() => void salva(), RITARDO_SALVATAGGIO_MS);
  });

  // La chiusura della scheda non aspetta un salvataggio asincrono. Il passaggio
  // in secondo piano sì, ed è il momento in cui su iOS le schede muoiono.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void salva();
    });
  }
}

/**
 * Apre il database, ripiegando sulla memoria se l'archiviazione persistente
 * non è utilizzabile.
 *
 * Sul web il database vive su OPFS, che su WebKit può mancare del tutto o
 * rifiutare gli handle sincroni. Invece di non far partire l'app, si tiene il
 * database in memoria e se ne conserva l'immagine in IndexedDB.
 */
async function apriDatabase(): Promise<{ sqlite: SQLite.SQLiteDatabase; ripiego: boolean }> {
  const soloRipiego = Platform.OS === 'web' && ripiegoGiaDeciso();

  if (!soloRipiego) {
    try {
      return { sqlite: await apriConRiprove(), ripiego: false };
    } catch (errore) {
      if (Platform.OS !== 'web') throw errore;
      console.warn('[db] archiviazione persistente non disponibile, si passa alla copia:', errore);
    }
  }

  const byte = await leggiSnapshot();
  const sqlite = byte
    ? await SQLite.deserializeDatabaseAsync(byte, { enableChangeListener: true })
    : await SQLite.openDatabaseAsync(':memory:', { enableChangeListener: true });
  ricordaRipiego();
  return { sqlite, ripiego: true };
}

export function getDatabase(): Promise<Database> {
  if (instance) return Promise.resolve(instance);

  if (!opening) {
    opening = (async () => {
      if (isolamentoInArrivo()) {
        // La pagina sta per essere ricaricata dal service worker: si resta in
        // attesa senza toccare niente. Il rifiuto dopo la scadenza esiste solo
        // per il caso in cui il ricaricamento non arrivi mai — meglio una
        // spiegazione che una schermata di caricamento eterna.
        await new Promise((_, rifiuta) =>
          setTimeout(
            () =>
              rifiuta(
                new Error(
                  "La pagina non è cross-origin isolated e il service worker non ha ripreso il controllo. Chiudi e riapri la scheda; se continua, il browser potrebbe bloccare i service worker (navigazione privata)."
                )
              ),
            ATTESA_ISOLAMENTO_MS
          )
        );
      }

      const { sqlite, ripiego } = await apriDatabase();
      // Le foreign key in SQLite sono disattivate di default: senza questo
      // pragma `onDelete: 'cascade'` sullo schema non fa nulla.
      await sqlite.execAsync('PRAGMA foreign_keys = ON;');
      handle = sqlite;
      instance = drizzle(sqlite, { schema });
      if (ripiego) avviaSalvataggio(sqlite);
      return instance;
    })();
  }

  return opening;
}

/**
 * Chiude e cancella il database.
 *
 * Serve quando le migrazioni non si applicano a un file preesistente — succede
 * in sviluppo ogni volta che si rigenera lo schema — e va offerta SOLO da lì:
 * per l'utente questo pulsante cancella anni di ripetizioni, ed è irreversibile
 * a meno che non abbia esportato.
 */
export async function resetDatabase(): Promise<void> {
  if (handle) {
    await handle.closeAsync();
    handle = null;
  }
  instance = null;
  opening = null;
  await SQLite.deleteDatabaseAsync(DATABASE_NAME);
}

export { schema };
