/**
 * Motore di regole per il genere (§5.1).
 *
 * Il genere è il carico front-loaded principale del tedesco, ma è largamente
 * predicibile: Köpcke 1982 spiega circa il 90% di un corpus di 1.466 parole con
 * regole fonologiche, morfologiche e semantiche.
 *
 * Vincolo di progetto: questo motore PREDICE, non ASSEGNA. Il genere autorevole
 * è quello nei contenuti. `-er` è dato al 71-78% maschile, ma `das Fenster`,
 * `die Mutter` e `das Wasser` esistono: se il motore scrivesse il genere nel
 * database, inserirebbe dati sbagliati con la faccia della certezza. Qui si
 * produce una predizione con una confidenza, usata per due cose sole — taggare
 * gli item e generare le carte «regola scoperta».
 */
import type { Gender, GrammarTag } from '../types';
import { LEXICON_HEADS_BY_LENGTH, NOUN_LEXICON } from './nounLexicon';

export interface GenderPrediction {
  gender: Gender | null;
  /** 0-1. Sotto 0,8 la regola va presentata come tendenza, non come legge. */
  confidence: number;
  ruleId: string;
  /** Spiegazione in italiano, da mostrare nella scheda regola. */
  explanation: string;
  tag: GrammarTag | null;
}

export interface SuffixRule {
  id: string;
  suffixes: readonly string[];
  gender: Gender;
  confidence: number;
  tag: GrammarTag | null;
  explanation: string;
}

/** Diminutivi: senza eccezioni, e vincono su qualsiasi altra regola. */
export const DIMINUTIVE_RULES: readonly SuffixRule[] = [
  {
    id: 'diminutive_chen',
    suffixes: ['chen'],
    gender: 'das',
    confidence: 1,
    tag: 'suffix_chen',
    explanation: 'I diminutivi in -chen sono sempre neutri, anche quando indicano persone: das Mädchen.',
  },
  {
    id: 'diminutive_lein',
    suffixes: ['lein'],
    gender: 'das',
    confidence: 1,
    tag: 'suffix_lein',
    explanation: 'I diminutivi in -lein sono sempre neutri: das Fräulein.',
  },
];

/** Suffissi derivazionali: quasi senza eccezioni. */
export const STRONG_SUFFIX_RULES: readonly SuffixRule[] = [
  {
    id: 'fem_ung',
    suffixes: ['ung'],
    gender: 'die',
    confidence: 0.99,
    tag: 'suffix_ung',
    explanation: 'I nomi in -ung sono femminili: die Wohnung, die Rechnung.',
  },
  {
    id: 'fem_heit',
    suffixes: ['heit'],
    gender: 'die',
    confidence: 0.99,
    tag: 'suffix_heit',
    explanation: 'I nomi in -heit sono femminili: die Freiheit.',
  },
  {
    id: 'fem_keit',
    suffixes: ['keit'],
    gender: 'die',
    confidence: 0.99,
    tag: 'suffix_keit',
    explanation: 'I nomi in -keit sono femminili: die Möglichkeit.',
  },
  {
    id: 'fem_schaft',
    suffixes: ['schaft'],
    gender: 'die',
    confidence: 0.99,
    tag: 'suffix_schaft',
    explanation: 'I nomi in -schaft sono femminili: die Freundschaft.',
  },
  {
    id: 'fem_taet',
    suffixes: ['tät'],
    gender: 'die',
    confidence: 0.99,
    tag: 'suffix_taet',
    explanation: 'I nomi in -tät sono femminili: die Universität. Corrispondono all’italiano -tà.',
  },
  {
    id: 'fem_ion',
    suffixes: ['ion'],
    gender: 'die',
    confidence: 0.98,
    tag: 'suffix_ion',
    explanation: 'I nomi in -ion sono femminili: die Nation. Corrispondono all’italiano -zione.',
  },
  {
    id: 'fem_ie',
    suffixes: ['ie'],
    gender: 'die',
    confidence: 0.95,
    tag: 'suffix_ie',
    explanation: 'I nomi in -ie sono femminili: die Familie, die Energie.',
  },
  {
    id: 'fem_ur',
    suffixes: ['ur'],
    gender: 'die',
    confidence: 0.9,
    tag: 'suffix_ur',
    explanation: 'I nomi in -ur sono di norma femminili: die Kultur, die Natur.',
  },
  {
    id: 'neut_ment',
    suffixes: ['ment'],
    gender: 'das',
    confidence: 0.95,
    tag: 'suffix_ment',
    explanation: 'I nomi in -ment sono neutri: das Instrument, das Dokument.',
  },
  {
    id: 'neut_um',
    suffixes: ['um'],
    gender: 'das',
    confidence: 0.93,
    tag: 'suffix_um',
    explanation: 'I nomi in -um sono neutri: das Museum, das Zentrum.',
  },
  {
    id: 'masc_ling',
    suffixes: ['ling'],
    gender: 'der',
    confidence: 0.97,
    tag: 'suffix_ling',
    explanation: 'I nomi in -ling sono maschili: der Schmetterling.',
  },
  {
    id: 'masc_ismus',
    suffixes: ['ismus'],
    gender: 'der',
    confidence: 0.99,
    tag: 'suffix_ismus',
    explanation: 'I nomi in -ismus sono maschili: der Tourismus.',
  },
  {
    id: 'masc_or',
    suffixes: ['or'],
    gender: 'der',
    confidence: 0.9,
    tag: 'suffix_or',
    explanation: 'I nomi in -or sono di norma maschili: der Motor, der Doktor.',
  },
];

