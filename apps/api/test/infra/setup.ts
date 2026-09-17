import { beforeEach } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { buildInfraServerConfig } from '../support/infra-server-config';
import { truncateMutableTestDatabaseTables } from '../support/truncate-mutable-tables';

/**
 * Runs before every test in apps/api/test/infra/ — re-executes the
 * four-check guard (docs/adr/006-persistence-and-local-infrastructure.md,
 * "Guarda de segurança obrigatória") on every single call, then truncates
 * the 14 mutable domain tables. `roles` and `_prisma_migrations` are
 * never touched — see
 * docs/adr/008-runtime-persistence-and-repositories.md (§7.5). A fresh
 * `PrismaService` is created and disconnected for each call; this file
 * never keeps a shared connection open across tests.
 */
beforeEach(async () => {
  const config = buildInfraServerConfig();
  const prisma = new PrismaService(config);
  try {
    await truncateMutableTestDatabaseTables({
      client: prisma,
      nodeEnv: config.nodeEnv,
      testDatabaseUrl: config.databaseUrl,
    });
  } finally {
    await prisma.onModuleDestroy();
  }
});
