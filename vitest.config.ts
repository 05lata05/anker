import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Vitest gira SOLO su `src/core/`. Se un test qui dentro fallisce perché
 * qualcosa importa React Native, la violazione è nel codice, non nella config:
 * il motore deve restare puro.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/core/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
});
