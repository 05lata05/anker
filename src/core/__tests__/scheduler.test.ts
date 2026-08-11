import { describe, expect, it } from 'vitest';
import { DAY_MS, isSameLogicalDay, logicalDay, previousLogicalDay, startOfLogicalDay } from '../scheduler/day';
import { applyReview, createCard, createScheduler, clampRetention } from '../scheduler/fsrs';
import { CAP_HALVE_THRESHOLD, CAP_ZERO_THRESHOLD, adaptiveNewItemCap, getDueQueue } from '../scheduler/queue';
import {
  SAME_DAY_MAX_MS,
  SAME_DAY_MIN_MS,
  dueSameDayReinforcements,
  scheduleSameDayReinforcement,
} from '../scheduler/sameDay';
import { PRODUCTION_UNLOCK_STABILITY_DAYS, canPresent, bySiblingDirection, directionsToUnlock } from '../scheduler/unlock';
import { CardState, Rating, type Settings } from '../types';
import { NOW, itemMap, makeCard, makeItem, testSettings } from './helpers';

const item = makeItem({ id: 'das-auto', type: 'noun', de: 'das Auto', gender: 'das', plural: 'die Autos' });
const items = itemMap([item]);

describe('§9.1 — la produzione non si presenta finché il riconoscimento non regge', () => {
  function queueWith(recognitionStability: number) {
    const cards = [
      makeCard('das-auto', 'recognition', { stability: recognitionStability }),
      makeCard('das-auto', 'production', { stability: 2 }),
    ];
    return getDueQueue({ cards, itemsById: items, now: NOW, settings: testSettings });
  }

  it('esclude la produzione quando la recognition ha stability sotto i 7 giorni', () => {
    const directions = queueWith(5).map((d) => d.card.direction);
    expect(directions).toContain('recognition');
    expect(directions).not.toContain('production');
  });

  it('esclude la produzione anche esattamente a 7 giorni: la soglia è stretta', () => {
    expect(queueWith(PRODUCTION_UNLOCK_STABILITY_DAYS).map((d) => d.card.direction)).not.toContain('production');
  });

  it('la ammette appena la recognition supera i 7 giorni', () => {
    expect(queueWith(7.5).map((d) => d.card.direction)).toContain('production');
  });

  it('la ritira se un lapse fa ricadere la recognition sotto la soglia', () => {
    // La card resta `unlocked` — la UI non deve far sparire una direzione già
    // vista — ma smette di essere presentata finché la traccia non risale.
    const production = makeCard('das-auto', 'production', { unlocked: true, stability: 20 });
    const recognition = makeCard('das-auto', 'recognition', { stability: 3, lapses: 1 });
    const siblings = bySiblingDirection([recognition, production]);
    expect(canPresent(production, siblings)).toBe(false);
    expect(production.unlocked).toBe(true);
  });

  it('lo speaking richiede la produzione, non il riconoscimento', () => {
    const cards = [
      makeCard('das-auto', 'recognition', { stability: 40 }),
      makeCard('das-auto', 'speaking', { stability: 1 }),
    ];
    const siblings = bySiblingDirection(cards);
    expect(canPresent(cards[1], siblings)).toBe(false);
  });

  it('genere e ascolto si sbloccano insieme al riconoscimento', () => {
    const cards = [
      makeCard('das-auto', 'recognition', { stability: 0, unlocked: true }),
      makeCard('das-auto', 'gender', { unlocked: false }),
      makeCard('das-auto', 'listening', { unlocked: false }),
      makeCard('das-auto', 'production', { unlocked: false }),
    ];
    expect(directionsToUnlock(cards).sort()).toEqual(['gender', 'listening']);
  });
});

describe('§9.2 — cap adattivo dei nuovi item', () => {
  it('azzera i nuovi item quando la coda supera 60', () => {
    const cap = adaptiveNewItemCap(CAP_ZERO_THRESHOLD + 1, testSettings);
    expect(cap.allowance).toBe(0);
    expect(cap.reason).toBe('zeroed');
  });

  it('non li azzera a 60 esatte', () => {
    expect(adaptiveNewItemCap(CAP_ZERO_THRESHOLD, testSettings).reason).toBe('halved');
  });

  it('li dimezza tra 40 e 60', () => {
    const cap = adaptiveNewItemCap(CAP_HALVE_THRESHOLD, testSettings);
    expect(cap.reason).toBe('halved');
    expect(cap.allowance).toBe(Math.floor(testSettings.maxNewItemsPerDay / 2));
  });

  it('li lascia interi sotto le 40', () => {
    const cap = adaptiveNewItemCap(CAP_HALVE_THRESHOLD - 1, testSettings);
    expect(cap.reason).toBe('none');
    expect(cap.allowance).toBe(testSettings.maxNewItemsPerDay);
  });

  it('scala le soglie sull’obiettivo giornaliero', () => {
    const short: Settings = { ...testSettings, dailyGoalMin: 10 };
    // Con 10 minuti al giorno, 40 card dovute sono già un'emergenza.
    expect(adaptiveNewItemCap(31, short).reason).toBe('zeroed');
    expect(adaptiveNewItemCap(31, testSettings).reason).toBe('none');
  });

  it('sottrae gli item già introdotti oggi', () => {
    expect(adaptiveNewItemCap(0, testSettings, 4).allowance).toBe(testSettings.maxNewItemsPerDay - 4);
    expect(adaptiveNewItemCap(0, testSettings, 99).allowance).toBe(0);
  });
});

