import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SessionStep } from '../../core/session/steps';
import type { Item } from '../../core/types';
import { spacing, type } from '../../theme';
import { speakGerman } from '../audio/tts';
import { Button, Chip, Label, Surface } from '../ui/components';
import { useColors } from '../ui/theme';

type DialogueStepData = Extract<SessionStep, { phase: 'input'; kind: 'dialogue' }>;
type QuestionStepData = Extract<SessionStep, { phase: 'input'; kind: 'question' }>;

/**
 * Fase 2 — input comprensibile.
 *
 * La traduzione è nascosta di default e si rivela riga per riga: se sta lì
 * accanto, l'occhio la legge prima del tedesco e la fase smette di essere
 * input. Toccare una parola sconosciuta ne mostra la glossa quando l'app la
 * conosce; le altre finiscono nella lista dei candidati.
 */
export function DialogueStep({
  step,
  itemsById,
  ttsSpeed,
  onDone,
}: {
  step: DialogueStepData;
  itemsById: ReadonlyMap<string, Item>;
  ttsSpeed: number;
  onDone: () => void;
}) {
  const colors = useColors();
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [gloss, setGloss] = useState<{ word: string; it: string | null } | null>(null);

  const byWord = new Map<string, Item>();
  for (const item of itemsById.values()) {
    for (const token of item.de.toLowerCase().replace(/[.,!?]/g, '').split(/\s+/)) {
      if (!byWord.has(token)) byWord.set(token, item);
    }
  }

  useEffect(() => {
    speakGerman(step.lesson.lines.map((line) => line.de).join(' '), { rate: ttsSpeed });
  }, [step.id, step.lesson.lines, ttsSpeed]);

  return (
    <View style={styles.root}>
      <Label>Ascolta e leggi. Tocca una riga per la traduzione.</Label>

      <ScrollView contentContainerStyle={styles.lines}>
        {step.lesson.lines.map((line, index) => (
          <View key={`${step.id}:${index}`} style={styles.line}>
            <Text style={[type.label, { color: colors.textFaint }]}>{line.speaker.toUpperCase()}</Text>

            <View style={styles.words}>
              {line.de.split(/\s+/).map((word, wordIndex) => {
                const bare = word.toLowerCase().replace(/[.,!?]/g, '');
                return (
                  <Pressable
                    key={`${index}:${wordIndex}`}
                    onPress={() => setGloss({ word, it: byWord.get(bare)?.it ?? null })}
                  >
                    <Text style={[type.german, { color: colors.text }]}>{word} </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={() =>
                setRevealed((current) => {
                  const next = new Set(current);
                  if (next.has(index)) next.delete(index);
                  else next.add(index);
                  return next;
                })
              }
            >
              <Text style={[type.body, { color: revealed.has(index) ? colors.textMuted : colors.textFaint }]}>
                {revealed.has(index) ? line.it : '· · · · ·'}
              </Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>

      {gloss ? (
        <Surface>
          <Text style={[type.title, { color: colors.text }]}>{gloss.word}</Text>
          <Text style={[type.body, { color: colors.textMuted }]}>
            {gloss.it ?? 'Non è ancora nei tuoi contenuti: la incontrerai più avanti.'}
          </Text>
          <Button label="Chiudi" variant="ghost" onPress={() => setGloss(null)} />
        </Surface>
      ) : null}

      <View style={styles.actions}>
        <Button
          label="Riascolta"
          variant="ghost"
          onPress={() => speakGerman(step.lesson.lines.map((line) => line.de).join(' '), { rate: ttsSpeed })}
        />
        <View style={styles.grow}>
          <Button label="Ho capito" onPress={onDone} />
        </View>
      </View>
    </View>
  );
}

/** Le domande sono in tedesco e sulla sostanza, non sulla traduzione (§4). */
export function QuestionStep({
  step,
  disabled,
  onAnswer,
}: {
  step: QuestionStepData;
  disabled: boolean;
  onAnswer: (optionIndex: string) => void;
}) {
  return (
    <View style={styles.root}>
      <Label>Domanda {step.index + 1} di 2</Label>
      <Text style={type.german}>
        <QuestionText text={step.question.de} />
      </Text>
      <View style={styles.options}>
        {step.question.options.map((option, index) => (
          <Chip key={option} label={option} onPress={() => !disabled && onAnswer(String(index))} />
        ))}
      </View>
    </View>
  );
}

function QuestionText({ text }: { text: string }) {
  const colors = useColors();
  return <Text style={[type.german, { color: colors.text }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg, flex: 1 },
  lines: { gap: spacing.lg, paddingBottom: spacing.md },
  line: { gap: spacing.xs },
  words: { flexDirection: 'row', flexWrap: 'wrap' },
  options: { gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  grow: { flex: 1 },
});
