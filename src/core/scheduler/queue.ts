/**
 * Coda del giorno e cap adattivo dei nuovi item (§3.1).
 */
import type { Card, Item, Settings } from '../types';
import { createScheduler, retrievabilityWith } from './fsrs';
import { bySiblingDirection, canPresent } from './unlock';

/**
 * Soglie della specifica, tarate su un obiettivo di 20 minuti al giorno.
 * Restano i default esatti; vengono scalate sull'obiettivo reale perché con un
 * obiettivo di 10 minuti si annega già a 30 card dovute, e con 45 minuti 60
 * card sono una sessione normale, non un'emergenza.
 */
export const CAP_REFERENCE_GOAL_MIN = 20;
export const CAP_ZERO_THRESHOLD = 60;
export const CAP_HALVE_THRESHOLD = 40;

export type CapReason = 'none' | 'halved' | 'zeroed';

export interface NewItemAllowance {
  allowance: number;
  reason: CapReason;
  zeroThreshold: number;
  halveThreshold: number;
}

function scaleThreshold(base: number, dailyGoalMin: number): number {
  const scaled = Math.round((base * dailyGoalMin) / CAP_REFERENCE_GOAL_MIN);
  return Math.max(10, scaled);
}

/**
 * Quanti item nuovi si possono introdurre oggi.
 *
 * Il debito di review uccide la costanza molto più della lentezza del
 * progresso: chi apre l'app e trova 120 card dovute smette, chi trova 15 card e
 * nessun item nuovo torna domani.
 */
export function adaptiveNewItemCap(
  dueCount: number,
  settings: Settings,
  introducedToday = 0,
): NewItemAllowance {
  const zeroThreshold = scaleThreshold(CAP_ZERO_THRESHOLD, settings.dailyGoalMin);
  const halveThreshold = scaleThreshold(CAP_HALVE_THRESHOLD, settings.dailyGoalMin);

  let budget = settings.maxNewItemsPerDay;
  let reason: CapReason = 'none';

  if (dueCount > zeroThreshold) {
    budget = 0;
    reason = 'zeroed';
  } else if (dueCount >= halveThreshold) {
    budget = Math.floor(settings.maxNewItemsPerDay / 2);
    reason = 'halved';
  }

  return {
    allowance: Math.max(0, budget - introducedToday),
    reason,
    zeroThreshold,
    halveThreshold,
  };
}

export interface DueCard {
  card: Card;
  item: Item;
  /** 0-1. Più è bassa, più il richiamo è urgente. */
  retrievability: number;
}

export interface DueQueueInput {
  cards: Card[];
  itemsById: ReadonlyMap<string, Item>;
  now: number;
  settings: Settings;
  weights?: number[] | null;
}

/**
 * Tutte le card dovute, ordinate per urgenza (retrievability crescente).
 *
 * Il filtro di presentabilità gira qui e non solo al momento dello sblocco:
 * una card `production` il cui riconoscimento è appena crollato sotto i 7
 * giorni di stability non deve comparire, anche se il flag `unlocked` è vero.
 */
export function getDueQueue({ cards, itemsById, now, settings, weights }: DueQueueInput): DueCard[] {
  // Una sola istanza FSRS per l'intera coda: costruirne una per card è
  // ricalcolare i parametri qualche centinaio di volte per niente.
  const scheduler = createScheduler(settings, weights);
  const byItem = new Map<string, Card[]>();
  for (const card of cards) {
    const list = byItem.get(card.itemId);
    if (list) list.push(card);
    else byItem.set(card.itemId, [card]);
  }

  const out: DueCard[] = [];
  for (const [itemId, itemCards] of byItem) {
    const item = itemsById.get(itemId);
    if (!item) continue;
    const siblings = bySiblingDirection(itemCards);

    for (const card of itemCards) {
      if (!card.unlocked || card.suspended) continue;
      if (card.due > now) continue;
      if (!canPresent(card, siblings)) continue;
      out.push({ card, item, retrievability: retrievabilityWith(scheduler, card, now) });
    }
  }

  return out.sort((a, b) => {
    if (a.retrievability !== b.retrievability) return a.retrievability - b.retrievability;
    // A parità di urgenza, prima la card scaduta da più tempo.
    return a.card.due - b.card.due;
  });
}

/** Quante card entrano nel tempo disponibile, stimando ~9 secondi per card. */
export const SECONDS_PER_CARD = 9;

export function cardsPerPhase(dailyGoalMin: number, phaseShare: number): number {
  return Math.max(1, Math.floor((dailyGoalMin * 60 * phaseShare) / SECONDS_PER_CARD));
}
