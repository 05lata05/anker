import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TAG_LABELS } from '../../core/german/tags';
import type { SessionStep } from '../../core/session/steps';
import { spacing, type } from '../../theme';
import { speakGerman } from '../audio/tts';
import { Button, Chip, Field, GermanText, Label, Surface } from '../ui/components';
import { useColors } from '../ui/theme';

type ChunkStepData = Extract<SessionStep, { phase: 'new'; kind: 'chunk' }>;
type RuleStepData = Extract<SessionStep, { phase: 'new'; kind: 'rule' }>;
type DrillStepData = Extract<SessionStep, { phase: 'new'; kind: 'drill' }>;

/** Fase 3 — un chunk usabile per volta, mai una parola isolata (§4). */
export function ChunkStep({ step, onDone }: { step: ChunkStepData; onDone: () => void }) {
  const colors = useColors();
  const item = step.item;

  useEffect(() => {
    speakGerman(item.de);
  }, [item.de, step.id]);

  return (
    <View style={styles.root}>
      <Label>Nuovo</Label>

      <Pressable onPress={() => speakGerman(item.de)}>
        <GermanText text={item.de} gender={item.gender} />
      </Pressable>

      <Text style={[type.title, { color: colors.textMuted }]}>{item.it}</Text>

      {item.literalIt ? (
        <Text style={[type.body, { color: colors.textFaint }]}>alla lettera: {item.literalIt}</Text>
      ) : null}

      {item.plural ? (
        <Text style={[type.body, { color: colors.textMuted }]}>plurale: {item.plural}</Text>
      ) : null}

      {item.falseFriend ? (
        <View style={[styles.warning, { borderColor: colors.danger }]}>
          <Text style={[type.label, { color: colors.danger }]}>FALSO AMICO</Text>
          <Text style={[type.body, { color: colors.textMuted }]}>{item.falseFriendNote}</Text>
        </View>
      ) : null}

      {item.cognateIt || item.cognateEn ? (
        <Text style={[type.body, { color: colors.textFaint }]}>
          somiglia a: {[item.cognateIt, item.cognateEn].filter(Boolean).join(' · ')}
        </Text>
      ) : null}

      <View style={styles.tags}>
        {item.tags.slice(0, 3).map((tag) => (
          <Text key={tag} style={[type.label, { color: colors.textFaint }]}>
            {TAG_LABELS[tag].toUpperCase()}
          </Text>
        ))}
      </View>

      <Button label="Avanti" onPress={onDone} />
    </View>
  );
}

/**
 * Scheda regola esplicita: tre righe e due esempi, poi si esercita.
 * Se servisse più spazio, non sarebbe Focus on Form ma una lezione di
 * grammatica — che è ciò che §4 esclude.
 */
export function RuleStep({ step, onDone }: { step: RuleStepData; onDone: () => void }) {
  const colors = useColors();
  const rule = step.drill.rule!;

  return (
    <View style={styles.root}>
      <Label>Ti è capitato spesso di sbagliare qui</Label>
      <Text style={[type.title, { color: colors.text }]}>{rule.title}</Text>

      {rule.lines.map((line) => (
        <Text key={line} style={[type.body, { color: colors.textMuted }]}>
          {line}
        </Text>
      ))}

      <Surface>
        {rule.examples.map((example) => (
          <View key={example.de} style={styles.example}>
            <Pressable onPress={() => speakGerman(example.de)}>
              <Text style={[type.body, { color: colors.text }]}>{example.de}</Text>
            </Pressable>
            <Text style={[type.body, { color: colors.textFaint }]}>{example.it}</Text>
          </View>
        ))}
      </Surface>

      <Button label="Proviamo" onPress={onDone} />
    </View>
  );
}

/** Micro-drill: cloze, scelta, riordino o produzione, secondo il tag. */
export function DrillStep({
  step,
  disabled,
  onAnswer,
}: {
  step: DrillStepData;
  disabled: boolean;
  onAnswer: (answer: string) => void;
}) {
  const colors = useColors();
  const [value, setValue] = useState('');
  const [chips, setChips] = useState<string[]>([]);
  const exercise = step.exercise;

  const shuffled = exercise.kind === 'reorder' ? shuffleStable(exercise.answer.split(/\s+/), exercise.id) : [];

  useEffect(() => {
    setValue('');
    setChips([]);
  }, [step.id]);

  return (
    <View style={styles.root}>
      <Label>{exercise.prompt}</Label>

      {exercise.kind === 'reorder' ? (
        <>
          <View style={[styles.slot, { borderColor: colors.border }]}>
            <Text style={[type.german, { color: colors.text }]}>{chips.join(' ') || ' '}</Text>
          </View>
          <View style={styles.chipRow}>
            {shuffled.map((word, index) => (
              <Chip
                key={`${word}:${index}`}
                label={word}
                selected={chips.includes(word)}
                onPress={() => setChips((current) => [...current, word])}
              />
            ))}
          </View>
          <View style={styles.actions}>
            <Button label="Cancella" variant="ghost" onPress={() => setChips([])} />
            <View style={styles.grow}>
              <Button
                label="Rispondi"
                onPress={() => onAnswer(chips.join(' '))}
                disabled={disabled || chips.length === 0}
              />
            </View>
          </View>
        </>
      ) : exercise.options ? (
        <>
          <Text style={[type.german, { color: colors.text }]}>{exercise.text}</Text>
          <View style={styles.options}>
            {exercise.options.map((option) => (
              <Chip key={option} label={option} onPress={() => !disabled && onAnswer(option)} />
            ))}
          </View>
        </>
      ) : (
        <>
          <Text style={[type.title, { color: colors.textMuted }]}>{exercise.text}</Text>
          <Field value={value} onChangeText={setValue} placeholder="Scrivi in tedesco…" editable={!disabled} />
          <Button label="Rispondi" onPress={() => onAnswer(value)} disabled={disabled || value.trim() === ''} />
        </>
      )}
    </View>
  );
}

/** Mescolamento stabile, così i chip non saltano a ogni render. */
function shuffleStable(words: string[], key: string): string[] {
  let seed = 0;
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
  const out = [...words];
  for (let i = out.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const j = seed % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  tags: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  example: { gap: 2 },
  options: { gap: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    borderStyle: 'dashed',
    padding: spacing.md,
    minHeight: 64,
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  grow: { flex: 1 },
  warning: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: spacing.sm, gap: 2 },
});
