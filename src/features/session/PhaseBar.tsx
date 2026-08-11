import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PHASE_LABELS, PHASE_ORDER, type SessionStep, phasesPresent, progressWithinPhase } from '../../core/session/steps';
import { spacing, type } from '../../theme';
import { useColors } from '../ui/theme';

/**
 * Indicatore di avanzamento: una barra per fase, riempita in proporzione.
 * Mostra solo le fasi che esistono davvero in questa sessione — una barra
 * vuota per una fase che non verrà mai eseguita è una promessa non mantenuta.
 */
export function PhaseBar({
  steps,
  index,
  onExit,
}: {
  steps: SessionStep[];
  index: number;
  onExit: () => void;
}) {
  const colors = useColors();
  const present = phasesPresent(steps);
  const current = steps[index]?.phase;
  const within = progressWithinPhase(steps, index);

  return (
    <View style={styles.root}>
      <View style={styles.bars}>
        {present.map((phase) => {
          const isCurrent = phase === current;
          const isPast = PHASE_ORDER.indexOf(phase) < PHASE_ORDER.indexOf(current ?? 'recall');
          const fill = isPast ? 1 : isCurrent && within.total > 0 ? within.done / within.total : 0;
          return (
            <View key={phase} style={[styles.track, { backgroundColor: colors.border }]}>
              <View style={[styles.fill, { backgroundColor: colors.text, width: `${fill * 100}%` }]} />
            </View>
          );
        })}
      </View>

      <View style={styles.row}>
        <Text style={[type.label, { color: colors.textFaint }]}>
          {current ? PHASE_LABELS[current].toUpperCase() : ''}
          {within.total > 0 ? `  ${Math.min(within.done + 1, within.total)}/${within.total}` : ''}
        </Text>
        <Pressable accessibilityRole="button" onPress={onExit} hitSlop={12}>
          <Text style={[type.label, { color: colors.textFaint }]}>METTI IN PAUSA</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  bars: { flexDirection: 'row', gap: spacing.xs },
  track: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 3, borderRadius: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
