import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { STREAK_FREEZES_PER_MONTH } from '../core/progress/metrics';
import { RETENTION_MAX, RETENTION_MIN } from '../core/types';
import {
  cancelReinforcementNotification,
  hasNotificationPermission,
  requestNotificationPermission,
} from '../features/notifications/reinforcement';
import { exportDatabase, importDatabase } from '../db/backup';
import { getDatabase } from '../db/client';
import { resetOnboarding } from '../db/repo';
import { useSettingsStore } from '../state/settingsStore';
import { speakGerman } from '../features/audio/tts';
import { Button, Chip, Label, Surface } from '../features/ui/components';
import { useColors } from '../features/ui/theme';
import { GENDER_COLORS, GENDER_MARKS } from '../theme';
import { spacing, type } from '../theme';

const GOALS = [10, 15, 20, 30, 45];
const NEW_ITEMS = [3, 4, 6, 8, 12];
const RETENTIONS = [0.8, 0.85, 0.88, 0.9, 0.92];
const SPEEDS = [0.7, 0.85, 1];

export default function SettingsScreen() {
  const router = useRouter();
  const colors = useColors();
  const settings = useSettingsStore((state) => state.settings);
  const loaded = useSettingsStore((state) => state.loaded);
  const patch = useSettingsStore((state) => state.patch);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [notificationsOn, setNotificationsOn] = useState(false);

  useEffect(() => {
    void hasNotificationPermission().then(setNotificationsOn);
  }, []);

  async function onExport() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await exportDatabase();
      setMessage(
        result.shared
          ? 'Database esportato.'
          : `Condivisione non disponibile. Il file è in: ${result.uri}`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function onImport() {
    Alert.alert(
      'Importare un database?',
      'Il database attuale verrà sostituito. Ne viene salvata una copia prima di procedere, e l’app va riavviata dopo l’import.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Importa',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setMessage(null);
            try {
              const result = await importDatabase();
              setMessage(
                result.imported
                  ? 'Import completato. Chiudi e riapri l’app: la connessione aperta punta ancora ai dati precedenti.'
                  : 'Import annullato.',
              );
            } catch (e) {
              setMessage(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  if (!loaded) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
        <View style={styles.content}>
          <Text style={[type.body, { color: colors.textMuted }]}>Caricamento…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10}>
          <Text style={[type.label, { color: colors.textMuted }]}>← HOME</Text>
        </Pressable>

        <Text style={[type.display, { color: colors.text }]}>Impostazioni</Text>

        <Label>Obiettivo giornaliero</Label>
        <View style={styles.chips}>
          {GOALS.map((goal) => (
            <Chip
              key={goal}
              label={`${goal} min`}
              selected={settings.dailyGoalMin === goal}
              onPress={() => void patch({ dailyGoalMin: goal })}
            />
          ))}
        </View>

        <Label>Nuovi chunk al giorno</Label>
        <View style={styles.chips}>
          {NEW_ITEMS.map((count) => (
            <Chip
              key={count}
              label={String(count)}
              selected={settings.maxNewItemsPerDay === count}
              onPress={() => void patch({ maxNewItemsPerDay: count })}
            />
          ))}
        </View>
        <Text style={[type.mono, { color: colors.textFaint }]}>
          È un tetto, non una quota: se la coda di review cresce troppo, l’app lo dimezza o lo azzera da sola.
        </Text>

        <Label>Ritenzione desiderata</Label>
        <View style={styles.chips}>
          {RETENTIONS.map((value) => (
            <Chip
              key={value}
              label={`${Math.round(value * 100)}%`}
              selected={Math.abs(settings.desiredRetention - value) < 0.001}
              onPress={() => void patch({ desiredRetention: value })}
            />
          ))}
        </View>
        <Text style={[type.mono, { color: colors.textFaint }]}>
          Quanto spesso vuoi azzeccare un richiamo. Alzarla significa ripassare più spesso, non ricordare meglio: sopra
          il {Math.round(RETENTION_MAX * 100)}% il costo cresce molto più del beneficio, sotto l’
          {Math.round(RETENTION_MIN * 100)}% si perde troppo.
        </Text>

        <Label>Colore del genere</Label>
        <Surface>
          <View style={styles.switchRow}>
            <Text style={[type.body, { color: colors.text }]}>Colora i sostantivi</Text>
            <Switch
              value={settings.genderColorsEnabled}
              onValueChange={(value) => void patch({ genderColorsEnabled: value })}
            />
          </View>
          <View style={styles.genderRow}>
            {(['der', 'die', 'das'] as const).map((gender) => (
              <Text key={gender} style={[type.body, { color: GENDER_COLORS[gender] }]}>
                {GENDER_MARKS[gender]} {gender}
              </Text>
            ))}
          </View>
          <Text style={[type.mono, { color: colors.textFaint }]}>
            Il simbolo resta anche col colore spento: serve a chi non distingue rosso e verde.
          </Text>
        </Surface>

        <Label>Velocità della voce</Label>
        <View style={styles.chips}>
          {SPEEDS.map((speed) => (
            <Chip
              key={speed}
              label={`${speed}×`}
              selected={Math.abs(settings.ttsSpeed - speed) < 0.001}
              onPress={() => {
                void patch({ ttsSpeed: speed });
                speakGerman('Ich hätte gern einen Kaffee.', { rate: speed });
              }}
            />
          ))}
        </View>

        <Label>Ripasso lampo</Label>
        <Surface>
          <Text style={[type.body, { color: colors.textMuted }]}>
            Ogni chunk nuovo torna una seconda volta dopo un’ora e mezza. È lo spacing che lo fissa, ed è il momento
            in cui l’app non è aperta: senza promemoria resta una riga nel database che nessuno vede.
          </Text>
          <View style={styles.switchRow}>
            <Text style={[type.body, { color: colors.text }]}>Promemoria</Text>
            <Switch
              value={notificationsOn}
              onValueChange={async (value) => {
                if (!value) {
                  await cancelReinforcementNotification();
                  setNotificationsOn(false);
                  return;
                }
                setNotificationsOn(await requestNotificationPermission());
              }}
            />
          </View>
          <Text style={[type.mono, { color: colors.textFaint }]}>
            Una notifica sola, all’ora del ripasso. Nessun promemoria serale e nessun messaggio che ti fa sentire in
            colpa: sono il motivo per cui la gente disattiva tutto e poi non torna.
          </Text>
        </Surface>

        <Label>Giornata</Label>
        <Surface>
          <Text style={[type.body, { color: colors.textMuted }]}>
            La giornata inizia alle {settings.dayRolloverHour}:00. Studiare all’una di notte conta per il giorno
            precedente, così non si perde lo streak per un tecnicismo di calendario.
          </Text>
          <Text style={[type.mono, { color: colors.textFaint }]}>
            Streak freeze rimasti questo mese: {settings.streakFreezesLeft} su {STREAK_FREEZES_PER_MONTH}. Si
            consumano da soli quando salti un giorno, e solo se c’era una catena da proteggere.
          </Text>
        </Surface>

        <Label>Dati</Label>
        <Surface>
          <Text style={[type.body, { color: colors.textMuted }]}>
            Tutto è sul dispositivo: non c’è account né sincronizzazione. L’export è l’unico modo di non perdere i
            progressi cambiando telefono.
          </Text>
          <Button label="Esporta il database" variant="ghost" onPress={() => void onExport()} disabled={busy} />
          <Button label="Importa un database" variant="ghost" onPress={onImport} disabled={busy} />
          {message ? <Text style={[type.mono, { color: colors.textMuted }]}>{message}</Text> : null}
        </Surface>

        <Label>Livello</Label>
        <Surface>
          <Text style={[type.body, { color: colors.textMuted }]}>
            Punto di partenza stimato: {settings.level}. Limita quali item possono essere introdotti.
          </Text>
          <Button
            label="Rifai il test di livello"
            variant="ghost"
            onPress={async () => {
              const db = await getDatabase();
              await resetOnboarding(db);
              router.replace('/onboarding');
            }}
          />
        </Surface>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  genderRow: { flexDirection: 'row', gap: spacing.md },
});
