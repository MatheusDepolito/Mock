import { defineConfig } from 'prisma/config';
import {
  migrations,
  requireDatabaseUrl,
  schema,
  seed,
} from './prisma/prisma-config.shared';

/**
 * Used by `db:migrate:dev`, `db:migrate:deploy` and `db:seed` — all
 * against `mockp`, the local development database. `requireDatabaseUrl`
 * throws immediately if `DATABASE_URL` is missing/empty, before any
 * connection attempt — never a fallback connection string. See
 * docs/adr/006-persistence-and-local-infrastructure.md.
 */
export default defineConfig({
  schema,
  datasource: { url: requireDatabaseUrl('DATABASE_URL') },
  // The explicit `DATABASE_URL` argument tells seed.ts exactly which
  // variable to use — it never infers this from which one is set.
  migrations: { path: migrations, seed: `tsx ${seed} DATABASE_URL` },
});
