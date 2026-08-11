/**
 * Feedback immediato dopo ogni risposta (§4, Fase 1).
 *
 * La specifica chiede due cose: la forma corretta evidenziata e, se l'errore
 * ricade su un tag noto, una riga di spiegazione esplicita. «Sbagliato, la
 * risposta era X» non è feedback correttivo: è un verdetto. La differenza è
 * dire PERCHÉ, e dirlo in una riga sola — se serve un paragrafo, quello è un
 * drill, non un feedback.
 */
import type { AnswerCheck } from '../german/answerCheck';
import { explainArticleError, prepositionGovernment } from '../german/cases';
import { RULE_CARDS } from '../profile/drills';
import { TAG_LABELS } from '../german/tags';
import { classifyClause, explainWordOrder } from '../german/wordOrder';
import type { GrammarTag, Item } from '../types';

export interface Feedback {
  correct: boolean;
  title: string;
  /** Forma corretta da evidenziare. `null` quando la risposta era perfetta. */
  correction: string | null;
  /** Riga di regola esplicita. `null` se l'errore non ricade su un tag noto. */
  explanation: string | null;
  /** Tag su cui è caduto l'errore, per il profilo errori e la heatmap. */
  tag: GrammarTag | null;
}

const ARTICLE_LIKE = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des',
  'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  'kein', 'keine', 'keinen', 'keinem', 'keiner',
]);

const WORD_ORDER_TAGS: ReadonlySet<GrammarTag> = new Set<GrammarTag>([
  'v2_order',
  'verb_final_subordinate',
  'verbalklammer',
  'separable_verb',
  'inversion',
]);

function articleExplanation(check: AnswerCheck): { text: string; tag: GrammarTag } | null {
  const diff = check.differingToken;
  if (!diff || !ARTICLE_LIKE.has(diff.expected)) return null;

  const tokens = check.normalizedExpected.split(' ');
  const preposition = diff.index > 0 ? tokens[diff.index - 1] : null;
  if (!preposition) return null;

  const government = prepositionGovernment(preposition);
  if (government === null) return null;

  const text = explainArticleError({
    preposition,
    expectedArticle: tokens[diff.index],
    noun: tokens[diff.index + 1],
  });
  if (text === null) return null;

  const tag: GrammarTag =
    government === 'wechsel' ? 'wechselpraeposition' : government === 'dativ' ? 'dativ' : 'akkusativ';

  return { text, tag };
}

/**
 * Costruisce il feedback. L'ordine dei tentativi va dal più specifico al più
 * generico: una spiegazione sull'articolo sbagliato vale molto più della
 * ripetizione del nome del tag.
 */
export function buildFeedback(check: AnswerCheck, item: Item): Feedback {
  if (check.verdict === 'correct') {
    return { correct: true, title: 'Esatto', correction: null, explanation: null, tag: null };
  }

  if (check.wasCorrect) {
    return {
      correct: true,
      title: check.verdict === 'typo' ? 'Quasi' : 'Va bene',
      correction: check.normalizedExpected,
      explanation: check.note,
      tag: null,
    };
  }

  const article = articleExplanation(check);
  if (article) {
    return {
      correct: false,
      title: 'Non ancora',
      correction: check.normalizedExpected,
      explanation: article.text,
      tag: article.tag,
    };
  }

  const orderTag = item.tags.find((tag) => WORD_ORDER_TAGS.has(tag));
  if (orderTag) {
    const { rule } = explainWordOrder(classifyClause(item.de));
    return { correct: false, title: 'Non ancora', correction: check.normalizedExpected, explanation: rule, tag: orderTag };
  }

  // Ripiego: la prima riga della scheda regola del primo tag che ne ha una.
  for (const tag of item.tags) {
    const card = RULE_CARDS[tag];
    if (card) {
      return {
        correct: false,
        title: 'Non ancora',
        correction: check.normalizedExpected,
        explanation: `${TAG_LABELS[tag]}: ${card.lines[0]}`,
        tag,
      };
    }
  }

  return {
    correct: false,
    title: 'Non ancora',
    correction: check.normalizedExpected,
    explanation: item.literalIt ? `Alla lettera: ${item.literalIt}` : null,
    tag: item.tags[0] ?? null,
  };
}
