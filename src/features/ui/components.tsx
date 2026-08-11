import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { GENDER_COLORS, GENDER_MARKS, type Gender } from '../../core/types';
import { useGenderColorsEnabled } from '../../state/settingsStore';
import { radius, spacing, type } from '../../theme';
import { useColors } from './theme';

export function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const colors = useColors();
  return <View style={[styles.screen, { backgroundColor: colors.bg }, style]}>{children}</View>;
}

export function Surface({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const colors = useColors();
  return (
    <View style={[styles.surface, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <Text style={[type.label, { color: colors.textFaint }]}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const colors = useColors();
  return <Text style={[type.body, { color: muted ? colors.textMuted : colors.text }]}>{children}</Text>;
}

export function Title({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <Text style={[type.title, { color: colors.text }]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
}) {
  const colors = useColors();
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: isPrimary ? colors.accent : 'transparent',
          borderColor: colors.border,
          borderWidth: isPrimary ? 0 : StyleSheet.hairlineWidth,
          opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text style={[type.body, styles.buttonLabel, { color: isPrimary ? colors.bg : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  const colors = useColors();
  return (
    <TextInput
      {...props}
      placeholderTextColor={colors.textFaint}
      autoCapitalize="sentences"
      autoCorrect={false}
      style={[
        styles.field,
        type.body,
        { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
        props.style,
      ]}
    />
  );
}

/**
 * Testo tedesco col color-coding del genere (§5.1).
 *
 * Il colore non viaggia mai da solo: `GENDER_MARKS` aggiunge il canale non
 * cromatico, altrimenti per un utente daltonico l'intero sistema di codifica
 * semplicemente non esiste.
 *
 * Colora solo gli item che PORTANO un genere, cioè i sostantivi. Dentro un
 * chunk come «Ich fahre mit dem Auto» il genere di `Auto` non è ricavabile dal
 * testo — `dem` vale per maschile e neutro — e dipingere a caso sarebbe peggio
 * che non dipingere.
 */
export function GermanText({
  text,
  gender,
  size = 'german',
}: {
  text: string;
  gender?: Gender | null;
  size?: 'german' | 'body' | 'title';
}) {
  const colors = useColors();
  const colorsEnabled = useGenderColorsEnabled();
  const useColor = colorsEnabled && gender != null;
  return (
    <Text style={[type[size], { color: useColor ? GENDER_COLORS[gender] : colors.text }]}>
      {/* Il simbolo resta anche col colore spento: è il canale non cromatico. */}
      {gender != null ? `${GENDER_MARKS[gender]} ` : ''}
      {text}
    </Text>
  );
}

export function Chip({
  label,
  onPress,
  selected,
  tone = 'neutral',
}: {
  label: string;
  onPress?: () => void;
  selected?: boolean;
  tone?: 'neutral' | 'correct' | 'wrong';
}) {
  const colors = useColors();
  const border = tone === 'correct' ? colors.success : tone === 'wrong' ? colors.danger : colors.border;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: border,
          backgroundColor: selected ? colors.surfaceRaised : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[type.body, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Divider() {
  const colors = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  surface: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.sm,
  },
  button: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  buttonLabel: { fontWeight: '600' },
  field: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  chip: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
});
