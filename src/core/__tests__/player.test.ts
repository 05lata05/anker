import { describe, expect, it } from 'vitest';
import { checkAnswer, checkGloss } from '../german/answerCheck';
import { buildFeedback } from '../session/feedback';
import { buildPrompt, gradeAnswer, shuffleDeterministic } from '../session/grading';
import { buildSessionPlan } from '../session/plan';
import { PHASE_ORDER, buildSteps, phasesPresent, progressWithinPhase } from '../session/steps';
import type { Card, ErrorProfileEntry, GrammarTag, Item } from '../types';
import { NOW, itemMap, makeCard, makeItem, makeLesson, testSettings } from './helpers';

const autoNoun = makeItem({
  id: 'das-auto',
  type: 'noun',
  de: 'das Auto',
  it: "l'automobile",
  gender: 'das',
  plural: 'die Autos',
  topic: 'trasporti',
});

const chunk = makeItem({
  id: 'mit-dem-auto',
  de: 'Ich fahre mit dem Auto.',
  it: 'Vado in macchina.',
  topic: 'trasporti',
  tags: ['dativ', 'praeposition_dativ', 'v2_order'],
});

const suppe = makeItem({
  id: 'die-suppe',
  type: 'noun',
  de: 'die Suppe',
  it: 'la zuppa',
  gender: 'die',
  plural: 'die Suppen',
  topic: 'cibo',
});

const pool = [autoNoun, chunk, suppe];

describe('costruzione delle domande', () => {
  it('la card gender chiede l’articolo e offre der/die/das', () => {
    const prompt = buildPrompt(makeCard('das-auto', 'gender'), autoNoun, 'choice', pool);
    expect(prompt.text).toBe('Auto');
    expect(prompt.options).toEqual(['der', 'die', 'das']);
    expect(prompt.expected).toBe('das');
  });

  it('la produzione parte dall’italiano e attende il tedesco', () => {
    const prompt = buildPrompt(makeCard('mit-dem-auto', 'production'), chunk, 'typed', pool);
    expect(prompt.text).toBe('Vado in macchina.');
    expect(prompt.expected).toBe('Ich fahre mit dem Auto.');
    expect(prompt.answerLanguage).toBe('de');
  });

  it('il riconoscimento parte dal tedesco e attende l’italiano', () => {
    const prompt = buildPrompt(makeCard('mit-dem-auto', 'recognition'), chunk, 'typed', pool);
    expect(prompt.text).toBe('Ich fahre mit dem Auto.');
    expect(prompt.answerLanguage).toBe('it');
    expect(prompt.options).toBeUndefined();
  });

  it('l’ascolto non mostra il testo: sarebbe un esercizio di lettura', () => {
    const prompt = buildPrompt(makeCard('mit-dem-auto', 'listening'), chunk, 'typed', pool);
    expect(prompt.language).toBe('audio');
    expect(prompt.text).toBe('');
  });

  it('la scelta multipla include la risposta giusta e distrattori plausibili', () => {
    const prompt = buildPrompt(makeCard('das-auto', 'recognition'), autoNoun, 'choice', pool);
    expect(prompt.options).toContain("l'automobile");
    expect(prompt.options!.length).toBeGreaterThan(1);
    // Il primo distrattore viene dallo stesso topic: «la zuppa» come alternativa
    // a «l'automobile» non è un esercizio.
    expect(prompt.options).toContain('Vado in macchina.');
  });

  it('l’ordine delle opzioni è stabile per la stessa card', () => {
    const first = buildPrompt(makeCard('das-auto', 'recognition'), autoNoun, 'choice', pool);
    const second = buildPrompt(makeCard('das-auto', 'recognition'), autoNoun, 'choice', pool);
    expect(first.options).toEqual(second.options);
    expect(shuffleDeterministic(['a', 'b', 'c'], 'k')).toEqual(shuffleDeterministic(['a', 'b', 'c'], 'k'));
  });
});

describe('correzione secondo la lingua della risposta', () => {
  it('sul tedesco è severa', () => {
    const prompt = buildPrompt(makeCard('mit-dem-auto', 'production'), chunk, 'typed', pool);
    expect(gradeAnswer(prompt, 'Ich fahre mit der Auto.').wasCorrect).toBe(false);
    expect(gradeAnswer(prompt, 'Ich fahre mit dem Auto.').wasCorrect).toBe(true);
  });

  it('sull’italiano è permissiva: si misura la comprensione, non la formulazione', () => {
    const prompt = buildPrompt(makeCard('mit-dem-auto', 'recognition'), chunk, 'typed', pool);
    expect(gradeAnswer(prompt, 'vado in macchina').wasCorrect).toBe(true);
    expect(gradeAnswer(prompt, 'Vado in macchina!').wasCorrect).toBe(true);
    expect(gradeAnswer(prompt, 'mangio una zuppa').wasCorrect).toBe(false);
  });

  it('la glossa tollera una parola in più ma non un significato diverso', () => {
    expect(checkGloss("vado con l'auto", 'Vado in macchina.').wasCorrect).toBe(false);
    expect(checkGloss('la zuppa calda', 'la zuppa').wasCorrect).toBe(true);
  });
});

