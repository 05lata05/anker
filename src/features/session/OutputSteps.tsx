import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SessionStep } from '../../core/session/steps';
import { spacing, type } from '../../theme';
import { Button, Chip, Field, Label } from '../ui/components';
import { useColors } from '../ui/theme';

type OutputStepData = Extract<SessionStep, { phase: 'output' }>;

/**
 * Fase 4 — output, gradini scritti.
 *
 * È la fase che manca alle app concorrenti, e la scala è crescente:
 * completamento → riordino → produzione libera. Lo shadowing sta in
 * `ShadowingStep`, perché ha bisogno di microfono e riproduzione.
 */
export function OutputStep({
  step,
  disabled,
  onAnswer,
}: {
  step: OutputStepData;
  disabled: boolean;
  onAnswer: (answer: string) => void;
}) {
  const colors = useColors();
  const [value, setValue] = useState('');
  const [chips, setChips] = useState<string[]>([]);
  const item = step.item;

  useEffect(() => {
    setValue('');
    setChips([]);
  }, [step.id]);

  if (step.rung === 'completion') {
    const words = item.de.split(/\s+/);
    const blankIndex = words.length - 1;
    const masked = words.map((word, index) => (index === blankIndex ? '___' : word)).join(' ');

    return (
      <View style={styles.root}>
        <Label>Completa la frase</Label>
        <Text style={[type.german, { color: colors.text }]}>{masked}</Text>
        <Text style={[type.body, { color: colors.textMuted }]}>{item.it}</Text>
        <Field value={value} onChangeText={setValue} placeholder="La parola mancante…" editable={!disabled} />
        <Button
          label="Rispondi"
          onPress={() => onAnswer(words.map((word, index) => (index === blankIndex ? value.trim() : word)).join(' '))}
          disabled={disabled || value.trim() === ''}
        />
      </View>
    );
  }

  if (step.rung === 'reorder') {
    const shuffled = shuffleStable(item.de.split(/\s+/), item.id);
    return (
      <View style={styles.root}>
        <Label>Rimetti le parole in ordine</Label>
        <Text style={[type.body, { color: colors.textMuted }]}>{item.it}</Text>

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
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Label>Produzione libera — scrivi in tedesco</Label>
      <Text style={[type.title, { color: colors.text }]}>{item.it}</Text>
      <Field value={value} onChangeText={setValue} placeholder="Scrivi in tedesco…" editable={!disabled} multiline />
      <Button label="Rispondi" onPress={() => onAnswer(value)} disabled={disabled || value.trim() === ''} />
    </View>
  );
}

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
  actions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  grow: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    borderStyle: 'dashed',
    padding: spacing.md,
    minHeight: 64,
    justifyContent: 'center',
  },
});
