/**
 * Seconda esposizione intra-giornaliera (§3.1).
 *
 * Ogni item nuovo torna una seconda volta dopo 90-120 minuti. Vive FUORI dal
 * ciclo FSRS: il review viene loggato ma non aggiorna stability e difficulty.
 * Il motivo è che FSRS modella l'oblio su scala di giorni; un richiamo a
 * distanza di 90 minuti, dato in pasto a `next()`, produrrebbe una stima di
 * stability deformata verso il basso e accorcerebbe tutti gli intervalli
 * successivi. Lo spacing intra-giornaliero serve a consolidare la traccia
 * appena formata, non a misurarla.
 */
import type { Card } from '../types';
import { endOfLogicalDay } from './day';

export const SAME_DAY_MIN_MS = 90 * 60 * 1000;
export const SAME_DAY_MAX_MS = 120 * 60 * 1000;

export type Rng = () => number;

/**
 * Programma il rinforzo. Restituisce `sameDayReinforcementDue = null` se la
 * finestra cadrebbe oltre il confine della giornata logica: meglio saltarlo che
 * far comparire una notifica alle 5 del mattino.
 */
export function scheduleSameDayReinforcement(
  card: Card,
  now: number,
  rolloverHour = 4,
  rng: Rng = Math.random,
): Card {
  const delay = SAME_DAY_MIN_MS + rng() * (SAME_DAY_MAX_MS - SAME_DAY_MIN_MS);
  const due = Math.round(now + delay);
  if (due >= endOfLogicalDay(now, rolloverHour)) {
    return { ...card, sameDayReinforcementDue: null };
  }
  return { ...card, sameDayReinforcementDue: due };
}

export function dueSameDayReinforcements(cards: Card[], now: number): Card[] {
  return cards
    .filter((c) => c.sameDayReinforcementDue !== null && c.sameDayReinforcementDue <= now && !c.suspended)
    .sort((a, b) => (a.sameDayReinforcementDue ?? 0) - (b.sameDayReinforcementDue ?? 0));
}

export function clearSameDayReinforcement(card: Card): Card {
  return { ...card, sameDayReinforcementDue: null };
}

/**
 * Il rinforzo non tocca lo stato FSRS. L'unica cosa che cambia sulla card è che
 * il promemoria si spegne; il risultato della risposta finisce nel log dei
 * review (con `sameDayReinforcement: true`) e nel profilo errori.
 */
export function applySameDayReinforcement(card: Card): Card {
  return clearSameDayReinforcement(card);
}
