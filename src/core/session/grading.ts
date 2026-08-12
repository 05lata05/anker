/**
 * Cosa viene chiesto, e come si corregge, per ogni combinazione di direzione e
 * formato. Sta in `core/` e non nella UI perché è una regola didattica: la
 * schermata deve solo disegnare la domanda che riceve.
 */
import { type AnswerCheck, checkAnswer, checkGloss } from '../german/answerCheck';
import type { Card, Direction, Item } from '../types';
import type { ExerciseFormat } from './formats';

export type PromptLanguage = 'de' | 'it' | 'audio';

export interface Prompt {
  /** Cosa mostrare in grande. */
  text: string;
  language: PromptLanguage;
  /** Consegna in italiano. */
  instruction: string;
  /** Risposta attesa, usata per la correzione e per il feedback. */
  expected: string;
  /** In che lingua risponde l'utente: decide quale correttore usare. */
  answerLanguage: 'de' | 'it';
  /** Opzioni, solo per il formato a scelta. */
  options?: string[];
}

const INSTRUCTIONS: Record<Direction, string> = {
  recognition: 'Che cosa significa?',
  listening: 'Ascolta e scrivi che cosa significa.',
  production: 'Scrivi in tedesco.',
  speaking: 'Dillo in tedesco.',
  gender: 'Quale articolo?',
};

/**
 * Distrattori per la scelta multipla, presi da altri item.
 *
 * Devono essere plausibili — quattro opzioni di cui tre assurde non sono un
 * esercizio, sono un regalo — ma soprattutto DIVERSI dalla risposta giusta.
 * Il tedesco ha coppie che condividono la traduzione italiana: «Wie viel Uhr
 * ist es?» e «Wie spät ist es?» sono entrambe «Che ore sono?». Senza il
 * controllo sulla glossa la domanda finisce con due opzioni identiche e
 * nessuna risposta corretta possibile.
 */
export function glossDistractors(item: Item, pool: readonly Item[], count = 3): string[] {
  const sameTopic = pool.filter((other) => other.id !== item.id && other.topic === item.topic);
  const rest = pool.filter((other) => other.id !== item.id && other.topic !== item.topic);

  const used = new Set([normalizeGloss(item.it)]);
  const out: string[] = [];

  for (const candidate of [...sameTopic, ...rest]) {
    if (out.length >= count) break;
    const key = normalizeGloss(candidate.it);
    if (used.has(key)) continue;
    used.add(key);
    out.push(candidate.it);
  }

  return out;
}

function normalizeGloss(gloss: string): string {
  return gloss.toLowerCase().replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ').trim();
}

export function buildPrompt(
  card: Card,
  item: Item,
  format: ExerciseFormat,
  pool: readonly Item[],
): Prompt {
  if (card.direction === 'gender') {
    const bare = item.de.replace(/^(der|die|das)\s+/, '');
    return {
      text: bare,
      language: 'de',
      instruction: INSTRUCTIONS.gender,
      expected: item.gender ?? 'das',
      answerLanguage: 'de',
      options: ['der', 'die', 'das'],
    };
  }

  if (card.direction === 'production' || card.direction === 'speaking') {
    return {
      text: item.it,
      language: 'it',
      instruction: INSTRUCTIONS[card.direction],
      expected: item.de,
      answerLanguage: 'de',
    };
  }

  // recognition e listening: si risponde in italiano.
  const base: Prompt = {
    text: card.direction === 'listening' ? '' : item.de,
    language: card.direction === 'listening' ? 'audio' : 'de',
    instruction: INSTRUCTIONS[card.direction],
    expected: item.it,
    answerLanguage: 'it',
  };

  if (format === 'choice') {
    const options = [item.it, ...glossDistractors(item, pool)];
    return { ...base, options: shuffleDeterministic(options, item.id) };
  }

  return base;
}

export function gradeAnswer(prompt: Prompt, userAnswer: string): AnswerCheck {
  return prompt.answerLanguage === 'it' ? checkGloss(userAnswer, prompt.expected) : checkAnswer(userAnswer, prompt.expected);
}

/**
 * Mescolamento deterministico a partire da una chiave.
 * Deterministico perché la stessa card riproposta nella stessa sessione non
 * deve cambiare l'ordine delle opzioni: l'utente ricorderebbe la posizione
 * invece della risposta.
 */
export function shuffleDeterministic<T>(values: readonly T[], key: string): T[] {
  let seed = 0;
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;

  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const j = seed % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
