/**
 * Ordine delle parole (§5.3).
 *
 * L'esercizio è a chip trascinabili perché costruire la frase è produzione;
 * riconoscere la frase giusta tra quattro opzioni non lo è. La verifica non si
 * limita a dire sì o no: restituisce il punto in cui l'utente ha divergiato,
 * perché nell'ordine delle parole l'errore è quasi sempre in una posizione
 * precisa e nominarla vale più di una correzione globale.
 */
import type { GrammarTag } from '../types';

export interface Chip {
  id: string;
  text: string;
}

export type ClauseKind = 'main_v2' | 'subordinate' | 'w_question' | 'yes_no_question' | 'verbal_bracket';

export const CLAUSE_TAGS: Record<ClauseKind, GrammarTag> = {
  main_v2: 'v2_order',
  subordinate: 'verb_final_subordinate',
  w_question: 'w_frage',
  yes_no_question: 'ja_nein_frage',
  verbal_bracket: 'verbalklammer',
};

export const CLAUSE_RULES: Record<ClauseKind, string> = {
  main_v2: 'Nella principale il verbo coniugato è sempre il SECONDO elemento, qualunque cosa venga prima.',
  subordinate: 'Dopo weil, dass, wenn, ob il verbo coniugato va in FONDO alla frase.',
  w_question: 'Nelle domande con pronome interrogativo il verbo segue subito il pronome: Wie heißen Sie?',
  yes_no_question: 'Nelle domande sì/no il verbo apre la frase: Kommst du aus Italien?',
  verbal_bracket:
    'Verbo coniugato in seconda posizione, participio o infinito in fondo: tutto il resto sta nella parentesi.',
};

const PUNCTUATION_TAIL = /[.!?]+$/;

/** Spezza la frase in chip. La punteggiatura finale resta attaccata all'ultimo chip. */
export function buildChips(sentence: string): Chip[] {
  return sentence
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((text, index) => ({ id: `${index}:${text}`, text }));
}

export type Rng = () => number;

/** Fisher-Yates con rng iniettabile, così i test sono deterministici. */
export function shuffleChips(chips: readonly Chip[], rng: Rng = Math.random): Chip[] {
  const out = [...chips];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface OrderCheck {
  correct: boolean;
  /** Indice del primo chip fuori posto, `-1` se la frase è giusta. */
  firstDivergence: number;
  expected: string[];
  got: string[];
}

function tokensOf(sentence: string): string[] {
  return sentence.replace(PUNCTUATION_TAIL, '').trim().split(/\s+/).filter(Boolean);
}

export function checkOrder(userChips: readonly Chip[], expectedSentence: string): OrderCheck {
  const expected = tokensOf(expectedSentence);
  const got = userChips.map((chip) => chip.text.replace(PUNCTUATION_TAIL, ''));

  let firstDivergence = -1;
  for (let i = 0; i < Math.max(expected.length, got.length); i++) {
    if (expected[i] !== got[i]) {
      firstDivergence = i;
      break;
    }
  }

  return { correct: firstDivergence === -1, firstDivergence, expected, got };
}

const SUBORDINATE_CONJUNCTIONS = ['weil', 'dass', 'wenn', 'ob', 'obwohl', 'damit', 'während', 'bevor', 'nachdem'];
const W_WORDS = ['wer', 'was', 'wo', 'wann', 'wie', 'warum', 'woher', 'wohin', 'welche', 'welcher', 'welches'];

/** Classificazione euristica, usata per scegliere la scheda regola da mostrare. */
export function classifyClause(sentence: string): ClauseKind {
  const clean = sentence.trim();
  const lower = clean.toLowerCase();
  const words = tokensOf(lower);

  if (SUBORDINATE_CONJUNCTIONS.some((c) => words.includes(c))) return 'subordinate';
  if (clean.endsWith('?')) return W_WORDS.includes(words[0]) ? 'w_question' : 'yes_no_question';
  if (/\b(habe|hat|haben|bin|ist|sind|muss|kann|will|möchte|soll|darf)\b/.test(lower) && words.length > 3) {
    return 'verbal_bracket';
  }
  return 'main_v2';
}

export function explainWordOrder(kind: ClauseKind): { tag: GrammarTag; rule: string } {
  return { tag: CLAUSE_TAGS[kind], rule: CLAUSE_RULES[kind] };
}
