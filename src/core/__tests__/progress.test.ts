import { describe, expect, it } from 'vitest';
import {
  PLACEMENT_SEED_STABILITY_DAYS,
  buildPlacement,
  scorePlacement,
  seedKnownCards,
  shouldStop,
} from '../onboarding/placement';
import {
  ANCHOR_STABILITY_DAYS,
  FREQUENCY_TARGET,
  computeStreak,
  countAnchors,
  currentFreezeMonth,
  decideStreakFreeze,
  estimateCefr,
  findDelayedSuccesses,
  frequencyCoverage,
  retentionCurve,
} from '../progress/metrics';
import { DAY_MS } from '../scheduler/day';
import { CardState, type Card, type DayLog, type Item } from '../types';
import { NOW, makeCard, makeItem } from './helpers';

describe('ancoraggi', () => {
  it('conta solo gli item la cui traccia regge un mese', () => {
    const cards = [
      makeCard('a', 'recognition', { stability: ANCHOR_STABILITY_DAYS }),
      makeCard('b', 'recognition', { stability: 29.9 }),
      makeCard('c', 'recognition', { stability: 120 }),
    ];
    expect(countAnchors(cards)).toBe(2);
  });

  it('non conta due volte lo stesso item per direzioni diverse', () => {
    const cards = [
      makeCard('a', 'recognition', { stability: 60 }),
      makeCard('a', 'production', { stability: 60 }),
    ];
    expect(countAnchors(cards)).toBe(1);
  });

  it('non si lascia gonfiare dalle direzioni secondarie', () => {
    // Solo il riconoscimento conta: una card di ascolto molto stabile non
    // significa che l'item sia ancorato.
    expect(countAnchors([makeCard('a', 'listening', { stability: 200 })])).toBe(0);
  });
});

describe('streak', () => {
  function log(day: string, overrides: Partial<DayLog> = {}): DayLog {
    return { day, newItemsIntroduced: 0, reviewsDone: 0, queueCleared: false, frozen: false, ...overrides };
  }

  const today = new Date(2026, 4, 12, 10, 0, 0).getTime();

  it('conta i giorni consecutivi in cui la coda è stata svuotata', () => {
    const logs = [
      log('2026-05-12', { queueCleared: true }),
      log('2026-05-11', { queueCleared: true }),
      log('2026-05-10', { queueCleared: true }),
    ];
    const streak = computeStreak(logs, today);
    expect(streak.current).toBe(3);
    expect(streak.todayDone).toBe(true);
  });

  it('non azzera lo streak la mattina prima della sessione', () => {
    const logs = [log('2026-05-11', { queueCleared: true }), log('2026-05-10', { queueCleared: true })];
    const streak = computeStreak(logs, today);
    expect(streak.current).toBe(2);
    expect(streak.todayDone).toBe(false);
  });

  it('un freeze protegge la catena senza allungarla', () => {
    const logs = [
      log('2026-05-12', { queueCleared: true }),
      log('2026-05-11', { frozen: true }),
      log('2026-05-10', { queueCleared: true }),
    ];
    const streak = computeStreak(logs, today);
    expect(streak.current).toBe(2);
    expect(streak.frozenDays).toBe(1);
  });

  it('un giorno saltato e non congelato spezza la catena', () => {
    const logs = [
      log('2026-05-12', { queueCleared: true }),
      log('2026-05-11', { reviewsDone: 3 }),
      log('2026-05-10', { queueCleared: true }),
    ];
    expect(computeStreak(logs, today).current).toBe(1);
  });

  it('aprire l’app senza svuotare la coda non conta', () => {
    expect(computeStreak([log('2026-05-12', { reviewsDone: 40 })], today).current).toBe(0);
  });

  it('ricorda la catena più lunga', () => {
    const logs = [
      log('2026-05-01', { queueCleared: true }),
      log('2026-05-02', { queueCleared: true }),
      log('2026-05-03', { queueCleared: true }),
      log('2026-05-04'),
      log('2026-05-12', { queueCleared: true }),
    ];
    expect(computeStreak(logs, today).longest).toBe(3);
  });
});

