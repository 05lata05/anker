/**
 * Interleaving della coda (§3.2).
 *
 * Presentare le review raggruppate per argomento gonfia l'accuratezza della
 * sessione e peggiora la ritenzione ritardata: dentro un blocco tematico il
 * contesto fa metà del lavoro di recupero. L'interleaving è una desirable
 * difficulty — la sessione diventa più faticosa e il ricordo più solido.
 */

/** Distanza minima di indice tra due card dello stesso item: almeno 4 card in mezzo. */
export const MIN_SAME_ITEM_GAP = 5;

export interface Interleavable {
  itemId: string;
  topic: string;
  direction: string;
}

export interface InterleaveOptions {
  minGap?: number;
}

/**
 * Riordina la coda rispettando, in ordine di priorità:
 *
 * 1. **vincolo forte** — due card dello stesso item distano almeno `minGap`
 *    posizioni. Senza questo, la seconda direzione dello stesso item è un
 *    ricordo di lavoro, non un recupero dalla memoria a lungo termine.
 * 2. **vincolo debole** — mai due card dello stesso topic di fila.
 * 3. **vincolo debole** — mai due card dello stesso tipo di esercizio di fila.
 *
 * L'ordine di partenza (urgenza crescente di retrievability) viene preservato
 * per quanto i vincoli lo consentano: a parità di ammissibilità si prende
 * sempre il candidato più urgente.
 *
 * Se il vincolo forte è insoddisfacibile — coda di 3 card, o tutte le card
 * dovute appartenenti a due soli item — non si va in loop: si sceglie il
 * candidato che massimizza la distanza disponibile. Meglio un gap di 2 che un
 * crash.
 */
export function interleave<T extends Interleavable>(cards: readonly T[], options: InterleaveOptions = {}): T[] {
  const minGap = options.minGap ?? MIN_SAME_ITEM_GAP;
  const remaining = [...cards];
  const out: T[] = [];
  const lastIndexByItem = new Map<string, number>();

  const pending = new Map<string, number>();
  for (const card of cards) pending.set(card.itemId, (pending.get(card.itemId) ?? 0) + 1);

  while (remaining.length > 0) {
    const previous = out[out.length - 1];
    let chosen = -1;
    let bestKey: [number, number, number, number] | null = null;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const last = lastIndexByItem.get(candidate.itemId);
      if (last !== undefined && out.length - last < minGap) continue;

      // Chiave di ordinamento, dalla più importante alla meno importante:
      //
      // 1. card ancora da piazzare per quell'item, DECRESCENTE. È questo che
      //    rende il greedy corretto: rimandare l'item che ha più card da
      //    collocare è il modo sicuro di ritrovarsi alla fine con tre card
      //    dello stesso item e nessuno spazio per separarle.
      // 2. topic diverso dalla card precedente.
      // 3. tipo di esercizio diverso dalla card precedente.
      // 4. posizione originale, cioè urgenza: l'ultimo criterio, non il primo.
      const key: [number, number, number, number] = [
        -(pending.get(candidate.itemId) ?? 0),
        previous && candidate.topic === previous.topic ? 1 : 0,
        previous && candidate.direction === previous.direction ? 1 : 0,
        i,
      ];

      if (bestKey === null || compareKeys(key, bestKey) < 0) {
        bestKey = key;
        chosen = i;
      }
    }

    if (chosen === -1) {
      let bestLast = Number.POSITIVE_INFINITY;
      chosen = 0;
      for (let i = 0; i < remaining.length; i++) {
        const last = lastIndexByItem.get(remaining[i].itemId) ?? Number.NEGATIVE_INFINITY;
        if (last < bestLast) {
          bestLast = last;
          chosen = i;
        }
      }
    }

    const [card] = remaining.splice(chosen, 1);
    pending.set(card.itemId, (pending.get(card.itemId) ?? 1) - 1);
    lastIndexByItem.set(card.itemId, out.length);
    out.push(card);
  }

  return out;
}

function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** Numero di card dello stesso item che violano il gap. 0 = coda pulita. */
export function countGapViolations(cards: readonly Interleavable[], minGap = MIN_SAME_ITEM_GAP): number {
  const lastIndex = new Map<string, number>();
  let violations = 0;
  cards.forEach((card, index) => {
    const last = lastIndex.get(card.itemId);
    if (last !== undefined && index - last < minGap) violations += 1;
    lastIndex.set(card.itemId, index);
  });
  return violations;
}

export const INITIAL_BLOCKING_COUNT = 3;

/**
 * Blocking iniziale su una regola nuova (§3.2).
 *
 * I primi esercizi su una regola appena introdotta stanno in blocco, poi si
 * passa a interleaved. L'evidenza su questo punto è mista — il blocking
 * iniziale aiuta la formazione della regola ma se prolungato produce
 * l'illusione di padronanza — quindi sta dietro al flag `initialBlocking` e
 * non è attivo di default.
 */
export function applyInitialBlocking<T extends Interleavable & { tags?: readonly string[] }>(
  cards: readonly T[],
  newRuleTag: string,
  options: InterleaveOptions & { blockSize?: number } = {},
): T[] {
  const blockSize = options.blockSize ?? INITIAL_BLOCKING_COUNT;
  const block: T[] = [];
  const rest: T[] = [];

  for (const card of cards) {
    if (block.length < blockSize && card.tags?.includes(newRuleTag)) block.push(card);
    else rest.push(card);
  }

  return [...block, ...interleave(rest, options)];
}
