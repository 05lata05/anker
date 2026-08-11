import { useColorScheme } from 'react-native';
import { type Palette, palette } from '../../theme';

export function useColors(): Palette {
  const scheme = useColorScheme();
  return palette[scheme === 'light' ? 'light' : 'dark'];
}

export { spacing, radius, type, GENDER_COLORS, GENDER_MARKS } from '../../theme';
export type { Palette } from '../../theme';
