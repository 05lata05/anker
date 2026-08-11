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
