/**
 * Micro-drill adattivi e schede regola (§3.4, §4 Fase 3).
 *
 * Focus on Form, non lezione di grammatica: massimo tre righe di regola e due
 * esempi, poi subito 4-6 esercizi sul tag debole. La scheda arriva DOPO che
 * l'errore si è manifestato, non prima — è istruzione esplicita innescata da un
 * bisogno, che è la condizione in cui Norris & Ortega la trovano più efficace.
 */
import { articleParadigm } from '../german/cases';
import { CLAUSE_RULES } from '../german/wordOrder';
import type { GrammarTag, Item } from '../types';

export const DRILL_MIN_EXERCISES = 4;
export const DRILL_MAX_EXERCISES = 6;

export interface RuleCard {
  tag: GrammarTag;
  title: string;
  /** Massimo tre righe. Se ne servono quattro, la regola è troppo grande per un drill. */
  lines: string[];
  examples: { de: string; it: string }[];
}

export const RULE_CARDS: Partial<Record<GrammarTag, RuleCard>> = {
  dativ: {
    tag: 'dativ',
    title: 'Il dativo',
    lines: [
      'Dopo mit, aus, bei, nach, seit, von, zu il caso è sempre dativo.',
      'Gli articoli diventano: der → dem, das → dem, die → der, plurale → den.',
    ],
    examples: [
      { de: 'Ich fahre mit dem Auto.', it: 'Vado in macchina.' },
      { de: 'Wir kommen aus der Stadt.', it: 'Veniamo dalla città.' },
    ],
  },
  akkusativ: {
    tag: 'akkusativ',
    title: 'L’accusativo',
    lines: [
      'L’accusativo marca l’oggetto diretto e segue durch, für, gegen, ohne, um.',
      'Cambia solo il maschile: der → den, ein → einen. Femminile e neutro restano.',
    ],
    examples: [
      { de: 'Ich habe einen Bruder.', it: 'Ho un fratello.' },
      { de: 'Der Kaffee ist für die Frau.', it: 'Il caffè è per la donna.' },
    ],
  },
  wechselpraeposition: {
    tag: 'wechselpraeposition',
    title: 'Le preposizioni a doppio caso',
    lines: [
      'in, an, auf, über, unter, vor, hinter, neben, zwischen reggono due casi.',
      'Movimento verso un luogo → accusativo. Posizione, stato → dativo.',
      'La domanda di controllo: wohin? (accusativo) oppure wo? (dativo).',
    ],
    examples: [
      { de: 'Ich gehe in die Stadt.', it: 'Vado in città (movimento).' },
      { de: 'Ich wohne in der Stadt.', it: 'Abito in città (stato).' },
    ],
  },
  v2_order: {
    tag: 'v2_order',
    title: 'Il verbo in seconda posizione',
    lines: [
      CLAUSE_RULES.main_v2,
      'Se in prima posizione metti un complemento, il soggetto passa dopo il verbo.',
    ],
    examples: [
      { de: 'Ich spiele am Wochenende Fußball.', it: 'Nel fine settimana gioco a calcio.' },
      { de: 'Am Wochenende spiele ich Fußball.', it: 'Nel fine settimana gioco a calcio.' },
    ],
  },
  verb_final_subordinate: {
    tag: 'verb_final_subordinate',
    title: 'Il verbo in fondo',
    lines: [CLAUSE_RULES.subordinate, 'La subordinata è separata da una virgola, sempre.'],
    examples: [
      { de: 'Ich bleibe zu Hause, weil ich krank bin.', it: 'Resto a casa perché sono malato.' },
      { de: 'Ich weiß, dass er Deutsch spricht.', it: 'So che parla tedesco.' },
    ],
  },
  verbalklammer: {
    tag: 'verbalklammer',
    title: 'La parentesi verbale',
    lines: [CLAUSE_RULES.verbal_bracket],
    examples: [
      { de: 'Ich möchte das kaufen.', it: 'Vorrei comprarlo.' },
      { de: 'Ich bin nach Berlin gefahren.', it: 'Sono andato a Berlino.' },
    ],
  },
  separable_verb: {
    tag: 'separable_verb',
    title: 'I verbi separabili',
    lines: [
      'Il prefisso si stacca e va in fondo alla frase: anfangen → ich fange … an.',
      'Con un modale il verbo resta intero e va in fondo: Ich muss anfangen.',
    ],
    examples: [
      { de: 'Ich fange um neun an.', it: 'Inizio alle nove.' },
      { de: 'Ich muss um neun anfangen.', it: 'Devo iniziare alle nove.' },
    ],
  },
  perfekt_haben_sein: {
    tag: 'perfekt_haben_sein',
    title: 'Perfetto: haben o sein',
    lines: [
      'La maggior parte dei verbi fa il perfetto con haben.',
      'I verbi di movimento e di cambiamento di stato usano sein: fahren, gehen, kommen, bleiben, werden.',
    ],
    examples: [
      { de: 'Ich habe Kaffee getrunken.', it: 'Ho bevuto un caffè.' },
      { de: 'Ich bin nach Berlin gefahren.', it: 'Sono andato a Berlino.' },
    ],
  },
  adjective_ending: {
    tag: 'adjective_ending',
    title: 'Le desinenze dell’aggettivo',
    lines: [
      'L’aggettivo prende una desinenza solo se sta davanti al sostantivo.',
      'Dopo l’articolo determinativo al nominativo: -e al singolare, -en altrove.',
    ],
    examples: [
      { de: 'Der Kaffee ist gut.', it: 'Il caffè è buono (nessuna desinenza).' },
      { de: 'Der gute Kaffee.', it: 'Il buon caffè (desinenza -e).' },
    ],
  },
  negation_nicht_kein: {
    tag: 'negation_nicht_kein',
    title: 'nicht o kein',
    lines: [
      'kein nega un sostantivo con articolo indeterminativo o senza articolo.',
      'nicht nega tutto il resto: verbi, aggettivi, e i sostantivi con articolo determinativo.',
    ],
    examples: [
      { de: 'Ich habe keine Zeit.', it: 'Non ho tempo.' },
      { de: 'Ich komme nicht.', it: 'Non vengo.' },
    ],
  },
  plural_form: {
    tag: 'plural_form',
    title: 'I plurali',
    lines: [
      'Il tedesco ha cinque schemi di plurale: -e, -er, -(e)n, -s e invariato.',
      'Molti aggiungono anche la dieresi: der Vater → die Väter.',
      'Il plurale si impara insieme al sostantivo, non dopo.',
    ],
    examples: [
      { de: 'das Kind → die Kinder', it: 'il bambino → i bambini' },
      { de: 'das Zimmer → die Zimmer', it: 'la stanza → le stanze (invariato)' },
    ],
  },
  gender_der: {
    tag: 'gender_der',
    title: 'Il maschile',
    lines: [
      'Sono maschili i giorni, i mesi, le stagioni, i punti cardinali e il meteo.',
      'E i nomi di mestiere in -er: der Lehrer, der Arbeiter.',
    ],
    examples: [
      { de: 'der Montag', it: 'il lunedì' },
      { de: 'der Lehrer', it: 'l’insegnante' },
    ],
  },
  gender_die: {
    tag: 'gender_die',
    title: 'Il femminile',
    lines: [
      'Sono femminili quasi tutti i nomi in -ung, -heit, -keit, -schaft, -tät, -ion.',
      'E circa 9 su 10 di quelli che finiscono in -e.',
    ],
    examples: [
      { de: 'die Wohnung', it: 'l’appartamento' },
      { de: 'die Suppe', it: 'la zuppa' },
    ],
  },
  gender_das: {
    tag: 'gender_das',
    title: 'Il neutro',
    lines: [
      'Sono neutri tutti i diminutivi in -chen e -lein, senza eccezioni.',
      'E gli infiniti sostantivati: das Essen, das Trinken.',
    ],
    examples: [
      { de: 'das Mädchen', it: 'la ragazza (neutro, non femminile)' },
      { de: 'das Auto', it: 'l’automobile' },
    ],
  },
};

