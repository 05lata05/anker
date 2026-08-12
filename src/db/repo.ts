/**
 * Accesso ai dati. È l'unico strato che parla con Drizzle.
 *
 * Il motore in `src/core/` riceve oggetti semplici e restituisce oggetti
 * semplici; qui si legge lo stato, si chiama il motore, si scrive il risultato.
 * Nessuna regola didattica vive in questo file: se ne compare una, è nel posto
 * sbagliato.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { seedKnownCards } from '../core/onboarding/placement';
import { recordAnswer } from '../core/profile/errorProfile';
import { ANCHOR_STABILITY_DAYS } from '../core/progress/metrics';
import { logicalDay } from '../core/scheduler/day';
import { applyReview, createCard, createScheduler, retrievabilityWith } from '../core/scheduler/fsrs';
import { scheduleSameDayReinforcement } from '../core/scheduler/sameDay';
import { directionsForItem, directionsToUnlock } from '../core/scheduler/unlock';
import { KNOWN_RETRIEVABILITY } from '../core/selection/comprehensibleInput';
import type {
  Card,
  Cefr,
  DayLog,
  ErrorProfileEntry,
  Grade,
  GrammarTag,
  Item,
  Lesson,
  SessionPhase,
  Settings,
} from '../core/types';
import { DEFAULT_SETTINGS } from '../core/types';
import type { Database } from './client';
import { newId } from './ids';
import { rowToCard, rowToItem, rowToLesson, rowToSettings } from './mappers';
import { cards, dayLog, errorProfile, items, lessons, reviews, sessions, settings } from './schema';

// ---------------------------------------------------------------------------
// Impostazioni
// ---------------------------------------------------------------------------

export async function getSettings(db: Database): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  return row ? rowToSettings(row) : { ...DEFAULT_SETTINGS };
}

export async function getFsrsWeights(db: Database): Promise<number[] | null> {
  const [row] = await db.select({ w: settings.fsrsWeights }).from(settings).where(eq(settings.id, 1));
  return row?.w ?? null;
}

export async function updateSettings(db: Database, patch: Partial<Settings>): Promise<void> {
  await db.update(settings).set(patch).where(eq(settings.id, 1));
}

// ---------------------------------------------------------------------------
// Stato del motore
// ---------------------------------------------------------------------------

export interface EngineState {
  now: number;
  settings: Settings;
  weights: number[] | null;
  cards: Card[];
  itemsById: Map<string, Item>;
  lessons: Lesson[];
  errorProfile: Map<GrammarTag, ErrorProfileEntry>;
  knownItemIds: Set<string>;
  seenLessonIds: Set<string>;
  newItemsIntroducedToday: number;
}

export async function loadEngineState(db: Database, now = Date.now()): Promise<EngineState> {
  const [settingsValue, weights, itemRows, cardRows, lessonRows, profileRows] = await Promise.all([
    getSettings(db),
    getFsrsWeights(db),
    db.select().from(items),
    db.select().from(cards),
    db.select().from(lessons),
    db.select().from(errorProfile),
  ]);

  const day = logicalDay(now, settingsValue.dayRolloverHour);
  const [todayRow] = await db.select().from(dayLog).where(eq(dayLog.day, day));
  const seenRows = await db
    .select({ resumeState: sessions.resumeState })
    .from(sessions)
    .where(eq(sessions.completed, true));

  const allCards = cardRows.map(rowToCard);
  const scheduler = createScheduler(settingsValue, weights);

  // Un item è "noto" quando la sua card di riconoscimento supera la soglia di
  // retrievability: è la definizione che usa il selettore i+1 (§3.3).
  const knownItemIds = new Set<string>();
  for (const card of allCards) {
    if (card.direction !== 'recognition') continue;
    if (retrievabilityWith(scheduler, card, now) > KNOWN_RETRIEVABILITY) knownItemIds.add(card.itemId);
  }

  const seenLessonIds = new Set<string>();
  for (const row of seenRows) {
    const lessonId = (row.resumeState as { lessonId?: string } | null)?.lessonId;
    if (lessonId) seenLessonIds.add(lessonId);
  }

  return {
    now,
    settings: settingsValue,
    weights,
    cards: allCards,
    itemsById: new Map(itemRows.map((row) => [row.id, rowToItem(row)])),
    lessons: lessonRows.map(rowToLesson),
    errorProfile: new Map(
      profileRows.map((row) => [
        row.tag,
        {
          tag: row.tag,
          emaErrorRate: row.emaErrorRate,
          exposures: row.exposures,
          lastUpdated: row.lastUpdated,
          lastDrillAt: row.lastDrillAt,
        },
      ]),
    ),
    knownItemIds,
    seenLessonIds,
    newItemsIntroducedToday: todayRow?.newItemsIntroduced ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Introduzione di nuovi item
// ---------------------------------------------------------------------------

/**
 * Crea le card di un item appena introdotto.
 *
 * Solo riconoscimento, ascolto e — per i sostantivi — genere nascono sbloccati.
 * Produzione e speaking esistono già come righe, ma chiuse: il gate di §3.1 le
 * aprirà quando la traccia reggerà.
 */
