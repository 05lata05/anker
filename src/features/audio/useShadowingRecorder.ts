/**
 * Registrazione per lo shadowing.
 *
 * Raccoglie i livelli del microfono mentre l'utente parla: è l'unico inviluppo
 * di ampiezza che l'app può davvero misurare (vedi `core/audio/envelope.ts`
 * per il perché quello della voce di riferimento non è ottenibile).
 */
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EnvelopeSample } from '../../core/audio/envelope';

export const SAMPLE_INTERVAL_MS = 60;

export type RecorderState = 'idle' | 'denied' | 'recording' | 'recorded';

export interface ShadowingRecording {
  uri: string;
  durationMs: number;
  samples: EnvelopeSample[];
  /** false quando la piattaforma non espone il livello del microfono. */
  hasMetering: boolean;
}

export function useShadowingRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const [recording, setRecording] = useState<ShadowingRecording | null>(null);
  const [error, setError] = useState<string | null>(null);

  const samplesRef = useRef<EnvelopeSample[]>([]);
  const startedAtRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const recorder = useAudioRecorder({ ...RecordingPresets.LOW_QUALITY, isMeteringEnabled: true });

  // Il livello del microfono sta su `getStatus()`, non sull'evento di stato
  // della registrazione: va campionato a intervalli. 60 ms danno una risoluzione
  // sufficiente a distinguere le sillabe senza far lavorare il thread JS.
  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(() => {
      const status = recorder.getStatus();
      if (typeof status.metering === 'number') {
        samplesRef.current.push({ t: Date.now() - startedAtRef.current, db: status.metering });
      }
    }, SAMPLE_INTERVAL_MS);
  }, [recorder, stopPolling]);

  const player = useAudioPlayer(recording?.uri ?? null);

  const start = useCallback(async () => {
    setError(null);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setState('denied');
        return;
      }

      // Su iOS senza `allowsRecording` la sessione audio resta in sola
      // riproduzione e la registrazione parte muta.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

      samplesRef.current = [];
      startedAtRef.current = Date.now();
      setRecording(null);
      await recorder.prepareToRecordAsync();
      recorder.record();
      startPolling();
      setState('recording');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState('idle');
    }
  }, [recorder, startPolling]);

  const stop = useCallback(async () => {
    stopPolling();
    try {
      await recorder.stop();
      const durationMs = Date.now() - startedAtRef.current;
      const samples = samplesRef.current;

      if (recorder.uri) {
        setRecording({ uri: recorder.uri, durationMs, samples, hasMetering: samples.length > 2 });
        setState('recorded');
      } else {
        setState('idle');
        setError('La registrazione non ha prodotto nulla.');
      }

      // Ripristina la sessione in riproduzione: su iOS lasciarla in modalità
      // registrazione abbassa il volume di tutto il resto.
      await setAudioModeAsync({ allowsRecording: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState('idle');
    }
  }, [recorder, stopPolling]);

  // Se il componente sparisce mentre si registra, il polling deve morire con lui.
  useEffect(() => stopPolling, [stopPolling]);

  const playBack = useCallback(() => {
    if (!recording) return;
    player.seekTo(0);
    player.play();
  }, [player, recording]);

  const reset = useCallback(() => {
    setRecording(null);
    setState('idle');
    setError(null);
  }, []);

  return { state, recording, error, start, stop, playBack, reset };
}
