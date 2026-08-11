/**
 * Sintesi vocale tedesca.
 *
 * Nota di onestà: questo è il FALLBACK previsto dalla specifica, non l'audio
 * nativo. Un TTS di sistema non ha la prosodia di un parlante reale, e la Fase 4
 * (shadowing) su una voce sintetica insegna un modello prosodico approssimato.
 * Finché i contenuti non porteranno registrazioni vere, l'app lo dichiara invece
 * di far finta che sia lo stesso.
 */
import * as Speech from 'expo-speech';

export const GERMAN_LOCALE = 'de-DE';

export interface SpeakOptions {
  rate?: number;
  onDone?: () => void;
}

export function speakGerman(text: string, options: SpeakOptions = {}): void {
  Speech.stop();
  Speech.speak(text, {
    language: GERMAN_LOCALE,
    rate: options.rate ?? 1,
    onDone: options.onDone,
    onStopped: options.onDone,
    onError: options.onDone,
  });
}

/**
 * Tempo oltre il quale si smette di aspettare la sintesi.
 *
 * Serve perché `onDone` non è garantito: se sul dispositivo manca la voce
 * tedesca, o il motore di sintesi la rifiuta, la callback non arriva mai e
 * senza questo limite la schermata resta in attesa per sempre. Stimato sulla
 * lunghezza del testo, con abbondanza.
 */
function speechTimeout(text: string, rate: number): number {
  return Math.min(20_000, Math.max(3_000, (text.length * 140) / Math.max(0.4, rate)));
}

export interface TimedSpeech {
  /** Durata misurata. Ha senso solo se `completed` è true. */
  elapsedMs: number;
  /** false se la sintesi non ha mai segnalato la fine: niente da misurare. */
  completed: boolean;
}

/**
 * Pronuncia e misura quanto ci mette.
 *
 * È l'unico dato temporale ricavabile dalla voce di riferimento: la sintesi
 * suona attraverso l'altoparlante e non passa da un buffer leggibile, quindi
 * un contorno prosodico non è ottenibile, ma la durata sì. Basta a dire
 * all'utente se sta andando più lento o più veloce del modello.
 *
 * Quando la sintesi non risponde, restituisce `completed: false` invece di una
 * durata stimata: un riferimento inventato produrrebbe un confronto del ritmo
 * che sembra una misura e non lo è.
 */
export function speakGermanTimed(text: string, options: SpeakOptions = {}): Promise<TimedSpeech> {
  const rate = options.rate ?? 1;

  return new Promise((resolve) => {
    const startedAt = Date.now();
    let settled = false;

    const finish = (completed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.onDone?.();
      resolve({ elapsedMs: Date.now() - startedAt, completed });
    };

    const timer = setTimeout(() => finish(false), speechTimeout(text, rate));

    Speech.stop();
    Speech.speak(text, {
      language: GERMAN_LOCALE,
      rate,
      onDone: () => finish(true),
      onStopped: () => finish(false),
      onError: () => finish(false),
    });
  });
}

export function stopSpeaking(): void {
  Speech.stop();
}

export async function hasGermanVoice(): Promise<boolean> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    return voices.some((voice) => voice.language?.toLowerCase().startsWith('de'));
  } catch {
    return false;
  }
}
