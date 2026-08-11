import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ConsolidationStep } from '../features/session/ConsolidationStep';
import { FeedbackBar } from '../features/session/FeedbackBar';
import { DialogueStep, QuestionStep } from '../features/session/InputSteps';
import { ChunkStep, DrillStep, RuleStep } from '../features/session/NewSteps';
import { OutputStep } from '../features/session/OutputSteps';
import { PhaseBar } from '../features/session/PhaseBar';
import { RecallStep } from '../features/session/RecallStep';
import { Button, Screen } from '../features/ui/components';
import { useColors } from '../features/ui/theme';
import { stopSpeaking } from '../features/audio/tts';
import { spacing, type } from '../theme';
import { useSessionStore } from '../state/sessionStore';

export default function SessionScreen() {
  const router = useRouter();
  const colors = useColors();
  const store = useSessionStore();

  useEffect(() => {
    void store.begin();
    return () => {
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exit = () => {
    stopSpeaking();
    router.back();
  };

  if (store.status === 'loading' || store.status === 'idle') {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={colors.textMuted} />
      </Screen>
    );
  }

  if (store.status === 'error') {
    return (
      <Screen style={styles.center}>
        <Text style={[type.title, { color: colors.danger }]}>Non riesco ad aprire la sessione</Text>
        <Text style={[type.body, { color: colors.textMuted, textAlign: 'center' }]}>{store.error}</Text>
        <Button label="Torna indietro" onPress={exit} />
      </Screen>
    );
  }

  if (store.status === 'completed') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
        <View style={styles.done}>
          <Text style={[type.display, { color: colors.text }]}>Sessione chiusa</Text>
          <Text style={[type.body, { color: colors.textMuted }]}>
            {store.stats.reviewsDone} richiami · {store.stats.newItems} chunk nuovi
          </Text>
          <Button
            label="Torna alla home"
            onPress={() => {
              store.reset();
              exit();
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const step = store.currentStep();
  const engine = store.engine;
  const plan = store.plan;

  if (!step || !engine || !plan) {
    return (
      <Screen style={styles.center}>
        <Text style={[type.body, { color: colors.textMuted }]}>Niente da fare adesso.</Text>
        <Button label="Torna indietro" onPress={exit} />
      </Screen>
    );
  }

  const answering = store.feedback === null;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <View style={styles.header}>
          <PhaseBar steps={store.steps} index={store.index} onExit={exit} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step.phase === 'recall' ? (
            <RecallStep
              step={step}
              prompt={store.promptFor(step)!}
              disabled={!answering}
              usedHint={store.usedHint}
              onHint={store.useHint}
              onAnswer={(answer) => void store.answer(answer)}
            />
          ) : null}

          {step.phase === 'input' && step.kind === 'dialogue' ? (
            <DialogueStep
              step={step}
              itemsById={engine.itemsById}
              ttsSpeed={engine.settings.ttsSpeed}
              onDone={() => void store.advance()}
            />
          ) : null}

          {step.phase === 'input' && step.kind === 'question' ? (
            <QuestionStep step={step} disabled={!answering} onAnswer={(index) => void store.answer(index)} />
          ) : null}

          {step.phase === 'new' && step.kind === 'chunk' ? (
            <ChunkStep step={step} onDone={() => void store.advance()} />
          ) : null}

          {step.phase === 'new' && step.kind === 'rule' ? (
            <RuleStep step={step} onDone={() => void store.advance()} />
          ) : null}

          {step.phase === 'new' && step.kind === 'drill' ? (
            <DrillStep step={step} disabled={!answering} onAnswer={(answer) => void store.answer(answer)} />
          ) : null}

          {step.phase === 'output' ? (
            <OutputStep
              step={step}
              disabled={!answering}
              ttsSpeed={engine.settings.ttsSpeed}
              onAnswer={(answer) => void store.answer(answer)}
              onDone={() => void store.advance()}
            />
          ) : null}

          {step.phase === 'consolidation' ? (
            <ConsolidationStep plan={plan} stats={store.stats} onDone={() => void store.finish()} />
          ) : null}
        </ScrollView>

        {store.feedback ? (
          <View style={styles.footer}>
            <FeedbackBar feedback={store.feedback} onContinue={() => void store.advance()} />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg, flexGrow: 1 },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
});
