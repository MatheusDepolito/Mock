import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/api-client',
  test: {
    name: 'api-client',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // No tests yet (Fase 5, subtarefa 5.2 is scaffold-only) — precedent:
    // apps/api/vitest.config.mts. Real tests arrive with the generated
    // types and the client (5.8/5.9).
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/libs/api-client',
      provider: 'v8' as const,
    },
  },
}));
