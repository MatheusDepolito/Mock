import type { WorkerConfig } from '@mockp/config/worker';

/**
 * Fails fast and loudly when a required real-infrastructure test
 * environment variable is missing or empty — never falls back to any
 * default connection string, and never includes the (possibly
 * credential-bearing) value in the thrown message. Mirrors
 * `requireInfraEnvVar` in apps/api/test/support/infra-server-config.ts.
 */
function requireInfraEnvVar(name: 'REDIS_URL'): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `Missing required environment variable ${name}. The real-infrastructure test suite refuses to fall back to any default connection string.`,
    );
  }
  return value;
}

/**
 * Builds a `WorkerConfig` for the real-infrastructure test suite
 * (apps/worker/test/infra/) by hand — deliberately never a hardcoded
 * `redis://localhost:6379`. `redisUrl` comes exclusively from
 * `REDIS_URL`, the same variable name and value the real Compose
 * `redis` service is reachable at — same convention as
 * `apps/api/test/support/infra-server-config.ts`.
 */
export function buildInfraWorkerConfig(): WorkerConfig {
  return {
    nodeEnv: 'test',
    logLevel: 'silent',
    redisUrl: requireInfraEnvVar('REDIS_URL'),
  };
}