export type DrillExerciseKind = 'cloze' | 'choice' | 'reorder' | 'produce';

export interface DrillExercise {
  id: string;
  kind: DrillExerciseKind;
  tag: GrammarTag;
  itemId: string;
  /** Consegna in italiano. */
  prompt: string;
  /** Frase con `___` per il cloze, o frase da ricostruire per il reorder. */
  text: string;
  options?: string[];
  answer: string;
  explanation: string;
}

export interface Drill {
  tag: GrammarTag;
  rule: RuleCard | null;
  exercises: DrillExercise[];
}

const DEFINITE = ['der', 'die', 'das', 'den', 'dem', 'des'];
const INDEFINITE = ['ein', 'eine', 'einen', 'einem', 'einer', 'eines', 'kein', 'keine', 'keinen'];
const CONTRACTED = ['zum', 'zur', 'am', 'im', 'vom', 'beim', 'ins', 'ans'];
const ARTICLE_TOKENS = new Set([...DEFINITE, ...INDEFINITE, ...CONTRACTED]);

const REORDER_TAGS: ReadonlySet<GrammarTag> = new Set<GrammarTag>([
  'v2_order',
  'verb_final_subordinate',
  'verbalklammer',
  'separable_verb',
  'inversion',
]);

const GENDER_TAGS: ReadonlySet<GrammarTag> = new Set<GrammarTag>(['gender_der', 'gender_die', 'gender_das']);

