/**
 * Stato del session player.
 *
 * Il player è un cursore su `steps`. Ogni avanzamento salva l'indice nel
 * database: chiudere l'app a metà sessione e riaprirla deve riprendere esatto,
 * non ricominciare — perdere il lavoro fatto è il modo più veloce per far
 * saltare la sessione del giorno, e con lei lo streak.
 */
import { create } from 'zustand';
import type { Feedback } from '../core/session/feedback';
import { buildFeedback } from '../core/session/feedback';
import type { ExerciseFormat } from '../core/session/formats';
import { type Prompt, buildPrompt, gradeAnswer } from '../core/session/grading';
import { PHASE_SHARES, type SessionPlan, buildSessionPlan } from '../core/session/plan';
import { buildDrill } from '../core/profile/drills';
import { type SessionStep, buildSteps } from '../core/session/steps';
import { deriveRating } from '../core/scheduler/rating';
import { bySiblingDirection, canPresent } from '../core/scheduler/unlock';
import type { GrammarTag, Item, SessionPhase } from '../core/types';
import { getDatabase } from '../db/client';
import {
  type EngineState,
  completeSession,
  findOpenSession,
  introduceItems,
  loadEngineState,
  markQueueCleared,
  markTagDrilled,
  recordReview,
  saveResumeState,
  startSession,
} from '../db/repo';

export interface SessionStats {
  answered: number;
  correct: number;
  reviewsDone: number;
  newItems: number;
}

interface ResumeState {
  version: 1;
  index: number;
  stats: SessionStats;
  recall: { cardId: string; format: ExerciseFormat }[];
  lessonId: string | null;
  newItemIds: string[];
  drillTag: GrammarTag | null;
  outputItemIds: string[];
  deferred: number;
  budgetMs: number;
}

export type SessionStatus = 'idle' | 'loading' | 'active' | 'completed' | 'error';

interface SessionStoreState {
  status: SessionStatus;
  error: string | null;
  sessionId: string | null;
  startedAt: number;
  engine: EngineState | null;
  plan: SessionPlan | null;
  steps: SessionStep[];
  index: number;
  stats: SessionStats;
  /** Feedback della risposta appena data. `null` = in attesa di risposta. */
  feedback: Feedback | null;
  stepStartedAt: number;
  usedHint: boolean;

  begin: () => Promise<void>;
  hasOpenSession: () => Promise<boolean>;
  answer: (userAnswer: string, options?: { selfAssessed?: boolean }) => Promise<void>;
  answerShadowing: (assessment: 'good' | 'again' | 'skipped') => Promise<void>;
  skipFeedback: () => void;
  useHint: () => void;
  advance: () => Promise<void>;
  finish: () => Promise<void>;
  reset: () => void;
  currentStep: () => SessionStep | null;
  promptFor: (step: SessionStep) => Prompt | null;
}

const EMPTY_STATS: SessionStats = { answered: 0, correct: 0, reviewsDone: 0, newItems: 0 };

function toResume(state: {
  index: number;
  stats: SessionStats;
  plan: SessionPlan | null;
}): ResumeState {
  const plan = state.plan;
  return {
    version: 1,
    index: state.index,
    stats: state.stats,
    recall: plan?.recall.assignments.map((a) => ({ cardId: a.card.card.id, format: a.format })) ?? [],
    lessonId: plan?.input.lesson?.lesson.id ?? null,
    newItemIds: plan?.newItems.items.map((i) => i.id) ?? [],
    drillTag: plan?.newItems.drills[0]?.tag ?? null,
    outputItemIds: plan?.output.items.map((i) => i.id) ?? [],
    deferred: plan?.recall.deferred ?? 0,
    budgetMs: plan?.budgetMs ?? 0,
  };
}

/**
 * Ricostruisce il piano salvato invece di ricalcolarlo.
 *
 * Ricalcolarlo sarebbe sbagliato: le card già risposte non sono più dovute,
 * quindi la coda del nuovo piano è più corta e l'indice salvato punterebbe a
 * un passo diverso — l'utente si ritroverebbe più avanti di dove era, saltando
 * esercizi. Il piano di una sessione è deciso una volta e resta quello.
 */
