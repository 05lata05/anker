import { describe, expect, it } from 'vitest';
import {
  SHADOWING_RATES,
  SILENCE_DB,
  type EnvelopeSample,
  buildEnvelope,
  compareTiming,
  countSyllables,
  levelFromDb,
  speechSpan,
} from '../audio/envelope';

describe('livello dal metering', () => {
  it('mappa i dBFS su 0-1', () => {
    expect(levelFromDb(0)).toBe(1);
    expect(levelFromDb(SILENCE_DB)).toBe(0);
    expect(levelFromDb(-30)).toBeCloseTo(0.5, 5);
  });

  it('tronca i valori fuori scala invece di produrre numeri assurdi', () => {
    expect(levelFromDb(-160)).toBe(0);
    expect(levelFromDb(12)).toBe(1);
    expect(levelFromDb(Number.NaN)).toBe(0);
  });
});

describe('inviluppo', () => {
  function ramp(count: number, dbAt: (i: number) => number): EnvelopeSample[] {
    return Array.from({ length: count }, (_, i) => ({ t: i * 50, db: dbAt(i) }));
  }

  it('riduce i campioni al numero di barre richiesto', () => {
    expect(buildEnvelope(ramp(100, () => -20), 24)).toHaveLength(24);
  });

  it('tiene il massimo di ogni intervallo, non la media', () => {
    // Una sillaba breve e forte dentro un intervallo lungo e silenzioso deve
    // restare visibile: mediando sparirebbe proprio ciò che si vuole guardare.
    const samples = ramp(40, (i) => (i === 3 ? 0 : SILENCE_DB));
    const envelope = buildEnvelope(samples, 4);
    expect(envelope[0]).toBe(1);
    expect(envelope[1]).toBe(0);
  });

  it('non esplode su input vuoto o su un campione solo', () => {
    expect(buildEnvelope([])).toEqual([]);
    expect(buildEnvelope([{ t: 0, db: -12 }])).toHaveLength(1);
  });
});

describe('individuazione del parlato', () => {
  const silence = 0;
  const speech = 0.9;

  it('ritaglia il silenzio iniziale e finale', () => {
    const envelope = [silence, silence, speech, speech, speech, silence];
    const span = speechSpan(envelope, 6000);
    expect(span.from).toBe(2);
    expect(span.to).toBe(4);
    expect(span.durationMs).toBe(3000);
  });

  it('conta le pause interne lunghe', () => {
    const envelope = [speech, speech, silence, silence, silence, speech, speech];
    const span = speechSpan(envelope, 7000, { minPauseMs: 900 });
    expect(span.pauses).toBe(1);
  });

  it('non conta come pausa una micro-interruzione', () => {
    const envelope = [speech, silence, speech, speech];
    expect(speechSpan(envelope, 4000, { minPauseMs: 2000 }).pauses).toBe(0);
  });

  it('dichiara l’assenza di parlato invece di inventare una durata', () => {
    const span = speechSpan([silence, silence, silence], 3000);
    expect(span.from).toBe(-1);
    expect(span.durationMs).toBe(0);
  });
});

describe('conteggio sillabe', () => {
  it('conta i gruppi vocalici', () => {
    expect(countSyllables('das Auto')).toBe(3);
    // Ich · fah-re · mit · dem · Au-to
    expect(countSyllables('Ich fahre mit dem Auto.')).toBe(7);
    expect(countSyllables('Guten Tag')).toBe(3);
  });

  it('gestisce le dieresi', () => {
    expect(countSyllables('die Küche')).toBe(3);
  });

  it('restituisce zero su testo senza vocali', () => {
    expect(countSyllables('!!! ???')).toBe(0);
  });
});

describe('confronto del ritmo', () => {
  const text = 'Ich fahre mit dem Auto.';

  it('riconosce quando l’utente è più lento', () => {
    const result = compareTiming({ text, referenceMs: 2000, userSpeechMs: 3200, pauses: 0 });
    expect(result.verdict).toBe('slower');
    expect(result.message).toContain('più lento');
  });

  it('riconosce quando è più veloce, e avverte del rischio', () => {
    const result = compareTiming({ text, referenceMs: 2000, userSpeechMs: 1400, pauses: 0 });
    expect(result.verdict).toBe('faster');
    expect(result.message).toContain('sillabe');
  });

  it('accetta uno scarto entro il 20%', () => {
    expect(compareTiming({ text, referenceMs: 2000, userSpeechMs: 2200, pauses: 0 }).verdict).toBe('aligned');
    expect(compareTiming({ text, referenceMs: 2000, userSpeechMs: 1800, pauses: 0 }).verdict).toBe('aligned');
  });

  it('segnala le pause: nello shadowing la frase va tenuta intera', () => {
    const result = compareTiming({ text, referenceMs: 2000, userSpeechMs: 2100, pauses: 2 });
    expect(result.message).toContain('2 pause');
  });

  it('ammette di non poter dire nulla senza segnale', () => {
    const result = compareTiming({ text, referenceMs: 0, userSpeechMs: 0, pauses: 0 });
    expect(result.verdict).toBe('unknown');
    expect(result.message).toContain('Non ho abbastanza segnale');
  });

  it('calcola le sillabe al secondo di entrambi', () => {
    const result = compareTiming({ text, referenceMs: 2000, userSpeechMs: 4000, pauses: 0 });
    expect(result.referenceSyllablesPerSecond).toBeCloseTo(3.5, 5);
    expect(result.userSyllablesPerSecond).toBeCloseTo(1.75, 5);
  });
});

describe('passaggi dello shadowing', () => {
  it('sono due, prima rallentato poi a velocità piena', () => {
    expect(SHADOWING_RATES).toEqual([0.8, 1]);
  });
});
