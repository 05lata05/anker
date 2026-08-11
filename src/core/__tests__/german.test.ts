import { describe, expect, it } from 'vitest';
import {
  DISCOVERY_THRESHOLD,
  findDiscoverableRules,
  predictGender,
  splitCompound,
  stripArticle,
  suffixTag,
} from '../german/genderRules';
import {
  articleFor,
  articleParadigm,
  explainCaseError,
  prepositionGovernment,
} from '../german/cases';
import { buildChips, checkOrder, classifyClause, explainWordOrder, shuffleChips } from '../german/wordOrder';

describe('§9.6 — motore di genere: suffissi', () => {
  const cases: [string, string, string][] = [
    ['die Wohnung', 'die', 'fem_ung'],
    ['die Freiheit', 'die', 'fem_heit'],
    ['die Möglichkeit', 'die', 'fem_keit'],
    ['die Freundschaft', 'die', 'fem_schaft'],
    ['die Universität', 'die', 'fem_taet'],
    ['die Nation', 'die', 'fem_ion'],
    ['die Familie', 'die', 'fem_ie'],
    ['die Kultur', 'die', 'fem_ur'],
    ['das Instrument', 'das', 'neut_ment'],
    ['das Museum', 'das', 'neut_um'],
    ['der Schmetterling', 'der', 'masc_ling'],
    ['der Tourismus', 'der', 'masc_ismus'],
    ['der Motor', 'der', 'masc_or'],
  ];

  for (const [noun, gender, ruleId] of cases) {
    it(`${noun} → ${gender}`, () => {
      const prediction = predictGender(noun);
      expect(prediction.gender).toBe(gender);
      expect(prediction.ruleId).toBe(ruleId);
    });
  }

  it('i diminutivi in -chen sono neutri e vincono su tutto', () => {
    const prediction = predictGender('das Mädchen');
    expect(prediction.gender).toBe('das');
    expect(prediction.confidence).toBe(1);
    expect(prediction.ruleId).toBe('diminutive_chen');
  });

  it('presenta -er come tendenza, non come legge', () => {
    const prediction = predictGender('Lehrer');
    expect(prediction.gender).toBe('der');
    expect(prediction.confidence).toBeLessThan(0.8);
    expect(prediction.explanation).toContain('das Fenster');
  });

  it('presenta -e come tendenza al 90%', () => {
    const prediction = predictGender('die Suppe');
    expect(prediction.gender).toBe('die');
    expect(prediction.confidence).toBeCloseTo(0.9, 5);
  });

  it('tace invece di inventare quando nessuna regola si applica', () => {
    const prediction = predictGender('Brot');
    expect(prediction.gender).toBeNull();
    expect(prediction.confidence).toBe(0);
  });

  it('espone il tag di suffisso per l’auto-tagging', () => {
    expect(suffixTag('die Rechnung')).toBe('suffix_ung');
    expect(suffixTag('das Mädchen')).toBe('suffix_chen');
  });

  it('toglie l’articolo dalla forma memorizzata nei contenuti', () => {
    expect(stripArticle('das Auto')).toBe('Auto');
    expect(stripArticle('Auto')).toBe('Auto');
  });
});

describe('§9.6 — motore di genere: composti', () => {
  it('restituisce il genere dell’ultimo elemento', () => {
    expect(splitCompound('Bahnhof')).toMatchObject({ head: 'Hof', gender: 'der' });
    expect(splitCompound('Fahrkarte')).toMatchObject({ head: 'Karte', gender: 'die' });
    expect(splitCompound('Wochenende')).toMatchObject({ head: 'Ende', gender: 'das' });
  });

  it('gestisce la vocale di collegamento', () => {
    // «Wochen» + «Ende»: la -n di collegamento non conta come sostanza.
    expect(splitCompound('Wochenende')?.modifier).toBe('Wochen');
  });

  it('la predizione sul composto batte i cue di suffisso', () => {
    // «Fahrkarte» finisce in -e (femminile al 90%) ma la vera ragione è che la
    // testa è «die Karte»: la spiegazione mostrata all'utente deve essere quella.
    const prediction = predictGender('Fahrkarte');
    expect(prediction.ruleId).toBe('compound_head');
    expect(prediction.gender).toBe('die');
    expect(prediction.tag).toBe('kompositum');
  });

  it('non spezza una parola che non è un composto', () => {
    expect(splitCompound('Legende')).toBeNull();
    expect(splitCompound('Ende')).toBeNull();
  });

  it('non dichiara mai una confidenza di 1 sui composti: la regola è certa, la segmentazione no', () => {
    expect(predictGender('Bahnhof').confidence).toBeLessThan(1);
  });
});