/**
 * Cue probabilistici. Vanno presentati come TENDENZE.
 * Se l'app dicesse «-er è maschile» e poi l'utente incontra `das Fenster`, il
 * danno alla fiducia nel sistema è peggiore del beneficio della regola.
 */
export const WEAK_CUE_RULES: readonly SuffixRule[] = [
  {
    id: 'weak_e',
    suffixes: ['e'],
    gender: 'die',
    confidence: 0.9,
    tag: 'suffix_e',
    explanation:
      'Circa 9 nomi su 10 che finiscono in -e sono femminili: die Suppe, die Küche. Eccezioni frequenti: der Name, der Junge.',
  },
  {
    id: 'weak_er',
    suffixes: ['er'],
    gender: 'der',
    confidence: 0.72,
    tag: 'suffix_er',
    explanation:
      'I nomi in -er sono maschili in circa 3 casi su 4, soprattutto i nomi di mestiere: der Lehrer. Ma das Fenster, das Zimmer, die Mutter esistono.',
  },
];

const ARTICLE_PREFIX = /^(der|die|das)\s+/i;

/** Rimuove l'articolo dalla forma memorizzata nei contenuti: «das Auto» → «Auto». */
export function stripArticle(noun: string): string {
  return noun.replace(ARTICLE_PREFIX, '').trim();
}

export interface CompoundSplit {
  /** Testa del composto: è lei a decidere il genere. */
  head: string;
  /** Tutto ciò che precede la testa. */
  modifier: string;
  gender: Gender;
}

/**
 * Segmenta un composto cercando la testa più lunga che chiude la parola.
 *
 * Il modificatore deve avere almeno 4 caratteri di sostanza. Senza il vincolo,
 * `Legende` verrebbe letto come `Leg` + `Ende` e dichiarato neutro con
 * sicurezza. Il prezzo è che i composti dal modificatore cortissimo (`Montag`
 * = `Mon` + `Tag`) non vengono riconosciuti e cadono su «nessuna regola»: per
 * un motore che alimenta le carte «regola scoperta», tacere costa molto meno
 * che sbagliare con convinzione.
 *
 * Anche con il vincolo la segmentazione resta euristica — la regola vale al
 * 100%, il riconoscimento no — ed è per questo che la confidenza restituita è
 * 0,97 e non 1.
 */
export const MIN_COMPOUND_MODIFIER_LENGTH = 4;

export function splitCompound(noun: string, lexicon: Readonly<Record<string, Gender>> = NOUN_LEXICON): CompoundSplit | null {
  const clean = stripArticle(noun);
  const lower = clean.toLowerCase();

  for (const head of LEXICON_HEADS_BY_LENGTH) {
    const headLower = head.toLowerCase();
    if (headLower.length >= lower.length) continue;
    if (!lower.endsWith(headLower)) continue;

    const modifier = clean.slice(0, clean.length - head.length);
    if (modifier.length < MIN_COMPOUND_MODIFIER_LENGTH) continue;

    return { head, modifier, gender: lexicon[head] };
  }

  return null;
}

