/**
 * Formato di esercizio per ogni card della Fase 1 (§4).
 *
 * La regola non negoziabile: il quiz a scelta multipla non può essere il
 * formato dominante. Riconoscere la risposta giusta tra quattro opzioni è
 * riconoscimento, non richiamo — costa poco, si sbaglia poco, e non trasferisce
 * quasi nulla alla produzione. Almeno il 60% delle card deve chiedere di
 * produrre: digitare o parlare.
 *
 * Le due eccezioni previste dalla specifica, e nessun'altra:
 * - la card `gender`, che è per costruzione una scelta tra der/die/das;
 * - i primi giorni di vita di un item, quando non c'è ancora niente da
 *   recuperare e la scelta multipla serve a costruire la traccia iniziale.
 */
import { DAY_MS } from '../scheduler/day';
import type { Card, Direction } from '../types';

export type ExerciseFormat = 'typed' | 'spoken' | 'choice';

/** Finestra in cui la scelta multipla è ancora tollerata su un item nuovo. */
export const CHOICE_GRACE_DAYS = 3;

/** Quota minima di card che richiedono produzione. */
export const MIN_PRODUCTION_SHARE = 0.6;

const PRODUCTIVE: ReadonlySet<ExerciseFormat> = new Set<ExerciseFormat>(['typed', 'spoken']);

export function isProductive(format: ExerciseFormat): boolean {
  return PRODUCTIVE.has(format);
}

const NATURAL_FORMAT: Record<Direction, ExerciseFormat> = {
  gender: 'choice',
  speaking: 'spoken',
  production: 'typed',
  recognition: 'typed',
  listening: 'typed',
};

export function naturalFormat(card: Card, now: number): ExerciseFormat {
  if (card.direction === 'gender') return 'choice';
  if (card.direction === 'speaking') return 'spoken';
  if (card.direction === 'production') return 'typed';

  const ageDays = (now - card.introducedAt) / DAY_MS;
  if (ageDays < CHOICE_GRACE_DAYS) return 'choice';
  return NATURAL_FORMAT[card.direction];
}

export interface FormatAssignment<T> {
  card: T;
  format: ExerciseFormat;
  /** true se il formato è stato irrigidito per rispettare la quota del 60%. */
  upgraded: boolean;
}

export interface FormatResult<T> {
  assignments: FormatAssignment<T>[];
  productionShare: number;
}

/**
 * Assegna i formati e poi, se la quota produttiva non arriva al 60%, irrigidisce
 * le card in periodo di grazia — dalla più vecchia alla più recente, perché è
 * quella che ha avuto più tempo per consolidarsi. La card `gender` non viene
 * mai toccata: non esiste una versione digitata di «der/die/das».
 */
export function assignFormats<T extends { card: Card }>(
  queue: readonly T[],
  now: number,
  minShare = MIN_PRODUCTION_SHARE,
): FormatResult<T> {
  const assignments: FormatAssignment<T>[] = queue.map((entry) => ({
    card: entry,
    format: naturalFormat(entry.card, now),
    upgraded: false,
  }));

  if (assignments.length === 0) return { assignments, productionShare: 1 };

  const target = Math.ceil(assignments.length * minShare);
  let productive = assignments.filter((a) => isProductive(a.format)).length;

  if (productive < target) {
    const upgradable = assignments
      .filter((a) => a.format === 'choice' && a.card.card.direction !== 'gender')
      .sort((a, b) => a.card.card.introducedAt - b.card.card.introducedAt);

    for (const assignment of upgradable) {
      if (productive >= target) break;
      assignment.format = NATURAL_FORMAT[assignment.card.card.direction];
      assignment.upgraded = true;
      productive += 1;
    }
  }

  return { assignments, productionShare: productive / assignments.length };
}