export async function introduceItems(
  db: Database,
  newItems: readonly Item[],
  now: number,
  rolloverHour: number,
): Promise<Card[]> {
  const created: Card[] = [];

  for (const item of newItems) {
    for (const direction of directionsForItem(item)) {
      const unlocked = direction === 'recognition' || direction === 'listening' || direction === 'gender';
      let card = createCard(item.id, direction, now, unlocked);

      // La seconda esposizione intra-giornaliera riguarda il riconoscimento:
      // è la traccia appena formata che va consolidata, non le direzioni chiuse.
      if (direction === 'recognition') {
        card = scheduleSameDayReinforcement(card, now, rolloverHour);
      }

      created.push(card);
    }
  }

  if (created.length === 0) return [];

  await db.insert(cards).values(created).onConflictDoNothing();
  await bumpDayLog(db, now, rolloverHour, { newItemsIntroduced: newItems.length });

  return created;
}

// ---------------------------------------------------------------------------
// Registrazione di un review
// ---------------------------------------------------------------------------

export interface RecordReviewInput {
  card: Card;
  item: Item;
  grade: Grade;
  wasCorrect: boolean;
  latencyMs: number;
  userAnswer: string | null;
  phase: SessionPhase;
  selfAssessed?: boolean;
  sameDayReinforcement?: boolean;
  /** Tag su cui è caduto l'errore, se il feedback l'ha identificato. */
  errorTag?: GrammarTag | null;
}

export interface RecordReviewResult {
  card: Card;
  intervalDays: number;
}

export async function recordReview(
  db: Database,
  input: RecordReviewInput,
  now: number,
  settingsValue: Settings,
  weights: number[] | null,
): Promise<RecordReviewResult> {
  const isReinforcement = input.sameDayReinforcement === true;

  // Il rinforzo intra-giornaliero viene loggato ma NON aggiorna lo stato FSRS:
  // vedi core/scheduler/sameDay.ts per il perché.
  const outcome = isReinforcement
    ? { card: { ...input.card, sameDayReinforcementDue: null }, intervalDays: 0 }
    : applyReview(input.card, input.grade, now, settingsValue, weights);

  await db.insert(reviews).values({
    id: newId(),
    cardId: input.card.id,
    ts: now,
    rating: input.grade,
    latencyMs: input.latencyMs,
    wasCorrect: input.wasCorrect,
    userAnswer: input.userAnswer,
    phase: input.phase,
    selfAssessed: input.selfAssessed ?? false,
    sameDayReinforcement: isReinforcement,
  });

  await db
    .update(cards)
    .set({
      stability: outcome.card.stability,
      difficulty: outcome.card.difficulty,
      due: outcome.card.due,
      reps: outcome.card.reps,
      lapses: outcome.card.lapses,
      state: outcome.card.state,
      lastReview: outcome.card.lastReview,
      scheduledDays: outcome.card.scheduledDays,
      learningSteps: outcome.card.learningSteps,
      sameDayReinforcementDue: outcome.card.sameDayReinforcementDue,
      suspended: outcome.card.suspended,
    })
    .where(eq(cards.id, input.card.id));

  // Il profilo errori si aggiorna sui tag dell'item, più quello specifico che
  // il feedback ha identificato (può non essere tra i tag dell'item: l'errore
  // di caso su un chunk taggato solo `v2_order` esiste).
  const tags = new Set<GrammarTag>(input.item.tags);
  if (input.errorTag) tags.add(input.errorTag);
  await updateErrorProfile(db, [...tags], input.wasCorrect, now);

  await bumpDayLog(db, now, settingsValue.dayRolloverHour, { reviewsDone: 1 });
  await refreshUnlocks(db, input.card.itemId);

  return outcome;
}

