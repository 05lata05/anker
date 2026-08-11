import { StyleSheet, Text, View } from 'react-native';
import { spacing, type } from '../../theme';
import { useColors } from './theme';

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const colors = useColors();
  return (
    <View style={styles.stat}>
      <Text style={[type.label, { color: colors.textFaint }]}>{label.toUpperCase()}</Text>
      <Text style={[type.title, { color: colors.text }]}>{value}</Text>
      {hint ? <Text style={[type.mono, { color: colors.textFaint }]}>{hint}</Text> : null}
    </View>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <Text style={[type.body, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[type.body, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

/**
 * Barra di riempimento. Il secondo canale è il numero accanto: una barra da
 * sola non dice quanto vale, e in questa app le proporzioni contano più
 * dell'impressione.
 */
export function Meter({ fraction, tone }: { fraction: number; tone?: string }) {
  const colors = useColors();
  const clamped = Math.max(0, Math.min(1, fraction));
  return (
    <View style={[styles.track, { backgroundColor: colors.border }]}>
      <View style={[styles.fill, { width: `${clamped * 100}%`, backgroundColor: tone ?? colors.text }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  stat: { gap: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
