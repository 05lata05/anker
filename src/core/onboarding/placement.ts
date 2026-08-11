/**
 * Placement adattivo (§7.1).
 *
 * Serve a non far ripartire da «Hallo» chi è già A2. Ma va detto chiaramente
 * cosa è e cosa non è: venti risposte di riconoscimento non misurano il livello
 * di nessuno. È una STIMA usata per due cose — decidere da dove cominciare a
 * introdurre item, e pre-caricare lo stato FSRS di ciò che l'utente sembra già
 * sapere — e entrambe si autocorreggono nel giro di qualche giorno, perché un
 * item seminato per sbaglio cade al primo richiamo e rientra in circolo.
 */
import { createCard } from '../scheduler/fsrs';
import { shuffleDeterministic } from '../session/grading';
import { CardState, type Card, type Cefr, type Item } from '../types';

export const PLACEMENT_LENGTH = 24;

/** Bande di frequenza campionate, dalla più comune alla più rara. */
export const PLACEMENT_BANDS: readonly number[] = [100, 250, 500, 800, 1200, 2000];

/** Dopo questi errori consecutivi si smette: il livello è già stato superato. */
export const PLACEMENT_STOP_AFTER_MISSES = 4;

export interface PlacementQuestion {
  item: Item;
  options: string[];
  answerIndex: number;
  band: number;
}

/**
 * Costruisce la scaletta a difficoltà crescente.
 *
 * Le domande sono di riconoscimento a scelta multipla — cioè esattamente il
 * formato che la specifica vieta durante le sessioni. Qui è legittimo perché
 * l'obiettivo non è insegnare ma misurare in fretta, e perché una domanda di
 * produzione a freddo su un item mai visto non discrimina: sbagliano tutti.
 */
export function buildPlacement(items: readonly Item[], length = PLACEMENT_LENGTH): PlacementQuestion[] {
  const sorted = [...items].sort((a, b) => a.freqRank - b.freqRank);
  const perBand = Math.max(1, Math.floor(length / PLACEMENT_BANDS.length));
  const questions: PlacementQuestion[] = [];
  const used = new Set<string>();

  for (const band of PLACEMENT_BANDS) {
    const candidates = sorted.filter((item) => item.freqRank <= band && !used.has(item.id));
    const picked = candidates.slice(-perBand);
    for (const item of picked) {
      used.add(item.id);
      const distractors = sorted
        .filter((other) => other.id !== item.id && other.topic !== item.topic)
        .slice(0, 40);
      const options = shuffleDeterministic(
        [item.it, ...pickSpread(distractors, 3).map((other) => other.it)],
        item.id,
      );
      questions.push({ item, options, answerIndex: options.indexOf(item.it), band });
    }
  }

  return questions.slice(0, length);
}

function pickSpread<T>(values: readonly T[], count: number): T[] {
  if (values.length <= count) return [...values];
  const step = Math.floor(values.length / count);
  return Array.from({ length: count }, (_, i) => values[i * step]);
}

export interface PlacementAnswer {
  itemId: string;
  correct: boolean;
  band: number;
}

export interface PlacementResult {
  level: Cefr;
  /** Item che l'utente sembra già conoscere: verranno seminati. */
  knownItemIds: string[];
  /** Rango di frequenza fino a cui l'utente regge. */
  reachedRank: number;
  accuracy: number;
}

/** Si smette quando l'utente ha superato il proprio limite, non a domanda fissa. */
export function shouldStop(answers: readonly PlacementAnswer[], stopAfter = PLACEMENT_STOP_AFTER_MISSES): boolean {
  const tail = answers.slice(-stopAfter);
  return tail.length === stopAfter && tail.every((answer) => !answer.correct);
}

export function scorePlacement(answers: readonly PlacementAnswer[]): PlacementResult {
  const correct = answers.filter((answer) => answer.correct);
  const reachedRank = correct.reduce((max, answer) => Math.max(max, answer.band), 0);
  const accuracy = answers.length === 0 ? 0 : correct.length / answers.length;

  // Soglie volutamente conservative: sopravvalutare il livello significa
  // saltare item che servono, e il costo di quell'errore è invisibile finché
  // non si accumula come buco.
  let level: Cefr = 'A1';
  if (reachedRank >= 2000 && accuracy >= 0.8) level = 'B1';
  else if (reachedRank >= 800 && accuracy >= 0.75) level = 'A2';

  return { level, knownItemIds: correct.map((answer) => answer.itemId), reachedRank, accuracy };
}

/**
 * Stability iniziale attribuita a un item riconosciuto nel placement.
 *
 * Quattro giorni, non trenta. Riconoscere una parola in un test a scelta
 * multipla non dice che la si ricorderà tra un mese: se si seminasse una
 * stability alta, l'item sparirebbe dalla coda per settimane e l'errore
 * verrebbe scoperto troppo tardi. Con quattro giorni l'item torna presto, e a
 * quel punto è FSRS a misurarlo davvero.
 */
export const PLACEMENT_SEED_STABILITY_DAYS = 4;
export const PLACEMENT_SEED_DIFFICULTY = 5.5;

/**
 * Crea le card di un item «già noto» con uno stato FSRS stimato.
 * È un'euristica, non una misura: la funzione lo dichiara nel nome del campo
 * che restituisce e la schermata dei progressi lo ripete all'utente.
 */
export function seedKnownCards(item: Item, now: number, directions: readonly Card['direction'][]): Card[] {
  return directions.map((direction) => {
    const card = createCard(item.id, direction, now, direction === 'recognition' || direction === 'listening' || direction === 'gender');
    if (direction !== 'recognition') return card;

    return {
      ...card,
      stability: PLACEMENT_SEED_STABILITY_DAYS,
      difficulty: PLACEMENT_SEED_DIFFICULTY,
      state: CardState.Review,
      reps: 1,
      lastReview: now,
      scheduledDays: PLACEMENT_SEED_STABILITY_DAYS,
      due: now + PLACEMENT_SEED_STABILITY_DAYS * 86_400_000,
    };
  });
}
