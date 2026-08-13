import { goBackOrHome } from '../../features/ui/navigation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { predictGender } from '../../core/german/genderRules';
import { TAG_LABELS } from '../../core/german/tags';
import { ANCHOR_STABILITY_DAYS, retentionCurve } from '../../core/progress/metrics';
import { DAY_MS } from '../../core/scheduler/day';
import { type Card, GENDER_COLORS, type Direction, Rating } from '../../core/types';
import { getDatabase } from '../../db/client';
import { type ItemDetail, getItemDetail, getSettings } from '../../db/repo';
import { speakGerman } from '../../features/audio/tts';
import { GermanText, Label, Surface } from '../../features/ui/components';
import { Row } from '../../features/ui/Stat';
import { useColors } from '../../features/ui/theme';
import { spacing, type } from '../../theme';

const DIRECTION_LABELS: Record<Direction, string> = {
  recognition: 'Riconoscimento',
  production: 'Produzione scritta',
  listening: 'Ascolto',
  speaking: 'Produzione orale',
  gender: 'Genere',
};

const RATING_LABELS: Record<number, string> = {
  [Rating.Again]: 'sbagliata',
  [Rating.Hard]: 'faticosa',
  [Rating.Good]: 'buona',
  [Rating.Easy]: 'immediata',
};

/** Dettaglio item (§7.4). */
export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [retention, setRetention] = useState(0.88);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = await getDatabase();
      const [result, settings] = await Promise.all([getItemDetail(db, id), getSettings(db)]);
      if (cancelled) return;
      setDetail(result);
      setRetention(settings.desiredRetention);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!detail) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
        <View style={styles.content}>
          <Text style={[type.body, { color: colors.textMuted }]}>Caricamento…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { item, cards, reviews } = detail;
  const recognition = cards.find((card) => card.direction === 'recognition');
  const prediction = item.type === 'noun' ? predictGender(item.de) : null;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="button" onPress={() => goBackOrHome(router)} hitSlop={10}>
          <Text style={[type.label, { color: colors.textMuted }]}>← INDIETRO</Text>
        </Pressable>

        <Pressable onPress={() => speakGerman(item.de)}>
          <GermanText text={item.de} gender={item.gender} />
        </Pressable>
        <Text style={[type.title, { color: colors.textMuted }]}>{item.it}</Text>

        {item.literalIt ? (
          <Text style={[type.body, { color: colors.textFaint }]}>alla lettera: {item.literalIt}</Text>
        ) : null}

        {item.falseFriend ? (
          <View style={[styles.warning, { borderColor: colors.danger }]}>
            <Text style={[type.label, { color: colors.danger }]}>FALSO AMICO</Text>
            <Text style={[type.body, { color: colors.textMuted }]}>{item.falseFriendNote}</Text>
          </View>
        ) : null}

        <Surface>
          {item.plural ? <Row label="Plurale" value={item.plural} /> : null}
          <Row label="Livello" value={item.cefr} />
          <Row label="Frequenza" value={`~${item.freqRank}`} />
          <Row label="Argomento" value={item.topic} />
          {item.cognateIt || item.cognateEn ? (
            <Row label="Somiglia a" value={[item.cognateIt, item.cognateEn].filter(Boolean).join(' · ')} />
          ) : null}
        </Surface>

        {prediction ? (
          <Surface>
            <Label>Perché questo genere</Label>
            <Text style={[type.body, { color: colors.textMuted }]}>{prediction.explanation}</Text>
            {prediction.gender !== null ? (
              <Text style={[type.mono, { color: colors.textFaint }]}>
                affidabilità della regola: {Math.round(prediction.confidence * 100)}%
                {prediction.gender !== item.gender ? ' — e qui la regola sbaglia: è un’eccezione.' : ''}
              </Text>
            ) : null}
          </Surface>
        ) : null}

        <Label>Tag grammaticali</Label>
        <View style={styles.tags}>
          {item.tags.map((tag) => (
            <Text key={tag} style={[type.mono, styles.tag, { color: colors.textMuted, borderColor: colors.border }]}>
              {TAG_LABELS[tag]}
            </Text>
          ))}
        </View>

        <Label>Stato delle direzioni</Label>
        <Surface>
          {cards.length === 0 ? (
            <Text style={[type.body, { color: colors.textMuted }]}>Non ancora introdotto.</Text>
          ) : (
            cards.map((card) => (
              <Row
                key={card.id}
                label={DIRECTION_LABELS[card.direction]}
                value={describeCard(card)}
              />
            ))
          )}
        </Surface>

        {recognition && recognition.stability > 0 ? (
          <>
            <Label>Curva di ritenzione stimata</Label>
            <Surface>
              <RetentionChart card={recognition} threshold={retention} />
              <Text style={[type.mono, { color: colors.textFaint }]}>
                Probabilità di ricordarlo nel tempo dall’ultimo richiamo. La linea è la ritenzione che hai scelto
                ({Math.round(retention * 100)}%): quando la curva la attraversa, la card torna in coda.
              </Text>
            </Surface>
          </>
        ) : null}

        <Label>Storico</Label>
        <Surface>
          {reviews.length === 0 ? (
            <Text style={[type.body, { color: colors.textMuted }]}>Nessun richiamo ancora.</Text>
          ) : (
            reviews.slice(0, 20).map((review) => (
              <View key={review.id} style={styles.reviewRow}>
                <Text style={[type.mono, { color: review.wasCorrect ? colors.success : colors.danger }]}>
                  {review.wasCorrect ? '●' : '×'}
                </Text>
                <Text style={[type.mono, styles.reviewDate, { color: colors.textMuted }]}>
                  {new Date(review.ts).toLocaleDateString('it-IT')}
                </Text>
                <Text style={[type.mono, { color: colors.textFaint }]}>{RATING_LABELS[review.rating] ?? ''}</Text>
              </View>
            ))
          )}
        </Surface>
      </ScrollView>
    </SafeAreaView>
  );
}

