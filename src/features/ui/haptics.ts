/**
 * Feedback tattile sulle risposte.
 *
 * Serve a una cosa sola: chiudere il ciclo risposta-esito senza costringere a
 * guardare lo schermo. Deliberatamente sobrio — una vibrazione di successo
 * carica ogni risposta giusta di una piccola ricompensa, ed è esattamente il
 * meccanismo che la specifica esclude quando dice di non premiare la
 * performance facile immediata.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export function tapFeedback(correct: boolean): void {
  if (Platform.OS === 'web') return;
  void Haptics.notificationAsync(
    correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
  ).catch(() => {
    // Su alcuni dispositivi il motore aptico non c'è: non è un errore.
  });
}

export function selectionFeedback(): void {
  if (Platform.OS === 'web') return;
  void Haptics.selectionAsync().catch(() => {});
}
