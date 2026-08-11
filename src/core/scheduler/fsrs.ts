/**
 * Wrapper su ts-fsrs. Nessuna implementazione di SM-2 fatta a mano.
 *
 * Un chiarimento onesto su cosa fa e cosa NON fa questa dipendenza: ts-fsrs
 * APPLICA i pesi FSRS, non li STIMA dal log dei review. La personalizzazione
 * che si ottiene è quella per-item (stability e difficulty evolvono per ogni
 * card in base alla sua storia), che è già molto più di un Leitner a intervalli
 * fissi. La personalizzazione per-UTENTE — rifittare i 19 pesi sui review di
 * quella persona, cioè quello che descrive Tabibian et al. 2019 — richiede un
 * ottimizzatore separato e circa un migliaio di review prima di dire qualcosa
 * di non rumoroso. `settings.fsrsWeights` esiste per quel giorno; finché è
 * null l'app usa i pesi di default e non deve raccontare all'utente di essersi
 * adattata a lui.
 */
import { type Card as FsrsCard, type CardInput, FSRS, type Grade as FsrsGrade, State, fsrs } from 'ts-fsrs';
import { type Card, type CardState, type Direction, type Grade, RETENTION_MAX, RETENTION_MIN, type Settings } from '../types';
import { DAY_MS, daysBetween } from './day';

export function clampRetention(value: number): number {
  return Math.min(RETENTION_MAX, Math.max(RETENTION_MIN, value));
}

/**
 * Costruisce l'istanza FSRS a partire dalle impostazioni.
 *
 * `enable_short_term: false` è una scelta deliberata. Con gli step brevi
 * attivi, FSRS ripropone la card dopo 1 e 10 minuti dentro la stessa sessione.
 * Ma la seconda esposizione intra-giornaliera prevista dalla specifica (§3.1)
 * sta a 90-120 minuti ed è gestita fuori dal ciclo FSRS: lasciare attivi
 * entrambi i meccanismi significa farli litigare, e per giunta un richiamo a
 * distanza di un minuto è memoria di lavoro, non recupero dalla memoria a
 * lungo termine — cioè l'opposto di quello che l'app deve allenare.
 */
export function createScheduler(settings: Settings, weights?: number[] | null): FSRS {
  return fsrs({
    request_retention: clampRetention(settings.desiredRetention),
    enable_short_term: false,
    learning_steps: [],
    relearning_steps: [],
    enable_fuzz: true,
    ...(weights && weights.length > 0 ? { w: weights } : {}),
  });
}

/** Card appena creata: `New`, dovuta subito, ancora senza storia. */
export function createCard(itemId: string, direction: Direction, now: number, unlocked: boolean): Card {
  return {
    id: `${itemId}::${direction}`,
    itemId,
    direction,
    unlocked,
    introducedAt: now,
    stability: 0,
    difficulty: 0,
    due: now,
    reps: 0,
    lapses: 0,
    state: 0 as CardState,
    lastReview: null,
    scheduledDays: 0,
    learningSteps: 0,
    sameDayReinforcementDue: null,
    suspended: false,
  };
}

function toFsrsCard(card: Card, now: number): CardInput {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.lastReview === null ? 0 : Math.max(0, daysBetween(card.lastReview, now)),
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as unknown as State,
    last_review: card.lastReview === null ? undefined : new Date(card.lastReview),
  };
}

function fromFsrsCard(base: Card, updated: FsrsCard, settings: Settings): Card {
  const lapses = updated.lapses;
  return {
    ...base,
    stability: updated.stability,
    difficulty: updated.difficulty,
    due: updated.due.getTime(),
    reps: updated.reps,
    lapses,
    state: updated.state as unknown as CardState,
    lastReview: updated.last_review ? updated.last_review.getTime() : base.lastReview,
    scheduledDays: updated.scheduled_days,
    learningSteps: updated.learning_steps,
    // Leech: un item che continua a cadere avvelena la coda all'infinito.
    // Sospenderlo non è arrendersi, è toglierlo dal giro finché non lo si
    // riformula (contesto diverso, chunk diverso).
    suspended: base.suspended || lapses >= settings.leechLapseThreshold,
  };
}

export interface ReviewOutcome {
  card: Card;
  /** Intervallo assegnato, in giorni. Serve alla schermata di consolidamento. */
  intervalDays: number;
}

/** Applica un voto e restituisce la card aggiornata. Non muta l'input. */
export function applyReview(
  card: Card,
  grade: Grade,
  now: number,
  settings: Settings,
  weights?: number[] | null,
): ReviewOutcome {
  const scheduler = createScheduler(settings, weights);
  const { card: updated } = scheduler.next(toFsrsCard(card, now), new Date(now), grade as unknown as FsrsGrade);
  const next = fromFsrsCard(card, updated, settings);
  return { card: next, intervalDays: Math.max(0, (next.due - now) / DAY_MS) };
}

/**
 * Probabilità stimata di ricordare la card adesso, 0-1.
 * Una card mai vista ha retrievability 0: non è "dimenticata", è ignota, ma
 * ai fini dell'ordinamento per urgenza il trattamento è lo stesso.
 */
export function retrievabilityWith(scheduler: FSRS, card: Card, now: number): number {
  if (card.state === (State.New as unknown as CardState) || card.reps === 0) return 0;
  return scheduler.get_retrievability(toFsrsCard(card, now), new Date(now), false);
}

export function retrievability(card: Card, now: number, settings: Settings, weights?: number[] | null): number {
  return retrievabilityWith(createScheduler(settings, weights), card, now);
}

/** Anteprima degli intervalli per i quattro voti. Usata dal pannello diagnostico. */
export function previewIntervals(
  card: Card,
  now: number,
  settings: Settings,
  weights?: number[] | null,
): Record<Grade, number> {
  const scheduler = createScheduler(settings, weights);
  const preview = scheduler.repeat(toFsrsCard(card, now), new Date(now));
  const out = {} as Record<Grade, number>;
  for (const grade of [1, 2, 3, 4] as Grade[]) {
    out[grade] = Math.max(0, (preview[grade as unknown as FsrsGrade].card.due.getTime() - now) / DAY_MS);
  }
  return out;
}
