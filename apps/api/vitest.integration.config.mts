import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/api-integration',
  resolve: { conditions: ['development'] },
  test: {
    name: 'api-integration',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    // test/infra/** requires real PostgreSQL/Redis (Tarefa 3.3.4) — runs
    // only via vitest.integration.infra.config.mts /
    // `yarn validate:infra`, never as part of this fully offline suite.
    exclude: [...configDefaults.exclude, 'test/infra/**'],
    reporters: ['default'],
    hookTimeout: 20000,
    testTimeout: 20000,
    coverage: {
      reportsDirectory: '../../coverage/apps/api-integration',
      provider: 'v8' as const,
    },
  },
}));
