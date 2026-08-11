/**
 * Palette e tipografia.
 *
 * Regola di design (§7): il colore è quasi assente, tranne che per il genere
 * dei sostantivi. Tutto il resto vive su una scala di grigi, così quando appare
 * il blu/rosso/verde significa una cosa sola.
 */
import { GENDER_COLORS, GENDER_MARKS } from './core/types';

export { GENDER_COLORS, GENDER_MARKS };

export interface Palette {
  bg: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  danger: string;
  success: string;
}

export const palette: Record<'dark' | 'light', Palette> = {
  dark: {
    bg: '#0B0C0E',
    surface: '#151719',
    surfaceRaised: '#1E2124',
    border: '#2A2E33',
    text: '#F2F4F6',
    textMuted: '#9BA3AC',
    textFaint: '#646C75',
    accent: '#E8EAED',
    danger: '#DC2626',
    success: '#16A34A',
  },
  light: {
    bg: '#FBFBFC',
    surface: '#FFFFFF',
    surfaceRaised: '#F2F3F5',
    border: '#DFE2E6',
    text: '#101214',
    textMuted: '#5A626B',
    textFaint: '#8B939C',
    accent: '#101214',
    danger: '#DC2626',
    success: '#16A34A',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
} as const;

export const type = {
  display: { fontSize: 34, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '600' as const },
  body: { fontSize: 17, fontWeight: '400' as const, lineHeight: 25 },
  german: { fontSize: 26, fontWeight: '500' as const, lineHeight: 34 },
  label: { fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.6 },
  mono: { fontSize: 13, fontWeight: '400' as const },
} as const;
