import { defineConfig } from 'vitest/config';

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
    reporters: ['default'],
    hookTimeout: 20000,
    testTimeout: 20000,
    coverage: {
      reportsDirectory: '../../coverage/apps/api-integration',
      provider: 'v8' as const,
    },
  },
}));
