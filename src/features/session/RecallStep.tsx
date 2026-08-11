import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Prompt } from '../../core/session/grading';
import type { SessionStep } from '../../core/session/steps';
import { spacing, type } from '../../theme';
import { speakGerman } from '../audio/tts';
import { Button, Chip, Field, GermanText, Label } from '../ui/components';
import { useColors } from '../ui/theme';

type RecallStepData = Extract<SessionStep, { phase: 'recall' }>;

/**
 * Una card alla volta, nient'altro sullo schermo (§7).
 *
 * Il pulsante di suggerimento esiste ma costa: chi lo usa prende `Hard`. È il
 * modo di offrire una via d'uscita senza regalare l'intervallo — se il
 * suggerimento fosse gratis, l'app ottimizzerebbe la sensazione di bravura
 * invece della ritenzione.
 */
export function RecallStep({
  step,
  prompt,
  disabled,
  usedHint,
  onHint,
  onAnswer,
}: {
  step: RecallStepData;
  prompt: Prompt;
  disabled: boolean;
  usedHint: boolean;
  onHint: () => void;
  onAnswer: (answer: string) => void;
}) {
  const colors = useColors();
  const [value, setValue] = useState('');
  const item = step.card.item;

  useEffect(() => {
    setValue('');
  }, [step.id]);

  // L'audio parte da solo sulle card di ascolto: aspettare un tap trasforma
  // l'esercizio di comprensione orale in un esercizio di pazienza.
  useEffect(() => {
    if (prompt.language === 'audio') speakGerman(item.de);
  }, [prompt.language, item.de, step.id]);

  const isChoice = prompt.options !== undefined;

  return (
    <View style={styles.root}>
      <Label>{prompt.instruction}</Label>

      {prompt.language === 'audio' ? (
        <Pressable onPress={() => speakGerman(item.de)} style={styles.audio}>
          <Text style={[type.display, { color: colors.text }]}>♪</Text>
          <Text style={[type.body, { color: colors.textMuted }]}>tocca per riascoltare</Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => prompt.language === 'de' && speakGerman(prompt.text)}>
          <GermanText
            text={prompt.text}
            // Sulla card di genere il colore E il simbolo sono la risposta:
            // mostrarli qui trasformerebbe l'esercizio in una lettura.
            gender={prompt.language === 'de' && step.card.card.direction !== 'gender' ? item.gender : null}
            size={prompt.language === 'de' ? 'german' : 'title'}
          />
        </Pressable>
      )}

      {item.falseFriend ? (
        <View style={[styles.warning, { borderColor: colors.danger }]}>
          <Text style={[type.label, { color: colors.danger }]}>FALSO AMICO</Text>
          <Text style={[type.body, { color: colors.textMuted }]}>{item.falseFriendNote}</Text>
        </View>
      ) : null}

      {usedHint ? (
        <Text style={[type.body, { color: colors.textFaint }]}>
          {prompt.expected.slice(0, Math.max(2, Math.ceil(prompt.expected.length / 3)))}…
        </Text>
      ) : null}

      {isChoice ? (
        <View style={styles.options}>
          {prompt.options!.map((option) => (
            <Chip key={option} label={option} onPress={() => !disabled && onAnswer(option)} />
          ))}
        </View>
      ) : (
        <View style={styles.answer}>
          <Field
            value={value}
            onChangeText={setValue}
            placeholder={prompt.answerLanguage === 'de' ? 'Scrivi in tedesco…' : 'Scrivi in italiano…'}
            editable={!disabled}
            onSubmitEditing={() => value.trim() && onAnswer(value)}
            returnKeyType="done"
            multiline
          />
          <View style={styles.actions}>
            {!usedHint ? <Button label="Suggerimento" variant="ghost" onPress={onHint} /> : null}
            <View style={styles.grow}>
              <Button label="Rispondi" onPress={() => onAnswer(value)} disabled={disabled || value.trim() === ''} />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  audio: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  options: { gap: spacing.sm },
  answer: { gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  grow: { flex: 1 },
  warning: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: spacing.sm, gap: 2 },
});
