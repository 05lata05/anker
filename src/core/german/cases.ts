/**
 * Casi (§5.2).
 *
 * Sequenza di insegnamento: Nominativo + Accusativo → Dativo → Genitivo.
 * I casi si insegnano in CHUNK PREPOSIZIONALI, non con tabelle astratte:
 * `mit dem Auto` si impara come blocco, la tabella si consulta dopo, quando
 * serve a spiegare perché — mai come contenuto primario di apprendimento.
 */
import type { Gender, GrammarTag } from '../types';

export type Case = 'nominativ' | 'akkusativ' | 'dativ' | 'genitiv';
export type PrepositionGovernment = 'dativ' | 'akkusativ' | 'wechsel';

export const DATIVE_PREPOSITIONS = ['mit', 'aus', 'bei', 'nach', 'seit', 'von', 'zu', 'gegenüber', 'ab'] as const;
export const ACCUSATIVE_PREPOSITIONS = ['durch', 'für', 'gegen', 'ohne', 'um', 'bis', 'entlang'] as const;
export const TWO_WAY_PREPOSITIONS = [
  'in',
  'an',
  'auf',
  'über',
  'unter',
  'vor',
  'hinter',
  'neben',
  'zwischen',
] as const;

const GOVERNMENT = new Map<string, PrepositionGovernment>([
  ...DATIVE_PREPOSITIONS.map((p) => [p, 'dativ'] as const),
  ...ACCUSATIVE_PREPOSITIONS.map((p) => [p, 'akkusativ'] as const),
  ...TWO_WAY_PREPOSITIONS.map((p) => [p, 'wechsel'] as const),
]);

export function prepositionGovernment(preposition: string): PrepositionGovernment | null {
  return GOVERNMENT.get(preposition.toLowerCase().trim()) ?? null;
}

/** Forme contratte frequenti: l'utente le incontra prima delle tabelle. */
export const CONTRACTIONS: Readonly<Record<string, { preposition: string; article: string; case: Case }>> = {
  zum: { preposition: 'zu', article: 'dem', case: 'dativ' },
  zur: { preposition: 'zu', article: 'der', case: 'dativ' },
  am: { preposition: 'an', article: 'dem', case: 'dativ' },
  im: { preposition: 'in', article: 'dem', case: 'dativ' },
  vom: { preposition: 'von', article: 'dem', case: 'dativ' },
  beim: { preposition: 'bei', article: 'dem', case: 'dativ' },
  ins: { preposition: 'in', article: 'das', case: 'akkusativ' },
  ans: { preposition: 'an', article: 'das', case: 'akkusativ' },
  aufs: { preposition: 'auf', article: 'das', case: 'akkusativ' },
};

type ArticleTable = Record<Case, Record<Gender | 'plural', string>>;

export const DEFINITE_ARTICLES: ArticleTable = {
  nominativ: { der: 'der', die: 'die', das: 'das', plural: 'die' },
  akkusativ: { der: 'den', die: 'die', das: 'das', plural: 'die' },
  dativ: { der: 'dem', die: 'der', das: 'dem', plural: 'den' },
  genitiv: { der: 'des', die: 'der', das: 'des', plural: 'der' },
};

export const INDEFINITE_ARTICLES: ArticleTable = {
  nominativ: { der: 'ein', die: 'eine', das: 'ein', plural: 'keine' },
  akkusativ: { der: 'einen', die: 'eine', das: 'ein', plural: 'keine' },
  dativ: { der: 'einem', die: 'einer', das: 'einem', plural: 'keinen' },
  genitiv: { der: 'eines', die: 'einer', das: 'eines', plural: 'keiner' },
};

export function articleFor(gender: Gender | 'plural', kase: Case, kind: 'definite' | 'indefinite'): string {
  return (kind === 'definite' ? DEFINITE_ARTICLES : INDEFINITE_ARTICLES)[kase][gender];
}

/** Tutte le forme dell'articolo: servono come distrattori nei cloze. */
export function articleParadigm(gender: Gender | 'plural', kind: 'definite' | 'indefinite'): string[] {
  const table = kind === 'definite' ? DEFINITE_ARTICLES : INDEFINITE_ARTICLES;
  return [...new Set((['nominativ', 'akkusativ', 'dativ', 'genitiv'] as Case[]).map((c) => table[c][gender]))];
}