function planFromResume(resume: ResumeState, engine: EngineState): SessionPlan | null {
  const cardsById = new Map(engine.cards.map((card) => [card.id, card]));
  const allItems = [...engine.itemsById.values()];

  const assignments = resume.recall
    .map(({ cardId, format }) => {
      const card = cardsById.get(cardId);
      const item = card ? engine.itemsById.get(card.itemId) : undefined;
      if (!card || !item) return null;
      return {
        card: {
          card,
          item,
          retrievability: 0,
          itemId: card.itemId,
          topic: item.topic,
          direction: card.direction,
        },
        format,
        upgraded: false,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const lesson = resume.lessonId ? engine.lessons.find((l) => l.id === resume.lessonId) : undefined;
  const newItems = resume.newItemIds
    .map((id) => engine.itemsById.get(id))
    .filter((item): item is Item => item !== undefined);
  const outputItems = resume.outputItemIds
    .map((id) => engine.itemsById.get(id))
    .filter((item): item is Item => item !== undefined);
  const drill = resume.drillTag ? buildDrill(resume.drillTag, allItems) : null;

  const productive = assignments.filter((a) => a.format !== 'choice').length;

  return {
    day: '',
    budgetMs: resume.budgetMs,
    newItemAllowance: { allowance: 0, reason: 'none', zeroThreshold: 0, halveThreshold: 0 },
    recall: {
      budgetMs: resume.budgetMs * PHASE_SHARES.recall,
      assignments,
      productionShare: assignments.length === 0 ? 1 : productive / assignments.length,
      deferred: resume.deferred,
    },
    input: {
      budgetMs: resume.budgetMs * PHASE_SHARES.input,
      lesson: lesson
        ? {
            lesson,
            coverage: 1,
            unknownTokens: [],
            newItemIds: [],
            bestNewFreqRank: Number.POSITIVE_INFINITY,
            appliedMinCoverage: 0,
            relaxed: false,
            alreadySeen: true,
          }
        : null,
    },
    newItems: {
      budgetMs: resume.budgetMs * PHASE_SHARES.new,
      items: newItems,
      drills: drill ? [drill] : [],
    },
    output: { budgetMs: resume.budgetMs * PHASE_SHARES.output, items: outputItems },
    consolidation: { budgetMs: resume.budgetMs * PHASE_SHARES.consolidation },
  };
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  status: 'idle',
  error: null,
  sessionId: null,
  startedAt: 0,
  engine: null,
  plan: null,
  steps: [],
  index: 0,
  stats: { ...EMPTY_STATS },
  feedback: null,
  stepStartedAt: 0,
  usedHint: false,

  async hasOpenSession() {
    const db = await getDatabase();
    const engine = await loadEngineState(db);
    const open = await findOpenSession(db, engine.now, engine.settings.dayRolloverHour);
    return open !== null;
  },

  async begin() {
    set({ status: 'loading', error: null });
    try {
      const db = await getDatabase();
      const now = Date.now();
      const engine = await loadEngineState(db, now);
      const open = await findOpenSession(db, now, engine.settings.dayRolloverHour);
      const savedResume = open?.resumeState as ResumeState | null;
      const restored = savedResume?.version === 1 ? planFromResume(savedResume, engine) : null;

      let plan: SessionPlan;
      let index = 0;
      let stats: SessionStats;
      let sessionId: string;
      let startedAt = now;

      if (open && restored && savedResume) {
        plan = restored;
        index = Math.min(savedResume.index, Math.max(0, buildSteps(plan).length - 1));
        stats = savedResume.stats;
        sessionId = open.id;
        startedAt = open.startedAt;
      } else {
        plan = buildSessionPlan({
          now,
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
        stats = { ...EMPTY_STATS, newItems: plan.newItems.items.length };

        // Gli item nuovi entrano nel database all'avvio, non alla fine: se
        // l'utente chiude l'app a metà, quelli già visti devono restare visti.
        // Sta qui e non nel ramo di ripresa perché reintrodurli conterebbe due
        // volte nel cap giornaliero.
        if (plan.newItems.items.length > 0) {
          await introduceItems(db, plan.newItems.items, now, engine.settings.dayRolloverHour);
        }

        if (open) {
          sessionId = open.id;
          startedAt = open.startedAt;
        } else {
          sessionId = await startSession(db, now, engine.settings.dayRolloverHour, toResume({ index, stats, plan }));
        }
      }

      await saveResumeState(db, sessionId, toResume({ index, stats, plan }));

      set({
        status: 'active',
        engine,
        plan,
        steps: buildSteps(plan),
        index,
        stats,
        sessionId,
        startedAt,
        feedback: null,
        stepStartedAt: Date.now(),
        usedHint: false,
      });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },

  currentStep() {
    const { steps, index } = get();
    return steps[index] ?? null;
  },

  promptFor(step) {
    const engine = get().engine;
    if (!engine || step.phase !== 'recall') return null;
    return buildPrompt(step.card.card, step.card.item, step.format, [...engine.itemsById.values()]);
  },

  useHint() {
    set({ usedHint: true });
  },

  async answer(userAnswer, options) {
    const state = get();
    const step = state.currentStep();
    const engine = state.engine;
    if (!step || !engine || state.feedback) return;

    const now = Date.now();
    const latencyMs = now - state.stepStartedAt;
    const db = await getDatabase();

    if (step.phase === 'recall') {
      const prompt = state.promptFor(step)!;
      const check = gradeAnswer(prompt, userAnswer);
      const feedback = buildFeedback(check, step.card.item, { expectsGerman: prompt.answerLanguage === 'de' });

      const { rating } = deriveRating({
        wasCorrect: check.wasCorrect,
        latencyMs,
        direction: step.card.card.direction,
        expectedLength: prompt.expected.length,
        usedHint: state.usedHint || check.verdict === 'typo',
        selfAssessed: options?.selfAssessed,
      });

      await recordReview(
        db,
        {
          card: step.card.card,
          item: step.card.item,
          grade: rating,
          wasCorrect: check.wasCorrect,
          latencyMs,
          userAnswer,
          phase: 'recall',
          selfAssessed: options?.selfAssessed,
          errorTag: feedback.tag,
        },
        now,
        engine.settings,
        engine.weights,
      );

      set({
        feedback,
        stats: {
          ...state.stats,
          answered: state.stats.answered + 1,
          correct: state.stats.correct + (check.wasCorrect ? 1 : 0),
          reviewsDone: state.stats.reviewsDone + 1,
        },
      });
      return;
    }

    if (step.phase === 'input' && step.kind === 'question') {
      const correct = Number(userAnswer) === step.question.answerIndex;
      set({
        feedback: {
          correct,
          title: correct ? 'Esatto' : 'Non ancora',
          correction: correct ? null : step.question.options[step.question.answerIndex],
          explanation: null,
          tag: null,
        },
      });
      return;
    }

    if (step.phase === 'new' && step.kind === 'drill') {
      const check = gradeAnswer(
        {
          text: step.exercise.text,
          language: 'de',
          instruction: step.exercise.prompt,
          expected: step.exercise.answer,
          answerLanguage: 'de',
        },
        userAnswer,
      );
      set({
        feedback: {
          correct: check.wasCorrect,
          title: check.wasCorrect ? 'Esatto' : 'Non ancora',
          correction: check.wasCorrect ? null : step.exercise.answer,
          explanation: step.exercise.explanation,
          tag: step.exercise.tag,
        },
      });
      return;
    }

    if (step.phase === 'output') {
      const outputItem: Item = step.item;
      // Sulla trasformazione la forma attesa è quella autorizzata nei contenuti,
      // non la frase di partenza.
      const expected =
        step.rung === 'transformation' && step.transformation ? step.transformation.to : outputItem.de;
      const check = gradeAnswer(
        {
          text: outputItem.it,
          language: 'it',
          instruction: 'Scrivi in tedesco.',
          expected,
          answerLanguage: 'de',
        },
        userAnswer,
      );
      const feedback = buildFeedback(check, outputItem);
      set({
        feedback,
        stats: {
          ...state.stats,
          answered: state.stats.answered + 1,
          correct: state.stats.correct + (check.wasCorrect ? 1 : 0),
        },
      });
      return;
    }

    set({ feedback: { correct: true, title: 'Fatto', correction: null, explanation: null, tag: null } });
  },

  /**
   * Esito dello shadowing.
   *
   * Vale come review SOLO se la card `speaking` di quell'item è già aperta e
   * presentabile. Altrimenti resta esercizio: un'auto-valutazione su una
   * direzione che il gate di §3.1 tiene ancora chiusa entrerebbe nello
   * scheduling scavalcando la regola che dice quando è il momento di produrre.
   */
  async answerShadowing(assessment) {
    const state = get();
    const step = state.currentStep();
    if (!step || step.phase !== 'output' || step.rung !== 'shadowing' || !state.engine) return;

    if (assessment !== 'skipped') {
      const db = await getDatabase();
      const now = Date.now();
      const itemCards = state.engine.cards.filter((card) => card.itemId === step.item.id);
      const speaking = itemCards.find((card) => card.direction === 'speaking');

      if (speaking && speaking.unlocked && canPresent(speaking, bySiblingDirection(itemCards))) {
        const { rating } = deriveRating({
          wasCorrect: assessment === 'good',
          latencyMs: 0,
          direction: 'speaking',
          selfAssessed: true,
        });

        await recordReview(
          db,
          {
            card: speaking,
            item: step.item,
            grade: rating,
            wasCorrect: assessment === 'good',
            latencyMs: 0,
            userAnswer: null,
            phase: 'output',
            selfAssessed: true,
          },
          now,
          state.engine.settings,
          state.engine.weights,
        );

        set({
          stats: {
            ...state.stats,
            reviewsDone: state.stats.reviewsDone + 1,
          },
        });
      }
    }

    await get().advance();
  },

  skipFeedback() {
    set({ feedback: null });
  },

  async advance() {
    const state = get();
    const step = state.currentStep();
    const db = await getDatabase();

    if (step?.phase === 'new' && step.kind === 'rule' && state.engine) {
      await markTagDrilled(db, step.drill.tag, Date.now());
    }

    const nextIndex = state.index + 1;
    if (nextIndex >= state.steps.length) {
      await get().finish();
      return;
    }

    set({ index: nextIndex, feedback: null, stepStartedAt: Date.now(), usedHint: false });

    if (state.sessionId) {
      await saveResumeState(db, state.sessionId, toResume({ index: nextIndex, stats: get().stats, plan: state.plan }));
    }
  },

  async finish() {
    const state = get();
    if (!state.sessionId || !state.engine) return;

    const db = await getDatabase();
    const now = Date.now();
    const phasesCompleted = [...new Set(state.steps.map((step) => step.phase))] as SessionPhase[];

    await completeSession(db, state.sessionId, {
      durationMs: now - state.startedAt,
      phasesCompleted,
      newItems: state.stats.newItems,
      reviewsDone: state.stats.reviewsDone,
      accuracy: state.stats.answered === 0 ? 0 : state.stats.correct / state.stats.answered,
    });

    // Lo streak si guadagna svuotando la coda dovuta, non accumulando esercizi.
    if (state.plan && state.plan.recall.deferred === 0 && state.stats.reviewsDone > 0) {
      await markQueueCleared(db, now, state.engine.settings.dayRolloverHour);
    }

    set({ status: 'completed', feedback: null });
  },

  reset() {
    set({
      status: 'idle',
      error: null,
      sessionId: null,
      engine: null,
      plan: null,
      steps: [],
      index: 0,
      stats: { ...EMPTY_STATS },
      feedback: null,
      usedHint: false,
    });
  },
}));
