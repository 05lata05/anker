/**
 * Schema Drizzle (SQLite / expo-sqlite). Offline-first, nessun backend.
 *
 * Convenzione sui timestamp: sempre epoch in millisecondi (`integer`), mai
 * stringhe ISO. Il motore in `src/core/` ragiona su numeri e non deve sapere
 * nulla di come sono serializzati.
 */
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { ComprehensionQuestion, GrammarTag, LessonLine, SessionPhase } from '../core/types';

// ---------------------------------------------------------------------------
// items
// ---------------------------------------------------------------------------

export const items = sqliteTable(
  'items',
  {
    id: text('id').primaryKey(),
    type: text('type', { enum: ['chunk', 'noun', 'verb', 'pattern'] }).notNull(),
    de: text('de').notNull(),
    it: text('it').notNull(),
    literalIt: text('literal_it'),
    audioPath: text('audio_path'),
    ttsFallback: integer('tts_fallback', { mode: 'boolean' }).notNull().default(true),
    gender: text('gender', { enum: ['der', 'die', 'das'] }),
    plural: text('plural'),
    cefr: text('cefr', { enum: ['A1', 'A2', 'B1', 'B2'] }).notNull(),
    freqRank: integer('freq_rank').notNull(),
    topic: text('topic').notNull(),
    tags: text('tags', { mode: 'json' }).$type<GrammarTag[]>().notNull(),
    cognateIt: text('cognate_it'),
    cognateEn: text('cognate_en'),
    falseFriend: integer('false_friend', { mode: 'boolean' }).notNull().default(false),
    falseFriendNote: text('false_friend_note'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('items_freq_idx').on(t.freqRank), index('items_topic_idx').on(t.topic)],
);

// ---------------------------------------------------------------------------
// cards
// ---------------------------------------------------------------------------

export const cards = sqliteTable(
  'cards',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    direction: text('direction', {
      enum: ['recognition', 'production', 'listening', 'speaking', 'gender'],
    }).notNull(),
    unlocked: integer('unlocked', { mode: 'boolean' }).notNull().default(false),
    introducedAt: integer('introduced_at').notNull(),

    // --- stato FSRS, scritto solo dal wrapper in core/scheduler ---
    stability: real('stability').notNull().default(0),
    difficulty: real('difficulty').notNull().default(0),
    due: integer('due').notNull(),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    /** 0 New, 1 Learning, 2 Review, 3 Relearning. */
    state: integer('state').notNull().default(0),
    lastReview: integer('last_review'),
    scheduledDays: integer('scheduled_days').notNull().default(0),
    learningSteps: integer('learning_steps').notNull().default(0),

    sameDayReinforcementDue: integer('same_day_reinforcement_due'),
    suspended: integer('suspended', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    uniqueIndex('cards_item_direction_idx').on(t.itemId, t.direction),
    // La coda del giorno è una query su (unlocked, suspended, due): l'indice
    // composito la tiene O(log n) anche con qualche migliaio di card.
    index('cards_due_idx').on(t.unlocked, t.suspended, t.due),
  ],
);

// ---------------------------------------------------------------------------
// reviews — log immutabile, append-only
// ---------------------------------------------------------------------------

export const reviews = sqliteTable(
  'reviews',
  {
    id: text('id').primaryKey(),
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    ts: integer('ts').notNull(),
    /** 1 Again, 2 Hard, 3 Good, 4 Easy. */
    rating: integer('rating').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    wasCorrect: integer('was_correct', { mode: 'boolean' }).notNull(),
    userAnswer: text('user_answer'),
    phase: text('phase', {
      enum: ['recall', 'input', 'new', 'output', 'consolidation'],
    })
      .$type<SessionPhase>()
      .notNull(),
    selfAssessed: integer('self_assessed', { mode: 'boolean' }).notNull().default(false),
    sameDayReinforcement: integer('same_day_reinforcement', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('reviews_card_ts_idx').on(t.cardId, t.ts), index('reviews_ts_idx').on(t.ts)],
);

// ---------------------------------------------------------------------------
// error_profile
// ---------------------------------------------------------------------------

export const errorProfile = sqliteTable('error_profile', {
  tag: text('tag').$type<GrammarTag>().primaryKey(),
  emaErrorRate: real('ema_error_rate').notNull().default(0),
  exposures: integer('exposures').notNull().default(0),
  lastUpdated: integer('last_updated').notNull(),
  lastDrillAt: integer('last_drill_at'),
});

// ---------------------------------------------------------------------------
// lessons
// ---------------------------------------------------------------------------

export const lessons = sqliteTable(
  'lessons',
  {
    id: text('id').primaryKey(),
    cefr: text('cefr', { enum: ['A1', 'A2', 'B1', 'B2'] }).notNull(),
    topic: text('topic').notNull(),
    /**
     * Il dialogo è memorizzato riga per riga e non come blocco di testo: la
     * Fase 2 rivela la traduzione una riga alla volta e serve l'allineamento
     * DE↔IT, che da due stringhe monolitiche non si ricostruisce.
     */
    lines: text('lines', { mode: 'json' }).$type<LessonLine[]>().notNull(),
    audioPath: text('audio_path'),
    targetItemIds: text('target_item_ids', { mode: 'json' }).$type<string[]>().notNull(),
    questions: text('questions', { mode: 'json' }).$type<ComprehensionQuestion[]>().notNull(),
  },
  (t) => [index('lessons_cefr_idx').on(t.cefr)],
);

// ---------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    /** Giornata logica YYYY-MM-DD col rollover configurato (default 04:00). */
    day: text('day').notNull(),
    startedAt: integer('started_at').notNull(),
    durationMs: integer('duration_ms').notNull().default(0),
    phasesCompleted: text('phases_completed', { mode: 'json' }).$type<SessionPhase[]>().notNull(),
    newItems: integer('new_items').notNull().default(0),
    reviewsDone: integer('reviews_done').notNull().default(0),
    accuracy: real('accuracy').notNull().default(0),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    /** Snapshot serializzato per riprendere una sessione interrotta (§7.3). */
    resumeState: text('resume_state', { mode: 'json' }).$type<unknown>(),
  },
  (t) => [index('sessions_day_idx').on(t.day)],
);

