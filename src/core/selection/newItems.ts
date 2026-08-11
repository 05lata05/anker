/**
 * Scelta degli item nuovi da introdurre (§3.1 cap, §5.4 cognati).
 */
import type { Cefr, GrammarTag, Item } from '../types';

const CEFR_ORDER: Record<Cefr, number> = { A1: 0, A2: 1, B1: 2, B2: 3 };

/**
 * Un item conta come cognato se un italofono lo riconosce a colpo d'occhio —
 * dall'italiano o dall'inglese, che quasi tutti hanno studiato. I falsi amici
 * sono esclusi: `bekommen` somiglia a «diventare» ed è esattamente per questo
 * che non va introdotto nel gruppo dei regali.
 */
export function isCognate(item: Item): boolean {
  return !item.falseFriend && (item.cognateIt !== null || item.cognateEn !== null);
}

export interface NewItemSelection {
  items: Item[];
  /** Perché ogni item è entrato: serve al pannello diagnostico, non alla UI. */
  reasons: Map<string, 'cognate' | 'frequency'>;
}

export interface SelectNewItemsInput {
  candidates: readonly Item[];
  /** Item già introdotti: hanno già delle card. */
  introducedItemIds: ReadonlySet<string>;
  allowance: number;
  level: Cefr;
  /**
   * Quanti item con lo stesso tag grammaticale nuovo si possono introdurre
   * nello stesso giorno. Tre chunk al dativo tutti insieme non insegnano il
   * dativo: sovraccaricano e basta.
   */
  maxPerTag?: number;
  /** Tag già padroneggiati: non contano nel limite per tag. */
  familiarTags?: ReadonlySet<GrammarTag>;
}

export const DEFAULT_MAX_NEW_PER_TAG = 2;

/**
 * Ordina e taglia i candidati.
 *
 * Priorità: prima i cognati, poi la frequenza crescente. Al livello A1 i
 * cognati costruiscono volume in fretta — circa il 60% delle radici lessicali
 * è condiviso con l'inglese — e il volume iniziale è quello che tiene una
 * persona nell'app abbastanza a lungo da arrivare alle parole difficili.
 */
export function selectNewItems(input: SelectNewItemsInput): NewItemSelection {
  const maxPerTag = input.maxPerTag ?? DEFAULT_MAX_NEW_PER_TAG;
  const familiar = input.familiarTags ?? new Set<GrammarTag>();
  const levelCap = CEFR_ORDER[input.level];

  const pool = input.candidates
    .filter((item) => !input.introducedItemIds.has(item.id))
    .filter((item) => CEFR_ORDER[item.cefr] <= levelCap)
    .sort((a, b) => {
      const aCognate = isCognate(a) ? 0 : 1;
      const bCognate = isCognate(b) ? 0 : 1;
      if (aCognate !== bCognate) return aCognate - bCognate;
      return a.freqRank - b.freqRank;
    });

  const items: Item[] = [];
  const reasons = new Map<string, 'cognate' | 'frequency'>();
  const tagCounts = new Map<GrammarTag, number>();

  for (const item of pool) {
    if (items.length >= input.allowance) break;

    const newTags = item.tags.filter((tag) => !familiar.has(tag));
    const wouldExceed = newTags.some((tag) => (tagCounts.get(tag) ?? 0) >= maxPerTag);
    if (wouldExceed) continue;

    for (const tag of newTags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    items.push(item);
    reasons.set(item.id, isCognate(item) ? 'cognate' : 'frequency');
  }

  return { items, reasons };
}
