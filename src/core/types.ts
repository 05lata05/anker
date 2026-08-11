/**
 * Tipi di dominio di ANKER.
 *
 * Vincolo architetturale: `src/core/` non importa React, React Native, Expo né
 * Drizzle. Gira in Node sotto Vitest. Il layer `src/db/` mappa le righe SQLite
 * su questi tipi, mai il contrario.
 */
import type { GrammarTag } from './german/tags';

export type { GrammarTag } from './german/tags';

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

/**
 * `chunk` è l'unità di default (approccio lessicale). `noun` e `verb` esistono
 * solo perché genere/plurale e paradigmi verbali richiedono card dedicate;
 * anche loro compaiono sempre in contesto, mai come lemma nudo.
 * `pattern` è uno schema produttivo con uno slot (es. «Ich möchte ___ kaufen»).
 */
export type ItemType = 'chunk' | 'noun' | 'verb' | 'pattern';

export type Gender = 'der' | 'die' | 'das';

export type Cefr = 'A1' | 'A2' | 'B1' | 'B2';

export interface Item {
  id: string;
  type: ItemType;
  /** Forma tedesca. Per i sostantivi include SEMPRE l'articolo: «das Auto». */
  de: string;
  it: string;
  /** Glossa letterale, per rendere trasparente un chunk opaco. */
  literalIt: string | null;
  audioPath: string | null;
  /** Se true, in assenza di `audioPath` si usa il TTS di sistema. */
  ttsFallback: boolean;
  gender: Gender | null;
  /** Plurale completo con articolo: «die Autos». Null per i non-sostantivi. */
  plural: string | null;
  cefr: Cefr;
  /**
   * Posizione approssimata nella lista di frequenza del tedesco parlato.
   * Per i chunk è il rango della parola-testa. Valore basso = più frequente.
   */
  freqRank: number;
  topic: string;
  tags: GrammarTag[];
  cognateIt: string | null;
  cognateEn: string | null;
  falseFriend: boolean;
  /** Nota mostrata col badge di falso amico. Obbligatoria se `falseFriend`. */
  falseFriendNote: string | null;
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

/**
 * Una card per (item × direzione). Le direzioni si sbloccano progressivamente:
 * recognition → production → speaking (§3.1). `gender` si sblocca insieme a
 * recognition, `listening` insieme a recognition.
 */
export type Direction =
  | 'recognition' // DE → IT
  | 'production' // IT → DE, scritta
  | 'listening' // audio → significato
  | 'speaking' // IT → DE, parlata
  | 'gender'; // solo sostantivi: der/die/das

export const DIRECTIONS: readonly Direction[] = [
  'recognition',
  'gender',
  'listening',
  'production',
  'speaking',
];

/** Rispecchia `State` di ts-fsrs, ridichiarato per non legare i tipi al package. */
export enum CardState {
  New = 0,
  Learning = 1,
  Review = 2,
  Relearning = 3,
}

/** Rispecchia `Rating` di ts-fsrs. `Manual` non viene mai prodotto dall'app. */
export enum Rating {
  Manual = 0,
  Again = 1,
  Hard = 2,
  Good = 3,
  Easy = 4,
}

/** I quattro voti che l'app può derivare da correttezza + latenza (§4, Fase 1). */
export type Grade = Rating.Again | Rating.Hard | Rating.Good | Rating.Easy;

export interface Card {
  id: string;
  itemId: string;
  direction: Direction;
  unlocked: boolean;
  /**
   * Quando l'item è entrato in circolo. Serve alla regola dei formati (§4):
   * il quiz a scelta multipla è tollerato solo nei primi giorni di vita di un
   * item, e «i primi giorni» è una misura di tempo, non di ripetizioni.
   */
  introducedAt: number;

  // --- stato FSRS ---
  stability: number;
  difficulty: number;
  due: number; // epoch ms
  reps: number;
  lapses: number;
  state: CardState;
  lastReview: number | null; // epoch ms
  scheduledDays: number;
  learningSteps: number;

  /**
   * Seconda esposizione intra-giornaliera (§3.1). Vive fuori dal ciclo FSRS:
   * quando scatta si presenta la card, si registra il review nel log, ma NON si
   * aggiorna la stability (vedi `scheduler/sameDay.ts` per il motivo).
   */
  sameDayReinforcementDue: number | null;