describe('streak freeze', () => {
  function log(day: string, overrides: Partial<DayLog> = {}): DayLog {
    return { day, newItemsIntroduced: 0, reviewsDone: 0, queueCleared: false, frozen: false, ...overrides };
  }

  const today = new Date(2026, 4, 12, 10, 0, 0).getTime();

  it('brucia un freeze per il giorno saltato, se c’era una catena', () => {
    const logs = [log('2026-05-10', { queueCleared: true })];
    const decision = decideStreakFreeze(logs, today, 2);
    expect(decision.reason).toBe('consume');
    expect(decision.day).toBe('2026-05-11');
  });

  it('non lo brucia se ieri la coda era stata svuotata', () => {
    const logs = [log('2026-05-11', { queueCleared: true }), log('2026-05-10', { queueCleared: true })];
    expect(decideStreakFreeze(logs, today, 2).reason).toBe('not_needed');
  });

  it('non lo regala a chi non ha mai studiato', () => {
    // Proteggere una catena inesistente svuota la riserva prima che serva.
    expect(decideStreakFreeze([], today, 2).reason).toBe('no_streak_to_protect');
  });

  it('non fa nulla quando la riserva è finita', () => {
    const logs = [log('2026-05-10', { queueCleared: true })];
    expect(decideStreakFreeze(logs, today, 0).reason).toBe('no_freezes_left');
  });

  it('non ricongela un giorno già congelato', () => {
    const logs = [log('2026-05-11', { frozen: true }), log('2026-05-10', { queueCleared: true })];
    expect(decideStreakFreeze(logs, today, 2).reason).toBe('not_needed');
  });

  it('protegge anche una catena che ieri l’altro era già congelata', () => {
    const logs = [log('2026-05-10', { frozen: true })];
    expect(decideStreakFreeze(logs, today, 1).reason).toBe('consume');
  });

  it('il mese della riserva segue la giornata logica', () => {
    expect(currentFreezeMonth(new Date(2026, 4, 1, 2, 0, 0).getTime())).toBe('2026-04');
    expect(currentFreezeMonth(new Date(2026, 4, 1, 9, 0, 0).getTime())).toBe('2026-05');
  });
});

describe('copertura per frequenza e livello', () => {
  it('conta gli item noti dentro la fascia dei primi 2.000', () => {
    const known: Item[] = [
      makeItem({ id: 'a', freqRank: 50 }),
      makeItem({ id: 'b', freqRank: 1900 }),
      makeItem({ id: 'c', freqRank: 5000 }),
    ];
    const coverage = frequencyCoverage(known);
    expect(coverage.known).toBe(2);
    expect(coverage.target).toBe(FREQUENCY_TARGET);
    expect(coverage.deepestRank).toBe(1900);
  });

  it('la stima del livello è conservativa', () => {
    expect(estimateCefr(0)).toBe('A1');
    expect(estimateCefr(299)).toBe('A1');
    expect(estimateCefr(300)).toBe('A2');
    expect(estimateCefr(800)).toBe('B1');
  });
});

describe('curva di ritenzione', () => {
  it('parte da 1 e scende', () => {
    const card = makeCard('a', 'recognition', { stability: 10, lastReview: NOW });
    const curve = retentionCurve(card, 30);
    expect(curve[0].retrievability).toBeCloseTo(1, 6);
    expect(curve[curve.length - 1].retrievability).toBeLessThan(curve[0].retrievability);
  });

  it('passa per 0,9 quando i giorni trascorsi eguagliano la stability', () => {
    const card = makeCard('a', 'recognition', { stability: 10, lastReview: NOW });
    const curve = retentionCurve(card, 10, 10);
    expect(curve[10].retrievability).toBeCloseTo(0.9, 3);
  });

  it('una card mai vista non ha curva', () => {
    expect(retentionCurve(makeCard('a', 'recognition', { stability: 0, lastReview: null }), 30)).toEqual([]);
  });
});

describe('successi ritardati', () => {
  it('segnala il richiamo riuscito dopo una lunga pausa', () => {
    const card = makeCard('die-verabredung', 'recognition');
    const reviews = [
      { cardId: card.id, ts: NOW - 42 * DAY_MS, wasCorrect: true },
      { cardId: card.id, ts: NOW, wasCorrect: true },
    ];
    const successes = findDelayedSuccesses(reviews, new Map([[card.id, card]]));
    expect(successes).toHaveLength(1);
    expect(successes[0].itemId).toBe('die-verabredung');
    expect(successes[0].gapDays).toBe(42);
  });

  it('non celebra un richiamo ravvicinato né uno fallito', () => {
    const card = makeCard('a', 'recognition');
    const cards = new Map([[card.id, card]]);
    expect(
      findDelayedSuccesses(
        [
          { cardId: card.id, ts: NOW - 2 * DAY_MS, wasCorrect: true },
          { cardId: card.id, ts: NOW, wasCorrect: true },
        ],
        cards,
      ),
    ).toHaveLength(0);
    expect(
      findDelayedSuccesses(
        [
          { cardId: card.id, ts: NOW - 60 * DAY_MS, wasCorrect: true },
          { cardId: card.id, ts: NOW, wasCorrect: false },
        ],
        cards,
      ),
    ).toHaveLength(0);
  });
});

