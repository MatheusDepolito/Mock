/**
 * Pure argument parsing for `seed.ts` — kept in its own module (no
 * `main()`, no side effects) so it can be imported by tests without
 * running the seed itself. `seed.ts` is invoked as
 * `tsx prisma/seed.ts DATABASE_URL` / `tsx prisma/seed.ts TEST_DATABASE_URL`
 * by `prisma.migrate.config.ts`/`prisma.test.config.ts` respectively —
 * the caller always states explicitly which variable to use; the seed
 * itself never guesses based on which one happens to be set.
 */
export type SeedTargetEnvVar = 'DATABASE_URL' | 'TEST_DATABASE_URL';

const ALLOWED_TARGETS: readonly SeedTargetEnvVar[] = [
  'DATABASE_URL',
  'TEST_DATABASE_URL',
];

function isAllowedTarget(value: string): value is SeedTargetEnvVar {
  return (ALLOWED_TARGETS as readonly string[]).includes(value);
}

/**
 * Parses the seed script's CLI arguments into exactly one allowed
 * environment variable name. Throws for anything else: no argument, more
 * than one argument, or an argument that isn't `DATABASE_URL`/
 * `TEST_DATABASE_URL`. Never reads `process.env` itself — selection is a
 * pure function of the arguments given.
 */
export function selectSeedEnvVar(args: readonly string[]): SeedTargetEnvVar {
  if (args.length !== 1) {
    throw new Error(
      `Expected exactly one argument (DATABASE_URL or TEST_DATABASE_URL), got ${args.length}.`,
    );
  }

  const [arg] = args as [string];

  if (!isAllowedTarget(arg)) {
    // Deliberately a fixed message — never interpolates the received
    // argument, which could itself be (or contain) a connection string.
    throw new Error(
      'Unknown seed target. Expected DATABASE_URL or TEST_DATABASE_URL.',
    );
  }

  return arg;
}
