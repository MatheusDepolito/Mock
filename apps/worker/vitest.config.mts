import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/worker',
  // Resolve workspace packages (e.g. @mockp/config) straight from their
  // TypeScript source via their "development" export condition, instead of
  // requiring a build first — see libs/config/package.json.
  resolve: { conditions: ['development'] },
  test: {
    name: 'worker',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // No unit spec exists yet under src/ in this subtask (no
    // processor/consumer logic to unit-test until Tarefa 4.3) — mirrors
    // apps/api/vitest.config.mts.
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/worker',
      provider: 'v8' as const,
    },
  },
}));
