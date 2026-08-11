/**
 * Analisi dell'inviluppo di ampiezza per lo shadowing (§4, Fase 4).
 *
 * Cosa si può misurare davvero, e cosa no.
 *
 * Della VOCE DELL'UTENTE si può avere l'inviluppo: durante la registrazione
 * expo-audio espone il livello in dBFS a intervalli regolari, e da quelli si
 * ricava dove parla, dove si ferma e quanto ci mette.
 *
 * Della voce di RIFERIMENTO no. Il riferimento è sintesi vocale di sistema:
 * suona attraverso l'altoparlante, non passa da un buffer che l'app possa
 * leggere, e non esiste un file da cui pre-calcolare un inviluppo. Un confronto
 * del contorno prosodico punto per punto richiederebbe registrazioni di
 * parlanti reali, che i contenuti non hanno ancora.
 *
 * Quindi il confronto qui è di TEMPO, non di contorno: durata complessiva,
 * ritmo in sillabe al secondo, e quante pause fa l'utente. Sono misure vere e
 * utili — un italofono che legge il tedesco tende a rallentare e a spezzare i
 * composti — e questo modulo non finge di offrire più di così.
 */

/** dBFS restituito quando il microfono non capta nulla. */
export const SILENCE_DB = -60;

/** Sopra questo livello normalizzato si considera che l'utente stia parlando. */
export const SPEECH_THRESHOLD = 0.18;

/**
 * Converte un livello in dBFS (tipicamente da −160 a 0) in 0-1.
 * La scala è logaritmica: normalizzare linearmente sui dB dà una curva più
 * leggibile della potenza grezza, dove le sillabe deboli sparirebbero.
 */
export function levelFromDb(db: number): number {
  if (!Number.isFinite(db)) return 0;
  const clamped = Math.max(SILENCE_DB, Math.min(0, db));
  return (clamped - SILENCE_DB) / -SILENCE_DB;
}

export interface EnvelopeSample {
  /** Millisecondi dall'inizio della registrazione. */
  t: number;
  db: number;
}

/**
 * Riduce i campioni a un numero fisso di barre, prendendo il massimo di ogni
 * intervallo. Il massimo e non la media: una sillaba breve dentro un intervallo
 * lungo deve restare visibile, altrimenti l'inviluppo appiattisce proprio ciò
 * che si vuole guardare.
 */
export function buildEnvelope(samples: readonly EnvelopeSample[], buckets = 48): number[] {
  if (samples.length === 0) return [];

  const duration = samples[samples.length - 1].t - samples[0].t;
  if (duration <= 0) return [levelFromDb(samples[0].db)];

  const start = samples[0].t;
  const out = new Array<number>(buckets).fill(0);

  for (const sample of samples) {
    const index = Math.min(buckets - 1, Math.floor(((sample.t - start) / duration) * buckets));
    out[index] = Math.max(out[index], levelFromDb(sample.db));
  }

  return out;
}

export interface SpeechSpan {
  /** Indice della prima barra sopra soglia, `-1` se non c'è parlato. */
  from: number;
  to: number;
  /** Durata del parlato al netto del silenzio iniziale e finale, in ms. */
  durationMs: number;
  /** Pause interne più lunghe di `minPauseMs`. */
  pauses: number;
}

/**
 * Ritaglia il silenzio agli estremi e conta le pause interne.
 * Serve perché tra il tocco su «registra» e la prima sillaba passa quasi sempre
 * mezzo secondo, e conteggiarlo come lentezza sarebbe una misura sbagliata.
 */