function matches(lower: string, rule: SuffixRule): boolean {
  return rule.suffixes.some((suffix) => lower.length > suffix.length && lower.endsWith(suffix));
}

/**
 * Predice il genere. L'ordine è: diminutivi → composti → suffissi forti →
 * cue deboli. I diminutivi vengono prima dei composti perché `-chen` non ha
 * eccezioni e non va confuso con una testa lessicale.
 */
export function predictGender(noun: string, lexicon: Readonly<Record<string, Gender>> = NOUN_LEXICON): GenderPrediction {
  const clean = stripArticle(noun);
  const lower = clean.toLowerCase();

  for (const rule of DIMINUTIVE_RULES) {
    if (matches(lower, rule)) {
      return {
        gender: rule.gender,
        confidence: rule.confidence,
        ruleId: rule.id,
        explanation: rule.explanation,
        tag: rule.tag,
      };
    }
  }

  const compound = splitCompound(clean, lexicon);
  if (compound) {
    return {
      gender: compound.gender,
      confidence: 0.97,
      ruleId: 'compound_head',
      explanation: `Nei composti il genere è quello dell’ultimo elemento: ${compound.modifier} + ${compound.head} → ${compound.gender} ${clean}.`,
      tag: 'kompositum',
    };
  }

  for (const rule of [...STRONG_SUFFIX_RULES, ...WEAK_CUE_RULES]) {
    if (matches(lower, rule)) {
      return {
        gender: rule.gender,
        confidence: rule.confidence,
        ruleId: rule.id,
        explanation: rule.explanation,
        tag: rule.tag,
      };
    }
  }

  return {
    gender: null,
    confidence: 0,
    ruleId: 'none',
    explanation: 'Nessuna regola applicabile: questo genere va imparato per esposizione.',
    tag: null,
  };
}

/** Tag di suffisso da attribuire automaticamente all'item. */
export function suffixTag(noun: string): GrammarTag | null {
  return predictGender(noun).tag;
}

// ---------------------------------------------------------------------------
// Regola scoperta
// ---------------------------------------------------------------------------

/**
 * Soglia di esposizioni prima di esplicitare un pattern.
 *
 * Mostrare la regola DOPO l'esposizione la rende molto più memorabile della
 * regola presentata a freddo: l'utente ha già i cinque esempi in testa e la
 * carta non fa che nominare quello che ha già notato a metà.
 */
export const DISCOVERY_THRESHOLD = 5;

export interface DiscoveredRule {
  ruleId: string;
  gender: Gender;
  confidence: number;
  explanation: string;
  /** Gli esempi che l'utente ha già incontrato: sono la prova della regola. */
  examples: string[];
}

export function findDiscoverableRules(
  seenNouns: readonly { de: string; gender: Gender | null }[],
  alreadyShown: ReadonlySet<string> = new Set(),
  threshold = DISCOVERY_THRESHOLD,
): DiscoveredRule[] {
  const groups = new Map<string, { rule: SuffixRule; examples: string[]; confirming: number }>();

  for (const noun of seenNouns) {
    const lower = stripArticle(noun.de).toLowerCase();
    for (const rule of [...DIMINUTIVE_RULES, ...STRONG_SUFFIX_RULES, ...WEAK_CUE_RULES]) {
      if (!matches(lower, rule)) continue;
      const group = groups.get(rule.id) ?? { rule, examples: [], confirming: 0 };
      group.examples.push(noun.de);
      if (noun.gender === rule.gender) group.confirming += 1;
      groups.set(rule.id, group);
      break; // una parola conferma una regola sola: la più specifica
    }
  }

  const out: DiscoveredRule[] = [];
  for (const [ruleId, group] of groups) {
    if (alreadyShown.has(ruleId)) continue;
    if (group.examples.length < threshold) continue;
    // Non si mostra una regola che gli esempi dell'utente contraddicono.
    if (group.confirming / group.examples.length < 0.7) continue;

    out.push({
      ruleId,
      gender: group.rule.gender,
      confidence: group.rule.confidence,
      explanation: group.rule.explanation,
      examples: group.examples.slice(0, 5),
    });
  }

  return out.sort((a, b) => b.confidence - a.confidence);
}
