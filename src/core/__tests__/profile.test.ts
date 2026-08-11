import { describe, expect, it } from 'vitest';
import { RULE_CARDS, buildDrill } from '../profile/drills';
import {
  DRILL_COOLDOWN_MS,
  DRILL_ERROR_THRESHOLD,
  DRILL_MIN_EXPOSURES,
  EMA_ALPHA,
  emptyEntry,
  exceedsThreshold,
  markDrilled,
  needsDrill,
  recordAnswer,
  tagHeatmap,
  tagsNeedingDrill,
  updateEntry,
} from '../profile/errorProfile';
import type { ErrorProfileEntry, GrammarTag, Item } from '../types';
import { NOW, makeItem } from './helpers';

function afterAnswers(tag: GrammarTag, results: boolean[]): ErrorProfileEntry {
  let entry = emptyEntry(tag, NOW);
  for (const wasCorrect of results) {
    entry = updateEntry(entry, tag, wasCorrect, NOW);
  }
  return entry;
}

describe('§9.5 — il drill scatta esattamente alla soglia', () => {
  it('non scatta a 7 esposizioni, anche se sono tutte sbagliate', () => {
    const entry = afterAnswers('dativ', Array(7).fill(false));
    expect(entry.exposures).toBe(7);
    expect(entry.emaErrorRate).toBeGreaterThan(DRILL_ERROR_THRESHOLD);
    expect(needsDrill(entry, NOW)).toBe(false);
  });

  it('scatta all’ottava', () => {
    const entry = afterAnswers('dativ', Array(8).fill(false));
    expect(entry.exposures).toBe(DRILL_MIN_EXPOSURES);
    expect(needsDrill(entry, NOW)).toBe(true);
  });

  it('non scatta con molte esposizioni ma error rate sotto la soglia', () => {
    const entry = afterAnswers('dativ', [false, ...Array(20).fill(true)]);
    expect(entry.exposures).toBeGreaterThan(DRILL_MIN_EXPOSURES);
    expect(entry.emaErrorRate).toBeLessThan(DRILL_ERROR_THRESHOLD);
    expect(needsDrill(entry, NOW)).toBe(false);
  });

  it('il confronto sull’error rate è stretto: 0,30 esatto non basta', () => {
    const atThreshold: ErrorProfileEntry = {
      tag: 'dativ',
      emaErrorRate: DRILL_ERROR_THRESHOLD,
      exposures: 20,
      lastUpdated: NOW,
      lastDrillAt: null,
    };
    expect(exceedsThreshold(atThreshold)).toBe(false);
    expect(exceedsThreshold({ ...atThreshold, emaErrorRate: 0.3001 })).toBe(true);
  });

  it('non drilla un tag che non è drillabile', () => {
    const entry = afterAnswers('suffix_e', Array(12).fill(false));
    expect(exceedsThreshold(entry)).toBe(true);
    expect(needsDrill(entry, NOW)).toBe(false);
  });

  it('non ripete lo stesso drill dentro il periodo di raffreddamento', () => {
    const entry = markDrilled(afterAnswers('dativ', Array(10).fill(false)), NOW);
    expect(needsDrill(entry, NOW + DRILL_COOLDOWN_MS - 1)).toBe(false);
    expect(needsDrill(entry, NOW + DRILL_COOLDOWN_MS)).toBe(true);
  });
});