export function speechSpan(
  envelope: readonly number[],
  totalDurationMs: number,
  options: { threshold?: number; minPauseMs?: number } = {},
): SpeechSpan {
  const threshold = options.threshold ?? SPEECH_THRESHOLD;
  const minPauseMs = options.minPauseMs ?? 250;

  const first = envelope.findIndex((level) => level >= threshold);
  if (first === -1) return { from: -1, to: -1, durationMs: 0, pauses: 0 };

  let last = first;
  for (let i = envelope.length - 1; i >= first; i--) {
    if (envelope[i] >= threshold) {
      last = i;
      break;
    }
  }

  const msPerBucket = totalDurationMs / envelope.length;
  const minPauseBuckets = Math.max(1, Math.round(minPauseMs / msPerBucket));

  let pauses = 0;
  let run = 0;
  for (let i = first; i <= last; i++) {
    if (envelope[i] < threshold) {
      run += 1;
      continue;
    }
    if (run >= minPauseBuckets) pauses += 1;
    run = 0;
  }

  return { from: first, to: last, durationMs: (last - first + 1) * msPerBucket, pauses };
}

// ---------------------------------------------------------------------------
// Ritmo
// ---------------------------------------------------------------------------

const VOWEL_GROUPS = /[aeiouyäöü]+/gi;

/**
 * Conteggio approssimato delle sillabe di una frase tedesca.
 *
 * Conta i gruppi vocalici, che in tedesco approssimano bene le sillabe perché
 * l'ortografia è quasi fonemica. Sottostima i dittonghi separati (`Familie` ha
 * quattro sillabe, non tre) e sovrastima le `-e` finali mute, che però in
 * tedesco quasi non esistono. Basta per un ritmo indicativo, non per una
 * trascrizione fonetica.
 */
export function countSyllables(text: string): number {
  const matches = text.replace(/[^\p{L}\s]/gu, ' ').match(VOWEL_GROUPS);
  return matches ? matches.length : 0;
}

export type TimingVerdict = 'slower' | 'aligned' | 'faster' | 'unknown';

export interface TimingComparison {
  verdict: TimingVerdict;
  /** Rapporto tra la durata dell'utente e quella del riferimento. */
  ratio: number;
  userSyllablesPerSecond: number;
  referenceSyllablesPerSecond: number;
  message: string;
}

/** Oltre questo scarto relativo il ritmo si considera diverso. */
export const TIMING_TOLERANCE = 0.2;

export function compareTiming(params: {
  text: string;
  referenceMs: number;
  userSpeechMs: number;
  pauses: number;
}): TimingComparison {
  const syllables = countSyllables(params.text);

  if (params.referenceMs <= 0 || params.userSpeechMs <= 0 || syllables === 0) {
    return {
      verdict: 'unknown',
      ratio: 0,
      userSyllablesPerSecond: 0,
      referenceSyllablesPerSecond: 0,
      message: 'Non ho abbastanza segnale per confrontare il ritmo.',
    };
  }

  const ratio = params.userSpeechMs / params.referenceMs;
  const userRate = syllables / (params.userSpeechMs / 1000);
  const referenceRate = syllables / (params.referenceMs / 1000);

  let verdict: TimingVerdict = 'aligned';
  if (ratio > 1 + TIMING_TOLERANCE) verdict = 'slower';
  else if (ratio < 1 - TIMING_TOLERANCE) verdict = 'faster';

  const pauseNote =
    params.pauses > 0
      ? ` Hai fatto ${params.pauses} paus${params.pauses > 1 ? 'e' : 'a'} in mezzo: nello shadowing la frase va tenuta intera.`
      : '';

  const message =
    verdict === 'slower'
      ? `Sei andato più lento del riferimento (${ratio.toFixed(1)}× il tempo).${pauseNote}`
      : verdict === 'faster'
        ? `Sei andato più veloce del riferimento (${ratio.toFixed(1)}× il tempo). Controlla di non star mangiando le sillabe.${pauseNote}`
        : `Ritmo allineato al riferimento.${pauseNote}`;

  return { verdict, ratio, userSyllablesPerSecond: userRate, referenceSyllablesPerSecond: referenceRate, message };
}

/** I due passaggi previsti dalla specifica: prima rallentato, poi a velocità piena. */
export const SHADOWING_RATES: readonly number[] = [0.8, 1];
