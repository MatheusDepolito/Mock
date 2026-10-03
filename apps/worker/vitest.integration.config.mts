import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/worker-integration',
  resolve: { conditions: ['development'] },
  test: {
    name: 'worker-integration',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    // test/infra/** requires real Redis (Tarefa 4.5 — AppModule now
    // wires in a real BullMQ Worker) — runs only via
    // vitest.integration.infra.config.mts / `yarn validate:infra`,
    // never as part of this fully offline suite.
    exclude: [...configDefaults.exclude, 'test/infra/**'],
    // Nothing currently lives directly under test/ outside test/infra/
    // — both existing specs moved to test/infra/ in Tarefa 4.5, since
    // composing the full AppModule (real BullMQ Worker) is only safe
    // where real Redis is guaranteed. Kept passWithNoTests so this
    // target still succeeds if that remains true.
    passWithNoTests: true,
    reporters: ['default'],
    hookTimeout: 20000,
    testTimeout: 20000,
    coverage: {
      reportsDirectory: '../../coverage/apps/worker-integration',
      provider: 'v8' as const,
    },
  },
}));
