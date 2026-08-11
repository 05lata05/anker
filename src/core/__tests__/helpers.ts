/** Costruttori per i test. Non è un file di test: Vitest raccoglie solo `*.test.ts`. */
import { type Card, CardState, DEFAULT_SETTINGS, type Direction, type Item, type Lesson, type Settings } from '../types';

export const NOW = new Date(2026, 4, 12, 10, 0, 0).getTime();

export const testSettings: Settings = { ...DEFAULT_SETTINGS };

export function makeItem(overrides: Partial<Item> & { id: string }): Item {
  return {
    type: 'chunk',
    de: 'Guten Tag!',
    it: 'Buongiorno!',
    literalIt: null,
    audioPath: null,
    ttsFallback: true,
    gender: null,
    plural: null,
    cefr: 'A1',
    freqRank: 100,
    topic: 'saluti',
    tags: ['formelhaft'],
    cognateIt: null,
    cognateEn: null,
    falseFriend: false,
    falseFriendNote: null,
    ...overrides,
  };
}

export function makeCard(
  itemId: string,
  direction: Direction,
  overrides: Partial<Card> = {},
): Card {
  return {
    id: `${itemId}::${direction}`,
    itemId,
    direction,
    unlocked: true,
    introducedAt: NOW - 30 * 86_400_000,
    stability: 0,
    difficulty: 5,
    due: NOW - 1000,
    reps: 1,
    lapses: 0,
    state: CardState.Review,
    lastReview: NOW - 86_400_000,
    scheduledDays: 1,
    learningSteps: 0,
    sameDayReinforcementDue: null,
    suspended: false,
    ...overrides,
  };
}

export function makeLesson(overrides: Partial<Lesson> & { id: string }): Lesson {
  return {
    cefr: 'A1',
    topic: 'saluti',
    lines: [
      { speaker: 'A', de: 'Guten Tag!', it: 'Buongiorno!' },
      { speaker: 'B', de: 'Guten Tag!', it: 'Buongiorno!' },
      { speaker: 'A', de: 'Wie geht es Ihnen?', it: 'Come sta?' },
      { speaker: 'B', de: 'Mir geht es gut.', it: 'Sto bene.' },
    ],
    audioPath: null,
    targetItemIds: [],
    questions: [
      { de: 'Wer spricht?', options: ['A', 'B'], answerIndex: 0 },
      { de: 'Wie geht es B?', options: ['Gut', 'Schlecht'], answerIndex: 0 },
    ],
    ...overrides,
  };
}

export function itemMap(items: Item[]): Map<string, Item> {
  return new Map(items.map((item) => [item.id, item]));
}
