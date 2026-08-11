/**
 * Composizione del piano di sessione: le cinque fasi del §4.
 *
 * È una funzione pura. Riceve lo stato dell'utente, restituisce cosa mostrare —
 * niente I/O, niente React. La Fase C deve limitarsi a disegnare questo
 * oggetto; se per costruire una sessione servisse logica dentro la UI,
 * vorrebbe dire che questo modulo è incompleto.
 */
import type { Drill } from '../profile/drills';
import { buildDrill } from '../profile/drills';
import type { ErrorProfile } from '../profile/errorProfile';
import { tagsNeedingDrill } from '../profile/errorProfile';
import { logicalDay } from '../scheduler/day';
import { type DueCard, adaptiveNewItemCap, type NewItemAllowance, cardsPerPhase, getDueQueue } from '../scheduler/queue';
import { type LessonPick, pickLesson } from '../selection/comprehensibleInput';
import { interleave } from '../selection/interleave';
import { selectNewItems } from '../selection/newItems';
import type { Card, Cefr, Direction, GrammarTag, Item, Lesson, SessionPhase, Settings } from '../types';
import { type FormatAssignment, assignFormats } from './formats';

/** Card della Fase 1, arricchita con i campi che servono all'interleaving. */
export interface RecallCard extends DueCard {
  itemId: string;
  topic: string;
  direction: Direction;
}

/** Ripartizione del tempo tra le fasi (§4). Somma 1. */
export const PHASE_SHARES: Record<SessionPhase, number> = {
  recall: 0.35,
  input: 0.2,
  new: 0.15,
  output: 0.25,
  consolidation: 0.05,
};

export interface SessionPlanInput {
  now: number;
  settings: Settings;
  cards: readonly Card[];
  itemsById: ReadonlyMap<string, Item>;
  lessons: readonly Lesson[];
  errorProfile: ErrorProfile;
  /** Item con retrievability > 0,8, per il selettore i+1. */
  knownItemIds: ReadonlySet<string>;
  seenLessonIds?: ReadonlySet<string>;
  newItemsIntroducedToday?: number;
  level?: Cefr;
  weights?: number[] | null;
}

export interface SessionPlan {
  day: string;
  budgetMs: number;
  newItemAllowance: NewItemAllowance;

  recall: {
    budgetMs: number;
    assignments: FormatAssignment<RecallCard>[];
    productionShare: number;
    /** Card dovute rimaste fuori dal budget di tempo: torneranno domani. */
    deferred: number;
  };
  input: { budgetMs: number; lesson: LessonPick | null };
  newItems: { budgetMs: number; items: Item[]; drills: Drill[] };
  output: { budgetMs: number; items: Item[] };
  consolidation: { budgetMs: number };
}

const MINUTE_MS = 60_000;

/**
 * Quanti item mandare in Fase 4. L'output è la fase che manca alle app
 * concorrenti e va protetta: si prendono gli item già consolidati, non quelli
 * appena introdotti, perché produrre richiede una traccia che regga.
 */
export const OUTPUT_ITEM_COUNT = 4;
export const OUTPUT_MIN_STABILITY_DAYS = 3;

export function buildSessionPlan(input: SessionPlanInput): SessionPlan {
  const { now, settings, cards, itemsById } = input;
  const budgetMs = settings.dailyGoalMin * MINUTE_MS;

  const dueQueue = getDueQueue({
    cards: [...cards],
    itemsById,
    now,
    settings,
    weights: input.weights,
  });

  const newItemAllowance = adaptiveNewItemCap(
    dueQueue.length,
    settings,
    input.newItemsIntroducedToday ?? 0,
  );

  // --- Fase 1: richiamo schedulato ---
  const recallCapacity = cardsPerPhase(settings.dailyGoalMin, PHASE_SHARES.recall);
  const interleaved = interleave<RecallCard>(
    dueQueue.map((entry) => ({
      ...entry,
      itemId: entry.card.itemId,
      topic: entry.item.topic,
      direction: entry.card.direction,
    })),
  );
  const recallSlice = interleaved.slice(0, recallCapacity);
  const { assignments, productionShare } = assignFormats(recallSlice, now);

  // --- Fase 2: input comprensibile ---
  const lesson = pickLesson({
    lessons: input.lessons,
    itemsById,
    knownItemIds: input.knownItemIds,
    seenLessonIds: input.seenLessonIds,
  });

  // --- Fase 3: nuovi chunk + micro-drill adattivi ---
  const introducedItemIds = new Set(cards.map((card) => card.itemId));
  const { items: newItems } = selectNewItems({
    candidates: [...itemsById.values()],
    introducedItemIds,
    allowance: newItemAllowance.allowance,
    level: input.level ?? 'A1',
    familiarTags: familiarTagsFrom(input.errorProfile),
  });

  const allItems = [...itemsById.values()];
  const drills = tagsNeedingDrill(input.errorProfile, now)
    .map((tag) => buildDrill(tag, allItems))
    .filter((drill): drill is Drill => drill !== null)
    // Un drill per sessione: due micro-drill in quindici minuti trasformano la
    // sessione in una lezione di grammatica, che è esattamente ciò che §4 vieta.
    .slice(0, 1);

  // --- Fase 4: output e shadowing ---
  const outputItems = pickOutputItems(cards, itemsById, newItems);

  return {
    day: logicalDay(now, settings.dayRolloverHour),
    budgetMs,
    newItemAllowance,
    recall: {
      budgetMs: budgetMs * PHASE_SHARES.recall,
      assignments,
      productionShare,
      deferred: Math.max(0, dueQueue.length - recallSlice.length),
    },
    input: { budgetMs: budgetMs * PHASE_SHARES.input, lesson },
    newItems: { budgetMs: budgetMs * PHASE_SHARES.new, items: newItems, drills },
    output: { budgetMs: budgetMs * PHASE_SHARES.output, items: outputItems },
    consolidation: { budgetMs: budgetMs * PHASE_SHARES.consolidation },
  };
}

/** Tag su cui l'utente ha già una storia: non contano come carico nuovo. */
function familiarTagsFrom(profile: ErrorProfile): Set<GrammarTag> {
  const familiar = new Set<GrammarTag>();
  for (const entry of profile.values()) {
    if (entry.exposures >= 5) familiar.add(entry.tag);
  }
  return familiar;
}

function pickOutputItems(
  cards: readonly Card[],
  itemsById: ReadonlyMap<string, Item>,
  newItems: readonly Item[],
): Item[] {
  const consolidated = cards
    .filter((card) => card.direction === 'recognition' && !card.suspended)
    .filter((card) => card.stability >= OUTPUT_MIN_STABILITY_DAYS)
    .sort((a, b) => b.stability - a.stability)
    .map((card) => itemsById.get(card.itemId))
    .filter((item): item is Item => item !== undefined);

  const picked = consolidated.slice(0, OUTPUT_ITEM_COUNT);

  // Se non c'è ancora niente di consolidato — i primi giorni — si lavora sui
  // chunk appena introdotti: meglio un output imperfetto che nessun output.
  if (picked.length === 0) return newItems.slice(0, OUTPUT_ITEM_COUNT);
  return picked;
}
