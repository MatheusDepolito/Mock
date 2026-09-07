import { defineConfig } from 'prisma/config';
import {
  migrations,
  requireDatabaseUrl,
  schema,
  seed,
} from './prisma/prisma-config.shared';

/**
 * Used by `db:migrate:deploy:test` and `db:seed:test` — both against
 * `mockp_test`, the dedicated test database. Same structure as
 * `prisma.migrate.config.ts`, reading `TEST_DATABASE_URL` exclusively
 * (never `DATABASE_URL`). See
 * docs/adr/006-persistence-and-local-infrastructure.md.
 */
export default defineConfig({
  schema,
  datasource: { url: requireDatabaseUrl('TEST_DATABASE_URL') },
  // The explicit `TEST_DATABASE_URL` argument tells seed.ts exactly which
  // variable to use — it never infers this from which one is set.
  migrations: { path: migrations, seed: `tsx ${seed} TEST_DATABASE_URL` },
});
