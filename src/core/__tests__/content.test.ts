import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { a1Pack } from '../content/a1Pack';
import { contentPackSchema } from '../content/contentSchema';
import { DRILLABLE_TAGS, GRAMMAR_TAGS, isGrammarTag } from '../german/tags';

const pack = a1Pack;
/** Copia grezza del pacchetto, per i test che devono romperlo di proposito. */
const rawPack = JSON.parse(JSON.stringify(pack)) as Record<string, unknown>;

describe('pacchetto contenuti A1', () => {
  it('raggiunge il volume richiesto dalla §8', () => {
    expect(pack.items.length).toBeGreaterThanOrEqual(300);
    expect(pack.lessons.length).toBeGreaterThanOrEqual(25);
  });

  it('copre tutti gli argomenti elencati nella §8', () => {
    const topics = new Set(pack.items.map((item) => item.topic));
    for (const required of [
      'saluti',
      'presentarsi',
      'numeri',
      'orari',
      'famiglia',
      'cibo',
      'ristorante',
      'casa',
      'trasporti',
      'lavoro',
      'tempo_libero',
      'acquisti',
      'salute',
    ]) {
      expect(topics.has(required), `manca l'argomento «${required}»`).toBe(true);
    }
  });

  it('ha abbastanza item per argomento da alimentare i drill', () => {
    const perTopic = new Map<string, number>();
    for (const item of pack.items) perTopic.set(item.topic, (perTopic.get(item.topic) ?? 0) + 1);
    for (const [topic, count] of perTopic) {
      expect(count, `«${topic}» ha solo ${count} item`).toBeGreaterThanOrEqual(4);
    }
  });

  it('ogni tag drillabile ha abbastanza item per generare un drill', () => {
    // `buildDrill` rinuncia sotto i 4 esercizi: un tag che può attivare un
    // drill ma non ha materiale produrrebbe una soglia che scatta a vuoto.
    const perTag = new Map<string, number>();
    for (const item of pack.items) {
      for (const tag of item.tags) perTag.set(tag, (perTag.get(tag) ?? 0) + 1);
    }
    for (const tag of DRILLABLE_TAGS) {
      expect(perTag.get(tag) ?? 0, `il tag «${tag}» ha troppo pochi item`).toBeGreaterThanOrEqual(4);
    }
  });

  it('non contiene mai un sostantivo senza articolo o senza plurale', () => {
    const nouns = pack.items.filter((i) => i.type === 'noun');
    expect(nouns.length).toBeGreaterThan(0);
    for (const noun of nouns) {
      expect(noun.gender, `${noun.id} senza genere`).not.toBeNull();
      expect(noun.de.startsWith(`${noun.gender} `), `${noun.id}: «${noun.de}» non inizia con l'articolo`).toBe(true);
      expect(noun.plural, `${noun.id} senza plurale`).toMatch(/^die /);
    }
  });

  it('usa solo tag del registro e non lascia item senza tag', () => {
    for (const item of pack.items) {
      expect(item.tags.length, `${item.id} senza tag`).toBeGreaterThan(0);
      for (const tag of item.tags) {
        expect(isGrammarTag(tag), `${item.id}: tag sconosciuto «${tag}»`).toBe(true);
      }
    }
  });

  it('ha id unici', () => {
    const ids = pack.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const lessonIds = pack.lessons.map((l) => l.id);
    expect(new Set(lessonIds).size).toBe(lessonIds.length);
  });

  it('collega ogni lezione a item esistenti', () => {
    const known = new Set(pack.items.map((i) => i.id));
    for (const lesson of pack.lessons) {
      expect(lesson.targetItemIds.length).toBeGreaterThan(0);
      for (const target of lesson.targetItemIds) {
        expect(known.has(target), `${lesson.id} → item inesistente «${target}»`).toBe(true);
      }
    }
  });

  it('rispetta il formato delle lezioni: 4-8 battute e 2 domande', () => {
    for (const lesson of pack.lessons) {
      expect(lesson.lines.length, `${lesson.id}`).toBeGreaterThanOrEqual(4);
      expect(lesson.lines.length, `${lesson.id}`).toBeLessThanOrEqual(8);
      expect(lesson.questions.length, `${lesson.id}`).toBe(2);
      for (const q of lesson.questions) {
        expect(q.answerIndex).toBeLessThan(q.options.length);
      }
    }
  });

  it('le trasformazioni cambiano davvero la frase e restano in tedesco', () => {
    const withTransformations = pack.items.filter((item) => item.transformations.length > 0);
    expect(withTransformations.length).toBeGreaterThanOrEqual(20);

    for (const item of withTransformations) {
      for (const transformation of item.transformations) {
        expect(transformation.from).not.toBe(transformation.to);
        expect(transformation.prompt.length).toBeGreaterThan(3);
        expect(isGrammarTag(transformation.tag)).toBe(true);
      }
    }
  });

  it('copre la scala della Fase 4 sugli item più frequenti', () => {
    // Il gradino della trasformazione compare solo se l'item porta una coppia
    // autorizzata: senza abbastanza item frequenti che ne hanno una, quel
    // gradino non si vedrebbe mai.
    const frequentWithTransformation = pack.items.filter(
      (item) => item.freqRank <= 800 && item.transformations.length > 0,
    );
    expect(frequentWithTransformation.length).toBeGreaterThanOrEqual(10);
  });

  it('spiega ogni falso amico', () => {
    for (const item of pack.items.filter((i) => i.falseFriend)) {
      expect(item.falseFriendNote, `${item.id} è marcato falso amico ma non spiega perché`).toBeTruthy();
    }
  });

  it('copre una gamma di topic sufficiente al selettore i+1', () => {
    const topics = new Set(pack.items.map((i) => i.topic));
    expect(topics.size).toBeGreaterThanOrEqual(8);
  });
});