describe('feedback', () => {
  it('sull’errore di caso dice la regola, non solo la forma giusta', () => {
    const check = checkAnswer('Ich fahre mit der Auto.', 'Ich fahre mit dem Auto.');
    const feedback = buildFeedback(check, chunk);
    expect(feedback.correct).toBe(false);
    expect(feedback.explanation).toContain('mit');
    expect(feedback.explanation).toContain('dativo');
    expect(feedback.explanation).toContain('dem Auto');
    expect(feedback.tag).toBe('dativ');
  });

  it('sulla risposta giusta non aggiunge rumore', () => {
    const feedback = buildFeedback(checkAnswer('Ich fahre mit dem Auto.', 'Ich fahre mit dem Auto.'), chunk);
    expect(feedback.correct).toBe(true);
    expect(feedback.explanation).toBeNull();
    expect(feedback.correction).toBeNull();
  });

  it('sul typo accetta ma mostra la forma corretta', () => {
    const feedback = buildFeedback(checkAnswer('Ich fahre mit dem Auho.', 'Ich fahre mit dem Auto.'), chunk);
    expect(feedback.correct).toBe(true);
    expect(feedback.correction).toBe('Ich fahre mit dem Auto');
  });

  it('su un genere sbagliato cita la regola di QUELLA parola, non una generica', () => {
    const familie = makeItem({
      id: 'die-familie',
      type: 'noun',
      de: 'die Familie',
      it: 'la famiglia',
      gender: 'die',
      plural: 'die Familien',
      tags: ['gender_die', 'suffix_ie'],
    });
    const feedback = buildFeedback(checkAnswer('der Familie', 'die Familie'), familie);
    expect(feedback.explanation).toContain('-ie');
    expect(feedback.explanation).not.toContain('-ung');
    expect(feedback.tag).toBe('gender_die');
  });

  it('quando nessuna regola predice il genere lo dice, invece di inventarne una', () => {
    // `Auto` non finisce con nessun suffisso informativo: citare i diminutivi
    // in -chen sarebbe una regola vera e del tutto inutile qui.
    const feedback = buildFeedback(checkAnswer('die', 'das'), autoNoun);
    expect(feedback.explanation).toContain('per esposizione');
    expect(feedback.explanation).not.toContain('-chen');
    expect(feedback.tag).toBe('gender_das');
  });

  it('quando l’errore non è sull’articolo ripiega sulla regola del tag', () => {
    const ordine = makeItem({
      id: 'weil',
      de: 'Ich bleibe zu Hause, weil ich krank bin.',
      it: 'Resto a casa perché sono malato.',
      tags: ['verb_final_subordinate'],
    });
    const feedback = buildFeedback(checkAnswer('Ich bleibe zu Hause weil ich bin krank', ordine.de), ordine);
    expect(feedback.explanation).toContain('FONDO');
    expect(feedback.tag).toBe('verb_final_subordinate');
  });
});

describe('appiattimento in passi', () => {
  const items: Item[] = [
    autoNoun,
    chunk,
    suppe,
    makeItem({ id: 'nuovo-1', de: 'Was kostet das?', it: 'Quanto costa?', topic: 'acquisti', freqRank: 30 }),
    makeItem({ id: 'nuovo-2', de: 'Das ist zu teuer.', it: 'È troppo caro.', topic: 'acquisti', freqRank: 40 }),
  ];

  const cards: Card[] = [
    makeCard('das-auto', 'recognition', { stability: 40 }),
    makeCard('das-auto', 'gender', { stability: 8 }),
    makeCard('mit-dem-auto', 'recognition', { stability: 30 }),
    makeCard('die-suppe', 'recognition', { stability: 5 }),
  ];

  const plan = buildSessionPlan({
    now: NOW,
    settings: testSettings,
    cards,
    itemsById: itemMap(items),
    lessons: [makeLesson({ id: 'l1', targetItemIds: ['das-auto'] })],
    errorProfile: new Map<GrammarTag, ErrorProfileEntry>(),
    knownItemIds: new Set(['das-auto', 'mit-dem-auto']),
  });

  const steps = buildSteps(plan);

  it('mantiene l’ordine delle fasi', () => {
    const seen = steps.map((step) => PHASE_ORDER.indexOf(step.phase));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  it('chiude sempre con il consolidamento', () => {
    expect(steps[steps.length - 1].phase).toBe('consolidation');
  });

  it('mette il dialogo prima delle domande di comprensione', () => {
    const dialogue = steps.findIndex((s) => s.phase === 'input' && s.kind === 'dialogue');
    const question = steps.findIndex((s) => s.phase === 'input' && s.kind === 'question');
    expect(dialogue).toBeGreaterThanOrEqual(0);
    expect(question).toBeGreaterThan(dialogue);
    expect(steps.filter((s) => s.phase === 'input' && s.kind === 'question')).toHaveLength(2);
  });

  it('apre la Fase 4 con lo shadowing e poi sale di difficoltà', () => {
    const rungs = steps.filter((s) => s.phase === 'output').map((s) => (s.phase === 'output' ? s.rung : ''));
    expect(rungs[0]).toBe('shadowing');
    expect(rungs).toContain('completion');
  });

  it('non annuncia fasi che non contengono passi', () => {
    const present = phasesPresent(steps);
    for (const phase of present) {
      expect(steps.some((step) => step.phase === phase)).toBe(true);
    }
  });

  it('sa dire a che punto è dentro la fase corrente', () => {
    const progress = progressWithinPhase(steps, 0);
    expect(progress.done).toBe(0);
    expect(progress.total).toBeGreaterThan(0);
  });

  it('ogni passo ha un id univoco: è la chiave della ripresa', () => {
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
  });
});
