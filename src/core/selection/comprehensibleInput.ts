/**
 * Selettore di input comprensibile a i+1 (§3.3).
 *
 * Sotto il 92% di copertura il testo smette di essere input e diventa un muro:
 * l'attenzione va tutta alla decodifica e non resta niente per l'acquisizione.
 * Sopra il 99% non si impara nulla di nuovo. La finestra utile è stretta, e la
 * soglia del 95-98% viene da Hu & Nation 2000.
 */
import type { Item, Lesson } from '../types';

export const COVERAGE_MIN = 0.92;
export const COVERAGE_MAX = 0.99;
export const IDEAL_MIN = 0.95;
export const IDEAL_MAX = 0.98;

/** Un item conta come "noto" se la probabilità di richiamo supera questa soglia. */
export const KNOWN_RETRIEVABILITY = 0.8;

/**
 * Scala di ripiego.
 *
 * Senza, il selettore è rotto a freddo: con 60 item in memoria NESSUNA lezione
 * raggiunge il 92% di copertura, `pickLesson` restituirebbe sempre `null` e la
 * Fase 2 resterebbe vuota per settimane — proprio quando l'input serve di più.
 * Si scende di soglia finché qualcosa qualifica, e la UI dichiara che la
 * lezione è sopra il livello invece di fingere che sia a i+1.
 */
export const RELAXATION_LADDER = [COVERAGE_MIN, 0.85, 0.75, 0.6, 0] as const;

const PUNCTUATION = /[.,!?;:„“”"'’()[\]»«…\-–—]/g;

export function tokenize(text: string): string[] {
  return text.toLowerCase().replace(PUNCTUATION, ' ').split(/\s+/).filter(Boolean);
}

/**
 * Insieme dei token noti, ricavato dai testi degli item padroneggiati.
 *
 * Approssimazione dichiarata: la copertura è calcolata sui token, ma il modello
 * di memoria vive sugli item. Un token conta come noto se compare dentro almeno
 * un item la cui retrievability supera la soglia. Le parole funzionali (der,
 * ist, und, ich) entrano gratis perché stanno dentro i chunk già noti — che è
 * esattamente il motivo per cui l'unità di apprendimento è il chunk.
 */
export function buildKnownTokens(knownItems: Iterable<Item>): Set<string> {
  const tokens = new Set<string>();
  for (const item of knownItems) {
    for (const token of tokenize(item.de)) tokens.add(token);
    if (item.plural) for (const token of tokenize(item.plural)) tokens.add(token);
  }
  return tokens;
}

export interface CoverageResult {
  coverage: number;
  unknownTokens: string[];
  totalTokens: number;
}

export function lessonCoverage(lesson: Lesson, knownTokens: ReadonlySet<string>): CoverageResult {
  const tokens = lesson.lines.flatMap((line) => tokenize(line.de));
  if (tokens.length === 0) return { coverage: 1, unknownTokens: [], totalTokens: 0 };

  const unknown: string[] = [];
  let known = 0;
  for (const token of tokens) {
    if (knownTokens.has(token)) known += 1;
    else unknown.push(token);
  }

  return { coverage: known / tokens.length, unknownTokens: unknown, totalTokens: tokens.length };
}

export interface LessonCandidate {
  lesson: Lesson;
  coverage: number;
  unknownTokens: string[];
  /** Target della lezione non ancora noti: è ciò che la lezione insegna. */
  newItemIds: string[];
  /** freqRank più basso tra i target nuovi. `Infinity` se non ne introduce. */
  bestNewFreqRank: number;
}

export interface PickLessonInput {
  lessons: readonly Lesson[];
  itemsById: ReadonlyMap<string, Item>;
  /** Item con retrievability > 0,8: vedi `KNOWN_RETRIEVABILITY`. */
  knownItemIds: ReadonlySet<string>;
  /** Lezioni già viste: deprioritizzate, non escluse. */
  seenLessonIds?: ReadonlySet<string>;
}

export interface LessonPick extends LessonCandidate {
  /** Soglia minima effettivamente usata. Se > `COVERAGE_MIN`, non c'è stato ripiego. */
  appliedMinCoverage: number;
  relaxed: boolean;
  alreadySeen: boolean;
}

export function evaluateLessons(input: PickLessonInput): LessonCandidate[] {
  const knownItems: Item[] = [];
  for (const id of input.knownItemIds) {
    const item = input.itemsById.get(id);
    if (item) knownItems.push(item);
  }
  const knownTokens = buildKnownTokens(knownItems);

  return input.lessons.map((lesson) => {
    const { coverage, unknownTokens } = lessonCoverage(lesson, knownTokens);
    const newItemIds = lesson.targetItemIds.filter((id) => !input.knownItemIds.has(id));
    const ranks = newItemIds
      .map((id) => input.itemsById.get(id)?.freqRank)
      .filter((rank): rank is number => typeof rank === 'number');

    return {
      lesson,
      coverage,
      unknownTokens,
      newItemIds,
      bestNewFreqRank: ranks.length > 0 ? Math.min(...ranks) : Number.POSITIVE_INFINITY,
    };
  });
}

const IDEAL_CENTER = (IDEAL_MIN + IDEAL_MAX) / 2;

/**
 * Sceglie la lezione che massimizza l'apprendimento a i+1.
 *
 * A parità di ammissibilità vince la lezione che introduce l'item più
 * frequente: sotto la legge di Zipf le prime 2.000 parole coprono circa l'80%
 * dei testi, quindi un item raro vale una frazione di un item comune.
 */
export function pickLesson(input: PickLessonInput): LessonPick | null {
  const candidates = evaluateLessons(input);
  const seen = input.seenLessonIds ?? new Set<string>();

  for (const minCoverage of RELAXATION_LADDER) {
    const eligible = candidates.filter((c) => c.coverage >= minCoverage && c.coverage <= COVERAGE_MAX);
    if (eligible.length === 0) continue;

    const best = eligible.sort((a, b) => {
      const aSeen = seen.has(a.lesson.id) ? 1 : 0;
      const bSeen = seen.has(b.lesson.id) ? 1 : 0;
      if (aSeen !== bSeen) return aSeen - bSeen;

      const aIdeal = a.coverage >= IDEAL_MIN && a.coverage <= IDEAL_MAX ? 0 : 1;
      const bIdeal = b.coverage >= IDEAL_MIN && b.coverage <= IDEAL_MAX ? 0 : 1;
      if (aIdeal !== bIdeal) return aIdeal - bIdeal;

      if (a.bestNewFreqRank !== b.bestNewFreqRank) return a.bestNewFreqRank - b.bestNewFreqRank;

      return Math.abs(a.coverage - IDEAL_CENTER) - Math.abs(b.coverage - IDEAL_CENTER);
    })[0];

    return {
      ...best,
      appliedMinCoverage: minCoverage,
      relaxed: minCoverage < COVERAGE_MIN,
      alreadySeen: seen.has(best.lesson.id),
    };
  }

  return null;
}