describe('media mobile esponenziale', () => {
  it('usa α = 0,2 e parte da zero', () => {
    const first = updateEntry(undefined, 'dativ', false, NOW);
    expect(first.emaErrorRate).toBeCloseTo(EMA_ALPHA, 10);
    expect(first.exposures).toBe(1);
  });

  it('dimentica gli errori vecchi quando l’utente migliora', () => {
    const weak = afterAnswers('dativ', Array(15).fill(false));
    const recovered = afterAnswers('dativ', [...Array(15).fill(false), ...Array(15).fill(true)]);
    expect(recovered.emaErrorRate).toBeLessThan(weak.emaErrorRate);
    expect(needsDrill(recovered, NOW)).toBe(false);
  });

  it('aggiorna tutti i tag dell’item con una sola risposta', () => {
    const profile = recordAnswer(new Map(), ['dativ', 'v2_order'], false, NOW);
    expect(profile.get('dativ')?.exposures).toBe(1);
    expect(profile.get('v2_order')?.exposures).toBe(1);
  });

  it('ordina i tag da drillare dal più debole', () => {
    let profile = new Map<GrammarTag, ErrorProfileEntry>();
    profile.set('dativ', afterAnswers('dativ', Array(12).fill(false)));
    profile.set('akkusativ', afterAnswers('akkusativ', [...Array(9).fill(false), true, true]));
    expect(tagsNeedingDrill(profile, NOW)[0]).toBe('dativ');
  });

  it('la heatmap pesa i tag con poche esposizioni', () => {
    const profile = new Map<GrammarTag, ErrorProfileEntry>([
      ['dativ', afterAnswers('dativ', [false, false])],
      ['akkusativ', afterAnswers('akkusativ', Array(10).fill(false))],
    ]);
    const heat = tagHeatmap(profile);
    expect(heat[0].tag).toBe('akkusativ');
    expect(heat.find((h) => h.tag === 'dativ')?.confidence).toBeLessThan(1);
  });
});

describe('micro-drill', () => {
  const dativi: Item[] = [
    makeItem({ id: 'mit-dem-auto', de: 'Ich fahre mit dem Auto.', it: 'Vado in macchina.', freqRank: 10, tags: ['dativ'] }),
    makeItem({ id: 'aus-der-stadt', de: 'Ich komme aus der Stadt.', it: 'Vengo dalla città.', freqRank: 20, tags: ['dativ'] }),
    makeItem({ id: 'zu-dem-arzt', de: 'Ich gehe zum Arzt.', it: 'Vado dal medico.', freqRank: 30, tags: ['dativ'] }),
    makeItem({ id: 'bei-der-post', de: 'Ich bin bei der Post.', it: 'Sono alla posta.', freqRank: 40, tags: ['dativ'] }),
    makeItem({ id: 'nach-dem-essen', de: 'Nach dem Essen.', it: 'Dopo mangiato.', freqRank: 50, tags: ['dativ'] }),
  ];

  it('genera da 4 a 6 esercizi con la scheda regola', () => {
    const drill = buildDrill('dativ', dativi);
    expect(drill).not.toBeNull();
    expect(drill!.exercises.length).toBeGreaterThanOrEqual(4);
    expect(drill!.exercises.length).toBeLessThanOrEqual(6);
    expect(drill!.rule?.tag).toBe('dativ');
  });

  it('la scheda regola resta entro tre righe e due esempi', () => {
    for (const rule of Object.values(RULE_CARDS)) {
      expect(rule.lines.length).toBeLessThanOrEqual(3);
      expect(rule.examples.length).toBe(2);
    }
  });

  it('sui casi produce cloze sull’articolo, con distrattori dello stesso paradigma', () => {
    const drill = buildDrill('dativ', dativi)!;
    const cloze = drill.exercises.find((e) => e.kind === 'cloze');
    expect(cloze).toBeDefined();
    expect(cloze!.text).toContain('___');
    expect(cloze!.options).toContain(cloze!.answer);
    expect(cloze!.options!.length).toBeGreaterThan(1);
  });

  it('sui tag di genere produce una scelta tra der/die/das', () => {
    const nomi = [1, 2, 3, 4].map((n) =>
      makeItem({
        id: `nome-${n}`,
        type: 'noun',
        de: `das Ding${n}`,
        gender: 'das',
        plural: `die Ding${n}e`,
        tags: ['gender_das'],
      }),
    );
    const drill = buildDrill('gender_das', nomi)!;
    expect(drill.exercises[0].kind).toBe('choice');
    expect(drill.exercises[0].options).toEqual(['der', 'die', 'das']);
    expect(drill.exercises[0].answer).toBe('das');
  });

  it('sui tag di ordine produce un riordino', () => {
    const frasi = [1, 2, 3, 4].map((n) =>
      makeItem({ id: `frase-${n}`, de: `Ich spiele gern Fußball ${n}.`, tags: ['v2_order'] }),
    );
    expect(buildDrill('v2_order', frasi)!.exercises[0].kind).toBe('reorder');
  });

  it('rinuncia se non ci sono abbastanza item: un drill di due esercizi non è un drill', () => {
    expect(buildDrill('dativ', dativi.slice(0, 2))).toBeNull();
  });
});
