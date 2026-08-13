import { goBackOrHome } from '../features/ui/navigation';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TAG_LABELS } from '../core/german/tags';
import { type TagHeat, tagHeatmap } from '../core/profile/errorProfile';
import {
  ANCHOR_STABILITY_DAYS,
  FREQUENCY_TARGET,
  computeStreak,
  countAnchors,
  estimateCefr,
  frequencyCoverage,
} from '../core/progress/metrics';
import type { Item } from '../core/types';
import { getDatabase } from '../db/client';
import { getDayLogs, getKnownItems, listStudiedItems, loadEngineState } from '../db/repo';
import { GermanText, Label, Surface } from '../features/ui/components';
import { Meter, Row } from '../features/ui/Stat';
import { useColors } from '../features/ui/theme';
import { radius, spacing, type } from '../theme';

interface ProgressState {
  anchors: number;
  studied: { item: Item; stability: number }[];
  coverage: ReturnType<typeof frequencyCoverage>;
  heat: TagHeat[];
  streak: ReturnType<typeof computeStreak>;
  level: string;
}

/**
 * Progressi (§7.5). Alta densità informativa, colore quasi assente:
 * l'unico uso forte è la mappa di calore, dove il colore È il dato.
 */
export default function ProgressScreen() {
  const router = useRouter();
  const colors = useColors();
  const [state, setState] = useState<ProgressState | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const db = await getDatabase();
        const now = Date.now();
        const engine = await loadEngineState(db, now);
        const [studied, known, dayLogs] = await Promise.all([
          listStudiedItems(db),
          getKnownItems(db, now),
          getDayLogs(db),
        ]);

        if (cancelled) return;
        const anchors = countAnchors(engine.cards);
        setState({
          anchors,
          studied,
          coverage: frequencyCoverage(known),
          heat: tagHeatmap(engine.errorProfile),
          streak: computeStreak(dayLogs, now, engine.settings.dayRolloverHour),
          level: estimateCefr(anchors),
        });
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="button" onPress={() => goBackOrHome(router)} hitSlop={10}>
          <Text style={[type.label, { color: colors.textMuted }]}>← HOME</Text>
        </Pressable>

        <Text style={[type.display, { color: colors.text }]}>Progressi</Text>

        <Surface>
          <Row label={`Ancoraggi (oltre ${ANCHOR_STABILITY_DAYS} giorni)`} value={String(state?.anchors ?? '—')} />
          <Row label="Item in circolo" value={String(state?.studied.length ?? '—')} />
          <Row label="Giorni di fila" value={String(state?.streak.current ?? '—')} />
          <Row label="Catena più lunga" value={String(state?.streak.longest ?? '—')} />
          <Row label="Livello stimato" value={state?.level ?? '—'} />
          <Text style={[type.mono, { color: colors.textFaint }]}>
            Il livello è una stima dagli ancoraggi: il CEFR misura anche produzione e interazione che l’app non
            osserva.
          </Text>
        </Surface>

        <Label>Copertura delle prime {FREQUENCY_TARGET} parole</Label>
        <Surface>
          <Row
            label="Item noti nella fascia"
            value={state ? `${state.coverage.known} / ${state.coverage.target}` : '—'}
          />
          <Meter fraction={state?.coverage.fraction ?? 0} />
          <Text style={[type.mono, { color: colors.textFaint }]}>
            Le prime {FREQUENCY_TARGET} parole coprono circa l’80% di un testo corrente. Il conteggio è per item, non
            per parola-tipo: sottostima la copertura reale.
          </Text>
        </Surface>

        <Label>Dove sei debole</Label>
        <Surface>
          {state && state.heat.some((entry) => entry.exposures > 0) ? (
            state.heat
              .filter((entry) => entry.exposures > 0)
              .slice(0, 10)
              .map((entry) => (
                <View key={entry.tag} style={styles.heatRow}>
                  <View style={styles.heatLabel}>
                    <Text style={[type.body, { color: colors.text }]}>{TAG_LABELS[entry.tag]}</Text>
                    <Text style={[type.mono, { color: colors.textFaint }]}>
                      {Math.round(entry.emaErrorRate * 100)}% su {entry.exposures} esposizioni
                    </Text>
                  </View>
                  <View style={styles.heatMeter}>
                    <Meter
                      fraction={entry.emaErrorRate}
                      tone={entry.emaErrorRate > 0.3 ? colors.danger : colors.textMuted}
                    />
                  </View>
                </View>
              ))
          ) : (
            <Text style={[type.body, { color: colors.textMuted }]}>
              Ancora nessun dato: la mappa si riempie man mano che rispondi.
            </Text>
          )}
          <Text style={[type.mono, { color: colors.textFaint }]}>
            Sopra il 30% con almeno 8 esposizioni l’app inserisce un micro-drill nella sessione successiva.
          </Text>
        </Surface>

        <Label>Item in circolo</Label>
        <View style={styles.list}>
          {(state?.studied ?? []).slice(0, 60).map(({ item, stability }) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
              style={({ pressed }) => [
                styles.itemRow,
                { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <View style={styles.itemMain}>
                <GermanText text={item.de} gender={item.gender} size="body" />
                <Text style={[type.mono, { color: colors.textFaint }]}>{item.it}</Text>
              </View>
              <Text style={[type.mono, { color: stability >= ANCHOR_STABILITY_DAYS ? colors.success : colors.textMuted }]}>
                {stability < 1 ? '<1g' : `${Math.round(stability)}g`}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  heatRow: { gap: spacing.xs },
  heatLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  heatMeter: { paddingBottom: spacing.xs },
  list: { gap: spacing.sm },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  itemMain: { flex: 1, gap: 2 },
});
