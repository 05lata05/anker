import { describe, expect, it } from 'vitest';
import { checkAnswer, foldUmlauts, levenshtein, ratingInputFromCheck } from '../german/answerCheck';
import {
  DEFAULT_TYPING_CPS,
  MAX_PLAUSIBLE_LATENCY_MS,
  RATING_THRESHOLDS,
  deriveRating,
  normalizeLatency,
} from '../scheduler/rating';
import { Rating } from '../types';

describe('§9.7 — le quattro soglie del rating derivato', () => {
  const base = { wasCorrect: true, direction: 'recognition' as const };

  it('corretto sotto i 3 secondi → Easy', () => {
    expect(deriveRating({ ...base, latencyMs: 2_999 }).rating).toBe(Rating.Easy);
  });

  it('corretto tra 3 e 8 secondi → Good', () => {
    expect(deriveRating({ ...base, latencyMs: RATING_THRESHOLDS.easyMs }).rating).toBe(Rating.Good);
    expect(deriveRating({ ...base, latencyMs: RATING_THRESHOLDS.goodMs }).rating).toBe(Rating.Good);
  });

  it('corretto sopra gli 8 secondi → Hard', () => {
    expect(deriveRating({ ...base, latencyMs: 8_001 }).rating).toBe(Rating.Hard);
  });

  it('corretto dopo un suggerimento → Hard, per veloce che sia stato', () => {
    const derived = deriveRating({ ...base, latencyMs: 500, usedHint: true });
    expect(derived.rating).toBe(Rating.Hard);
    expect(derived.reason).toBe('hint');
  });

  it('errato → Again, indipendentemente dal tempo', () => {
    expect(deriveRating({ ...base, wasCorrect: false, latencyMs: 100 }).rating).toBe(Rating.Again);
    expect(deriveRating({ ...base, wasCorrect: false, latencyMs: 30_000 }).rating).toBe(Rating.Again);
  });
});

describe('normalizzazione della latenza', () => {
  const longAnswer = 'Ich hätte gern einen Kaffee.';

  it('scorpora il tempo di battitura sulle card di produzione', () => {
    const raw = 9_000;
    const normalized = normalizeLatency({
      wasCorrect: true,
      latencyMs: raw,
      direction: 'production',
      expectedLength: longAnswer.length,
    });
    const mechanical = (longAnswer.length / DEFAULT_TYPING_CPS) * 1000;
    expect(normalized).toBeCloseTo(raw - mechanical, 5);
  });

  it('senza scorporo ogni risposta lunga finirebbe Hard: con lo scorporo no', () => {
    const latencyMs = 11_000;
    // Stessa latenza, stessa risposta: cambia solo se il tempo di battitura
    // viene scorporato. Senza, 11 secondi lordi sfondano la soglia degli 8 e
    // ogni card di produzione finirebbe Hard a prescindere da quanto l'utente
    // sappia la risposta.
    const senzaScorporo = deriveRating({ wasCorrect: true, latencyMs, direction: 'recognition' });
    const conScorporo = deriveRating({
      wasCorrect: true,
      latencyMs,
      direction: 'production',
      expectedLength: longAnswer.length,
    });

    expect(senzaScorporo.rating).toBe(Rating.Hard);
    expect(conScorporo.rating).toBe(Rating.Good);
  });

  it('non scorpora nulla sulle card di riconoscimento', () => {
    expect(
      normalizeLatency({ wasCorrect: true, latencyMs: 5_000, direction: 'recognition', expectedLength: 40 }),
    ).toBe(5_000);
  });

  it('tronca gli outlier: una latenza di 10 minuti è un’interruzione', () => {
    const derived = deriveRating({ wasCorrect: true, latencyMs: 600_000, direction: 'recognition' });
    expect(derived.normalizedLatencyMs).toBe(MAX_PLAUSIBLE_LATENCY_MS);
    expect(derived.rating).toBe(Rating.Hard);
  });

  it('non va mai sotto zero', () => {
    expect(
      normalizeLatency({ wasCorrect: true, latencyMs: 100, direction: 'production', expectedLength: 200 }),
    ).toBe(0);
  });

  it('un’auto-valutazione non produce mai Easy', () => {
    const derived = deriveRating({ wasCorrect: true, latencyMs: 200, direction: 'speaking', selfAssessed: true });
    expect(derived.rating).toBe(Rating.Good);
    expect(derived.reason).toBe('self_assessed');
  });
});

