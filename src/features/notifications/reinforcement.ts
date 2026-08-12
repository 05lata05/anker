/**
 * Notifica locale per la seconda esposizione intra-giornaliera (§3.1).
 *
 * Una sola notifica, all'ora del primo rinforzo in scadenza, e nient'altro.
 * Niente promemoria serali, niente «ti manca poco al traguardo», niente
 * messaggi che fanno leva sul senso di colpa: la specifica li esclude, e sono
 * anche il motivo per cui la gente disattiva le notifiche e poi non torna.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL_ID = 'anker-reinforcement';

/** Identificatore fisso: riprogrammare sostituisce, non accumula. */
const IDENTIFIER = 'anker-same-day-reinforcement';

let configured = false;

async function configure(): Promise<void> {
  if (configured) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Ripasso lampo',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
      vibrationPattern: [0, 120],
    });
  }

  configured = true;
}

export async function hasNotificationPermission(): Promise<boolean> {
  try {
    const { granted } = await Notifications.getPermissionsAsync();
    return granted;
  } catch {
    return false;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    await configure();
    const { granted } = await Notifications.requestPermissionsAsync();
    return granted;
  } catch {
    return false;
  }
}

/**
 * Programma (o riprogramma) la notifica del ripasso lampo.
 *
 * Restituisce false quando non è stato possibile: permesso negato, piattaforma
 * che non le supporta, o istante già passato. Il chiamante non deve trattare il
 * fallimento come un errore — il ripasso resta comunque visibile in home, la
 * notifica è solo un promemoria.
 */
export async function scheduleReinforcementNotification(at: number, itemCount: number): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const seconds = Math.round((at - Date.now()) / 1000);
  if (seconds <= 0) return false;

  try {
    await configure();
    if (!(await hasNotificationPermission())) return false;

    await Notifications.cancelScheduledNotificationAsync(IDENTIFIER).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: IDENTIFIER,
      content: {
        title: 'Ripasso lampo',
        body:
          itemCount === 1
            ? 'Un chunk di stamattina è pronto per il secondo richiamo.'
            : `${itemCount} chunk sono pronti per il secondo richiamo.`,
        data: { route: '/reinforcement' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        channelId: CHANNEL_ID,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelReinforcementNotification(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(IDENTIFIER);
  } catch {
    // Niente da fare: non c'era nulla da cancellare.
  }
}
