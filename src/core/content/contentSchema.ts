/**
 * Validazione dei pacchetti di contenuto (`content/*.json`).
 *
 * I contenuti sono il carburante del motore: se un sostantivo arriva senza
 * articolo o con un tag inventato, il selettore i+1 e i drill adattivi
 * degradano in silenzio. Meglio fallire rumorosamente al caricamento.
 */
import { z } from 'zod';
import { GRAMMAR_TAGS } from '../german/tags';
import type { Cefr, Item, Lesson } from '../types';

const cefrSchema = z.enum(['A1', 'A2', 'B1', 'B2']);
const genderSchema = z.enum(['der', 'die', 'das']);
const tagSchema = z.enum(GRAMMAR_TAGS);

const idSchema = z
  .string()
  .min(2)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'gli id devono essere slug kebab-case');

const rawItemSchema = z.object({
  id: idSchema,
  type: z.enum(['chunk', 'noun', 'verb', 'pattern']),
  de: z.string().min(1),
  it: z.string().min(1),
  literalIt: z.string().min(1).nullable().default(null),
  audioPath: z.string().min(1).nullable().default(null),
  ttsFallback: z.boolean().default(true),
  gender: genderSchema.nullable().default(null),
  plural: z.string().min(1).nullable().default(null),
  cefr: cefrSchema,
  freqRank: z.int().positive(),
  topic: z.string().min(1),
  tags: z.array(tagSchema).min(1),
  cognateIt: z.string().min(1).nullable().default(null),
  cognateEn: z.string().min(1).nullable().default(null),
  falseFriend: z.boolean().default(false),
  falseFriendNote: z.string().min(1).nullable().default(null),
  transformations: z
    .array(
      z.object({
        prompt: z.string().min(1),
        from: z.string().min(1),
        to: z.string().min(1),
        tag: tagSchema,
      }),
    )
    .default([]),
});

const ARTICLE_PREFIX = /^(der|die|das) [A-ZÄÖÜ]/;
const PLURAL_PREFIX = /^die [A-ZÄÖÜ]/;

/**
 * Invarianti per-item che il tipo da solo non cattura.
 * Il vincolo forte è §5.1: un sostantivo non esiste mai senza articolo.
 */
const itemSchema = rawItemSchema.superRefine((item, ctx) => {
  if (item.type === 'noun') {
    if (item.gender === null) {
      ctx.addIssue({ code: 'custom', message: `«${item.id}»: un sostantivo deve avere il genere`, path: ['gender'] });
    }
    if (item.plural === null) {
      ctx.addIssue({ code: 'custom', message: `«${item.id}»: un sostantivo deve avere il plurale`, path: ['plural'] });
    } else if (!PLURAL_PREFIX.test(item.plural)) {
      ctx.addIssue({
        code: 'custom',
        message: `«${item.id}»: il plurale deve includere l'articolo, es. «die Autos» (trovato «${item.plural}»)`,
        path: ['plural'],
      });
    }
    if (!ARTICLE_PREFIX.test(item.de)) {
      ctx.addIssue({
        code: 'custom',
        message: `«${item.id}»: un sostantivo non esiste mai senza articolo, es. «das Auto» (trovato «${item.de}»)`,
        path: ['de'],
      });
    }
    if (item.gender !== null && !item.de.startsWith(`${item.gender} `)) {
      ctx.addIssue({
        code: 'custom',
        message: `«${item.id}»: l'articolo in «de» non corrisponde al campo gender «${item.gender}»`,
        path: ['de'],
      });
    }
  } else if (item.gender !== null) {
    ctx.addIssue({
      code: 'custom',
      message: `«${item.id}»: solo gli item di tipo noun possono avere un genere`,
      path: ['gender'],
    });
  }

  if (item.falseFriend && item.falseFriendNote === null) {
    ctx.addIssue({
      code: 'custom',
      message: `«${item.id}»: un falso amico deve spiegare in cosa inganna`,
      path: ['falseFriendNote'],
    });
  }

  for (const transformation of item.transformations) {
    if (transformation.from === transformation.to) {
      ctx.addIssue({
        code: 'custom',
        message: `«${item.id}»: una trasformazione che non trasforma niente non è un esercizio`,
        path: ['transformations'],
      });
    }
  }
});

