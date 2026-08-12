/**
 * Caricamento dei contenuti nel database locale.
 *
 * Nota di design: il seed inserisce SOLO `items` e `lessons`. Le `cards` non
 * esistono finché l'item non viene effettivamente introdotto in una sessione
 * (Fase 3). Creare 5 card per ognuno dei 348 item al primo avvio significa
 * riempire la coda FSRS di card `New` mai viste, e il cap dei nuovi item per
 * giorno (§3.1) perderebbe ogni significato.
 */
import { sql } from 'drizzle-orm';
import { a1Pack } from '../core/content/a1Pack';
import { DEFAULT_SETTINGS } from '../core/types';
import type { Database } from './client';
import { items, lessons, settings } from './schema';

export const contentPack = a1Pack;

/**
 * Righe per singola INSERT.
 *
 * Il limite non è estetico: SQLite ha un tetto ai parametri per statement
 * (999 nelle build più conservative) e `items` ha diciotto colonne. Cinquanta
 * righe per volta stanno abbondantemente sotto, e il numero di round-trip
 * scende da 348 a sette — che al primo avvio è la differenza tra un'attesa
 * percepibile e nessuna attesa.
 */
const ITEM_BATCH = 50;
const LESSON_BATCH = 100;

function chunk<T>(values: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

export async function seedDatabase(db: Database, now = Date.now()): Promise<void> {
  await db.transaction(async (tx) => {
    await seedContent(tx, now);
  });
}

/**
 * Il corpo del seed, senza transazione, così può girare anche su driver che
 * non le supportano — è quello che permette al test di integrazione di
 * esercitare esattamente questo codice invece di una sua copia.
 *
 * L'upsert aggiorna invece di ignorare: una correzione ai contenuti (un plurale
 * sbagliato, un tag mancante) deve arrivare all'utente senza che debba
 * reinstallare. Lo stato di apprendimento vive in `cards`, quindi sovrascrivere
 * `items` non distrugge niente.
 */
export async function seedContent(tx: Database, now: number): Promise<void> {
  // La riga delle impostazioni va creata PRIMA dei contenuti. Se il seed si
  // interrompe a metà — è successo davvero, con la coda di insert troppo lunga
  // per il bridge di expo-sqlite su web — il database resta con gli item ma
  // senza impostazioni, e da lì niente riesce più a scrivere una preferenza.
  await tx
    .insert(settings)
    .values({ id: 1, ...DEFAULT_SETTINGS, fsrsWeights: null, onboardingDone: false, createdAt: now })
    .onConflictDoNothing({ target: settings.id });

  for (const batch of chunk(contentPack.items, ITEM_BATCH)) {
    await tx
      .insert(items)
      .values(batch.map((item) => ({ ...item, createdAt: now })))
      .onConflictDoUpdate({
        target: items.id,
        set: {
          type: sql`excluded.type`,
          de: sql`excluded.de`,
          it: sql`excluded.it`,
          literalIt: sql`excluded.literal_it`,
          audioPath: sql`excluded.audio_path`,
          ttsFallback: sql`excluded.tts_fallback`,
          gender: sql`excluded.gender`,
          plural: sql`excluded.plural`,
          cefr: sql`excluded.cefr`,
          freqRank: sql`excluded.freq_rank`,
          topic: sql`excluded.topic`,
          tags: sql`excluded.tags`,
          cognateIt: sql`excluded.cognate_it`,
          cognateEn: sql`excluded.cognate_en`,
          falseFriend: sql`excluded.false_friend`,
          falseFriendNote: sql`excluded.false_friend_note`,
          transformations: sql`excluded.transformations`,
        },
      });
  }

  for (const batch of chunk(contentPack.lessons, LESSON_BATCH)) {
    await tx
      .insert(lessons)
      .values(batch)
      .onConflictDoUpdate({
        target: lessons.id,
        set: {
          cefr: sql`excluded.cefr`,
          topic: sql`excluded.topic`,
          lines: sql`excluded.lines`,
          audioPath: sql`excluded.audio_path`,
          targetItemIds: sql`excluded.target_item_ids`,
          questions: sql`excluded.questions`,
        },
      });
  }

}

/**
 * Il database è pronto solo se ci sono i contenuti E la riga delle
 * impostazioni. Guardare i soli item significherebbe considerare completo un
 * seed interrotto a metà, e non ripararlo mai più.
 */
export async function isSeeded(db: Database): Promise<boolean> {
  const [itemRow] = await db.select({ n: sql<number>`count(*)` }).from(items);
  const [settingsRow] = await db.select({ n: sql<number>`count(*)` }).from(settings);
  return (itemRow?.n ?? 0) >= contentPack.items.length && (settingsRow?.n ?? 0) > 0;
}