describe('regola scoperta', () => {
  const nouns = [
    { de: 'die Wohnung', gender: 'die' as const },
    { de: 'die Rechnung', gender: 'die' as const },
    { de: 'die Zeitung', gender: 'die' as const },
    { de: 'die Meinung', gender: 'die' as const },
    { de: 'die Übung', gender: 'die' as const },
  ];

  it('non mostra nulla prima di cinque incontri', () => {
    expect(findDiscoverableRules(nouns.slice(0, DISCOVERY_THRESHOLD - 1))).toHaveLength(0);
  });

  it('esplicita il pattern al quinto', () => {
    const rules = findDiscoverableRules(nouns);
    expect(rules).toHaveLength(1);
    expect(rules[0].ruleId).toBe('fem_ung');
    expect(rules[0].examples).toHaveLength(5);
  });

  it('non ripropone una regola già mostrata', () => {
    expect(findDiscoverableRules(nouns, new Set(['fem_ung']))).toHaveLength(0);
  });

  it('non mostra una regola che gli esempi dell’utente contraddicono', () => {
    const contraddittori = [
      { de: 'das Fenster', gender: 'das' as const },
      { de: 'das Zimmer', gender: 'das' as const },
      { de: 'das Wasser', gender: 'das' as const },
      { de: 'die Mutter', gender: 'die' as const },
      { de: 'der Lehrer', gender: 'der' as const },
    ];
    expect(findDiscoverableRules(contraddittori)).toHaveLength(0);
  });
});

describe('casi', () => {
  it('classifica il reggente delle preposizioni', () => {
    expect(prepositionGovernment('mit')).toBe('dativ');
    expect(prepositionGovernment('für')).toBe('akkusativ');
    expect(prepositionGovernment('in')).toBe('wechsel');
    expect(prepositionGovernment('blau')).toBeNull();
  });

  it('declina l’articolo determinativo', () => {
    expect(articleFor('das', 'dativ', 'definite')).toBe('dem');
    expect(articleFor('der', 'akkusativ', 'definite')).toBe('den');
    expect(articleFor('die', 'dativ', 'definite')).toBe('der');
    expect(articleFor('der', 'akkusativ', 'indefinite')).toBe('einen');
  });

  it('fornisce il paradigma completo per i distrattori', () => {
    const paradigm = articleParadigm('das', 'definite');
    expect(paradigm).toContain('das');
    expect(paradigm).toContain('dem');
    expect(paradigm.length).toBeGreaterThan(1);
  });

  it('produce la riga di spiegazione della Fase 1', () => {
    const line = explainCaseError({ preposition: 'mit', gender: 'das', expectedCase: 'dativ', noun: 'Auto' });
    expect(line).toContain('mit');
    expect(line).toContain('dativo');
    expect(line).toContain('dem Auto');
  });

  it('sulle preposizioni a doppio caso spiega la differenza, non la regola generica', () => {
    const line = explainCaseError({ preposition: 'in', gender: 'die', expectedCase: 'dativ', noun: 'Stadt' });
    expect(line).toContain('stato');
    expect(line).toContain('der Stadt');
  });
});

describe('ordine delle parole', () => {
  const sentence = 'Ich bleibe zu Hause, weil ich krank bin.';

  it('costruisce i chip e li rimescola senza perderli', () => {
    const chips = buildChips(sentence);
    const shuffled = shuffleChips(chips, () => 0.42);
    expect(shuffled).toHaveLength(chips.length);
    expect(new Set(shuffled.map((c) => c.id))).toEqual(new Set(chips.map((c) => c.id)));
  });

  it('accetta l’ordine giusto ignorando la punteggiatura finale', () => {
    expect(checkOrder(buildChips(sentence), sentence).correct).toBe(true);
  });

  it('indica il punto esatto della divergenza', () => {
    const chips = buildChips('Ich bleibe zu Hause, weil ich bin krank.');
    const result = checkOrder(chips, sentence);
    expect(result.correct).toBe(false);
    expect(result.firstDivergence).toBe(6);
  });

  it('classifica la frase per scegliere la scheda regola', () => {
    expect(classifyClause(sentence)).toBe('subordinate');
    expect(classifyClause('Wie heißen Sie?')).toBe('w_question');
    expect(classifyClause('Kommst du aus Italien?')).toBe('yes_no_question');
    expect(classifyClause('Ich möchte das kaufen.')).toBe('verbal_bracket');
    expect(classifyClause('Ich spiele Fußball.')).toBe('main_v2');
  });

  it('associa a ogni tipo di frase il suo tag e la sua regola', () => {
    expect(explainWordOrder('subordinate')).toMatchObject({ tag: 'verb_final_subordinate' });
    expect(explainWordOrder('main_v2').rule).toContain('SECONDO');
  });
});
