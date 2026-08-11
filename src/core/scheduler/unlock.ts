/**
 * Sblocco progressivo delle direzioni (§3.1).
 *
 * Chiedere la produzione di un item che si riconosce a malapena non insegna a
 * produrre: insegna a fallire. La produzione si apre solo quando il
 * riconoscimento ha una stability sopra i 7 giorni, cioè quando la traccia
 * regge davvero una settimana.
 *
 * Nota su `unlocked` vs presentabilità: `unlocked` è appiccicoso (una volta
 * aperto, resta aperto) perché una direzione che compare e scompare dalla UI è
 * incomprensibile. Ma la presentabilità viene ricontrollata a ogni costruzione
 * della coda: se un lapse fa crollare la stability del riconoscimento sotto la
 * soglia, la card di produzione smette di essere proposta finché non risale.
 */
import type { Card, Direction, Item } from '../types';

export const PRODUCTION_UNLOCK_STABILITY_DAYS = 7;
export const SPEAKING_UNLOCK_STABILITY_DAYS = 7;

export interface DirectionGate {
  /** Direzione prerequisito. `null` = nessun prerequisito. */
  requires: Direction | null;
  /** Stability minima (giorni, esclusiva) del prerequisito. `null` = si sblocca insieme. */
  minStabilityDays: number | null;
}

export const DIRECTION_GATES: Record<Direction, DirectionGate> = {
  recognition: { requires: null, minStabilityDays: null },
  gender: { requires: 'recognition', minStabilityDays: null },
  listening: { requires: 'recognition', minStabilityDays: null },
  production: { requires: 'recognition', minStabilityDays: PRODUCTION_UNLOCK_STABILITY_DAYS },
  speaking: { requires: 'production', minStabilityDays: SPEAKING_UNLOCK_STABILITY_DAYS },
};

/** Le direzioni che ha senso creare per un item. `gender` solo per i sostantivi. */
export function directionsForItem(item: Item): Direction[] {
  const base: Direction[] = ['recognition', 'listening', 'production', 'speaking'];
  return item.type === 'noun' ? ['recognition', 'gender', ...base.slice(1)] : base;
}

export function bySiblingDirection(cards: Card[]): Map<Direction, Card> {
  const map = new Map<Direction, Card>();
  for (const card of cards) map.set(card.direction, card);
  return map;
}

/**
 * La card può essere proposta adesso? Valutato sulle card sorelle dello stesso
 * item, non sul flag `unlocked`.
 */
export function canPresent(card: Card, siblings: Map<Direction, Card>): boolean {
  if (card.suspended) return false;

  const gate = DIRECTION_GATES[card.direction];
  if (gate.requires === null) return true;

  const prerequisite = siblings.get(gate.requires);
  if (!prerequisite) return false;
  if (gate.minStabilityDays === null) return true;

  return prerequisite.stability > gate.minStabilityDays;
}

/**
 * Direzioni che soddisfano il gate e vanno marcate `unlocked` adesso.
 * Restituisce solo quelle ancora chiuse, così il chiamante scrive il minimo.
 */
export function directionsToUnlock(cards: Card[]): Direction[] {
  const siblings = bySiblingDirection(cards);
  const out: Direction[] = [];
  for (const card of cards) {
    if (card.unlocked) continue;
    if (canPresent(card, siblings)) out.push(card.direction);
  }
  return out;
}
