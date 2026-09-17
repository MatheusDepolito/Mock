/**
 * Four-check safety guard that must pass, in this exact order, before any
 * TRUNCATE is issued against the test database — see
 * docs/adr/006-persistence-and-local-infrastructure.md ("Guarda de
 * segurança obrigatória") and docs/adr/008-runtime-persistence-and-repositories.md
 * (§7.5). Test-only code: never imported by apps/api/src.
 */

const ALLOWED_TEST_DATABASE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  'postgres',
]);
const REQUIRED_TEST_DATABASE_NAME = 'mockp_test';

export class TruncateGuardViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TruncateGuardViolationError';
  }
}

export interface TruncateGuardInput {
  nodeEnv: string | undefined;
  testDatabaseUrl: string;
  /**
   * Runs `SELECT current_database()` against the real connection — only
   * invoked once checks 1-3 (NODE_ENV, host allowlist, URL database name)
   * already passed, never before.
   */
  queryCurrentDatabase: () => Promise<string>;
}

/**
 * Aborts BEFORE any SQL is issued if any of the four checks fail, in
 * order. Never logs or embeds the raw `testDatabaseUrl` (which may carry
 * credentials) — error messages only ever include the parsed hostname or
 * database name.
 */
export async function assertSafeToTruncateTestDatabase(
  input: TruncateGuardInput,
): Promise<void> {
  if (input.nodeEnv !== 'test') {
    throw new TruncateGuardViolationError(
      `Refusing to truncate: NODE_ENV must be "test", got ${JSON.stringify(input.nodeEnv)}.`,
    );
  }

  const url = new URL(input.testDatabaseUrl);
  if (!ALLOWED_TEST_DATABASE_HOSTS.has(url.hostname)) {
    throw new TruncateGuardViolationError(
      `Refusing to truncate: host "${url.hostname}" is not in the local test-database allowlist.`,
    );
  }

  const databaseName = url.pathname.replace(/^\//, '');
  if (databaseName !== REQUIRED_TEST_DATABASE_NAME) {
    throw new TruncateGuardViolationError(
      `Refusing to truncate: database name must be exactly "${REQUIRED_TEST_DATABASE_NAME}", got ${JSON.stringify(databaseName)}.`,
    );
  }

  const actualDatabaseName = await input.queryCurrentDatabase();
  if (actualDatabaseName !== REQUIRED_TEST_DATABASE_NAME) {
    throw new TruncateGuardViolationError(
      `Refusing to truncate: connected database is ${JSON.stringify(actualDatabaseName)}, expected "${REQUIRED_TEST_DATABASE_NAME}".`,
    );
  }
}
