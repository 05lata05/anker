import { describe, expect, it } from 'vitest';
import { a1Pack } from '../content/a1Pack';
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

  it('non propone due opzioni con la stessa traduzione', () => {
    // Il tedesco ha coppie che in italiano collassano: «Wie viel Uhr ist es?» e
    // «Wie spät ist es?» sono entrambe «Che ore sono?». Se finiscono insieme
    // tra le opzioni, la domanda non ha una risposta corretta.
    const oraA = makeItem({ id: 'ora-a', de: 'Wie viel Uhr ist es?', it: 'Che ore sono?', topic: 'orari' });
    const oraB = makeItem({ id: 'ora-b', de: 'Wie spät ist es?', it: 'Che ore sono?', topic: 'orari' });
    const altro = makeItem({ id: 'altro', de: 'Es ist drei Uhr.', it: 'Sono le tre.', topic: 'orari' });

    const prompt = buildPrompt(makeCard('ora-a', 'recognition'), oraA, 'choice', [oraA, oraB, altro, suppe]);
    expect(new Set(prompt.options)).toEqual(new Set(prompt.options));
    expect(prompt.options!.length).toBe(new Set(prompt.options!.map((o) => o.toLowerCase())).size);
    expect(prompt.options!.filter((o) => o === 'Che ore sono?').length).toBe(1);
  });

  it('su tutti i contenuti reali nessuna card a scelta multipla ha opzioni ambigue', () => {
    const pool = a1Pack.items;
    for (const item of pool.filter((i) => i.type !== 'noun').slice(0, 120)) {
      const prompt = buildPrompt(makeCard(item.id, 'recognition'), item, 'choice', pool);
      const options = prompt.options!;
      expect(new Set(options.map((o) => o.toLowerCase())).size, `${item.id}: opzioni duplicate`).toBe(options.length);
      expect(options).toContain(item.it);
    }
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

  it('su una domanda di significato non tira fuori regole grammaticali', () => {
    // «Che cosa significa der Tag?» sbagliata non è un errore di genere:
    // spiegare che i giorni sono maschili sarebbe fuori bersaglio.
    const tag = makeItem({
      id: 'der-tag',
      type: 'noun',
      de: 'der Tag',
      it: 'il giorno',
      gender: 'der',
      plural: 'die Tage',
      tags: ['gender_der'],
    });
    const feedback = buildFeedback(checkGloss('la notte', 'il giorno'), tag, { expectsGerman: false });
    expect(feedback.correct).toBe(false);
    expect(feedback.correction).toBe('il giorno');
    expect(feedback.explanation).toBeNull();
    expect(feedback.tag).toBeNull();
  });

  it('sulla stessa parola, se chiede il tedesco, la regola torna pertinente', () => {
    const familie = makeItem({
      id: 'die-familie',
      type: 'noun',
      de: 'die Familie',
      it: 'la famiglia',
      gender: 'die',
      plural: 'die Familien',
      tags: ['gender_die', 'suffix_ie'],
    });
    const feedback = buildFeedback(checkAnswer('der Familie', 'die Familie'), familie, { expectsGerman: true });
    expect(feedback.explanation).toContain('-ie');
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

  const planInput = {
    now: NOW,
    settings: testSettings,
    cards,
    itemsById: itemMap(items),
    lessons: [makeLesson({ id: 'l1', targetItemIds: ['das-auto'] })],
    errorProfile: new Map<GrammarTag, ErrorProfileEntry>(),
    knownItemIds: new Set(['das-auto', 'mit-dem-auto']),
  };

  const plan = buildSessionPlan(planInput);
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

  it('propone la trasformazione solo se i contenuti la autorizzano', () => {
    const conTrasformazione = makeItem({
      id: 'con-trasf',
      de: 'Ich fahre mit dem Auto.',
      it: 'Vado in macchina.',
      topic: 'trasporti',
      freqRank: 5,
      transformations: [
        {
          prompt: 'Riscrivi al perfetto',
          from: 'Ich fahre mit dem Auto.',
          to: 'Ich bin mit dem Auto gefahren.',
          tag: 'perfekt_haben_sein',
        },
      ],
    });
    const senzaTrasformazione = makeItem({ id: 'senza-trasf', de: 'Guten Tag!', it: 'Buongiorno!', freqRank: 6 });

    // Tre item consolidati: il terzo occupa il gradino della trasformazione.
    const consolidati = [
      makeItem({ id: 'primo', freqRank: 1 }),
      makeItem({ id: 'secondo', freqRank: 2 }),
      conTrasformazione,
    ];
    const conCards = consolidati.map((item) => makeCard(item.id, 'recognition', { stability: 20 }));

    const conPlan = buildSessionPlan({
      ...planInput,
      cards: conCards,
      itemsById: itemMap(consolidati),
      knownItemIds: new Set(consolidati.map((i) => i.id)),
    });
    const conRungs = buildSteps(conPlan)
      .filter((s) => s.phase === 'output')
      .map((s) => (s.phase === 'output' ? s : null));

    const transformationStep = conRungs.find((s) => s?.rung === 'transformation');
    expect(transformationStep).toBeDefined();
    expect(transformationStep?.transformation?.to).toBe('Ich bin mit dem Auto gefahren.');

    // Stesso posto, item senza coppia autorizzata: si ripiega sul riordino
    // invece di generare tedesco che nessuno ha verificato.
    const senza = [makeItem({ id: 'primo', freqRank: 1 }), makeItem({ id: 'secondo', freqRank: 2 }), senzaTrasformazione];
    const senzaPlan = buildSessionPlan({
      ...planInput,
      cards: senza.map((item) => makeCard(item.id, 'recognition', { stability: 20 })),
      itemsById: itemMap(senza),
      knownItemIds: new Set(senza.map((i) => i.id)),
    });
    const senzaRungs = buildSteps(senzaPlan)
      .filter((s) => s.phase === 'output')
      .map((s) => (s.phase === 'output' ? s.rung : ''));

    expect(senzaRungs).not.toContain('transformation');
    expect(senzaRungs.filter((r) => r === 'reorder').length).toBeGreaterThanOrEqual(1);
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
