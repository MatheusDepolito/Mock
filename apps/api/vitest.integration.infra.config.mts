import { defineConfig } from 'vitest/config';

/**
 * Real-infrastructure integration suite (Tarefa 3.3.4). Separate from
 * vitest.integration.config.mts (fully offline, no PostgreSQL/Redis
 * reachable) — this config targets test/infra/** exclusively, against a
 * real, seeded `mockp_test` database and a real local Redis. Never run
 * as part of `yarn validate` — only via `yarn validate:infra` /
 * `nx run api:test:integration:infra`. See
 * docs/adr/008-runtime-persistence-and-repositories.md (§7.3/§7.5).
 */
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/api-integration-infra',
  resolve: { conditions: ['development'] },
  test: {
    name: 'api-integration-infra',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['test/infra/**/*.spec.ts'],
    setupFiles: ['test/infra/setup.ts'],
    // Serial execution, single process — every test shares the same
    // mockp_test database, truncated between tests by the guarded
    // beforeEach in test/infra/setup.ts. See ADR 008 §7.5.
    fileParallelism: false,
    pool: 'forks',
    reporters: ['default'],
    hookTimeout: 20000,
    testTimeout: 20000,
    coverage: {
      reportsDirectory: '../../coverage/apps/api-integration-infra',
      provider: 'v8' as const,
    },
  },
}));