describe('guardie della validazione', () => {
  const base = rawPack as unknown as Record<string, unknown>;

  function packWithFirstItemPatched(patch: Record<string, unknown>) {
    const clone = structuredClone(base) as { items: Record<string, unknown>[] };
    clone.items[0] = { ...clone.items[0], ...patch };
    return clone;
  }

  it('rifiuta un sostantivo senza articolo', () => {
    const broken = structuredClone(base) as { items: Record<string, unknown>[] };
    const nounIndex = broken.items.findIndex((i) => i.type === 'noun');
    broken.items[nounIndex] = { ...broken.items[nounIndex], de: 'Auto' };
    expect(contentPackSchema.safeParse(broken).success).toBe(false);
  });

  it('rifiuta un tag inventato', () => {
    expect(contentPackSchema.safeParse(packWithFirstItemPatched({ tags: ['dativo_inventato'] })).success).toBe(false);
  });

  it('rifiuta un genere su un item che non è un sostantivo', () => {
    expect(contentPackSchema.safeParse(packWithFirstItemPatched({ gender: 'der' })).success).toBe(false);
  });

  it('rifiuta un falso amico senza spiegazione', () => {
    const parsed = contentPackSchema.safeParse(packWithFirstItemPatched({ falseFriend: true, falseFriendNote: null }));
    expect(parsed.success).toBe(false);
  });

  it('rifiuta una lezione che punta a un item inesistente', () => {
    const broken = structuredClone(base) as { lessons: Record<string, unknown>[] };
    broken.lessons[0] = { ...broken.lessons[0], targetItemIds: ['item-che-non-esiste'] };
    expect(contentPackSchema.safeParse(broken).success).toBe(false);
  });
});

describe('registro dei tag', () => {
  it('non contiene duplicati', () => {
    expect(new Set(GRAMMAR_TAGS).size).toBe(GRAMMAR_TAGS.length);
  });

  it('espone solo tag drillabili che esistono nel registro', () => {
    for (const tag of DRILLABLE_TAGS) {
      expect(isGrammarTag(tag)).toBe(true);
    }
  });
});

describe('purezza di src/core', () => {
  const CORE_DIR = path.resolve(process.cwd(), 'src/core');
  const FORBIDDEN = ['react', 'react-native', 'expo', 'expo-', 'drizzle-orm', '@/db', '../db', '../../db'];

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) return walk(full);
      return full.endsWith('.ts') ? [full] : [];
    });
  }

  /**
   * Il motore deve restare testabile in isolamento (§1). Se qualcuno importa
   * React Native dentro `core/`, i test smettono di girare in Node e ce ne
   * accorgiamo solo mesi dopo: meglio un test che lo vieta esplicitamente.
   */
  it('non importa React, React Native, Expo o Drizzle', () => {
    const offenders: string[] = [];
    for (const file of walk(CORE_DIR)) {
      const source = readFileSync(file, 'utf8');
      const importRegex = /(?:^|\n)\s*(?:import|export)[^;\n]*?from\s+['"]([^'"]+)['"]/g;
      for (const match of source.matchAll(importRegex)) {
        const spec = match[1];
        if (spec.startsWith('.') && !spec.includes('/db')) continue;
        if (FORBIDDEN.some((bad) => spec === bad || spec.startsWith(`${bad}/`) || spec.startsWith('expo-'))) {
          offenders.push(`${path.relative(process.cwd(), file)} → ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
