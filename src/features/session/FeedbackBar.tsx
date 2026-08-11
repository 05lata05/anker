import { StyleSheet, Text, View } from 'react-native';
import type { Feedback } from '../../core/session/feedback';
import { radius, spacing, type } from '../../theme';
import { Button } from '../ui/components';
import { useColors } from '../ui/theme';

/**
 * Feedback immediato (§4).
 *
 * Non celebra: dice cosa era giusto e, quando l'errore ricade su una regola,
 * la nomina in una riga. Il pulsante è sempre nello stesso punto perché la
 * sessione deve poter andare avanti senza guardare dove si preme.
 */
export function FeedbackBar({ feedback, onContinue }: { feedback: Feedback; onContinue: () => void }) {
  const colors = useColors();
  const accent = feedback.correct ? colors.success : colors.danger;

  return (
    <View style={[styles.root, { backgroundColor: colors.surface, borderColor: accent }]}>
      <Text style={[type.label, { color: accent }]}>{feedback.title.toUpperCase()}</Text>

      {feedback.correction ? (
        <Text style={[type.german, { color: colors.text }]} selectable>
          {feedback.correction}
        </Text>
      ) : null}

      {feedback.explanation ? (
        <Text style={[type.body, { color: colors.textMuted }]}>{feedback.explanation}</Text>
      ) : null}

      <Button label="Continua" onPress={onContinue} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
});