// ---------------------------------------------------------------------------
// day_log
// ---------------------------------------------------------------------------

/**
 * Aggiunta rispetto alla specifica §2: lo streak (§6) è definito come "coda di
 * review del giorno completata", e il cap adattivo (§3.1) ha bisogno di sapere
 * quanti nuovi item sono già entrati oggi. Ricavare entrambi scandendo
 * `reviews` a ogni apertura dell'app è sprecato; una riga per giornata basta.
 */
export const dayLog = sqliteTable('day_log', {
  day: text('day').primaryKey(),
  newItemsIntroduced: integer('new_items_introduced').notNull().default(0),
  reviewsDone: integer('reviews_done').notNull().default(0),
  queueCleared: integer('queue_cleared', { mode: 'boolean' }).notNull().default(false),
  frozen: integer('frozen', { mode: 'boolean' }).notNull().default(false),
});

// ---------------------------------------------------------------------------
// settings — riga singola, id fisso = 1
// ---------------------------------------------------------------------------

export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey().default(1),
  dailyGoalMin: integer('daily_goal_min').notNull().default(20),
  maxNewItemsPerDay: integer('max_new_items_per_day').notNull().default(6),
  desiredRetention: real('desired_retention').notNull().default(0.88),
  genderColorsEnabled: integer('gender_colors_enabled', { mode: 'boolean' }).notNull().default(true),
  ttsSpeed: real('tts_speed').notNull().default(1),
  dayRolloverHour: integer('day_rollover_hour').notNull().default(4),
  initialBlocking: integer('initial_blocking', { mode: 'boolean' }).notNull().default(false),
  leechLapseThreshold: integer('leech_lapse_threshold').notNull().default(8),
  streakFreezesLeft: integer('streak_freezes_left').notNull().default(2),
  level: text('level', { enum: ['A1', 'A2', 'B1', 'B2'] })
    .notNull()
    .default('A1'),
  /**
   * Pesi FSRS. Restano i default finché non esiste un ottimizzatore: ts-fsrs
   * applica i pesi, non li stima. Vedi la nota in core/scheduler/fsrs.ts.
   */
  fsrsWeights: text('fsrs_weights', { mode: 'json' }).$type<number[] | null>(),
  onboardingDone: integer('onboarding_done', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
});

export type ItemRow = typeof items.$inferSelect;
export type CardRow = typeof cards.$inferSelect;
export type ReviewRow = typeof reviews.$inferSelect;
export type LessonRow = typeof lessons.$inferSelect;
export type SettingsRow = typeof settings.$inferSelect;
export type DayLogRow = typeof dayLog.$inferSelect;
