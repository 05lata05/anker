import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../scheduler/day';
import {
  CHOICE_GRACE_DAYS,
  MIN_PRODUCTION_SHARE,
  assignFormats,
  isProductive,
  naturalFormat,
} from '../session/formats';
import { PHASE_SHARES, buildSessionPlan } from '../session/plan';
import type { Card, ErrorProfileEntry, GrammarTag, Item } from '../types';
import { NOW, itemMap, makeCard, makeItem, makeLesson, testSettings } from './helpers';

const fresh = { introducedAt: NOW - 1 * DAY_MS };
const old = { introducedAt: NOW - 60 * DAY_MS };

describe('§4 — il quiz a scelta multipla non può dominare', () => {
  it('la card gender è sempre una scelta, anche su un item vecchissimo', () => {
    expect(naturalFormat(makeCard('n', 'gender', old), NOW)).toBe('choice');
  });

  it('un item nei primi tre giorni può usare la scelta multipla', () => {
    expect(naturalFormat(makeCard('n', 'recognition', fresh), NOW)).toBe('choice');
  });

  it('passati i tre giorni il riconoscimento chiede produzione', () => {
    const justOver = { introducedAt: NOW - (CHOICE_GRACE_DAYS + 0.1) * DAY_MS };
    expect(naturalFormat(makeCard('n', 'recognition', justOver), NOW)).toBe('typed');
  });

  it('la produzione e lo speaking non sono mai a scelta multipla', () => {
    expect(naturalFormat(makeCard('n', 'production', fresh), NOW)).toBe('typed');
    expect(naturalFormat(makeCard('n', 'speaking', fresh), NOW)).toBe('spoken');
  });

  it('garantisce almeno il 60% di card produttive irrigidendo quelle in grazia', () => {
    // Dieci card tutte nuove: senza correttivo sarebbero dieci quiz.
    const queue = Array.from({ length: 10 }, (_, i) => ({
      card: makeCard(`item-${i}`, 'recognition', { introducedAt: NOW - i * 3_600_000 }),
    }));

    const { assignments, productionShare } = assignFormats(queue, NOW);
    expect(productionShare).toBeGreaterThanOrEqual(MIN_PRODUCTION_SHARE);
    expect(assignments.filter((a) => a.upgraded).length).toBeGreaterThan(0);
    expect(assignments.every((a) => a.format !== 'choice' || !a.upgraded)).toBe(true);
  });

  it('irrigidisce prima le card più vecchie: hanno avuto più tempo per consolidarsi', () => {
    const queue = [
      { card: makeCard('recente', 'recognition', { introducedAt: NOW - 1_000 }) },
      { card: makeCard('vecchia', 'recognition', { introducedAt: NOW - 2 * DAY_MS }) },
    ];
    const { assignments } = assignFormats(queue, NOW);
    const upgraded = assignments.filter((a) => a.upgraded).map((a) => a.card.card.itemId);
    expect(upgraded).toContain('vecchia');
  });

  it('non trasforma mai una card gender in una digitata', () => {
    const queue = [
      { card: makeCard('nome', 'gender', fresh) },
      { card: makeCard('altro', 'gender', fresh) },
    ];
    const { assignments } = assignFormats(queue, NOW);
    expect(assignments.every((a) => a.format === 'choice')).toBe(true);
  });

  it('non esplode sulla coda vuota', () => {
    expect(assignFormats([], NOW).assignments).toEqual([]);
  });

  it('classifica correttamente i formati produttivi', () => {
    expect(isProductive('typed')).toBe(true);
    expect(isProductive('spoken')).toBe(true);
    expect(isProductive('choice')).toBe(false);
  });
});

