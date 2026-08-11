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
let opening: Promise<Database> | null = null;

export function getDatabase(): Promise<Database> {
  if (instance) return Promise.resolve(instance);

  if (!opening) {
    opening = (async () => {
      const sqlite = await SQLite.openDatabaseAsync(DATABASE_NAME, { enableChangeListener: true });
      // Le foreign key in SQLite sono disattivate di default: senza questo
      // pragma `onDelete: 'cascade'` sullo schema non fa nulla.
      await sqlite.execAsync('PRAGMA foreign_keys = ON;');
      instance = drizzle(sqlite, { schema });
      return instance;
    })();
  }

  return opening;
}

export { schema };
