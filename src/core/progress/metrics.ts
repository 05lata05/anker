/**
 * Metriche di progresso (§6, §7.5).
 *
 * Regola che governa tutto questo file: si misura la ritenzione a lungo
 * termine, non l'attività. Numero di esercizi fatti, minuti passati nell'app,
 * risposte esatte nella sessione — sono tutte metriche che salgono facendo cose
 * facili, e che quindi premiano il comportamento sbagliato.
 */
import { DAY_MS, logicalDay, previousLogicalDay } from '../scheduler/day';
import type { Card, Cefr, DayLog, Item } from '../types';

/**
 * Un item è «ancorato» quando la sua traccia regge un mese.
 * È l'unica metrica in home perché è l'unica che non si può gonfiare: nessuna
 * quantità di esercizi fatti oggi sposta una stability a 30 giorni.
 */
export const ANCHOR_STABILITY_DAYS = 30;

export function countAnchors(cards: readonly Card[]): number {
  const anchored = new Set<string>();
  for (const card of cards) {
    if (card.direction === 'recognition' && card.stability >= ANCHOR_STABILITY_DAYS) anchored.add(card.itemId);
  }
  return anchored.size;
}

// ---------------------------------------------------------------------------
// Streak
// ---------------------------------------------------------------------------

export interface StreakResult {
  current: number;
  longest: number;
  /** true se oggi la coda è già stata svuotata: la catena è al sicuro. */
  todayDone: boolean;
  /** Giorni salvati da uno streak freeze nella catena corrente. */
  frozenDays: number;
}

/**
 * Streak = giorni consecutivi in cui la coda di review è stata SVUOTATA (§6).
 *
 * Non è «giorni in cui hai aperto l'app» e non è XP: chi fa duecento esercizi
 * facili non deve battere chi ne fa venti dovuti. Un giorno coperto da un
 * freeze non spezza la catena ma non la allunga: protegge l'abitudine senza
 * regalare progresso.
 *
 * La giornata corrente non conta come rottura finché non è finita — altrimenti
 * lo streak risulterebbe azzerato ogni mattina fino alla sessione.
 */
export function computeStreak(dayLogs: readonly DayLog[], now: number, rolloverHour = 4): StreakResult {
  const byDay = new Map(dayLogs.map((log) => [log.day, log]));
  const today = logicalDay(now, rolloverHour);
  const todayDone = byDay.get(today)?.queueCleared === true;

  let current = 0;
  let frozenDays = 0;
  let cursor = todayDone ? today : previousLogicalDay(today);

  while (true) {
    const log = byDay.get(cursor);
    if (log?.queueCleared) current += 1;
    else if (log?.frozen) frozenDays += 1;
    else break;
    cursor = previousLogicalDay(cursor);
  }

  const sorted = [...dayLogs].sort((a, b) => a.day.localeCompare(b.day));
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const log of sorted) {
    const contiguous = previous === null || previousLogicalDay(log.day) === previous;
    if (!contiguous) run = 0;
    if (log.queueCleared) run += 1;
    else if (!log.frozen) run = 0;
    longest = Math.max(longest, run);
    previous = log.day;
  }

  return { current, longest: Math.max(longest, current), todayDone, frozenDays };
}

export const STREAK_FREEZES_PER_MONTH = 2;

export interface FreezeDecision {
  /** Giornata da coprire col freeze, `null` se non serve o non si può. */
  day: string | null;
  reason: 'not_needed' | 'no_streak_to_protect' | 'no_freezes_left' | 'consume';
}

/**
 * Decide se bruciare uno streak freeze per il giorno appena saltato (§6).
 *
 * Protegge l'abitudine da un giorno perso, che è la prima causa di abbandono.
 * Ma solo se c'era davvero una catena da proteggere: regalarlo a chi non ha
 * mai studiato non protegge niente e svuota la riserva prima che serva.
 */
export function decideStreakFreeze(
  dayLogs: readonly DayLog[],
  now: number,
  freezesLeft: number,
  rolloverHour = 4,
): FreezeDecision {
  const missed = previousLogicalDay(logicalDay(now, rolloverHour));
  const byDay = new Map(dayLogs.map((log) => [log.day, log]));
  const missedLog = byDay.get(missed);

  if (missedLog?.queueCleared || missedLog?.frozen) return { day: null, reason: 'not_needed' };

  const beforeMissed = byDay.get(previousLogicalDay(missed));
  if (!beforeMissed?.queueCleared && !beforeMissed?.frozen) {
    return { day: null, reason: 'no_streak_to_protect' };
  }

  if (freezesLeft <= 0) return { day: null, reason: 'no_freezes_left' };

  return { day: missed, reason: 'consume' };
}

/** Mese corrente in formato YYYY-MM, per il ripristino mensile dei freeze. */
export function currentFreezeMonth(now: number, rolloverHour = 4): string {
  return logicalDay(now, rolloverHour).slice(0, 7);
}

