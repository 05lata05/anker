/**
 * Ripasso lampo: la seconda esposizione intra-giornaliera (§3.1).
 *
 * È deliberatamente separato dal session player. Arriva un'ora e mezza dopo la
 * sessione, dura un minuto, e non deve somigliare a «un'altra sessione» — se
 * sembrasse un impegno, verrebbe rimandato, e rimandato equivale a non farlo.
 */
import { create } from 'zustand';
import type { Feedback } from '../core/session/feedback';
import { buildFeedback } from '../core/session/feedback';
import { type Prompt, buildPrompt, gradeAnswer } from '../core/session/grading';
import { Rating } from '../core/types';
import { getDatabase } from '../db/client';
import { type ReinforcementCard, getDueReinforcements, loadEngineState, recordReview } from '../db/repo';

interface ReinforcementStore {
  status: 'idle' | 'loading' | 'active' | 'completed';
  cards: ReinforcementCard[];
  pool: Parameters<typeof buildPrompt>[3];
  index: number;
  correct: number;
  feedback: Feedback | null;
  startedAt: number;

  load: () => Promise<void>;
  prompt: () => Prompt | null;
  answer: (userAnswer: string) => Promise<void>;
  advance: () => void;
  reset: () => void;
}

export const useReinforcementStore = create<ReinforcementStore>((set, get) => ({
  status: 'idle',
  cards: [],
  pool: [],
  index: 0,
  correct: 0,
  feedback: null,
  startedAt: 0,

  async load() {
    set({ status: 'loading' });
    const db = await getDatabase();
    const now = Date.now();
    const [cards, engine] = await Promise.all([getDueReinforcements(db, now), loadEngineState(db, now)]);

    set({
      status: cards.length === 0 ? 'completed' : 'active',
      cards,
      pool: [...engine.itemsById.values()],
      index: 0,
      correct: 0,
      feedback: null,
      startedAt: now,
    });
  },

  prompt() {
    const { cards, index, pool } = get();
    const entry = cards[index];
    if (!entry) return null;
    // Formato a scelta: la traccia ha un'ora e mezza di vita, e un fallimento
    // in richiamo libero a questa distanza non dice niente di utile — dice solo
    // che era presto. Qui serve rinforzare, non misurare.
    return buildPrompt(entry.card, entry.item, 'choice', pool);
  },

  async answer(userAnswer) {
    const state = get();
    const entry = state.cards[state.index];
    const prompt = state.prompt();
    if (!entry || !prompt || state.feedback) return;

    const db = await getDatabase();
    const now = Date.now();
    const engine = await loadEngineState(db, now);
    const check = gradeAnswer(prompt, userAnswer);
    const feedback = buildFeedback(check, entry.item, { expectsGerman: prompt.answerLanguage === 'de' });

    await recordReview(
      db,
      {
        card: entry.card,
        item: entry.item,
        // Il voto è formale: `sameDayReinforcement` fa sì che non venga mai
        // passato a FSRS. Serve solo a rendere leggibile la riga di log.
        grade: check.wasCorrect ? Rating.Good : Rating.Again,
        wasCorrect: check.wasCorrect,
        latencyMs: 0,
        userAnswer,
        phase: 'consolidation',
        sameDayReinforcement: true,
        errorTag: feedback.tag,
      },
      now,
      engine.settings,
      engine.weights,
    );

    set({ feedback, correct: state.correct + (check.wasCorrect ? 1 : 0) });
  },

  advance() {
    const { index, cards } = get();
    const next = index + 1;
    if (next >= cards.length) {
      set({ status: 'completed', feedback: null });
      return;
    }
    set({ index: next, feedback: null });
  },

  reset() {
    set({ status: 'idle', cards: [], index: 0, correct: 0, feedback: null });
  },
}));