describe('piano di sessione', () => {
  const items: Item[] = [
    makeItem({ id: 'das-auto', type: 'noun', de: 'das Auto', gender: 'das', plural: 'die Autos', topic: 'trasporti', freqRank: 200 }),
    makeItem({ id: 'mit-dem-auto', de: 'Ich fahre mit dem Auto.', topic: 'trasporti', freqRank: 210, tags: ['dativ'] }),
    makeItem({ id: 'die-suppe', type: 'noun', de: 'die Suppe', gender: 'die', plural: 'die Suppen', topic: 'cibo', freqRank: 900 }),
    makeItem({ id: 'nuovo-frequente', de: 'Was kostet das?', topic: 'acquisti', freqRank: 30, tags: ['w_frage'] }),
    makeItem({ id: 'nuovo-raro', de: 'Gute Besserung!', topic: 'salute', freqRank: 1200, tags: ['formelhaft'] }),
  ];

  const cards: Card[] = [
    makeCard('das-auto', 'recognition', { stability: 20, ...old }),
    makeCard('das-auto', 'gender', { stability: 6, ...old }),
    makeCard('mit-dem-auto', 'recognition', { stability: 12, ...old }),
    makeCard('die-suppe', 'recognition', { stability: 4, ...old }),
  ];

  const lessons = [makeLesson({ id: 'l1', targetItemIds: ['das-auto'] })];

  const base = {
    now: NOW,
    settings: testSettings,
    cards,
    itemsById: itemMap(items),
    lessons,
    errorProfile: new Map<GrammarTag, ErrorProfileEntry>(),
    knownItemIds: new Set(['das-auto', 'mit-dem-auto']),
  };

  it('ripartisce il tempo secondo le quote della specifica', () => {
    const plan = buildSessionPlan(base);
    const total = Object.values(PHASE_SHARES).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(plan.recall.budgetMs).toBeCloseTo(plan.budgetMs * 0.35, 5);
    expect(plan.output.budgetMs).toBeCloseTo(plan.budgetMs * 0.25, 5);
  });

  it('mette in Fase 1 le card dovute, interleaved e con la quota di produzione', () => {
    const plan = buildSessionPlan(base);
    expect(plan.recall.assignments.length).toBeGreaterThan(0);
    expect(plan.recall.productionShare).toBeGreaterThanOrEqual(MIN_PRODUCTION_SHARE);
  });

  it('sceglie una lezione per la Fase 2 anche quando l’utente è agli inizi', () => {
    expect(buildSessionPlan(base).input.lesson).not.toBeNull();
  });

  it('propone item nuovi entro il cap e preferendo i più frequenti', () => {
    const plan = buildSessionPlan(base);
    expect(plan.newItems.items.length).toBeGreaterThan(0);
    expect(plan.newItems.items.length).toBeLessThanOrEqual(testSettings.maxNewItemsPerDay);
    expect(plan.newItems.items[0].id).toBe('nuovo-frequente');
  });

  it('non propone item nuovi se la coda di review è fuori controllo', () => {
    const flooded: Card[] = Array.from({ length: 80 }, (_, i) =>
      makeCard(`extra-${i}`, 'recognition', { stability: 5, ...old }),
    );
    const floodedItems = itemMap([
      ...items,
      ...Array.from({ length: 80 }, (_, i) => makeItem({ id: `extra-${i}`, topic: `t${i % 5}` })),
    ]);

    const plan = buildSessionPlan({ ...base, cards: [...cards, ...flooded], itemsById: floodedItems });
    expect(plan.newItemAllowance.reason).toBe('zeroed');
    expect(plan.newItems.items).toEqual([]);
  });

  it('inietta al massimo un micro-drill, sul tag più debole', () => {
    const dativi = Array.from({ length: 5 }, (_, i) =>
      makeItem({ id: `dativ-${i}`, de: `Ich fahre mit dem Auto ${i}.`, tags: ['dativ'], freqRank: 100 + i }),
    );
    const profile = new Map<GrammarTag, ErrorProfileEntry>([
      ['dativ', { tag: 'dativ', emaErrorRate: 0.7, exposures: 20, lastUpdated: NOW, lastDrillAt: null }],
      ['akkusativ', { tag: 'akkusativ', emaErrorRate: 0.5, exposures: 20, lastUpdated: NOW, lastDrillAt: null }],
    ]);

    const plan = buildSessionPlan({
      ...base,
      itemsById: itemMap([...items, ...dativi]),
      errorProfile: profile,
    });

    expect(plan.newItems.drills).toHaveLength(1);
    expect(plan.newItems.drills[0].tag).toBe('dativ');
  });

  it('manda in Fase 4 gli item consolidati, non quelli di ieri', () => {
    const plan = buildSessionPlan(base);
    expect(plan.output.items.map((i) => i.id)).toContain('das-auto');
    expect(plan.output.items.map((i) => i.id)).not.toContain('nuovo-raro');
  });

  it('ripiega sui chunk nuovi se non c’è ancora niente di consolidato', () => {
    const plan = buildSessionPlan({ ...base, cards: [], knownItemIds: new Set() });
    expect(plan.output.items.length).toBeGreaterThan(0);
  });

  it('dichiara quante card restano fuori dal budget invece di nasconderle', () => {
    const many: Card[] = Array.from({ length: 200 }, (_, i) =>
      makeCard(`extra-${i}`, 'recognition', { stability: 5, ...old }),
    );
    const manyItems = itemMap([
      ...items,
      ...Array.from({ length: 200 }, (_, i) => makeItem({ id: `extra-${i}`, topic: `t${i % 7}` })),
    ]);
    const plan = buildSessionPlan({ ...base, cards: [...cards, ...many], itemsById: manyItems });
    expect(plan.recall.deferred).toBeGreaterThan(0);
  });
});
