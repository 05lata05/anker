/**
 * Derivazione del voto FSRS da correttezza + latenza (§4, Fase 1).
 *
 * Non si chiede all'utente di autovalutarsi con quattro bottoni: è attrito, ed
 * è inaffidabile. Ma la latenza grezza non è confrontabile tra formati di card:
 * digitare «Ich hätte gern einen Kaffee» costa più di 8 secondi di sola
 * meccanica di battitura, e con le soglie applicate al tempo totale OGNI card
 * di produzione finirebbe `Hard`, accorciando gli intervalli e gonfiando il
 * debito di review fino a soffocare l'utente.
 *
 * Quindi: le soglie della specifica restano quelle, ma si applicano alla
 * latenza NORMALIZZATA, cioè al tempo di pensiero al netto del tempo di
 * battitura stimato.
 */
import type { Direction } from '../types';
import { Rating } from '../types';
import type { Grade } from '../types';

export const RATING_THRESHOLDS = {
  /** Sotto questa soglia il richiamo è automatico: Easy. */
  easyMs: 3_000,
  /** Fino a questa soglia il richiamo è fluido ma non automatico: Good. */
  goodMs: 8_000,
} as const;

/**
 * Caratteri al secondo di battitura su tastiera mobile. 3,5 cps ≈ 42 wpm, che
 * è nella fascia alta della digitazione su telefono: sottostimare il tempo
 * meccanico è l'errore prudente, perché regala Hard invece di regalare Easy.
 */
export const DEFAULT_TYPING_CPS = 3.5;

/**
 * Oltre un minuto non stiamo più misurando difficoltà di richiamo ma
 * un'interruzione (una telefonata, l'app in background). Il valore viene
 * troncato: resta `Hard`, non diventa un dato assurdo nel log.
 */
export const MAX_PLAUSIBLE_LATENCY_MS = 60_000;

/** Direzioni in cui l'utente digita e il tempo meccanico va scorporato. */
const TYPED_DIRECTIONS: ReadonlySet<Direction> = new Set<Direction>(['production']);

export interface RatingInput {
  wasCorrect: boolean;
  latencyMs: number;
  direction: Direction;
  /** Lunghezza della risposta attesa in caratteri; serve solo per le direzioni digitate. */
  expectedLength?: number;
  /** L'utente ha chiesto un suggerimento prima di rispondere. */
  usedHint?: boolean;
  /**
   * Il voto viene da un'auto-valutazione binaria (speaking senza ASR). In quel
   * caso la latenza misura la durata della registrazione, non il richiamo:
   * usarla sarebbe rumore travestito da segnale.
   */
  selfAssessed?: boolean;
  /** Solo se misurata sull'utente; altrimenti si usa il default. */
  typingCps?: number;
}

export interface DerivedRating {
  rating: Grade;
  /** Latenza al netto del tempo di battitura, troncata agli outlier. */
  normalizedLatencyMs: number;
  /** Perché è uscito quel voto. Va nel log e nel pannello diagnostico. */
  reason: 'wrong' | 'self_assessed' | 'hint' | 'fast' | 'fluent' | 'slow';
}

export function normalizeLatency(input: RatingInput): number {
  const raw = Math.max(0, input.latencyMs);
  let ms = raw;

  if (TYPED_DIRECTIONS.has(input.direction) && input.expectedLength) {
    const cps = input.typingCps && input.typingCps > 0 ? input.typingCps : DEFAULT_TYPING_CPS;
    const mechanicalMs = (input.expectedLength / cps) * 1000;
    ms = Math.max(0, raw - mechanicalMs);
  }

  return Math.min(ms, MAX_PLAUSIBLE_LATENCY_MS);
}

export function deriveRating(input: RatingInput): DerivedRating {
  const normalizedLatencyMs = normalizeLatency(input);

  if (!input.wasCorrect) {
    return { rating: Rating.Again, normalizedLatencyMs, reason: 'wrong' };
  }

  // Un'auto-valutazione non può produrre `Easy`: l'utente non è un giudice
  // affidabile della propria pronuncia, e regalare intervalli lunghi su una
  // valutazione debole è il modo più veloce per perdere l'item.
  if (input.selfAssessed) {
    return { rating: Rating.Good, normalizedLatencyMs, reason: 'self_assessed' };
  }

  if (input.usedHint) {
    return { rating: Rating.Hard, normalizedLatencyMs, reason: 'hint' };
  }

  if (normalizedLatencyMs < RATING_THRESHOLDS.easyMs) {
    return { rating: Rating.Easy, normalizedLatencyMs, reason: 'fast' };
  }
  if (normalizedLatencyMs <= RATING_THRESHOLDS.goodMs) {
    return { rating: Rating.Good, normalizedLatencyMs, reason: 'fluent' };
  }
  return { rating: Rating.Hard, normalizedLatencyMs, reason: 'slow' };
}
