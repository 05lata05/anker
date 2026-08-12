/**
 * Test di integrazione del layer dati, contro SQLite vero.
 *
 * Perché esiste: i test in `src/core/` verificano il motore su oggetti in
 * memoria, ma tra il motore e l'utente ci sono le migrazioni, i tipi JSON delle
 * colonne, gli upsert e la persistenza dello stato FSRS — cioè il punto dove i
 * bug non si vedono finché non si perde il lavoro di qualcuno.
 *
 * Usa `node:sqlite` (nativo dal Node 22) tramite il driver proxy di Drizzle, non
 * expo-sqlite: gira in Node senza dipendenze native e senza emulatore.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { beforeEach, describe, expect, it } from 'vitest';
import { Rating } from '../../core/types';
import { buildSessionPlan } from '../../core/session/plan';
import { buildSteps } from '../../core/session/steps';
import type { Database } from '../client';
import { computeStreak } from '../../core/progress/metrics';
import { logicalDay, previousLogicalDay } from '../../core/scheduler/day';
import {
  countAnchors,
  countDueNow,
  completeSession,
  findOpenSession,
  getDayLogs,
  getDueReinforcements,
  getNextReinforcementAt,
  getSettings,
  introduceItems,
  loadEngineState,
  markQueueCleared,
  recordReview,
  runDailyMaintenance,
  saveResumeState,
  startSession,
} from '../repo';
import * as schema from '../schema';
import { contentPack, seedContent } from '../seed';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle');

function createDatabase(): Database {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const content = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    for (const statement of content.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed.length > 0) sqlite.exec(trimmed);
    }
  }

  const db = drizzle(
    async (sql, params, method) => {
      const statement = sqlite.prepare(sql);
      if (method === 'run') {
        statement.run(...(params as never[]));
        return { rows: [] };
      }
      // Righe come array, non come oggetti: sulle JOIN i nomi di colonna si
      // ripetono (`items.id` e `cards.id`) e la mappatura per chiave ne perde
      // metà, facendo arrivare a Drizzle valori nella colonna sbagliata.
      statement.setReturnArrays(true);
      const rows = statement.all(...(params as never[])) as unknown as unknown[][];
      return method === 'get' ? { rows: rows[0] ?? [] } : { rows };
    },
    { schema },
  );

  return db as unknown as Database;
}

describe('migrazioni e seed', () => {
  let db: Database;

  beforeEach(async () => {
    db = createDatabase();
    await seedContent(db, Date.now());
  });

  it('applica la migrazione e carica tutti i contenuti', async () => {
    const state = await loadEngineState(db);
    expect(state.itemsById.size).toBe(contentPack.items.length);
    expect(state.lessons.length).toBe(contentPack.lessons.length);
  });

  it('round-trip corretto delle colonne JSON', async () => {
    const state = await loadEngineState(db);
    const auto = state.itemsById.get('das-auto')!;
    expect(Array.isArray(auto.tags)).toBe(true);
    expect(auto.tags).toContain('gender_das');
    expect(auto.gender).toBe('das');
    expect(auto.plural).toBe('die Autos');

    const lesson = state.lessons.find((l) => l.id === 'l-im-cafe')!;
    expect(lesson.lines).toHaveLength(6);
    expect(lesson.lines[0].speaker).toBe('Kellner');
    expect(lesson.questions).toHaveLength(2);
    expect(lesson.targetItemIds).toContain('ich-haette-gern-einen-kaffee');
  });

  it('il seed è idempotente e aggiorna invece di duplicare', async () => {
    await seedContent(db, Date.now());
    const state = await loadEngineState(db);
    expect(state.itemsById.size).toBe(contentPack.items.length);
  });

  it('parte con le impostazioni di default', async () => {
    const settings = await getSettings(db);
    expect(settings.desiredRetention).toBe(0.88);
    expect(settings.maxNewItemsPerDay).toBe(6);
    expect(settings.dayRolloverHour).toBe(4);
  });

  it('non crea card al seed: nascono quando l’item viene introdotto', async () => {
    const state = await loadEngineState(db);
    expect(state.cards).toHaveLength(0);
    expect(await countDueNow(db, Date.now())).toBe(0);
  });
});

describe('ciclo di sessione end-to-end', () => {
  let db: Database;
  const now = Date.now();

  beforeEach(async () => {
    db = createDatabase();
    await seedContent(db, now);
  });

  async function planNow(at = now) {
    const engine = await loadEngineState(db, at);
    const plan = buildSessionPlan({
      now: at,
      settings: engine.settings,
      cards: engine.cards,
      itemsById: engine.itemsById,
      lessons: engine.lessons,
      errorProfile: engine.errorProfile,
      knownItemIds: engine.knownItemIds,
      seenLessonIds: engine.seenLessonIds,
      newItemsIntroducedToday: engine.newItemsIntroducedToday,
      weights: engine.weights,
    });
    return { engine, plan };
  }

  it('la prima sessione introduce chunk nuovi e crea le card giuste', async () => {
    const { engine, plan } = await planNow();
    expect(plan.newItems.items.length).toBeGreaterThan(0);

    await introduceItems(db, plan.newItems.items, now, engine.settings.dayRolloverHour);
    const after = await loadEngineState(db, now);

    const first = plan.newItems.items[0];
    const itsCards = after.cards.filter((card) => card.itemId === first.id);
    const unlocked = itsCards.filter((card) => card.unlocked).map((card) => card.direction).sort();

    expect(unlocked).toContain('recognition');
    expect(unlocked).toContain('listening');
    // La produzione esiste ma è chiusa: il riconoscimento non regge ancora.
    expect(itsCards.find((card) => card.direction === 'production')?.unlocked).toBe(false);
    expect(itsCards.find((card) => card.direction === 'speaking')?.unlocked).toBe(false);
  });

  it('programma la seconda esposizione intra-giornaliera sul riconoscimento', async () => {
    const { engine, plan } = await planNow();
    await introduceItems(db, plan.newItems.items, now, engine.settings.dayRolloverHour);
    const after = await loadEngineState(db, now);

    const recognition = after.cards.filter((card) => card.direction === 'recognition');
    expect(recognition.length).toBeGreaterThan(0);
    for (const card of recognition) {
      expect(card.sameDayReinforcementDue).not.toBeNull();
      const delay = card.sameDayReinforcementDue! - now;
      expect(delay).toBeGreaterThanOrEqual(90 * 60 * 1000);
      expect(delay).toBeLessThanOrEqual(120 * 60 * 1000);
    }
  });

  it('una risposta giusta persiste lo stato FSRS e allontana la scadenza', async () => {
    const { engine, plan } = await planNow();
    await introduceItems(db, plan.newItems.items, now, engine.settings.dayRolloverHour);
    const loaded = await loadEngineState(db, now);

    const card = loaded.cards.find((c) => c.direction === 'recognition')!;
    const item = loaded.itemsById.get(card.itemId)!;

    const { card: updated } = await recordReview(
      db,
      {
        card,
        item,
        grade: Rating.Good,
        wasCorrect: true,
        latencyMs: 4_000,
        userAnswer: item.it,
        phase: 'recall',
      },
      now,
      loaded.settings,
      loaded.weights,
    );

    expect(updated.stability).toBeGreaterThan(0);
    expect(updated.due).toBeGreaterThan(now);

    const persisted = (await loadEngineState(db, now)).cards.find((c) => c.id === card.id)!;
    expect(persisted.stability).toBeCloseTo(updated.stability, 6);
    expect(persisted.reps).toBe(1);
    expect(persisted.due).toBe(updated.due);
  });

  it('una risposta sbagliata alimenta il profilo errori sui tag dell’item', async () => {
    const { engine, plan } = await planNow();
    await introduceItems(db, plan.newItems.items, now, engine.settings.dayRolloverHour);
    const loaded = await loadEngineState(db, now);

    const card = loaded.cards.find((c) => c.direction === 'recognition')!;
    const item = loaded.itemsById.get(card.itemId)!;

    await recordReview(
      db,
      {
        card,
        item,
        grade: Rating.Again,
        wasCorrect: false,
        latencyMs: 9_000,
        userAnswer: 'sbagliato',
        phase: 'recall',
        errorTag: 'dativ',
      },
      now,
      loaded.settings,
      loaded.weights,
    );

    const profile = (await loadEngineState(db, now)).errorProfile;
    expect(profile.get('dativ')?.exposures).toBe(1);
    expect(profile.get('dativ')?.emaErrorRate).toBeCloseTo(0.2, 6);
    for (const tag of item.tags) {
      expect(profile.get(tag)?.exposures).toBe(1);
    }
  });

  it('sblocca la produzione solo quando il riconoscimento supera i 7 giorni', async () => {
    const { engine, plan } = await planNow();
    await introduceItems(db, plan.newItems.items, now, engine.settings.dayRolloverHour);

    let card = (await loadEngineState(db, now)).cards.find((c) => c.direction === 'recognition')!;
    const item = (await loadEngineState(db, now)).itemsById.get(card.itemId)!;
    let at = now;

    // Si risponde Easy fino a superare la soglia, avanzando nel tempo fino alla
    // scadenza di volta in volta: è il percorso reale, non una scorciatoia.
    for (let i = 0; i < 6 && card.stability <= 7; i++) {
      const state = await loadEngineState(db, at);
      card = state.cards.find((c) => c.id === card.id)!;
      const { card: updated } = await recordReview(
        db,
        { card, item, grade: Rating.Easy, wasCorrect: true, latencyMs: 1_500, userAnswer: item.it, phase: 'recall' },
        at,
        state.settings,
        state.weights,
      );
      card = updated;
      at = updated.due;
    }

    expect(card.stability).toBeGreaterThan(7);

    const final = await loadEngineState(db, at);
    const production = final.cards.find((c) => c.itemId === card.itemId && c.direction === 'production')!;
    expect(production.unlocked).toBe(true);
  });

  it('conta gli ancoraggi solo quando la stability supera i 30 giorni', async () => {
    const { engine, plan } = await planNow();
    await introduceItems(db, plan.newItems.items, now, engine.settings.dayRolloverHour);
    expect(await countAnchors(db)).toBe(0);
  });
});

describe('seconda esposizione intra-giornaliera', () => {
  let db: Database;
  const now = Date.now();

  beforeEach(async () => {
    db = createDatabase();
    await seedContent(db, now);
  });

  async function introduceSome() {
    const engine = await loadEngineState(db, now);
    const plan = buildSessionPlan({
      now,
      settings: engine.settings,
      cards: engine.cards,
      itemsById: engine.itemsById,
      lessons: engine.lessons,
      errorProfile: engine.errorProfile,
      knownItemIds: engine.knownItemIds,
      weights: engine.weights,
    });
    await introduceItems(db, plan.newItems.items, now, engine.settings.dayRolloverHour);
    return plan.newItems.items;
  }

  it('non è dovuta subito dopo l’introduzione', async () => {
    await introduceSome();
    expect(await getDueReinforcements(db, now)).toHaveLength(0);
  });

  it('diventa dovuta dopo la finestra di 90-120 minuti', async () => {
    const introduced = await introduceSome();
    const later = now + 121 * 60 * 1000;
    const due = await getDueReinforcements(db, later);

    expect(due.length).toBe(introduced.length);
    for (const entry of due) {
      expect(entry.card.direction).toBe('recognition');
      expect(entry.item.id).toBe(entry.card.itemId);
    }
  });

  it('annuncia quando arriverà il prossimo, per la notifica', async () => {
    await introduceSome();
    const next = await getNextReinforcementAt(db, now);
    expect(next).not.toBeNull();
    expect(next! - now).toBeGreaterThanOrEqual(90 * 60 * 1000);
    expect(next! - now).toBeLessThanOrEqual(120 * 60 * 1000);
  });

  it('rispondere al rinforzo NON tocca lo stato FSRS', async () => {
    await introduceSome();
    const later = now + 121 * 60 * 1000;
    const [entry] = await getDueReinforcements(db, later);
    const before = entry.card;

    await recordReview(
      db,
      {
        card: before,
        item: entry.item,
        grade: Rating.Good,
        wasCorrect: true,
        latencyMs: 1_500,
        userAnswer: entry.item.it,
        phase: 'consolidation',
        sameDayReinforcement: true,
      },
      later,
      (await loadEngineState(db, later)).settings,
      null,
    );

    const after = (await loadEngineState(db, later)).cards.find((c) => c.id === before.id)!;
    // Un richiamo a 90 minuti dato in pasto a FSRS deformerebbe la stability:
    // qui deve restare esattamente com'era.
    expect(after.stability).toBe(before.stability);
    expect(after.difficulty).toBe(before.difficulty);
    expect(after.due).toBe(before.due);
    expect(after.reps).toBe(before.reps);
    // Ma il promemoria si spegne, e quella card non ricompare.
    expect(after.sameDayReinforcementDue).toBeNull();
    const stillDue = await getDueReinforcements(db, later);
    expect(stillDue.map((entry) => entry.card.id)).not.toContain(before.id);
  });

  it('il rinforzo alimenta comunque il profilo errori', async () => {
    await introduceSome();
    const later = now + 121 * 60 * 1000;
    const [entry] = await getDueReinforcements(db, later);

    await recordReview(
      db,
      {
        card: entry.card,
        item: entry.item,
        grade: Rating.Again,
        wasCorrect: false,
        latencyMs: 4_000,
        userAnswer: 'sbagliato',
        phase: 'consolidation',
        sameDayReinforcement: true,
      },
      later,
      (await loadEngineState(db, later)).settings,
      null,
    );

    const profile = (await loadEngineState(db, later)).errorProfile;
    for (const tag of entry.item.tags) {
      expect(profile.get(tag)?.exposures).toBe(1);
    }
  });
});

describe('manutenzione della giornata', () => {
  let db: Database;
  const now = Date.now();

  beforeEach(async () => {
    db = createDatabase();
    await seedContent(db, now);
  });

  it('non congela niente per un utente nuovo', async () => {
    expect((await runDailyMaintenance(db, now)).frozeDay).toBeNull();
    expect((await getSettings(db)).streakFreezesLeft).toBe(2);
  });

  it('brucia un freeze per il giorno saltato e lo scrive nel registro', async () => {
    const settings = await getSettings(db);
    const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;
    await markQueueCleared(db, twoDaysAgo, settings.dayRolloverHour);

    const { frozeDay } = await runDailyMaintenance(db, now);
    expect(frozeDay).toBe(previousLogicalDay(logicalDay(now, settings.dayRolloverHour)));
    expect((await getSettings(db)).streakFreezesLeft).toBe(1);

    // La catena regge: ieri risulta coperto.
    const logs = await getDayLogs(db);
    expect(computeStreak(logs, now, settings.dayRolloverHour).current).toBe(1);
  });

  it('non brucia due freeze per lo stesso giorno', async () => {
    const settings = await getSettings(db);
    await markQueueCleared(db, now - 2 * 24 * 60 * 60 * 1000, settings.dayRolloverHour);

    await runDailyMaintenance(db, now);
    await runDailyMaintenance(db, now);
    expect((await getSettings(db)).streakFreezesLeft).toBe(1);
  });
});

describe('pausa e ripresa', () => {
  let db: Database;
  const now = Date.now();

  beforeEach(async () => {
    db = createDatabase();
    await seedContent(db, now);
  });

  it('ritrova la sessione aperta della giornata e ne conserva il punto', async () => {
    const engine = await loadEngineState(db, now);
    const sessionId = await startSession(db, now, engine.settings.dayRolloverHour, { version: 1, index: 0 });

    await saveResumeState(db, sessionId, { version: 1, index: 7, stats: { answered: 7 } });

    const open = await findOpenSession(db, now, engine.settings.dayRolloverHour);
    expect(open?.id).toBe(sessionId);
    expect((open?.resumeState as { index: number }).index).toBe(7);
  });

  it('una sessione chiusa non viene più proposta come riprendibile', async () => {
    const engine = await loadEngineState(db, now);
    const sessionId = await startSession(db, now, engine.settings.dayRolloverHour, { version: 1, index: 0 });

    await completeSession(db, sessionId, {
      durationMs: 900_000,
      phasesCompleted: ['recall', 'consolidation'],
      newItems: 3,
      reviewsDone: 12,
      accuracy: 0.87,
    });

    expect(await findOpenSession(db, now, engine.settings.dayRolloverHour)).toBeNull();
  });

  it('il piano appiattito in passi copre tutte le fasi con contenuti reali', async () => {
    const engine = await loadEngineState(db, now);
    const plan = buildSessionPlan({
      now,
      settings: engine.settings,
      cards: engine.cards,
      itemsById: engine.itemsById,
      lessons: engine.lessons,
      errorProfile: engine.errorProfile,
      knownItemIds: engine.knownItemIds,
      weights: engine.weights,
    });

    const steps = buildSteps(plan);
    const phases = new Set(steps.map((step) => step.phase));

    // A freddo non ci sono review dovute: la sessione parte da input e nuovi
    // chunk. È il comportamento voluto, non una fase mancante.
    expect(phases.has('input')).toBe(true);
    expect(phases.has('new')).toBe(true);
    expect(phases.has('output')).toBe(true);
    expect(phases.has('consolidation')).toBe(true);
    expect(steps.length).toBeGreaterThan(5);
  });
});
