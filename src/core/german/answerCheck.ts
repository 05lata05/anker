/**
 * Correzione delle risposte scritte.
 *
 * Due decisioni non ovvie, entrambe conseguenza del fatto che in tedesco
 * l'ortografia porta informazione grammaticale:
 *
 * - **La maiuscola dei sostantivi non è un dettaglio.** `auto` invece di `Auto`
 *   è un errore di ortografia tedesca. Ma bocciare la risposta e mandare l'item
 *   in `Again` per una maiuscola punisce una conoscenza che c'è: si accetta e
 *   si segnala.
 * - **Un typo non è un vuoto di memoria.** `Kaffe` per `Kaffee` significa che
 *   l'item è stato recuperato. Trattarlo come `Again` distrugge la stima di
 *   stability per un dito scivolato sulla tastiera. Si accetta e si declassa a
 *   `Hard`.
 */
import type { RatingInput } from '../scheduler/rating';
import type { Direction } from '../types';

export type AnswerVerdict = 'correct' | 'umlaut_spelling' | 'capitalization' | 'typo' | 'wrong';

export interface AnswerCheck {
  verdict: AnswerVerdict;
  /** Conta come richiamo riuscito ai fini di FSRS e del profilo errori. */
  wasCorrect: boolean;
  distance: number;
  normalizedUser: string;
  normalizedExpected: string;
  /** Riga di feedback in italiano, `null` se la risposta è perfetta. */
  note: string | null;
  /**
   * Se l'errore è concentrato su una parola sola, quale. Il layer di sessione
   * lo usa per costruire il feedback esplicito («dopo mit si usa il dativo →
   * dem Auto») invece di limitarsi a mostrare la frase giusta.
   */
  differingToken: { got: string; expected: string; index: number } | null;
}

const PUNCTUATION = /[.,!?;:„“”"'’()[\]»«…]/g;

export function normalize(text: string): string {
  return text.replace(PUNCTUATION, ' ').replace(/\s+/g, ' ').trim();
}

/** ä→ae, ö→oe, ü→ue, ß→ss. Consente di digitare senza tastiera tedesca. */
export function foldUmlauts(text: string): string {
  return text
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    [previous, current] = [current, previous];
  }

  return previous[b.length];
}

/** Sotto questa lunghezza un errore di un carattere non è un typo, è un'altra parola. */
export const MIN_LENGTH_FOR_TYPO = 4;
export const MAX_TYPO_DISTANCE = 1;

/**
 * Parole su cui la tolleranza al typo NON si applica.
 *
 * È la correzione più importante di questo modulo. `der` e `dem` distano un
 * carattere, ma «Ich fahre mit der Auto» non è un dito scivolato: è un errore
 * di caso, cioè esattamente ciò che l'app deve intercettare e spiegare.
 * Perdonarlo come typo significherebbe insegnare che il dativo è opzionale.
 */
const GRAMMATICALLY_LOADED = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des',
  'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  'kein', 'keine', 'keinen', 'keinem', 'keiner',
  'mein', 'meine', 'meinen', 'meinem', 'meiner',
  'dein', 'deine', 'deinen', 'deinem', 'deiner',
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr',
  'mir', 'mich', 'dir', 'dich', 'ihm', 'ihn', 'ihnen', 'uns', 'euch',
  'zum', 'zur', 'am', 'im', 'vom', 'beim', 'ins', 'ans',
  'ist', 'sind', 'bin', 'bist', 'hat', 'habe', 'hast', 'haben',
  'nicht', 'nichts', 'noch', 'nach', 'auch',
]);

function tokensOf(text: string): string[] {
  return text.split(' ').filter(Boolean);
}

/** L'unico token che differisce, se ce n'è esattamente uno. */
function singleTokenDiff(
  user: readonly string[],
  expected: readonly string[],
): { got: string; expected: string; index: number } | null {
  if (user.length !== expected.length) return null;

  let index = -1;
  for (let i = 0; i < expected.length; i++) {
    if (user[i] === expected[i]) continue;
    if (index !== -1) return null;
    index = i;
  }

  return index === -1 ? null : { got: user[index], expected: expected[index], index };
}

