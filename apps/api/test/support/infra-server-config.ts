import type { ServerConfig } from '@mockp/config/server';

type InfraEnvVarName = 'TEST_DATABASE_URL' | 'REDIS_URL';

/**
 * Fails fast and loudly when a required real-infrastructure test
 * environment variable is missing or empty — never falls back to any
 * default connection string, and never includes the (possibly
 * credential-bearing) value in the thrown message. Mirrors
 * `requireDatabaseUrl` in apps/api/prisma/prisma-config.shared.ts.
 */
function requireInfraEnvVar(name: InfraEnvVarName): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `Missing required environment variable ${name}. The real-infrastructure test suite refuses to fall back to any default connection string.`,
    );
  }
  return value;
}

/**
 * Builds a `ServerConfig` for the real-infrastructure test suite
 * (apps/api/test/infra/) by hand — deliberately never via
 * `loadServerConfig()`. `loadServerConfig()` validates and reads
 * `DATABASE_URL`, not `TEST_DATABASE_URL`: `TEST_DATABASE_URL` is
 * intentionally absent from the production env schema (see
 * libs/config/src/server/schema.ts) and must stay that way — this
 * function, not the schema, is where the substitution happens.
 * `databaseUrl` comes from `TEST_DATABASE_URL` exclusively; `DATABASE_URL`
 * is never read or reused here. `redisUrl` comes from `REDIS_URL`, same
 * variable name as production. Both are required, with no fallback (see
 * `requireInfraEnvVar` above).
 */
export function buildInfraServerConfig(): ServerConfig {
  return {
    nodeEnv: 'test',
    port: 0,
    host: '127.0.0.1',
    logLevel: 'silent',
    corsAllowedOrigins: [],
    databaseUrl: requireInfraEnvVar('TEST_DATABASE_URL'),
    redisUrl: requireInfraEnvVar('REDIS_URL'),
    rateLimit: { ttlMs: 60000, limit: 1000 },
  };
}
