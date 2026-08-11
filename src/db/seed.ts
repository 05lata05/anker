/**
 * Caricamento dei contenuti nel database locale.
 *
 * Nota di design: il seed inserisce SOLO `items` e `lessons`. Le `cards` non
 * esistono finché l'item non viene effettivamente introdotto in una sessione
 * (Fase 3). Creare 5 card per ognuno dei 300 item al primo avvio significa
 * riempire la coda FSRS di card `New` mai viste, e il cap dei nuovi item per
 * giorno (§3.1) perderebbe ogni significato.
 */
import { sql } from 'drizzle-orm';
import rawPack from '../../content/a1.seed.json';
import { parseContentPack } from '../core/content/contentSchema';
import { DEFAULT_SETTINGS } from '../core/types';
import type { Database } from './client';
import { items, lessons, settings } from './schema';

export const contentPack = parseContentPack(rawPack, 'content/a1.seed.json');

export async function seedDatabase(db: Database, now = Date.now()): Promise<void> {
  await db.transaction(async (tx) => {
    for (const item of contentPack.items) {
      await tx
        .insert(items)
        .values({ ...item, createdAt: now })
        .onConflictDoUpdate({
          target: items.id,
          // Aggiornare invece di ignorare: una correzione ai contenuti (un
          // plurale sbagliato, un tag mancante) deve arrivare all'utente senza
          // che debba reinstallare. Lo stato di apprendimento vive in `cards`,
          // quindi sovrascrivere `items` non distrugge nulla.
          set: {
            type: item.type,
            de: item.de,
            it: item.it,
            literalIt: item.literalIt,
            audioPath: item.audioPath,
            ttsFallback: item.ttsFallback,
            gender: item.gender,
            plural: item.plural,
            cefr: item.cefr,
            freqRank: item.freqRank,
            topic: item.topic,
            tags: item.tags,
            cognateIt: item.cognateIt,
            cognateEn: item.cognateEn,
            falseFriend: item.falseFriend,
            falseFriendNote: item.falseFriendNote,
          },
        });
    }

    for (const lesson of contentPack.lessons) {
      await tx
        .insert(lessons)
        .values(lesson)
        .onConflictDoUpdate({
          target: lessons.id,
          set: {
            cefr: lesson.cefr,
            topic: lesson.topic,
            lines: lesson.lines,
            audioPath: lesson.audioPath,
            targetItemIds: lesson.targetItemIds,
            questions: lesson.questions,
          },
        });
    }

    await tx
      .insert(settings)
      .values({ id: 1, ...DEFAULT_SETTINGS, fsrsWeights: null, onboardingDone: false, createdAt: now })
      .onConflictDoNothing({ target: settings.id });
  });
}

export async function isSeeded(db: Database): Promise<boolean> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(items);
  return (row?.n ?? 0) > 0;
}