async function updateErrorProfile(
  db: Database,
  tags: readonly GrammarTag[],
  wasCorrect: boolean,
  now: number,
): Promise<void> {
  if (tags.length === 0) return;

  const existing = await db.select().from(errorProfile);
  const current = new Map<GrammarTag, ErrorProfileEntry>(
    existing.map((row) => [
      row.tag,
      {
        tag: row.tag,
        emaErrorRate: row.emaErrorRate,
        exposures: row.exposures,
        lastUpdated: row.lastUpdated,
        lastDrillAt: row.lastDrillAt,
      },
    ]),
  );

  const updated = recordAnswer(current, tags, wasCorrect, now);

  for (const tag of tags) {
    const entry = updated.get(tag);
    if (!entry) continue;
    await db
      .insert(errorProfile)
      .values({
        tag,
        emaErrorRate: entry.emaErrorRate,
        exposures: entry.exposures,
        lastUpdated: entry.lastUpdated,
        lastDrillAt: entry.lastDrillAt,
      })
      .onConflictDoUpdate({
        target: errorProfile.tag,
        set: { emaErrorRate: entry.emaErrorRate, exposures: entry.exposures, lastUpdated: entry.lastUpdated },
      });
  }
}

export async function markTagDrilled(db: Database, tag: GrammarTag, now: number): Promise<void> {
  await db.update(errorProfile).set({ lastDrillAt: now }).where(eq(errorProfile.tag, tag));
}

/** Riesamina i gate di sblocco per un item dopo un review. */
async function refreshUnlocks(db: Database, itemId: string): Promise<void> {
  const rows = await db.select().from(cards).where(eq(cards.itemId, itemId));
  const itemCards = rows.map(rowToCard);
  const toUnlock = directionsToUnlock(itemCards);

  for (const direction of toUnlock) {
    await db
      .update(cards)
      .set({ unlocked: true })
      .where(and(eq(cards.itemId, itemId), eq(cards.direction, direction)));
  }
}

// ---------------------------------------------------------------------------
// Giornata
// ---------------------------------------------------------------------------

async function bumpDayLog(
  db: Database,
  now: number,
  rolloverHour: number,
  delta: { newItemsIntroduced?: number; reviewsDone?: number },
): Promise<void> {
  const day = logicalDay(now, rolloverHour);
  await db
    .insert(dayLog)
    .values({
      day,
      newItemsIntroduced: delta.newItemsIntroduced ?? 0,
      reviewsDone: delta.reviewsDone ?? 0,
    })
    .onConflictDoUpdate({
      target: dayLog.day,
      set: {
        newItemsIntroduced: sql`${dayLog.newItemsIntroduced} + ${delta.newItemsIntroduced ?? 0}`,
        reviewsDone: sql`${dayLog.reviewsDone} + ${delta.reviewsDone ?? 0}`,
      },
    });
}

export async function markQueueCleared(db: Database, now: number, rolloverHour: number): Promise<void> {
  const day = logicalDay(now, rolloverHour);
  await db
    .insert(dayLog)
    .values({ day, queueCleared: true })
    .onConflictDoUpdate({ target: dayLog.day, set: { queueCleared: true } });
}

// ---------------------------------------------------------------------------
// Sessioni: avvio, ripresa, chiusura
// ---------------------------------------------------------------------------

export async function startSession(
  db: Database,
  now: number,
  rolloverHour: number,
  resumeState: unknown,
): Promise<string> {
  const id = newId();
  await db.insert(sessions).values({
    id,
    day: logicalDay(now, rolloverHour),
    startedAt: now,
    phasesCompleted: [],
    resumeState,
  });
  return id;
}

export async function saveResumeState(db: Database, sessionId: string, resumeState: unknown): Promise<void> {
  await db.update(sessions).set({ resumeState }).where(eq(sessions.id, sessionId));
}

export interface SessionSummaryInput {
  durationMs: number;
  phasesCompleted: SessionPhase[];
  newItems: number;
  reviewsDone: number;
  accuracy: number;
}

export async function completeSession(
  db: Database,
  sessionId: string,
  summary: SessionSummaryInput,
): Promise<void> {
  await db.update(sessions).set({ ...summary, completed: true }).where(eq(sessions.id, sessionId));
}

/** Sessione interrotta della giornata corrente, se esiste. */
export async function findOpenSession(db: Database, now: number, rolloverHour: number) {
  const day = logicalDay(now, rolloverHour);
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.day, day), eq(sessions.completed, false)))
    .orderBy(desc(sessions.startedAt))
    .limit(1);
  return row ?? null;
}

export async function abandonOpenSessions(db: Database, now: number, rolloverHour: number): Promise<void> {
  const day = logicalDay(now, rolloverHour);
  await db.delete(sessions).where(and(eq(sessions.day, day), eq(sessions.completed, false)));
}

// ---------------------------------------------------------------------------
// Letture di supporto per la UI
// ---------------------------------------------------------------------------

export { ANCHOR_STABILITY_DAYS };

export async function countDueNow(db: Database, now: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(cards)
    .where(and(eq(cards.unlocked, true), eq(cards.suspended, false), sql`${cards.due} <= ${now}`));
  return row?.n ?? 0;
}