function findArticle(sentence: string): { token: string; index: number } | null {
  const words = sentence.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const bare = words[i].replace(/[.,!?;:]/g, '');
    if (ARTICLE_TOKENS.has(bare.toLowerCase())) return { token: bare, index: i };
  }
  return null;
}

function distractorsFor(answer: string): string[] {
  const lower = answer.toLowerCase();
  let pool: string[];
  if (CONTRACTED.includes(lower)) pool = CONTRACTED;
  else if (INDEFINITE.includes(lower)) pool = INDEFINITE;
  else pool = DEFINITE;

  return pool.filter((form) => form !== lower).slice(0, 3);
}

function clozeExercise(item: Item, tag: GrammarTag): DrillExercise | null {
  const found = findArticle(item.de);
  if (!found) return null;

  const words = item.de.split(/\s+/);
  const answer = found.token;
  words[found.index] = words[found.index].replace(answer, '___');

  const options = [answer.toLowerCase(), ...distractorsFor(answer)].sort();

  return {
    id: `${item.id}::cloze::${tag}`,
    kind: 'cloze',
    tag,
    itemId: item.id,
    prompt: 'Completa con la forma giusta.',
    text: words.join(' '),
    options,
    answer: answer.toLowerCase(),
    explanation: `${item.de} — ${item.it}${item.literalIt ? ` (${item.literalIt})` : ''}`,
  };
}

function genderExercise(item: Item, tag: GrammarTag): DrillExercise | null {
  if (item.type !== 'noun' || !item.gender) return null;
  const bare = item.de.replace(/^(der|die|das)\s+/, '');
  return {
    id: `${item.id}::gender`,
    kind: 'choice',
    tag,
    itemId: item.id,
    prompt: 'Quale articolo?',
    text: `___ ${bare}`,
    options: ['der', 'die', 'das'],
    answer: item.gender,
    explanation: `${item.de} — ${item.it}. Plurale: ${item.plural ?? '—'}.`,
  };
}

function reorderExercise(item: Item, tag: GrammarTag): DrillExercise {
  return {
    id: `${item.id}::reorder::${tag}`,
    kind: 'reorder',
    tag,
    itemId: item.id,
    prompt: 'Rimetti le parole in ordine.',
    text: item.de,
    answer: item.de,
    explanation: item.literalIt ? `${item.it} — alla lettera: ${item.literalIt}` : item.it,
  };
}

function produceExercise(item: Item, tag: GrammarTag): DrillExercise {
  return {
    id: `${item.id}::produce::${tag}`,
    kind: 'produce',
    tag,
    itemId: item.id,
    prompt: 'Scrivi in tedesco.',
    text: item.it,
    answer: item.de,
    explanation: item.literalIt ?? item.it,
  };
}

/**
 * Genera un drill su un tag debole a partire dagli item che lo portano.
 *
 * Restituisce `null` se non ci sono abbastanza item: un drill di due esercizi
 * non è un drill, ed è meglio non interrompere la sessione che interromperla
 * per niente.
 */
export function buildDrill(
  tag: GrammarTag,
  items: readonly Item[],
  options: { max?: number; min?: number } = {},
): Drill | null {
  const max = options.max ?? DRILL_MAX_EXERCISES;
  const min = options.min ?? DRILL_MIN_EXERCISES;

  const relevant = items.filter((item) => item.tags.includes(tag)).sort((a, b) => a.freqRank - b.freqRank);

  const exercises: DrillExercise[] = [];
  for (const item of relevant) {
    if (exercises.length >= max) break;

    let exercise: DrillExercise | null = null;
    if (GENDER_TAGS.has(tag)) exercise = genderExercise(item, tag);
    else if (REORDER_TAGS.has(tag)) exercise = reorderExercise(item, tag);
    else exercise = clozeExercise(item, tag);

    exercises.push(exercise ?? produceExercise(item, tag));
  }

  if (exercises.length < min) return null;

  return { tag, rule: RULE_CARDS[tag] ?? null, exercises };
}
