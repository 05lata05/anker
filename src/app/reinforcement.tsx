import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeedbackBar } from '../features/session/FeedbackBar';
import { Button, Chip, GermanText, Label, Screen } from '../features/ui/components';
import { useColors } from '../features/ui/theme';
import { tapFeedback } from '../features/ui/haptics';
import { speakGerman } from '../features/audio/tts';
import { useReinforcementStore } from '../state/reinforcementStore';
import { spacing, type } from '../theme';

/**
 * Ripasso lampo (§3.1): la seconda esposizione del giorno, a un'ora e mezza
 * dalla sessione. Poche card, nessun cronometro, nessuna metrica da inseguire.
 */
export default function ReinforcementScreen() {
  const router = useRouter();
  const colors = useColors();
  const store = useReinforcementStore();

  useEffect(() => {
    void store.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exit = () => {
    store.reset();
    router.back();
  };

  if (store.status === 'idle' || store.status === 'loading') {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={colors.textMuted} />
      </Screen>
    );
  }

  if (store.status === 'completed') {
    const total = store.cards.length;
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
        <View style={styles.center}>
          <Text style={[type.display, { color: colors.text }]}>
            {total === 0 ? 'Niente da ripassare' : 'Fatto'}
          </Text>
          <Text style={[type.body, styles.centered, { color: colors.textMuted }]}>
            {total === 0
              ? 'I chunk di oggi torneranno tra un’ora e mezza dalla sessione.'
              : `${store.correct} su ${total}. Questi item sono passati due volte oggi: è lo spacing che li fissa.`}
          </Text>
          <Button label="Torna alla home" onPress={exit} />
        </View>
      </SafeAreaView>
    );
  }

  const entry = store.cards[store.index];
  const prompt = store.prompt();
  if (!entry || !prompt) return null;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Label>
            Ripasso lampo · {store.index + 1} di {store.cards.length}
          </Label>
        </View>

        <Text
          style={[type.body, { color: colors.textFaint }]}
          onPress={() => speakGerman(entry.item.de)}
        >
          {prompt.instruction}
        </Text>

        <GermanText text={prompt.text} gender={entry.item.gender} />

        <View style={styles.options}>
          {prompt.options?.map((option) => (
            <Chip
              key={option}
              label={option}
              onPress={() => {
                if (store.feedback) return;
                void store.answer(option).then(() => {
                  tapFeedback(useReinforcementStore.getState().feedback?.correct ?? false);
                });
              }}
            />
          ))}
        </View>
      </ScrollView>

      {store.feedback ? (
        <View style={styles.footer}>
          <FeedbackBar feedback={store.feedback} onContinue={store.advance} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  centered: { textAlign: 'center' },
  content: { padding: spacing.lg, gap: spacing.lg, flexGrow: 1 },
  header: { paddingTop: spacing.sm },
  options: { gap: spacing.sm },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
});