// ---------------------------------------------------------------------------
// Copertura per frequenza
// ---------------------------------------------------------------------------

/**
 * Le prime 2.000 parole per frequenza coprono circa l'80% di un testo corrente.
 * È il traguardo che rende il tedesco leggibile senza dizionario a ogni riga.
 */
export const FREQUENCY_TARGET = 2000;

export interface FrequencyCoverage {
  known: number;
  target: number;
  /** Frazione 0-1 della fascia coperta. */
  fraction: number;
  /** Item noto col rango più alto raggiunto finora. */
  deepestRank: number;
}

/**
 * Approssimazione dichiarata: si conta quanti ITEM noti stanno nella fascia dei
 * primi 2.000 ranghi, non quante parole-tipo distinte. L'unità di apprendimento
 * qui è il chunk, quindi un item può portare più parole e il conteggio
 * sottostima la copertura reale. Meglio sottostimare che vendere progresso.
 */
export function frequencyCoverage(knownItems: readonly Item[], target = FREQUENCY_TARGET): FrequencyCoverage {
  const inBand = knownItems.filter((item) => item.freqRank <= target);
  const deepestRank = inBand.reduce((max, item) => Math.max(max, item.freqRank), 0);
  return { known: inBand.length, target, fraction: inBand.length / target, deepestRank };
}

// ---------------------------------------------------------------------------
// Livello stimato
// ---------------------------------------------------------------------------

const CEFR_THRESHOLDS: readonly { level: Cefr; anchors: number }[] = [
  { level: 'B2', anchors: 1600 },
  { level: 'B1', anchors: 800 },
  { level: 'A2', anchors: 300 },
  { level: 'A1', anchors: 0 },
];

/**
 * Stima del livello CEFR dagli ancoraggi. È una STIMA, e la UI deve dirlo:
 * il CEFR misura anche produzione, interazione e strategie che questa app non
 * osserva. Serve a dare un ordine di grandezza, non a certificare niente.
 */
export function estimateCefr(anchors: number): Cefr {
  return CEFR_THRESHOLDS.find((threshold) => anchors >= threshold.anchors)?.level ?? 'A1';
}

// ---------------------------------------------------------------------------
// Curva di ritenzione
// ---------------------------------------------------------------------------

export interface RetentionPoint {
  days: number;
  retrievability: number;
}

/**
 * Curva dell'oblio per una card, dal suo ultimo review in avanti.
 * Formula FSRS-5 con decay 0,5, ricalcolata qui per non dover istanziare uno
 * scheduler solo per disegnare un grafico.
 */
export function retentionCurve(card: Card, horizonDays: number, points = 40): RetentionPoint[] {
  if (card.stability <= 0 || card.lastReview === null) return [];

  const decay = -0.5;
  const factor = 0.9 ** (1 / decay) - 1;

  return Array.from({ length: points + 1 }, (_, i) => {
    const days = (i / points) * horizonDays;
    return { days, retrievability: (1 + (factor * days) / card.stability) ** decay };
  });
}

/** Giorni che mancano perché la card scenda alla retention desiderata. */
export function daysUntilDue(card: Card, now: number): number {
  return Math.max(0, (card.due - now) / DAY_MS);
}

// ---------------------------------------------------------------------------
// Successi ritardati
// ---------------------------------------------------------------------------

export interface DelayedSuccess {
  itemId: string;
  /** Giorni trascorsi dall'ultimo richiamo prima di questo. */
  gapDays: number;
}

/**
 * «Hai ricordato *die Verabredung* dopo 42 giorni» (§6).
 *
 * È l'unica celebrazione che l'app si concede, perché è l'unica che corrisponde
 * a un fatto interessante: la memoria a lungo termine ha tenuto. Celebrare
 * l'accuratezza della singola sessione premierebbe il materiale facile.
 */
export const DELAYED_SUCCESS_MIN_DAYS = 21;

export function findDelayedSuccesses(
  reviews: readonly { cardId: string; ts: number; wasCorrect: boolean }[],
  cardsById: ReadonlyMap<string, Card>,
  minGapDays = DELAYED_SUCCESS_MIN_DAYS,
): DelayedSuccess[] {
  const lastSeen = new Map<string, number>();
  const out: DelayedSuccess[] = [];

  for (const review of [...reviews].sort((a, b) => a.ts - b.ts)) {
    const previous = lastSeen.get(review.cardId);
    lastSeen.set(review.cardId, review.ts);
    if (previous === undefined || !review.wasCorrect) continue;

    const gapDays = (review.ts - previous) / DAY_MS;
    if (gapDays < minGapDays) continue;

    const card = cardsById.get(review.cardId);
    if (card) out.push({ itemId: card.itemId, gapDays: Math.round(gapDays) });
  }

  return out.sort((a, b) => b.gapDays - a.gapDays);
}