describe('placement', () => {
  const items: Item[] = Array.from({ length: 60 }, (_, i) =>
    makeItem({
      id: `item-${i}`,
      it: `traduzione ${i}`,
      freqRank: (i + 1) * 35,
      topic: `topic-${i % 7}`,
    }),
  );

  it('costruisce una scaletta a difficoltà crescente', () => {
    const questions = buildPlacement(items);
    expect(questions.length).toBeGreaterThan(5);
    const bands = questions.map((question) => question.band);
    expect(bands).toEqual([...bands].sort((a, b) => a - b));
  });

  it('ogni domanda ha la risposta giusta tra le opzioni', () => {
    for (const question of buildPlacement(items)) {
      expect(question.options[question.answerIndex]).toBe(question.item.it);
      expect(new Set(question.options).size).toBe(question.options.length);
    }
  });

  it('non ripropone lo stesso item in due bande', () => {
    const ids = buildPlacement(items).map((question) => question.item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('si ferma dopo quattro errori consecutivi', () => {
    const miss = { itemId: 'x', correct: false, band: 500 };
    expect(shouldStop([{ itemId: 'a', correct: true, band: 100 }, miss, miss, miss])).toBe(false);
    expect(shouldStop([miss, miss, miss, miss])).toBe(true);
  });

  it('non si ferma se in mezzo c’è una risposta giusta', () => {
    const miss = { itemId: 'x', correct: false, band: 500 };
    expect(shouldStop([miss, miss, { itemId: 'y', correct: true, band: 500 }, miss])).toBe(false);
  });

  it('stima il livello in modo conservativo', () => {
    const allWrong = scorePlacement([{ itemId: 'a', correct: false, band: 100 }]);
    expect(allWrong.level).toBe('A1');
    expect(allWrong.knownItemIds).toEqual([]);

    const strong = scorePlacement(
      Array.from({ length: 20 }, (_, i) => ({ itemId: `i${i}`, correct: true, band: 2000 })),
    );
    expect(strong.level).toBe('B1');
    expect(strong.knownItemIds).toHaveLength(20);
  });

  it('un’accuratezza mediocre non promuove, per quanto in alto si arrivi', () => {
    const answers = Array.from({ length: 20 }, (_, i) => ({
      itemId: `i${i}`,
      correct: i < 8,
      band: 2000,
    }));
    expect(scorePlacement(answers).level).toBe('A1');
  });
});

describe('semina dello stato FSRS dal placement', () => {
  const item = makeItem({ id: 'das-auto', type: 'noun', de: 'das Auto', gender: 'das', plural: 'die Autos' });

  it('semina una stability modesta, non «già imparato»', () => {
    const cards = seedKnownCards(item, NOW, ['recognition', 'gender', 'production']);
    const recognition = cards.find((card) => card.direction === 'recognition')!;

    expect(recognition.stability).toBe(PLACEMENT_SEED_STABILITY_DAYS);
    expect(recognition.state).toBe(CardState.Review);
    expect(recognition.due).toBe(NOW + PLACEMENT_SEED_STABILITY_DAYS * DAY_MS);
    // Sotto la soglia di sblocco della produzione: riconoscere in un test a
    // scelta multipla non apre la porta alla produzione.
    expect(recognition.stability).toBeLessThan(7);
  });

  it('non semina stato sulle direzioni che il placement non ha misurato', () => {
    const cards = seedKnownCards(item, NOW, ['recognition', 'gender', 'production']);
    for (const card of cards.filter((c) => c.direction !== 'recognition')) {
      expect(card.stability).toBe(0);
      expect(card.reps).toBe(0);
    }
  });

  it('lascia chiuse produzione e speaking', () => {
    const cards = seedKnownCards(item, NOW, ['recognition', 'gender', 'production', 'speaking']);
    expect(cards.find((c) => c.direction === 'production')?.unlocked).toBe(false);
    expect(cards.find((c) => c.direction === 'speaking')?.unlocked).toBe(false);
    expect(cards.find((c) => c.direction === 'gender')?.unlocked).toBe(true);
  });
});
