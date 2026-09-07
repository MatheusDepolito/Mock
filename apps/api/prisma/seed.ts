import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, RoleName } from '../src/generated/prisma-client/client';
import { requireDatabaseUrl } from './prisma-config.shared';
import { selectSeedEnvVar } from './seed-target';

/**
 * Deterministic, fixed and versioned UUIDs for the two global roles —
 * never randomly generated, so re-running the seed (or reading these ids
 * from application code before real authentication exists) always yields
 * the same identifiers. `Role.id` has no database default (see
 * `schema.prisma`) — an explicit `id` is mandatory on every `create`
 * below, there is no generated fallback to rely on. `AGENT` and
 * `MANAGER` are no longer global roles (they are now contextual to a
 * workspace, via `WorkspaceMembershipRole`) — their old catalog ids
 * (`...002`/`...003`) are not reused for anything else. See
 * docs/adr/007-multi-tenant-workspace-foundation.md ("Seed", "Papéis
 * globais reduzidos").
 */
const ROLE_IDS: Record<RoleName, string> = {
  CUSTOMER: '00000000-0000-4000-8000-000000000001',
  ADMIN: '00000000-0000-4000-8000-000000000004',
};

async function main(): Promise<void> {
  // The caller states explicitly which variable to use as a CLI argument
  // (`prisma.migrate.config.ts` passes `DATABASE_URL`,
  // `prisma.test.config.ts` passes `TEST_DATABASE_URL`) — this never
  // guesses based on which of the two happens to be set in the
  // environment, even when both are present simultaneously.
  const envVarName = selectSeedEnvVar(process.argv.slice(2));
  const adapter = new PrismaPg(requireDatabaseUrl(envVarName));
  const prisma = new PrismaClient({ adapter });

  try {
    // Upsert by `name` (the unique catalog key): running this any number
    // of times never creates a duplicate, and each role keeps its fixed
    // id — no user, brokerage, property or any other data is seeded here.
    for (const [name, id] of Object.entries(ROLE_IDS) as [RoleName, string][]) {
      await prisma.role.upsert({
        where: { name },
        update: {},
        create: { id, name },
      });
    }

    const count = await prisma.role.count();
    console.log(`Seed complete: ${count} role(s) in the catalog.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exitCode = 1;
});
