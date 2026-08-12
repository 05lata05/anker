/**
 * Appiattimento del piano di sessione in una sequenza di passi.
 *
 * Il session player è un cursore su questa lista, e basta. Il vantaggio non è
 * l'eleganza: è che «riprendi dove avevi lasciato» diventa il salvataggio di un
 * indice invece di uno stato ad albero con cinque fasi, tre sotto-fasi e un
 * puntatore per ciascuna.
 */
import type { Drill, DrillExercise } from '../profile/drills';
import type { ComprehensionQuestion, Item, Lesson, SessionPhase, Transformation } from '../types';
import type { ExerciseFormat } from './formats';
import type { RecallCard, SessionPlan } from './plan';

export type OutputRung = 'shadowing' | 'completion' | 'reorder' | 'transformation' | 'free';

export type SessionStep =
  | { id: string; phase: 'recall'; card: RecallCard; format: ExerciseFormat }
  | { id: string; phase: 'input'; kind: 'dialogue'; lesson: Lesson }
  | { id: string; phase: 'input'; kind: 'question'; lesson: Lesson; question: ComprehensionQuestion; index: number }
  | { id: string; phase: 'new'; kind: 'chunk'; item: Item }
  | { id: string; phase: 'new'; kind: 'rule'; drill: Drill }
  | { id: string; phase: 'new'; kind: 'drill'; drill: Drill; exercise: DrillExercise }
  | { id: string; phase: 'output'; rung: OutputRung; item: Item; transformation?: Transformation }
  | { id: string; phase: 'consolidation' };

/**
 * Scala di difficoltà crescente della Fase 4 (§4):
 * completamento → riordino → trasformazione → produzione libera.
 *
 * La trasformazione compare solo se l'item porta una coppia autorizzata nei
 * contenuti. Non viene generata: per correggerla bisogna conoscere la forma
 * attesa, e produrre tedesco che nessuno ha verificato è peggio che saltare
 * l'esercizio. Quando la coppia manca, quel posto lo prende il riordino, che
 * è comunque manipolazione di forma e non riconoscimento.
 */
const OUTPUT_LADDER: readonly OutputRung[] = ['completion', 'reorder', 'transformation', 'free'];

export function buildSteps(plan: SessionPlan): SessionStep[] {
  const steps: SessionStep[] = [];

  // --- Fase 1 ---
  for (const assignment of plan.recall.assignments) {
    steps.push({
      id: `recall:${assignment.card.card.id}`,
      phase: 'recall',
      card: assignment.card,
      format: assignment.format,
    });
  }

  // --- Fase 2 ---
  if (plan.input.lesson) {
    const lesson = plan.input.lesson.lesson;
    steps.push({ id: `input:${lesson.id}`, phase: 'input', kind: 'dialogue', lesson });
    lesson.questions.forEach((question, index) => {
      steps.push({ id: `input:${lesson.id}:q${index}`, phase: 'input', kind: 'question', lesson, question, index });
    });
  }

  // --- Fase 3 ---
  for (const item of plan.newItems.items) {
    steps.push({ id: `new:${item.id}`, phase: 'new', kind: 'chunk', item });
  }
  for (const drill of plan.newItems.drills) {
    if (drill.rule) steps.push({ id: `rule:${drill.tag}`, phase: 'new', kind: 'rule', drill });
    for (const exercise of drill.exercises) {
      steps.push({ id: `drill:${exercise.id}`, phase: 'new', kind: 'drill', drill, exercise });
    }
  }

  // --- Fase 4 ---
  plan.output.items.forEach((item, index) => {
    if (index === 0) steps.push({ id: `output:shadow:${item.id}`, phase: 'output', rung: 'shadowing', item });

    let rung = OUTPUT_LADDER[Math.min(index, OUTPUT_LADDER.length - 1)];
    const transformation = item.transformations[0];
    if (rung === 'transformation' && !transformation) rung = 'reorder';

    steps.push({
      id: `output:${rung}:${item.id}`,
      phase: 'output',
      rung,
      item,
      ...(rung === 'transformation' ? { transformation } : {}),
    });
  });

  // --- Fase 5 ---
  steps.push({ id: 'consolidation', phase: 'consolidation' });

  return steps;
}

export const PHASE_ORDER: readonly SessionPhase[] = ['recall', 'input', 'new', 'output', 'consolidation'];

export const PHASE_LABELS: Record<SessionPhase, string> = {
  recall: 'Richiamo',
  input: 'Input',
  new: 'Nuovi chunk',
  output: 'Produzione',
  consolidation: 'Consolidamento',
};

/** Quante fasi contengono almeno un passo. Serve alla barra di avanzamento. */
export function phasesPresent(steps: readonly SessionStep[]): SessionPhase[] {
  const present = new Set(steps.map((step) => step.phase));
  return PHASE_ORDER.filter((phase) => present.has(phase));
}

export function progressWithinPhase(steps: readonly SessionStep[], index: number): { done: number; total: number } {
  const current = steps[index];
  if (!current) return { done: 0, total: 0 };
  const ofPhase = steps.filter((step) => step.phase === current.phase);
  const done = steps.slice(0, index).filter((step) => step.phase === current.phase).length;
  return { done, total: ofPhase.length };
}