export const CASE_TAGS: Record<Case, GrammarTag> = {
  nominativ: 'nominativ',
  akkusativ: 'akkusativ',
  dativ: 'dativ',
  genitiv: 'genitiv',
};

const CASE_LABEL: Record<Case, string> = {
  nominativ: 'nominativo',
  akkusativ: 'accusativo',
  dativ: 'dativo',
  genitiv: 'genitivo',
};

/**
 * La riga di spiegazione esplicita richiesta dalla Fase 1 (§4).
 * Deve essere una riga sola e dire la regola, non nominarla:
 * «in tedesco dopo *mit* si usa sempre il dativo → **dem** Auto».
 */
export function explainCaseError(params: {
  preposition: string;
  gender: Gender | 'plural';
  expectedCase: Case;
  noun?: string;
}): string {
  const { preposition, gender, expectedCase, noun } = params;
  const correct = articleFor(gender, expectedCase, 'definite');
  const tail = noun ? ` ${noun}` : '';
  const government = prepositionGovernment(preposition);

  if (government === 'wechsel') {
    const other: Case = expectedCase === 'dativ' ? 'akkusativ' : 'dativ';
    const reason =
      expectedCase === 'dativ'
        ? 'qui indica uno stato, non un movimento verso'
        : 'qui indica un movimento verso, non uno stato';
    return `«${preposition}» regge sia il dativo sia l’accusativo: ${reason}, quindi ${CASE_LABEL[expectedCase]} → ${correct}${tail} (non ${articleFor(gender, other, 'definite')}${tail}).`;
  }

  return `In tedesco dopo «${preposition}» si usa sempre il ${CASE_LABEL[expectedCase]} → ${correct}${tail}.`;
}

/** Ordine di introduzione dei casi. Il genitivo arriva per ultimo, e va bene così. */
export const CASE_SEQUENCE: readonly Case[] = ['nominativ', 'akkusativ', 'dativ', 'genitiv'];

const DATIVE_FORMS = new Set(['dem', 'einem', 'einer', 'keinem', 'keiner', 'meinem', 'meiner']);
const ACCUSATIVE_FORMS = new Set(['den', 'einen', 'keinen', 'meinen']);

/**
 * Caso di una forma d'articolo, quando è deducibile.
 *
 * `der` e `die` restano ambigui fuori contesto — `der` è nominativo maschile,
 * dativo femminile e genitivo femminile — quindi qui si usa il reggente della
 * preposizione, che è l'informazione che l'utente deve davvero interiorizzare.
 */
export function caseOfArticle(article: string, government: PrepositionGovernment | null): Case | null {
  const lower = article.toLowerCase();
  if (government === 'dativ') return 'dativ';
  if (government === 'akkusativ') return 'akkusativ';

  if (DATIVE_FORMS.has(lower)) return 'dativ';
  if (ACCUSATIVE_FORMS.has(lower)) return 'akkusativ';
  if (government === 'wechsel') return lower === 'der' ? 'dativ' : 'akkusativ';
  return null;
}

/**
 * Variante della spiegazione che parte dalla forma corretta invece che dal
 * genere. Serve al feedback della Fase 1, dove la frase giusta è nota ma il
 * genere del sostantivo dentro il chunk no.
 */
export function explainArticleError(params: {
  preposition: string;
  expectedArticle: string;
  noun?: string;
}): string | null {
  const government = prepositionGovernment(params.preposition);
  if (government === null) return null;

  const kase = caseOfArticle(params.expectedArticle, government);
  if (kase === null) return null;

  const tail = params.noun ? ` ${params.noun}` : '';
  const correct = `${params.expectedArticle}${tail}`;

  if (government === 'wechsel') {
    const reason =
      kase === 'dativ'
        ? 'qui indica uno stato, non un movimento verso (wo?)'
        : 'qui indica un movimento verso, non uno stato (wohin?)';
    return `«${params.preposition}» regge sia il dativo sia l’accusativo: ${reason}, quindi ${CASE_LABEL[kase]} → ${correct}.`;
  }

  return `In tedesco dopo «${params.preposition}» si usa sempre il ${CASE_LABEL[kase]} → ${correct}.`;
}