export function checkAnswer(userAnswer: string, expected: string): AnswerCheck {
  const normalizedUser = normalize(userAnswer);
  const normalizedExpected = normalize(expected);

  const base = { normalizedUser, normalizedExpected, differingToken: null };

  if (normalizedUser === normalizedExpected) {
    return { ...base, verdict: 'correct', wasCorrect: true, distance: 0, note: null };
  }

  if (normalizedUser.toLowerCase() === normalizedExpected.toLowerCase()) {
    return {
      ...base,
      verdict: 'capitalization',
      wasCorrect: true,
      distance: 0,
      note: `In tedesco i sostantivi si scrivono sempre con la maiuscola: «${normalizedExpected}».`,
    };
  }

  const foldedUser = foldUmlauts(normalizedUser).toLowerCase();
  const foldedExpected = foldUmlauts(normalizedExpected).toLowerCase();

  if (foldedUser === foldedExpected) {
    return {
      ...base,
      verdict: 'umlaut_spelling',
      wasCorrect: true,
      distance: 0,
      note: `Va bene: «ae/oe/ue/ss» sostituiscono «ä/ö/ü/ß». La forma con dieresi è «${normalizedExpected}».`,
    };
  }

  const distance = levenshtein(foldedUser, foldedExpected);
  const diff = singleTokenDiff(tokensOf(foldedUser), tokensOf(foldedExpected));

  const isTypo =
    diff !== null &&
    diff.expected.length >= MIN_LENGTH_FOR_TYPO &&
    levenshtein(diff.got, diff.expected) <= MAX_TYPO_DISTANCE &&
    !GRAMMATICALLY_LOADED.has(diff.expected) &&
    !GRAMMATICALLY_LOADED.has(diff.got);

  if (isTypo) {
    return {
      ...base,
      differingToken: diff,
      verdict: 'typo',
      wasCorrect: true,
      distance,
      note: `Quasi: la forma corretta è «${normalizedExpected}».`,
    };
  }

  return {
    ...base,
    differingToken: diff,
    verdict: 'wrong',
    wasCorrect: false,
    distance,
    note: `La forma corretta è «${normalizedExpected}».`,
  };
}

const ITALIAN_FUNCTION_WORDS = new Set([
  'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', "un'",
  'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra',
  'del', 'dello', 'della', 'dei', 'degli', 'delle',
  'al', 'allo', 'alla', 'ai', 'agli', 'alle',
  'dal', 'dallo', 'dalla', 'nel', 'nella', 'sul', 'sulla',
  'e', 'che', 'è', 'ho', 'mi', 'ti', 'si', 'ci', 'vi',
]);

/**
 * Verifica una glossa italiana (direzioni `recognition` e `listening`).
 *
 * È deliberatamente permissiva. «Vado in macchina», «vado con l'auto» e «vado
 * in auto» sono tutte comprensioni riuscite di *Ich fahre mit dem Auto*, e i
 * contenuti portano una sola traduzione: pretendere quella esatta misurerebbe
 * la capacità di indovinare la formulazione dell'autore, non il richiamo.
 *
 * Il rovescio della medaglia è che questo controllo può assolvere una risposta
 * approssimativa. Va bene: la direzione che deve essere severa è la produzione
 * in tedesco, dove la forma attesa è una sola e `checkAnswer` non fa sconti.
 */
export const GLOSS_OVERLAP_THRESHOLD = 0.7;

export function checkGloss(userAnswer: string, expected: string): AnswerCheck {
  const normalizedUser = normalize(userAnswer);
  const normalizedExpected = normalize(expected);
  const base = { normalizedUser, normalizedExpected, differingToken: null };

  if (normalizedUser.toLowerCase() === normalizedExpected.toLowerCase()) {
    return { ...base, verdict: 'correct', wasCorrect: true, distance: 0, note: null };
  }

  const content = (text: string) =>
    text
      .toLowerCase()
      .split(' ')
      .filter((word) => word.length > 0 && !ITALIAN_FUNCTION_WORDS.has(word));

  const expectedWords = content(normalizedExpected);
  const userWords = new Set(content(normalizedUser));

  if (expectedWords.length === 0) {
    return { ...base, verdict: 'wrong', wasCorrect: false, distance: 1, note: `Significa «${normalizedExpected}».` };
  }

  const matched = expectedWords.filter((word) =>
    [...userWords].some((candidate) => levenshtein(word, candidate) <= (word.length > 5 ? 2 : 1)),
  ).length;

  const overlap = matched / expectedWords.length;

  if (overlap >= GLOSS_OVERLAP_THRESHOLD) {
    return {
      ...base,
      verdict: 'correct',
      wasCorrect: true,
      distance: 0,
      note: normalizedUser.toLowerCase() === normalizedExpected.toLowerCase() ? null : `Nei contenuti: «${normalizedExpected}».`,
    };
  }

  return {
    ...base,
    verdict: 'wrong',
    wasCorrect: false,
    distance: 1 - overlap,
    note: `Significa «${normalizedExpected}».`,
  };
}

/**
 * Traduce l'esito della correzione in input per la derivazione del voto FSRS.
 * Il typo passa da `usedHint` perché l'effetto voluto è identico: richiamo
 * avvenuto ma imperfetto, quindi `Hard`.
 */
export function ratingInputFromCheck(
  check: AnswerCheck,
  params: { latencyMs: number; direction: Direction; expectedLength?: number; usedHint?: boolean },
): RatingInput {
  return {
    wasCorrect: check.wasCorrect,
    latencyMs: params.latencyMs,
    direction: params.direction,
    expectedLength: params.expectedLength ?? check.normalizedExpected.length,
    usedHint: params.usedHint === true || check.verdict === 'typo',
  };
}
