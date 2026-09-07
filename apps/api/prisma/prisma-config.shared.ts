/**
 * Single source of truth shared by the three `prisma*.config.ts` files in
 * `apps/api/`. All paths here are relative to `apps/api/` (where those
 * config files live), not to this module's own location inside
 * `apps/api/prisma/` — Prisma resolves relative config paths against the
 * config file itself. See docs/adr/006-persistence-and-local-infrastructure.md
 * ("Arquivos de configuração Prisma: separação schema-only vs. banco real").
 */
export const schema = 'prisma/schema.prisma';
export const migrations = 'prisma/migrations';
export const seed = 'prisma/seed.ts';

type RequiredEnvVar = 'DATABASE_URL' | 'TEST_DATABASE_URL';

/**
 * Reads a connection-string environment variable, failing fast and loudly
 * when it is missing or empty — never falling back to any default
 * connection string, and never including the (possibly credential-bearing)
 * value in the thrown message.
 */
export function requireDatabaseUrl(varName: RequiredEnvVar): string {
  const value = process.env[varName];

  if (!value || value.trim().length === 0) {
    throw new Error(
      `Missing required environment variable ${varName}. Refusing to fall back to any default connection string.`,
    );
  }

  return value;
}
