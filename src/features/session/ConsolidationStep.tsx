import { StyleSheet, Text, View } from 'react-native';
import type { SessionPlan } from '../../core/session/plan';
import type { SessionStats } from '../../state/sessionStore';
import { spacing, type } from '../../theme';
import { Button, GermanText, Label, Surface } from '../ui/components';
import { useColors } from '../ui/theme';

/**
 * Fase 5 — consolidamento.
 *
 * Non celebra l'accuratezza: un 100% significa che il materiale era troppo
 * facile, e l'app non deve premiarlo. Mostra cosa è entrato, quando torna, e
 * quanto lavoro resta — informazione, non applausi.
 */
export function ConsolidationStep({
  plan,
  stats,
  onDone,
}: {
  plan: SessionPlan;
  stats: SessionStats;
  onDone: () => void;
}) {
  const colors = useColors();
  const accuracy = stats.answered === 0 ? null : Math.round((stats.correct / stats.answered) * 100);
  const reinforcementCount = plan.newItems.items.length;

  return (
    <View style={styles.root}>
      <Label>Consolidamento</Label>

      <Surface>
        <Row label="Richiami fatti" value={String(stats.reviewsDone)} />
        <Row label="Chunk nuovi" value={String(stats.newItems)} />
        <Row label="Accuratezza" value={accuracy === null ? '—' : `${accuracy}%`} />
        {plan.recall.deferred > 0 ? (
          <Row label="Card rimandate a domani" value={String(plan.recall.deferred)} />
        ) : null}
      </Surface>

      {accuracy !== null && accuracy > 95 ? (
        <Text style={[type.body, { color: colors.textFaint }]}>
          Accuratezza molto alta: di solito significa che il materiale è troppo facile. La zona utile sta intorno
          all’85-90%.
        </Text>
      ) : null}

      {reinforcementCount > 0 ? (
        <>
          <Label>Tornano tra un’ora e mezza</Label>
          <Surface>
            {plan.newItems.items.map((item) => (
              <View key={item.id} style={styles.item}>
                <GermanText text={item.de} gender={item.gender} size="body" />
                <Text style={[type.body, { color: colors.textMuted }]}>{item.it}</Text>
              </View>
            ))}
          </Surface>
        </>
      ) : null}

      <Button label="Chiudi la sessione" onPress={onDone} />
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <Text style={[type.body, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[type.body, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  item: { gap: 2 },
});