export async function countAnchors(db: Database): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${cards.itemId})` })
    .from(cards)
    .where(and(eq(cards.direction, 'recognition'), sql`${cards.stability} >= ${ANCHOR_STABILITY_DAYS}`));
  return row?.n ?? 0;
}

export async function getDayLogs(db: Database, limit = 400): Promise<DayLog[]> {
  const rows = await db.select().from(dayLog).orderBy(desc(dayLog.day)).limit(limit);
  return rows;
}

/** Item la cui card di riconoscimento supera la soglia di retrievability. */
export async function getKnownItems(db: Database, now: number): Promise<Item[]> {
  const state = await loadEngineState(db, now);
  return [...state.knownItemIds]
    .map((id) => state.itemsById.get(id))
    .filter((item): item is Item => item !== undefined);
}

export interface ItemDetail {
  item: Item;
  cards: Card[];
  reviews: { id: string; cardId: string; ts: number; rating: number; wasCorrect: boolean; userAnswer: string | null }[];
}

export async function getItemDetail(db: Database, itemId: string): Promise<ItemDetail | null> {
  const [itemRow] = await db.select().from(items).where(eq(items.id, itemId));
  if (!itemRow) return null;

  const cardRows = await db.select().from(cards).where(eq(cards.itemId, itemId));
  const cardIds = cardRows.map((row) => row.id);

  const reviewRows =
    cardIds.length === 0
      ? []
      : await db
          .select({
            id: reviews.id,
            cardId: reviews.cardId,
            ts: reviews.ts,
            rating: reviews.rating,
            wasCorrect: reviews.wasCorrect,
            userAnswer: reviews.userAnswer,
          })
          .from(reviews)
          .where(inArray(reviews.cardId, cardIds))
          .orderBy(desc(reviews.ts))
          .limit(50);

  return { item: rowToItem(itemRow), cards: cardRows.map(rowToCard), reviews: reviewRows };
}

/** Item studiati, dal più stabile: è la lista sfogliabile dei progressi. */
export async function listStudiedItems(db: Database, limit = 200): Promise<{ item: Item; stability: number }[]> {
  const rows = await db
    .select({ item: items, stability: cards.stability })
    .from(cards)
    .innerJoin(items, eq(cards.itemId, items.id))
    .where(eq(cards.direction, 'recognition'))
    .orderBy(desc(cards.stability))
    .limit(limit);

  return rows.map((row) => ({ item: rowToItem(row.item), stability: row.stability }));
}

export async function getRecentReviews(db: Database, limit = 500) {
  return db
    .select({ cardId: reviews.cardId, ts: reviews.ts, wasCorrect: reviews.wasCorrect })
    .from(reviews)
    .orderBy(desc(reviews.ts))
    .limit(limit);
}

export async function getItem(db: Database, itemId: string): Promise<Item | null> {
  const [row] = await db.select().from(items).where(eq(items.id, itemId));
  return row ? rowToItem(row) : null;
}

export async function getAllCards(db: Database): Promise<Card[]> {
  const rows = await db.select().from(cards);
  return rows.map(rowToCard);
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export async function isOnboardingDone(db: Database): Promise<boolean> {
  const [row] = await db.select({ done: settings.onboardingDone }).from(settings).where(eq(settings.id, 1));
  return row?.done ?? false;
}

/**
 * Applica l'esito del placement: semina le card degli item riconosciuti e
 * registra il livello stimato.
 *
 * Le card seminate partono da una stability di pochi giorni, non da «imparato»:
 * se la stima è sbagliata l'item torna presto e l'errore si corregge da sé.
 */
export async function applyPlacement(
  db: Database,
  result: { level: Cefr; knownItemIds: readonly string[] },
  now: number,
): Promise<number> {
  // Legge SOLO gli item riconosciuti, non l'intero catalogo: caricare
  // trecentocinquanta item per marcarne venti è lavoro sprecato, e su web
  // supera il budget della singola operazione SQLite.
  const rows =
    result.knownItemIds.length === 0
      ? []
      : await db
          .select()
          .from(items)
          .where(inArray(items.id, [...result.knownItemIds]));

  const created: Card[] = [];
  for (const row of rows) {
    const item = rowToItem(row);
    created.push(...seedKnownCards(item, now, directionsForItem(item)));
  }

  if (created.length > 0) {
    await db.insert(cards).values(created).onConflictDoNothing();
  }

  await db.update(settings).set({ level: result.level, onboardingDone: true }).where(eq(settings.id, 1));
  return created.length;
}

export async function resetOnboarding(db: Database): Promise<void> {
  await db.update(settings).set({ onboardingDone: false }).where(eq(settings.id, 1));
}