function describeCard(card: Card): string {
  if (card.suspended) return 'sospesa (troppi errori)';
  if (!card.unlocked) return 'non ancora sbloccata';
  if (card.reps === 0) return 'nuova';

  const days = Math.round(card.stability);
  const dueIn = Math.round((card.due - Date.now()) / DAY_MS);
  const anchor = card.stability >= ANCHOR_STABILITY_DAYS ? ' · ancorata' : '';
  return `${days}g di tenuta · tra ${dueIn <= 0 ? 'oggi' : `${dueIn}g`}${anchor}`;
}

const CHART_WIDTH = 280;
const CHART_HEIGHT = 90;

/**
 * Grafico senza librerie: la curva è disegnata con barre verticali.
 * Per una curva monotona bastano, e non aggiunge una dipendenza per un
 * grafico solo.
 */
function RetentionChart({ card, threshold }: { card: Card; threshold: number }) {
  const colors = useColors();
  const horizon = Math.max(7, Math.round(card.stability * 2.5));
  const points = retentionCurve(card, horizon, 34);
  const crossing = points.find((point) => point.retrievability < threshold);

  return (
    <View style={styles.chart}>
      <View style={[styles.chartArea, { height: CHART_HEIGHT }]}>
        {points.map((point, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              {
                height: Math.max(1, point.retrievability * CHART_HEIGHT),
                backgroundColor: point.retrievability >= threshold ? colors.text : colors.textFaint,
              },
            ]}
          />
        ))}
        <View
          style={[
            styles.threshold,
            { bottom: threshold * CHART_HEIGHT, borderColor: colors.textMuted },
          ]}
        />
      </View>
      <View style={styles.chartAxis}>
        <Text style={[type.mono, { color: colors.textFaint }]}>oggi</Text>
        <Text style={[type.mono, { color: colors.textMuted }]}>
          {crossing ? `torna dopo ~${Math.round(crossing.days)}g` : 'entro l’orizzonte non scende'}
        </Text>
        <Text style={[type.mono, { color: colors.textFaint }]}>{horizon}g</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  warning: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: spacing.sm, gap: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tag: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reviewDate: { flex: 1 },
  chart: { gap: spacing.xs, maxWidth: CHART_WIDTH },
  chartArea: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { flex: 1, borderRadius: 1 },
  threshold: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
  },
  chartAxis: { flexDirection: 'row', justifyContent: 'space-between' },
});