  /** Leech: card sospesa dopo troppi lapse. Non entra in coda finché non si riformula. */
  suspended: boolean;
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export type SessionPhase =
  | 'recall' // Fase 1
  | 'input' // Fase 2
  | 'new' // Fase 3
  | 'output' // Fase 4
  | 'consolidation'; // Fase 5

/** Log immutabile. Non si aggiorna mai una riga di `reviews`: si appende. */
export interface Review {
  id: string;
  cardId: string;
  ts: number; // epoch ms
  rating: Grade;
  /** Latenza grezza misurata. La normalizzazione avviene nel rating deriver. */
  latencyMs: number;
  wasCorrect: boolean;
  userAnswer: string | null;
  phase: SessionPhase;
  /**
   * true quando il voto viene da un'auto-valutazione dell'utente (fallback
   * speaking senza ASR, §4 Fase 4). Questi review sono meno affidabili e
   * vengono esclusi dalle statistiche di accuratezza.
   */
  selfAssessed: boolean;
  /** true se è la seconda esposizione intra-giornaliera: non aggiorna FSRS. */
  sameDayReinforcement: boolean;
}

// ---------------------------------------------------------------------------
// Profilo errori
// ---------------------------------------------------------------------------

export interface ErrorProfileEntry {
  tag: GrammarTag;
  /** Media mobile esponenziale del tasso di errore, α = 0,2. */
  emaErrorRate: number;
  exposures: number;
  lastUpdated: number; // epoch ms
  /** Timestamp dell'ultimo drill iniettato, per non ripeterlo ogni sessione. */
  lastDrillAt: number | null;
}

// ---------------------------------------------------------------------------
// Lezioni (input comprensibile)
// ---------------------------------------------------------------------------

export interface LessonLine {
  speaker: string;
  de: string;
  it: string;
}

/** Domanda di comprensione: in tedesco, sulla sostanza, non sulla traduzione. */
export interface ComprehensionQuestion {
  de: string;
  options: string[];
  answerIndex: number;
}

export interface Lesson {
  id: string;
  cefr: Cefr;
  topic: string;
  lines: LessonLine[];
  audioPath: string | null;
  targetItemIds: string[];
  questions: ComprehensionQuestion[];
}

// ---------------------------------------------------------------------------
// Sessioni e giornate
// ---------------------------------------------------------------------------

export interface SessionRecord {
  id: string;
  /** Giornata logica in formato YYYY-MM-DD, calcolata col rollover delle 04:00. */
  day: string;
  startedAt: number;
  durationMs: number;
  phasesCompleted: SessionPhase[];
  newItems: number;
  reviewsDone: number;
  /** Frazione 0-1, esclusi i review auto-valutati. */
  accuracy: number;
  completed: boolean;
}

/**
 * Una riga per giornata logica. Serve allo streak (§6) e al cap dei nuovi item
 * (§3.1): entrambi hanno bisogno di sapere cosa è successo "oggi", e derivarlo
 * ogni volta scandendo `reviews` è inutilmente costoso.
 */
export interface DayLog {
  day: string; // YYYY-MM-DD
  newItemsIntroduced: number;
  reviewsDone: number;
  /** true se la coda di review dovuta del giorno è stata svuotata: è lo streak. */
  queueCleared: boolean;
  /** true se la giornata è stata coperta da uno streak freeze. */
  frozen: boolean;
}

// ---------------------------------------------------------------------------
// Impostazioni
// ---------------------------------------------------------------------------

export interface Settings {
  dailyGoalMin: number;
  maxNewItemsPerDay: number;
  /** Range consentito 0,80–0,92. Non è mai hardcodato a 0,9. */
  desiredRetention: number;
  genderColorsEnabled: boolean;
  ttsSpeed: number;
  /**
   * Ora locale in cui inizia la giornata logica. 4 e non 0: chi studia all'una
   * di notte non deve perdere lo streak per un tecnicismo di calendario.
   */
  dayRolloverHour: number;
  /**
   * §3.2: i primi esercizi su una regola nuova in blocco invece che
   * interleaved. L'evidenza è mista, quindi sta dietro a un flag.
   */
  initialBlocking: boolean;
  /** Numero di lapse oltre il quale la card viene sospesa come leech. */
  leechLapseThreshold: number;
  /** Streak freeze rimasti nel mese corrente. */
  streakFreezesLeft: number;
}

export const RETENTION_MIN = 0.8;
export const RETENTION_MAX = 0.92;

export const DEFAULT_SETTINGS: Settings = {
  dailyGoalMin: 20,
  maxNewItemsPerDay: 6,
  desiredRetention: 0.88,
  genderColorsEnabled: true,
  ttsSpeed: 1,
  dayRolloverHour: 4,
  initialBlocking: false,
  leechLapseThreshold: 8,
  streakFreezesLeft: 2,
};

// ---------------------------------------------------------------------------
// Colori del genere (§5.1)
// ---------------------------------------------------------------------------

/**
 * Il colore non è mai l'unico canale: `GENDER_MARKS` fornisce il secondo canale
 * non cromatico richiesto per l'accessibilità ai daltonici.
 */
export const GENDER_COLORS: Record<Gender, string> = {
  der: '#2563EB',
  die: '#DC2626',
  das: '#16A34A',
};

export const GENDER_MARKS: Record<Gender, string> = {
  der: '▲',
  die: '●',
  das: '■',
};
