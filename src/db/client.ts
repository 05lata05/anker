/**
 * Istanza SQLite + Drizzle. Unico punto in cui l'app apre il database.
 *
 * Questo file importa expo-sqlite: NON può essere importato da `src/core/`.
 */
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import * as schema from './schema';

export const DATABASE_NAME = 'anker.db';

export const sqliteDb = SQLite.openDatabaseSync(DATABASE_NAME, {
  enableChangeListener: true,
});

// Le foreign key in SQLite sono disattivate di default: senza questo pragma
// `onDelete: 'cascade'` sullo schema non fa nulla.
sqliteDb.execSync('PRAGMA foreign_keys = ON;');

export const db = drizzle(sqliteDb, { schema });

export type Database = typeof db;
export { schema };
