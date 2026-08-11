/**
 * Registro chiuso dei tag grammaticali.
 *
 * È volutamente una union chiusa e non `string[]`: i tag pilotano i drill
 * adattivi (§3.4) e il profilo errori. Se l'autore dei contenuti può inventare
 * tag a piacere, l'EMA si frammenta su decine di tag quasi-vuoti e la soglia
 * "30% con ≥8 esposizioni" non scatta mai. La validazione dei contenuti
 * rifiuta ogni tag fuori da questo elenco.
 */
export const GRAMMAR_TAGS = [
  // --- casi ---
  'nominativ',
  'akkusativ',
  'dativ',
  'genitiv',

  // --- preposizioni ---
  'praeposition_akkusativ',
  'praeposition_dativ',
  'wechselpraeposition',

  // --- ordine delle parole ---
  'v2_order',
  'inversion',
  'verb_final_subordinate',
  'verbalklammer',

  // --- verbi ---
  'praesens_regular',
  'praesens_irregular',
  'modalverb',
  'separable_verb',
  'reflexiv',
  'imperativ',
  'infinitiv',
  'konjunktiv2_hoeflich',
  'perfekt_haben_sein',

  // --- nomi, articoli, aggettivi ---
  'gender_der',
  'gender_die',
  'gender_das',
  'plural_form',
  'adjective_ending',
  'kompositum',
  'possessivartikel',
  'personalpronomen',
  'negation_nicht_kein',
  'komparativ',

  // --- suffissi: cue probabilistici di genere (§5.1) ---
  'suffix_ung',
  'suffix_heit',
  'suffix_keit',
  'suffix_schaft',
  'suffix_taet',
  'suffix_ion',
  'suffix_ie',
  'suffix_ur',
  'suffix_chen',
  'suffix_lein',
  'suffix_ment',
  'suffix_um',
  'suffix_ling',
  'suffix_ismus',
  'suffix_or',
  'suffix_er',
  'suffix_e',

  // --- funzionali e pragmatici ---
  'w_frage',
  'ja_nein_frage',
  'hoeflichkeitsform',
  'formelhaft',
  'zahlen',
  'uhrzeit',
  'es_gibt',
] as const;

export type GrammarTag = (typeof GRAMMAR_TAGS)[number];

const TAG_SET: ReadonlySet<string> = new Set(GRAMMAR_TAGS);

export function isGrammarTag(value: string): value is GrammarTag {
  return TAG_SET.has(value);
}

/**
 * Tag che possono generare un micro-drill adattivo (§3.4).
 *
 * I tag di suffisso ne sono esclusi di proposito: sono cue statistici usati per
 * la "regola scoperta" (§5.1), non competenze che si possono drillare
 * direttamente. Un drill su `suffix_e` non ha senso; uno su `dativ` sì.
 */
export const DRILLABLE_TAGS = [
  'dativ',
  'akkusativ',
  'wechselpraeposition',
  'v2_order',
  'verb_final_subordinate',
  'adjective_ending',
  'gender_das',
  'gender_der',
  'gender_die',
  'separable_verb',
  'perfekt_haben_sein',
  'verbalklammer',
  'negation_nicht_kein',
  'plural_form',
] as const satisfies readonly GrammarTag[];

export type DrillableTag = (typeof DRILLABLE_TAGS)[number];

const DRILLABLE_SET: ReadonlySet<string> = new Set(DRILLABLE_TAGS);

export function isDrillableTag(tag: GrammarTag): tag is DrillableTag {
  return DRILLABLE_SET.has(tag);
}

/** Etichetta italiana breve, mostrata nella heatmap dei tag deboli e nei drill. */
export const TAG_LABELS: Record<GrammarTag, string> = {
  nominativ: 'Nominativo',
  akkusativ: 'Accusativo',
  dativ: 'Dativo',
  genitiv: 'Genitivo',

  praeposition_akkusativ: 'Preposizioni con accusativo',
  praeposition_dativ: 'Preposizioni con dativo',
  wechselpraeposition: 'Preposizioni a doppio caso',

  v2_order: 'Verbo in seconda posizione',
  inversion: 'Inversione soggetto-verbo',
  verb_final_subordinate: 'Verbo in fondo nelle subordinate',
  verbalklammer: 'Parentesi verbale',

  praesens_regular: 'Presente regolare',
  praesens_irregular: 'Presente irregolare',
  modalverb: 'Verbi modali',
  separable_verb: 'Verbi separabili',
  reflexiv: 'Verbi riflessivi',
  imperativ: 'Imperativo',
  infinitiv: 'Infinito',
  konjunktiv2_hoeflich: 'Congiuntivo di cortesia',
  perfekt_haben_sein: 'Perfetto: haben o sein',

  gender_der: 'Genere maschile (der)',
  gender_die: 'Genere femminile (die)',
  gender_das: 'Genere neutro (das)',
  plural_form: 'Formazione del plurale',
  adjective_ending: 'Desinenze dell’aggettivo',
  kompositum: 'Parole composte',
  possessivartikel: 'Possessivi',
  personalpronomen: 'Pronomi personali',
  negation_nicht_kein: 'Negazione: nicht o kein',
  komparativ: 'Comparativo',

  suffix_ung: 'Suffisso -ung',
  suffix_heit: 'Suffisso -heit',
  suffix_keit: 'Suffisso -keit',
  suffix_schaft: 'Suffisso -schaft',
  suffix_taet: 'Suffisso -tät',
  suffix_ion: 'Suffisso -ion',
  suffix_ie: 'Suffisso -ie',
  suffix_ur: 'Suffisso -ur',
  suffix_chen: 'Suffisso -chen',
  suffix_lein: 'Suffisso -lein',
  suffix_ment: 'Suffisso -ment',
  suffix_um: 'Suffisso -um',
  suffix_ling: 'Suffisso -ling',
  suffix_ismus: 'Suffisso -ismus',
  suffix_or: 'Suffisso -or',
  suffix_er: 'Suffisso -er',
  suffix_e: 'Finale in -e',

  w_frage: 'Domande con pronome interrogativo',
  ja_nein_frage: 'Domande sì/no',
  hoeflichkeitsform: 'Forma di cortesia',
  formelhaft: 'Formula fissa',
  zahlen: 'Numeri',
  uhrzeit: 'Ora',
  es_gibt: 'Costruzione «es gibt»',
};