describe('correzione delle risposte scritte', () => {
  it('accetta la forma esatta', () => {
    expect(checkAnswer('Ich hätte gern einen Kaffee.', 'Ich hätte gern einen Kaffee.').verdict).toBe('correct');
  });

  it('ignora la punteggiatura finale e gli spazi doppi', () => {
    expect(checkAnswer('  Das  Auto ', 'Das Auto.').verdict).toBe('correct');
  });

  it('accetta ae/oe/ue/ss al posto delle dieresi', () => {
    const check = checkAnswer('Ich haette gern einen Kaese', 'Ich hätte gern einen Käse');
    expect(check.verdict).toBe('umlaut_spelling');
    expect(check.wasCorrect).toBe(true);
  });

  it('segnala la maiuscola mancante senza bocciare', () => {
    const check = checkAnswer('das auto', 'das Auto');
    expect(check.verdict).toBe('capitalization');
    expect(check.wasCorrect).toBe(true);
    expect(check.note).toContain('maiuscola');
  });

  it('tratta un carattere sbagliato come typo, non come vuoto di memoria', () => {
    const check = checkAnswer('Kaffe', 'Kaffee');
    expect(check.verdict).toBe('typo');
    expect(check.wasCorrect).toBe(true);
  });

  it('ma su parole corte un carattere cambia la parola', () => {
    expect(checkAnswer('der', 'dem').verdict).toBe('wrong');
  });

  it('non perdona come typo un errore di caso: «der» per «dem» è un errore grammaticale', () => {
    const check = checkAnswer('Ich fahre mit der Auto', 'Ich fahre mit dem Auto');
    expect(check.verdict).toBe('wrong');
    expect(check.wasCorrect).toBe(false);
    expect(check.differingToken).toMatchObject({ got: 'der', expected: 'dem', index: 3 });
  });

  it('boccia una parola omessa', () => {
    expect(checkAnswer('Ich fahre mit Auto', 'Ich fahre mit dem Auto').verdict).toBe('wrong');
  });

  it('perdona un typo dentro una frase lunga, se non tocca una parola grammaticale', () => {
    const check = checkAnswer('Ich fahre mit dem Auho', 'Ich fahre mit dem Auto');
    expect(check.verdict).toBe('typo');
    expect(check.differingToken?.expected).toBe('auto');
  });

  it('il typo si traduce in Hard, non in Again', () => {
    const check = checkAnswer('Kaffe', 'Kaffee');
    const rating = deriveRating(ratingInputFromCheck(check, { latencyMs: 1_000, direction: 'production' }));
    expect(rating.rating).toBe(Rating.Hard);
  });

  it('una risposta sbagliata si traduce in Again', () => {
    const check = checkAnswer('Auto', 'Fahrkarte');
    const rating = deriveRating(ratingInputFromCheck(check, { latencyMs: 1_000, direction: 'production' }));
    expect(rating.rating).toBe(Rating.Again);
  });

  it('foldUmlauts e levenshtein fanno il loro mestiere', () => {
    expect(foldUmlauts('Füße groß')).toBe('Fuesse gross');
    expect(levenshtein('Kaffee', 'Kaffee')).toBe(0);
    expect(levenshtein('Kaffe', 'Kaffee')).toBe(1);
    expect(levenshtein('', 'abc')).toBe(3);
  });
});
