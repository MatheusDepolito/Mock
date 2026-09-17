import {
  assertSafeToTruncateTestDatabase,
  type TruncateGuardInput,
} from './truncate-guard';

/**
 * The 14 mutable domain tables from the ADR 007 multi-tenant model —
 * every table except `roles` (seeded catalog, never truncated) and
 * Prisma's own `_prisma_migrations`. Physical (`@@map`) names, from
 * apps/api/prisma/schema.prisma. See
 * docs/adr/008-runtime-persistence-and-repositories.md (§7.5) and
 * docs/TARGET_ARCHITECTURE.md (§10).
 */
export const MUTABLE_TEST_DATABASE_TABLES = [
  'users',
  'credentials',
  'auth_identities',
  'user_roles',
  'customer_profiles',
  'agent_profiles',
  'agent_licenses',
  'workspaces',
  'workspace_memberships',
  'workspace_membership_roles',
  'workspace_agents',
  'brokerages',
  'properties',
  'addresses',
] as const;

export interface TruncatableClient {
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
  $executeRawUnsafe(query: string): Promise<number>;
}

export interface TruncateMutableTestDatabaseTablesInput {
  client: TruncatableClient;
  nodeEnv: string | undefined;
  testDatabaseUrl: string;
}

/**
 * Runs the four-check guard (docs/adr/006-persistence-and-local-infrastructure.md,
 * "Guarda de segurança obrigatória") and, only if it passes, issues a
 * single static TRUNCATE covering exactly the 14 mutable domain tables
 * above. `roles` and `_prisma_migrations` are never touched. The SQL is
 * built entirely from the static list above — never from any external or
 * user-provided input.
 */
export async function truncateMutableTestDatabaseTables(
  input: TruncateMutableTestDatabaseTablesInput,
): Promise<void> {
  const guardInput: TruncateGuardInput = {
    nodeEnv: input.nodeEnv,
    testDatabaseUrl: input.testDatabaseUrl,
    queryCurrentDatabase: async () => {
      const rows = await input.client.$queryRawUnsafe<
        { current_database: string }[]
      >('SELECT current_database()');
      return rows[0]?.current_database ?? '';
    },
  };

  await assertSafeToTruncateTestDatabase(guardInput);

  const tableList = MUTABLE_TEST_DATABASE_TABLES.join(', ');
  await input.client.$executeRawUnsafe(
    `TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`,
  );
}
