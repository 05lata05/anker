import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Label, Surface } from '../features/ui/components';
import { useColors } from '../features/ui/theme';
import { getDatabase } from '../db/client';
import { ANCHOR_STABILITY_DAYS, countAnchors, countDueNow, findOpenSession, getSettings } from '../db/repo';
import { spacing, type } from '../theme';

/**
 * Home minima della Fase C: serve ad avviare e riprendere una sessione.
 * Streak, copertura per frequenza e metriche complete arrivano in Fase D.
 */
export default function HomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const [state, setState] = useState<{ due: number; anchors: number; resumable: boolean } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const db = await getDatabase();
        const now = Date.now();
        const settings = await getSettings(db);
        const [due, anchors, open] = await Promise.all([
          countDueNow(db, now),
          countAnchors(db),
          findOpenSession(db, now, settings.dayRolloverHour),
        ]);
        if (!cancelled) setState({ due, anchors, resumable: open !== null });
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.content}>
        <View style={styles.hero}>
          <Label>ANCORAGGI</Label>
          <Text style={[type.display, { color: colors.text }]}>{state?.anchors ?? '—'}</Text>
          <Text style={[type.body, { color: colors.textFaint }]}>
            item che reggono più di {ANCHOR_STABILITY_DAYS} giorni
          </Text>
        </View>

        <Surface>
          <View style={styles.row}>
            <Text style={[type.body, { color: colors.textMuted }]}>Da richiamare oggi</Text>
            <Text style={[type.title, { color: colors.text }]}>{state?.due ?? '—'}</Text>
          </View>
        </Surface>

        <View style={styles.spacer} />

        <Button
          label={state?.resumable ? 'Riprendi la sessione' : 'Inizia sessione'}
          onPress={() => router.push('/session')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, padding: spacing.lg, gap: spacing.lg },
  hero: { gap: spacing.xs, paddingTop: spacing.xxl },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  spacer: { flex: 1 },
});
