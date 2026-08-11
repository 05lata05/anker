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
import * as schema from './schema';

export const DATABASE_NAME = 'anker.db';

export type Database = ExpoSQLiteDatabase<typeof schema>;

let instance: Database | null = null;
let handle: SQLite.SQLiteDatabase | null = null;
let opening: Promise<Database> | null = null;

export function getDatabase(): Promise<Database> {
  if (instance) return Promise.resolve(instance);

  if (!opening) {
    opening = (async () => {
      const sqlite = await SQLite.openDatabaseAsync(DATABASE_NAME, { enableChangeListener: true });
      // Le foreign key in SQLite sono disattivate di default: senza questo
      // pragma `onDelete: 'cascade'` sullo schema non fa nulla.
      await sqlite.execAsync('PRAGMA foreign_keys = ON;');
      handle = sqlite;
      instance = drizzle(sqlite, { schema });
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