const lessonLineSchema = z.object({
  speaker: z.string().min(1),
  de: z.string().min(1),
  it: z.string().min(1),
});

const questionSchema = z
  .object({
    de: z.string().min(1),
    options: z.array(z.string().min(1)).min(2).max(4),
    answerIndex: z.int().nonnegative(),
  })
  .refine((q) => q.answerIndex < q.options.length, {
    message: 'answerIndex fuori dai limiti delle opzioni',
    path: ['answerIndex'],
  });

const lessonSchema = z.object({
  id: idSchema,
  cefr: cefrSchema,
  topic: z.string().min(1),
  // §4 Fase 2: un dialogo di 4-8 battute. Più corto non è input, più lungo
  // sfonda il budget di tempo della fase (20% della sessione).
  lines: z.array(lessonLineSchema).min(4).max(8),
  audioPath: z.string().min(1).nullable().default(null),
  targetItemIds: z.array(idSchema).min(1),
  questions: z.array(questionSchema).length(2),
});

export const contentPackSchema = z
  .object({
    version: z.literal(1),
    language: z.literal('de'),
    cefr: cefrSchema,
    /** Nota di provenienza: i rank di frequenza sono approssimati, va detto. */
    notes: z.string().optional(),
    items: z.array(itemSchema).min(1),
    lessons: z.array(lessonSchema),
  })
  .superRefine((pack, ctx) => {
    const seenItems = new Set<string>();
    for (const item of pack.items) {
      if (seenItems.has(item.id)) {
        ctx.addIssue({ code: 'custom', message: `id item duplicato: «${item.id}»`, path: ['items'] });
      }
      seenItems.add(item.id);
    }

    const seenLessons = new Set<string>();
    for (const lesson of pack.lessons) {
      if (seenLessons.has(lesson.id)) {
        ctx.addIssue({ code: 'custom', message: `id lezione duplicato: «${lesson.id}»`, path: ['lessons'] });
      }
      seenLessons.add(lesson.id);

      for (const target of lesson.targetItemIds) {
        if (!seenItems.has(target)) {
          ctx.addIssue({
            code: 'custom',
            message: `la lezione «${lesson.id}» punta a un item inesistente: «${target}»`,
            path: ['lessons'],
          });
        }
      }
    }
  });

export type ContentPack = {
  version: 1;
  language: 'de';
  cefr: Cefr;
  notes?: string;
  items: Item[];
  lessons: Lesson[];
};

/** Frammento di contenuto: un file per argomento, senza metadati del pacchetto. */
export interface ContentFragment {
  items?: unknown[];
  lessons?: unknown[];
}

/**
 * Unisce i frammenti in un pacchetto unico.
 *
 * I contenuti stanno in un file per argomento perché un singolo JSON da
 * trecento item non si rilegge e non si corregge: chi deve sistemare un plurale
 * sbagliato nel vocabolario del cibo non deve scorrere anche i trasporti. La
 * validazione però resta sull'insieme, perché i riferimenti delle lezioni
 * attraversano i file.
 */
export function mergeFragments(fragments: readonly ContentFragment[], cefr: Cefr, notes?: string): unknown {
  return {
    version: 1,
    language: 'de',
    cefr,
    notes,
    items: fragments.flatMap((fragment) => fragment.items ?? []),
    lessons: fragments.flatMap((fragment) => fragment.lessons ?? []),
  };
}

/**
 * Parsifica e valida un pacchetto di contenuto. Lancia con un messaggio
 * leggibile: questa funzione gira sia nel test sia al primo avvio dell'app.
 */
export function parseContentPack(raw: unknown, source = 'content'): ContentPack {
  const result = contentPackSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .slice(0, 20)
      .map((issue) => `  · ${issue.path.join('.') || '(radice)'}: ${issue.message}`)
      .join('\n');
    const extra = result.error.issues.length > 20 ? `\n  … e altri ${result.error.issues.length - 20} problemi` : '';
    throw new Error(`Contenuto non valido in ${source}:\n${details}${extra}`);
  }
  return result.data as ContentPack;
}
