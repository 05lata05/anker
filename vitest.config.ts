import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Due suite, entrambe in Node:
 *
 * - `src/core/**` — il motore, su oggetti in memoria. Se un test qui fallisce
 *   perché qualcosa importa React Native, la violazione è nel codice: il motore
 *   deve restare puro.
 * - `src/db/**` — il layer dati, contro SQLite vero via `node:sqlite`. Serve a
 *   coprire migrazioni, colonne JSON e persistenza dello stato FSRS, che i test
 *   del motore per costruzione non toccano.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/core/**/*.test.ts', 'src/db/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
});
