import { describe, expect, it } from 'vitest';
import {
  COVERAGE_MAX,
  COVERAGE_MIN,
  buildKnownTokens,
  evaluateLessons,
  lessonCoverage,
  pickLesson,
  tokenize,
} from '../selection/comprehensibleInput';
import { MIN_SAME_ITEM_GAP, applyInitialBlocking, countGapViolations, interleave } from '../selection/interleave';
import { selectNewItems } from '../selection/newItems';
import type { Item } from '../types';
import { itemMap, makeItem, makeLesson } from './helpers';

// ---------------------------------------------------------------------------
// §9.3 — interleaving
// ---------------------------------------------------------------------------

describe('§9.3 — interleaving', () => {
  const directions = ['recognition', 'production', 'listening'] as const;

  function queue(itemCount: number) {
    const cards = [];
    for (let i = 0; i < itemCount; i++) {
      for (const direction of directions) {
        cards.push({ itemId: `item-${i}`, topic: `topic-${i % 3}`, direction });
      }
    }
    return cards;
  }

  it('garantisce il gap minimo di 5 card tra due direzioni dello stesso item', () => {
    const input = queue(6);
    expect(countGapViolations(input)).toBeGreaterThan(0);
    expect(countGapViolations(interleave(input))).toBe(0);
  });

  it('regge anche su una coda grande', () => {
    expect(countGapViolations(interleave(queue(40)))).toBe(0);
  });

  it('evita due card dello stesso topic di fila quando è possibile', () => {
    const result = interleave(queue(9));
    let adjacent = 0;
    for (let i = 1; i < result.length; i++) {
      if (result[i].topic === result[i - 1].topic) adjacent += 1;
    }
    expect(adjacent).toBe(0);
  });

  it('non perde né duplica card', () => {
    const input = queue(7);
    const result = interleave(input);
    expect(result).toHaveLength(input.length);
    expect(new Set(result.map((c) => `${c.itemId}:${c.direction}`)).size).toBe(input.length);
  });

  it('non va in loop quando il vincolo è insoddisfacibile', () => {
    // Un solo item, tre direzioni: il gap di 5 è impossibile per costruzione.
    const impossible = directions.map((direction) => ({ itemId: 'solo', topic: 't', direction }));
    const result = interleave(impossible);
    expect(result).toHaveLength(3);
  });

  it('preserva l’urgenza quando i vincoli lo consentono', () => {
    const input = [
      { itemId: 'a', topic: 't1', direction: 'recognition' },
      { itemId: 'b', topic: 't2', direction: 'production' },
      { itemId: 'c', topic: 't3', direction: 'listening' },
    ];
    expect(interleave(input).map((c) => c.itemId)).toEqual(['a', 'b', 'c']);
  });

  it('il blocking iniziale mette in testa i primi 3 esercizi sulla regola nuova', () => {
    const cards = [
      { itemId: 'x1', topic: 'a', direction: 'recognition', tags: ['dativ'] },
      { itemId: 'y1', topic: 'b', direction: 'recognition', tags: ['akkusativ'] },
      { itemId: 'x2', topic: 'a', direction: 'recognition', tags: ['dativ'] },
      { itemId: 'y2', topic: 'b', direction: 'production', tags: ['akkusativ'] },
      { itemId: 'x3', topic: 'c', direction: 'listening', tags: ['dativ'] },
      { itemId: 'x4', topic: 'c', direction: 'production', tags: ['dativ'] },
    ];
    const result = applyInitialBlocking(cards, 'dativ');
    expect(result.slice(0, 3).map((c) => c.itemId)).toEqual(['x1', 'x2', 'x3']);
    expect(result).toHaveLength(cards.length);
  });

  it('espone la costante del gap come contratto pubblico', () => {
    expect(MIN_SAME_ITEM_GAP).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// §9.4 — selettore i+1
// ---------------------------------------------------------------------------

describe('§9.4 — selettore di input comprensibile', () => {
  const t = (n: number) => `wort${n}`;
  const tokens = Array.from({ length: 20 }, (_, i) => t(i + 1));

  /** Item fittizio che rende noti i token elencati. */
  const known = makeItem({ id: 'noti', de: tokens.slice(0, 19).join(' ') });

  function lessonFrom(id: string, lessonTokens: string[], targetItemIds: string[] = []) {
    const lines = [0, 1, 2, 3].map((i) => ({
      speaker: 'A',
      de: lessonTokens.slice(i * 5, i * 5 + 5).join(' '),
      it: '—',
    }));
    return makeLesson({ id, lines, targetItemIds });
  }

  const frequente = makeItem({ id: 'frequente', freqRank: 10 });
  const raro = makeItem({ id: 'raro', freqRank: 900 });

  // 19 token noti su 20 → 95%: dentro la finestra ideale.
  const buona = lessonFrom('buona', tokens, ['raro']);
  // 18 su 20 → 90%: sotto la soglia, è un muro.
  const difficile = lessonFrom('difficile', [...tokens.slice(0, 18), 'unbekannt', 'fremdwort']);
  // 20 su 20 → 100%: non insegna niente.
  const facile = lessonFrom('facile', [...tokens.slice(0, 19), t(1)]);
  // 95% come `buona`, ma introduce un item molto più frequente.
  const buonaFrequente = lessonFrom('buona-frequente', [...tokens.slice(0, 19), 'neuwort'], ['frequente']);

  const items: Item[] = [known, frequente, raro];
  const base = {
    itemsById: itemMap(items),
    knownItemIds: new Set(['noti']),
  };

  it('calcola la copertura sui token del dialogo', () => {
    const knownTokens = buildKnownTokens([known]);
    expect(lessonCoverage(buona, knownTokens).coverage).toBeCloseTo(0.95, 5);
    expect(lessonCoverage(difficile, knownTokens).coverage).toBeCloseTo(0.9, 5);
    expect(lessonCoverage(facile, knownTokens).coverage).toBe(1);
  });

  it('scarta le lezioni sotto il 92% e sopra il 99%', () => {
    const pick = pickLesson({ ...base, lessons: [difficile, facile, buona] });
    expect(pick?.lesson.id).toBe('buona');
    expect(pick?.relaxed).toBe(false);

    const candidates = evaluateLessons({ ...base, lessons: [difficile, facile, buona] });
    for (const candidate of candidates) {
      const eligible = candidate.coverage >= COVERAGE_MIN && candidate.coverage <= COVERAGE_MAX;
      expect(eligible).toBe(candidate.lesson.id === 'buona');
    }
  });

  it('a parità di copertura preferisce la lezione che introduce l’item più frequente', () => {
    const pick = pickLesson({ ...base, lessons: [buona, buonaFrequente] });
    expect(pick?.lesson.id).toBe('buona-frequente');
    expect(pick?.bestNewFreqRank).toBe(10);
  });

  it('a freddo ripiega invece di restituire null', () => {
    // Nessun item noto: nessuna lezione arriva al 92%. Senza scala di ripiego
    // la Fase 2 resterebbe vuota per settimane, proprio quando serve di più.
    const pick = pickLesson({ ...base, knownItemIds: new Set<string>(), lessons: [buona, difficile] });
    expect(pick).not.toBeNull();
    expect(pick?.relaxed).toBe(true);
    expect(pick?.appliedMinCoverage).toBeLessThan(COVERAGE_MIN);
  });

  it('restituisce null solo se non ci sono lezioni', () => {
    expect(pickLesson({ ...base, lessons: [] })).toBeNull();
  });

  it('deprioritizza le lezioni già viste', () => {
    const pick = pickLesson({
      ...base,
      lessons: [buonaFrequente, buona],
      seenLessonIds: new Set(['buona-frequente']),
    });
    expect(pick?.lesson.id).toBe('buona');
  });

  it('elenca i token sconosciuti, che diventano candidati nuovi item', () => {
    const pick = pickLesson({ ...base, lessons: [buona] });
    expect(pick?.unknownTokens).toEqual([tokens[19]]);
  });

  it('tokenizza ignorando punteggiatura e maiuscole', () => {
    expect(tokenize('Guten Tag, Herr Müller! Wie geht’s?')).toEqual([
      'guten',
      'tag',
      'herr',
      'müller',
      'wie',
      'geht',
      's',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Selezione dei nuovi item
// ---------------------------------------------------------------------------

describe('selezione dei nuovi item', () => {
  const cognato = makeItem({ id: 'cognato', freqRank: 500, cognateIt: 'famiglia', tags: ['gender_die'] });
  const frequente = makeItem({ id: 'frequente', freqRank: 20, tags: ['v2_order'] });
  const falsoAmico = makeItem({
    id: 'falso-amico',
    freqRank: 5,
    cognateIt: 'diventare',
    falseFriend: true,
    falseFriendNote: 'bekommen = ricevere',
    tags: ['akkusativ'],
  });

  it('mette i cognati davanti, a parità di livello', () => {
    const { items, reasons } = selectNewItems({
      candidates: [frequente, cognato],
      introducedItemIds: new Set(),
      allowance: 2,
      level: 'A1',
    });
    expect(items[0].id).toBe('cognato');
    expect(reasons.get('cognato')).toBe('cognate');
  });

  it('non tratta un falso amico come cognato', () => {
    const { items } = selectNewItems({
      candidates: [falsoAmico, cognato],
      introducedItemIds: new Set(),
      allowance: 1,
      level: 'A1',
    });
    expect(items[0].id).toBe('cognato');
  });

  it('rispetta il budget e salta gli item già introdotti', () => {
    const { items } = selectNewItems({
      candidates: [cognato, frequente],
      introducedItemIds: new Set(['cognato']),
      allowance: 5,
      level: 'A1',
    });
    expect(items.map((i) => i.id)).toEqual(['frequente']);
  });

  it('non introduce più di due item con lo stesso tag nuovo nello stesso giorno', () => {
    const dativi = [1, 2, 3, 4].map((n) =>
      makeItem({ id: `dativ-${n}`, freqRank: n, tags: ['dativ'] }),
    );
    const { items } = selectNewItems({
      candidates: dativi,
      introducedItemIds: new Set(),
      allowance: 4,
      level: 'A1',
    });
    expect(items).toHaveLength(2);
  });

  it('non propone item sopra il livello dell’utente', () => {
    const b1 = makeItem({ id: 'avanzato', cefr: 'B1', freqRank: 1 });
    const { items } = selectNewItems({
      candidates: [b1, frequente],
      introducedItemIds: new Set(),
      allowance: 5,
      level: 'A1',
    });
    expect(items.map((i) => i.id)).toEqual(['frequente']);
  });
});
