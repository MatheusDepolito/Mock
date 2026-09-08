import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import type { ServerConfig } from '@mockp/config/server';
import { RuntimeConfigModule } from '../common/runtime-config.module';
// Imported normally — Vitest hoists the `vi.mock`/`vi.hoisted` calls
// below above every import in this file at transform time.
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';

// Fully offline — `@prisma/adapter-pg` and the generated `PrismaClient`
// are mocked below to isolate exclusively PrismaModule's DI contract
// (providing/exporting PrismaService). Construction of the real
// generated client stays lazy regardless (see prisma.service.ts/
// prisma.service.spec.ts) — the proof that the real AppModule
// initializes and closes without PostgreSQL reachable belongs to the 34
// existing offline integration tests (apps/api/test/*.spec.ts), not to
// this unit-level module test. No real connection is made by any test
// in this file. See
// docs/adr/008-runtime-persistence-and-repositories.md (§2.2/§7.1).
const { MockPrismaPg, MockPrismaClient } = vi.hoisted(() => {
  class MockPrismaPg {}

  class MockPrismaClient {
    $disconnect = vi.fn().mockResolvedValue(undefined);
  }

  return { MockPrismaPg, MockPrismaClient };
});

vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: MockPrismaPg }));
vi.mock('../generated/prisma-client/client', () => ({
  PrismaClient: MockPrismaClient,
}));

const TEST_CONFIG: ServerConfig = {
  nodeEnv: 'test',
  port: 0,
  host: '127.0.0.1',
  logLevel: 'silent',
  corsAllowedOrigins: ['https://example.test'],
  databaseUrl: 'postgresql://mockp:mockp@localhost:5432/mockp_test',
  redisUrl: 'redis://localhost:6379',
  rateLimit: { ttlMs: 1000, limit: 10 },
};

// A consumer that injects PrismaService without ever importing it as its
// own provider — the only way it can resolve is through PrismaModule's
// `exports`. This is what makes the test below a real proof of export:
// removing `exports: [PrismaService]` from PrismaModule would make
// PrismaConsumerModule.compile() fail to resolve PrismaService, not
// silently succeed the way a root-level `moduleRef.get(PrismaService)`
// lookup would (Nest's default, non-strict lookup can find a provider
// nested inside an imported module even when that module never exports
// it).
@Injectable()
class PrismaConsumer {
  constructor(public readonly prismaService: PrismaService) {}
}

@Module({
  imports: [PrismaModule],
  providers: [PrismaConsumer],
})
class PrismaConsumerModule {}

describe('PrismaModule', () => {
  it('exports PrismaService: a module that only imports PrismaModule can inject it', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RuntimeConfigModule.forRoot(TEST_CONFIG), PrismaConsumerModule],
    }).compile();

    try {
      const consumer = moduleRef.get(PrismaConsumer);
      expect(consumer.prismaService).toBeInstanceOf(PrismaService);
    } finally {
      await moduleRef.close();
    }
  });
});
