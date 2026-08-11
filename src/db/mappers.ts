/**
 * Traduzione righe SQLite ↔ tipi di dominio.
 *
 * Esiste per una ragione sola: tenere `src/core/` ignaro di Drizzle. Le
 * differenze sono minime oggi (null vs undefined, boolean vs 0/1), ma il giorno
 * in cui lo schema cambia è qui che si assorbe il colpo.
 */
import type { Card, CardState, Item, Lesson, Settings } from '../core/types';
import type { CardRow, ItemRow, LessonRow, SettingsRow } from './schema';

export function rowToItem(row: ItemRow): Item {
  return {
    id: row.id,
    type: row.type,
    de: row.de,
    it: row.it,
    literalIt: row.literalIt,
    audioPath: row.audioPath,
    ttsFallback: row.ttsFallback,
    gender: row.gender,
    plural: row.plural,
    cefr: row.cefr,
    freqRank: row.freqRank,
    topic: row.topic,
    tags: row.tags,
    cognateIt: row.cognateIt,
    cognateEn: row.cognateEn,
    falseFriend: row.falseFriend,
    falseFriendNote: row.falseFriendNote,
  };
}

export function rowToCard(row: CardRow): Card {
  return {
    id: row.id,
    itemId: row.itemId,
    direction: row.direction,
    unlocked: row.unlocked,
    introducedAt: row.introducedAt,
    stability: row.stability,
    difficulty: row.difficulty,
    due: row.due,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as CardState,
    lastReview: row.lastReview,
    scheduledDays: row.scheduledDays,
    learningSteps: row.learningSteps,
    sameDayReinforcementDue: row.sameDayReinforcementDue,
    suspended: row.suspended,
  };
}

export function rowToLesson(row: LessonRow): Lesson {
  return {
    id: row.id,
    cefr: row.cefr,
    topic: row.topic,
    lines: row.lines,
    audioPath: row.audioPath,
    targetItemIds: row.targetItemIds,
    questions: row.questions,
  };
}

export function rowToSettings(row: SettingsRow): Settings {
  return {
    dailyGoalMin: row.dailyGoalMin,
    maxNewItemsPerDay: row.maxNewItemsPerDay,
    desiredRetention: row.desiredRetention,
    genderColorsEnabled: row.genderColorsEnabled,
    ttsSpeed: row.ttsSpeed,
    dayRolloverHour: row.dayRolloverHour,
    initialBlocking: row.initialBlocking,
    leechLapseThreshold: row.leechLapseThreshold,
    streakFreezesLeft: row.streakFreezesLeft,
    level: row.level,
  };
}

/** Id di card deterministico: un item non può avere due card nella stessa direzione. */
export function cardId(itemId: string, direction: Card['direction']): string {
  return `${itemId}::${direction}`;
}
