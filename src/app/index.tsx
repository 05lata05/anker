import { sql } from 'drizzle-orm';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GENDER_COLORS, GENDER_MARKS, type Gender } from '../core/types';
import { db } from '../db/client';
import { cards, items, lessons } from '../db/schema';
import { type Palette, palette, radius, spacing, type } from '../theme';

/**
 * Segnaposto della Fase A: serve a verificare che migrazioni e seed girino sul
 * dispositivo. La Home vera (Ancoraggi, review dovute, streak) arriva in Fase D.
 */
export default function ScaffoldScreen() {
  const scheme = useColorScheme() ?? 'dark';
  const colors = palette[scheme === 'light' ? 'light' : 'dark'];
  const [counts, setCounts] = useState<{ items: number; lessons: number; cards: number } | null>(null);
  const [samples, setSamples] = useState<{ id: string; de: string; it: string; gender: Gender | null }[]>([]);

  useEffect(() => {
    (async () => {
      const [i] = await db.select({ n: sql<number>`count(*)` }).from(items);
      const [l] = await db.select({ n: sql<number>`count(*)` }).from(lessons);
      const [c] = await db.select({ n: sql<number>`count(*)` }).from(cards);
      setCounts({ items: i?.n ?? 0, lessons: l?.n ?? 0, cards: c?.n ?? 0 });

      const rows = await db
        .select({ id: items.id, de: items.de, it: items.it, gender: items.gender })
        .from(items)
        .where(sql`${items.type} = 'noun'`)
        .limit(6);
      setSamples(rows);
    })();
  }, []);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[type.label, { color: colors.textFaint }]}>ANKER · FASE A</Text>
        <Text style={[type.display, { color: colors.text, marginBottom: spacing.lg }]}>Scaffolding</Text>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Row label="Item nel database" value={counts?.items ?? '…'} colors={colors} />
          <Row label="Lezioni di input" value={counts?.lessons ?? '…'} colors={colors} />
          <Row
            label="Card create"
            value={counts?.cards ?? '…'}
            hint="0 è corretto: le card nascono quando l'item viene introdotto"
            colors={colors}
          />
        </View>

        <Text style={[type.label, { color: colors.textFaint, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
          COLOR-CODING DEL GENERE
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {samples.map((item) => (
            <View key={item.id} style={styles.sampleRow}>
              <Text style={[type.mono, { color: item.gender ? GENDER_COLORS[item.gender] : colors.textMuted }]}>
                {item.gender ? GENDER_MARKS[item.gender] : '·'}
              </Text>
              <Text
                style={[
                  type.body,
                  styles.sampleDe,
                  { color: item.gender ? GENDER_COLORS[item.gender] : colors.text },
                ]}
              >
                {item.de}
              </Text>
              <Text style={[type.body, { color: colors.textMuted }]}>{item.it}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  label,
  value,
  hint,
  colors,
}: {
  label: string;
  value: number | string;
  hint?: string;
  colors: Palette;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={[type.body, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[type.title, { color: colors.text }]}>{value}</Text>
      </View>
      {hint ? <Text style={[type.mono, { color: colors.textFaint }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing.md, gap: spacing.md },
  row: { gap: spacing.xs },
  rowMain: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sampleRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  sampleDe: { flex: 1 },
});