describe('coda del giorno', () => {
  it('ordina per urgenza: prima la retrievability più bassa', () => {
    const fresh = makeCard('das-auto', 'recognition', { stability: 100, lastReview: NOW - DAY_MS });
    const stale = makeCard('das-auto', 'listening', { stability: 2, lastReview: NOW - 30 * DAY_MS });
    const queue = getDueQueue({ cards: [fresh, stale], itemsById: items, now: NOW, settings: testSettings });
    expect(queue[0].card.direction).toBe('listening');
    expect(queue[0].retrievability).toBeLessThan(queue[1].retrievability);
  });

  it('esclude card non ancora dovute, sospese o bloccate', () => {
    const cards = [
      makeCard('das-auto', 'recognition', { due: NOW + DAY_MS }),
      makeCard('das-auto', 'listening', { suspended: true }),
      makeCard('das-auto', 'gender', { unlocked: false }),
    ];
    expect(getDueQueue({ cards, itemsById: items, now: NOW, settings: testSettings })).toHaveLength(0);
  });

  it('ignora card orfane il cui item non esiste più', () => {
    const orphan = makeCard('item-cancellato', 'recognition');
    expect(getDueQueue({ cards: [orphan], itemsById: items, now: NOW, settings: testSettings })).toHaveLength(0);
  });
});

describe('FSRS', () => {
  it('non hardcoda 0,9 e tiene la retention nel range consentito', () => {
    expect(clampRetention(0.5)).toBe(0.8);
    expect(clampRetention(0.99)).toBe(0.92);
    expect(clampRetention(0.88)).toBe(0.88);
    expect(createScheduler(testSettings).parameters.request_retention).toBe(0.88);
  });

  it('non applica gli step brevi: il primo Good schedula in giorni, non in minuti', () => {
    const card = createCard('das-auto', 'recognition', NOW, true);
    const { intervalDays } = applyReview(card, Rating.Good, NOW, testSettings);
    expect(intervalDays).toBeGreaterThan(1);
  });

  it('un voto migliore non accorcia mai l’intervallo', () => {
    const card = createCard('das-auto', 'recognition', NOW, true);
    const again = applyReview(card, Rating.Again, NOW, testSettings).intervalDays;
    const good = applyReview(card, Rating.Good, NOW, testSettings).intervalDays;
    const easy = applyReview(card, Rating.Easy, NOW, testSettings).intervalDays;
    expect(again).toBeLessThanOrEqual(good);
    expect(good).toBeLessThanOrEqual(easy);
  });

  it('sospende come leech la card che continua a cadere', () => {
    const settings: Settings = { ...testSettings, leechLapseThreshold: 8 };
    const card = makeCard('das-auto', 'recognition', {
      lapses: 7,
      stability: 3,
      reps: 20,
      state: CardState.Review,
    });
    const { card: after } = applyReview(card, Rating.Again, NOW, settings);
    expect(after.lapses).toBe(8);
    expect(after.suspended).toBe(true);
  });

  it('non sospende una card che sta andando bene', () => {
    const card = makeCard('das-auto', 'recognition', { lapses: 7, stability: 10, reps: 20 });
    expect(applyReview(card, Rating.Good, NOW, testSettings).card.suspended).toBe(false);
  });
});

describe('seconda esposizione intra-giornaliera', () => {
  const rng = () => 0.5;

  it('la programma tra 90 e 120 minuti', () => {
    const card = createCard('das-auto', 'recognition', NOW, true);
    const scheduled = scheduleSameDayReinforcement(card, NOW, 4, rng);
    const delay = (scheduled.sameDayReinforcementDue ?? 0) - NOW;
    expect(delay).toBeGreaterThanOrEqual(SAME_DAY_MIN_MS);
    expect(delay).toBeLessThanOrEqual(SAME_DAY_MAX_MS);
  });

  it('la salta se cadrebbe oltre il confine della giornata logica', () => {
    const lateNight = new Date(2026, 4, 12, 3, 30, 0).getTime();
    const card = createCard('das-auto', 'recognition', lateNight, true);
    expect(scheduleSameDayReinforcement(card, lateNight, 4, rng).sameDayReinforcementDue).toBeNull();
  });

  it('restituisce solo i rinforzi scaduti, in ordine', () => {
    const a = makeCard('a', 'recognition', { sameDayReinforcementDue: NOW - 1000 });
    const b = makeCard('b', 'recognition', { sameDayReinforcementDue: NOW - 5000 });
    const c = makeCard('c', 'recognition', { sameDayReinforcementDue: NOW + 5000 });
    expect(dueSameDayReinforcements([a, b, c], NOW).map((card) => card.itemId)).toEqual(['b', 'a']);
  });
});

describe('giornata logica', () => {
  it('le 02:00 appartengono ancora al giorno precedente', () => {
    const lateNight = new Date(2026, 4, 12, 2, 0, 0).getTime();
    const evening = new Date(2026, 4, 11, 22, 0, 0).getTime();
    expect(logicalDay(lateNight)).toBe('2026-05-11');
    expect(isSameLogicalDay(lateNight, evening)).toBe(true);
  });

  it('le 05:00 sono già il giorno nuovo', () => {
    expect(logicalDay(new Date(2026, 4, 12, 5, 0, 0).getTime())).toBe('2026-05-12');
  });

  it('la giornata logica inizia all’ora di rollover', () => {
    const start = startOfLogicalDay(new Date(2026, 4, 12, 2, 0, 0).getTime());
    expect(new Date(start).getHours()).toBe(4);
    expect(new Date(start).getDate()).toBe(11);
  });

  it('sa risalire al giorno precedente attraverso il cambio di mese', () => {
    expect(previousLogicalDay('2026-05-01')).toBe('2026-04-30');
  });
});
