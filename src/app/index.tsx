import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { computeStreak, estimateCefr, findDelayedSuccesses } from '../core/progress/metrics';
import type { Item } from '../core/types';
import { getDatabase } from '../db/client';
import {
  ANCHOR_STABILITY_DAYS,
  countAnchors,
  countDueNow,
  findOpenSession,
  getAllCards,
  getDayLogs,
  getItem,
  getRecentReviews,
  getSettings,
  isOnboardingDone,
} from '../db/repo';
import { Button, Surface } from '../features/ui/components';
import { Row } from '../features/ui/Stat';
import { useColors } from '../features/ui/theme';
import { spacing, type } from '../theme';

interface HomeState {
  due: number;
  anchors: number;
  streak: number;
  todayDone: boolean;
  level: string;
  resumable: boolean;
  delayed: { item: Item; gapDays: number } | null;
}

/**
 * Home (§7.2).
 *
 * Un solo numero grande — gli Ancoraggi — e un solo bottone. Tutto ciò che
 * potrebbe diventare una metrica da inseguire (minuti, esercizi, percentuali di
 * sessione) sta fuori di proposito: quello che si mette in home è quello che
 * l'utente ottimizzerà.
 */
export default function HomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const [state, setState] = useState<HomeState | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const db = await getDatabase();

        if (!(await isOnboardingDone(db))) {
          router.replace('/onboarding');
          return;
        }

        const now = Date.now();
        const settings = await getSettings(db);
        const [due, anchors, open, dayLogs, cards, reviews] = await Promise.all([
          countDueNow(db, now),
          countAnchors(db),
          findOpenSession(db, now, settings.dayRolloverHour),
          getDayLogs(db),
          getAllCards(db),
          getRecentReviews(db),
        ]);

        const streak = computeStreak(dayLogs, now, settings.dayRolloverHour);
        const successes = findDelayedSuccesses(reviews, new Map(cards.map((card) => [card.id, card])));

        let delayed: HomeState['delayed'] = null;
        if (successes.length > 0) {
          const item = await getItem(db, successes[0].itemId);
          if (item) delayed = { item, gapDays: successes[0].gapDays };
        }

        if (!cancelled) {
          setState({
            due,
            anchors,
            streak: streak.current,
            todayDone: streak.todayDone,
            level: estimateCefr(anchors),
            resumable: open !== null,
            delayed,
          });
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [router]),
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[type.label, { color: colors.textFaint }]}>ANKER</Text>
          <View style={styles.headerLinks}>
            <Pressable accessibilityRole="button" onPress={() => router.push('/progress')} hitSlop={10}>
              <Text style={[type.label, { color: colors.textMuted }]}>PROGRESSI</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/settings')} hitSlop={10}>
              <Text style={[type.label, { color: colors.textMuted }]}>IMPOSTAZIONI</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.hero}>
          <Text style={[type.label, { color: colors.textFaint }]}>ANCORAGGI</Text>
          <Text style={[type.display, styles.big, { color: colors.text }]}>{state?.anchors ?? '—'}</Text>
          <Text style={[type.body, { color: colors.textFaint }]}>
            item che reggono più di {ANCHOR_STABILITY_DAYS} giorni
          </Text>
        </View>

        <Surface>
          <Row label="Da richiamare oggi" value={String(state?.due ?? '—')} />
          <Row
            label="Giorni di fila"
            value={state ? `${state.streak}${state.todayDone ? '' : ' · oggi da fare'}` : '—'}
          />
          <Row label="Livello stimato" value={state?.level ?? '—'} />
        </Surface>

        {state?.delayed ? (
          <Surface>
            <Text style={[type.label, { color: colors.textFaint }]}>TE LO RICORDAVI ANCORA</Text>
            <Text style={[type.body, { color: colors.text }]}>
              {state.delayed.item.de} — dopo {state.delayed.gapDays} giorni.
            </Text>
          </Surface>
        ) : null}

        <View style={styles.spacer} />

        <Button
          label={state?.resumable ? 'Riprendi la sessione' : 'Inizia sessione'}
          onPress={() => router.push('/session')}
        />

        {state && state.due === 0 && !state.resumable ? (
          <Text style={[type.body, styles.centered, { color: colors.textFaint }]}>
            Niente in scadenza. Una sessione ora introdurrà solo chunk nuovi.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, padding: spacing.lg, gap: spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLinks: { flexDirection: 'row', gap: spacing.md },
  hero: { gap: spacing.xs, paddingTop: spacing.xl },
  big: { fontSize: 64, lineHeight: 68 },
  spacer: { flex: 1, minHeight: spacing.xl },
  centered: { textAlign: 'center' },
});
