import { defineConfig } from 'prisma/config';
import { migrations, schema } from './prisma/prisma-config.shared';

/**
 * Schema-only config: used exclusively by `db:validate`/`db:generate`.
 * Deliberately has no `datasource` and never reads `process.env` — schema
 * validation and Client generation never need a live connection string,
 * and must keep working with zero environment variables set (`yarn
 * validate` runs offline, without Docker or a `.env` file). See
 * docs/adr/006-persistence-and-local-infrastructure.md.
 */
export default defineConfig({
  schema,
  migrations: { path: migrations },
});
