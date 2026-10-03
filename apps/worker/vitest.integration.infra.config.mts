import { defineConfig } from 'vitest/config';

/**
 * Real-infrastructure integration suite (Tarefa 4.5). Separate from
 * vitest.integration.config.mts (fully offline, no Redis reachable) —
 * this config targets test/infra/** exclusively, against the real,
 * local Redis (Docker Compose). Never run as part of `yarn validate` —
 * only via `yarn validate:infra` / `nx run worker:test:integration:infra`.
 * Mirrors apps/api/vitest.integration.infra.config.mts.
 */
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/worker-integration-infra',
  resolve: { conditions: ['development'] },
  test: {
    name: 'worker-integration-infra',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['test/infra/**/*.spec.ts'],
    // Serial execution, single process — a spawned worker process and
    // its real Redis connection are process-wide resources; running
    // these concurrently would make failures harder to attribute.
    fileParallelism: false,
    pool: 'forks',
    reporters: ['default'],
    hookTimeout: 20000,
    testTimeout: 30000,
    coverage: {
      reportsDirectory: '../../coverage/apps/worker-integration-infra',
      provider: 'v8' as const,
    },
  },
}));
