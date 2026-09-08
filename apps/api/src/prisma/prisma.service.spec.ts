import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerConfig } from '@mockp/config/server';
// Imported normally — Vitest hoists the `vi.mock`/`vi.hoisted` calls
// below above every import in this file at transform time, so
// `PrismaService` always extends the mocked `PrismaClient` and
// constructs the mocked `PrismaPg`, never the real generated client or
// the real adapter.
import { PrismaService } from './prisma.service';

// Fully offline: both `@prisma/adapter-pg` and the generated
// `PrismaClient` are mocked at the module level below — this suite
// never opens a real socket, never touches Docker/a real PostgreSQL.
// See docs/adr/008-runtime-persistence-and-repositories.md (§2.2/§7.1).
//
// `vi.hoisted` shares spies/classes between the two hoisted `vi.mock`
// factories and the test bodies below — plain module-scope variables
// referenced inside a `vi.mock` factory would be hoisted above their own
// initialization by Vitest and throw at import time.
const {
  prismaPgConstructorSpy,
  prismaClientConstructorSpy,
  connectSpy,
  queryRawSpy,
  disconnectSpy,
  MockPrismaPg,
  MockPrismaClient,
} = vi.hoisted(() => {
  const prismaPgConstructorSpy = vi.fn();
  const prismaClientConstructorSpy = vi.fn();
  const connectSpy = vi.fn().mockResolvedValue(undefined);
  const queryRawSpy = vi.fn().mockResolvedValue(undefined);
  const disconnectSpy = vi.fn().mockResolvedValue(undefined);

  class MockPrismaPg {
    constructor(config: unknown) {
      prismaPgConstructorSpy(config);
    }
  }

  class MockPrismaClient {
    constructor(options: unknown) {
      prismaClientConstructorSpy(options);
    }
    $connect = connectSpy;
    $queryRaw = queryRawSpy;
    $disconnect = disconnectSpy;
  }

  return {
    prismaPgConstructorSpy,
    prismaClientConstructorSpy,
    connectSpy,
    queryRawSpy,
    disconnectSpy,
    MockPrismaPg,
    MockPrismaClient,
  };
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

describe('PrismaService', () => {
  beforeEach(() => {
    prismaPgConstructorSpy.mockClear();
    prismaClientConstructorSpy.mockClear();
    connectSpy.mockClear();
    queryRawSpy.mockClear();
    disconnectSpy.mockReset().mockResolvedValue(undefined);
  });

  describe('construction', () => {
    it('constructs PrismaPg with exactly the databaseUrl from SERVER_CONFIG, and nothing else', () => {
      void new PrismaService(TEST_CONFIG);

      expect(prismaPgConstructorSpy).toHaveBeenCalledTimes(1);
      expect(prismaPgConstructorSpy).toHaveBeenCalledWith({
        connectionString: TEST_CONFIG.databaseUrl,
      });
    });

    it('passes the PrismaPg instance it created to the PrismaClient constructor as `adapter`', () => {
      void new PrismaService(TEST_CONFIG);

      expect(prismaClientConstructorSpy).toHaveBeenCalledTimes(1);
      const options = prismaClientConstructorSpy.mock.calls[0]?.[0] as {
        adapter: unknown;
      };
      expect(options.adapter).toBeInstanceOf(MockPrismaPg);
    });

    it('never calls $connect() when constructed', () => {
      void new PrismaService(TEST_CONFIG);

      expect(connectSpy).not.toHaveBeenCalled();
    });

    it('never issues a query during construction', () => {
      void new PrismaService(TEST_CONFIG);

      expect(queryRawSpy).not.toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy()', () => {
    it('awaits $disconnect() before resolving — not fire-and-forget', async () => {
      const service = new PrismaService(TEST_CONFIG);

      // A deferred promise that stays pending until this test explicitly
      // releases it — a single-microtask promise (e.g.
      // `Promise.resolve().then(...)`) would let onModuleDestroy() look
      // "awaited" even if the implementation called $disconnect() without
      // awaiting it (fire-and-forget), because both would still appear
      // settled after one microtask flush.
      let releaseDisconnect!: () => void;
      const pendingDisconnect = new Promise<void>((resolve) => {
        releaseDisconnect = resolve;
      });
      disconnectSpy.mockReturnValueOnce(pendingDisconnect);

      let destroyResolved = false;
      const destroyPromise = service.onModuleDestroy().then(() => {
        destroyResolved = true;
      });

      // Flush at least one microtask so onModuleDestroy() has had a
      // chance to run past its `await this.$disconnect()` line.
      await Promise.resolve();

      expect(disconnectSpy).toHaveBeenCalledTimes(1);
      // Proves onModuleDestroy() is genuinely blocked on $disconnect():
      // if the implementation ever stopped awaiting it, this would
      // already be true here.
      expect(destroyResolved).toBe(false);

      releaseDisconnect();
      await destroyPromise;

      expect(destroyResolved).toBe(true);
    });

    it('does not silently convert a $disconnect() error into success', async () => {
      const service = new PrismaService(TEST_CONFIG);
      const disconnectError = new Error('disconnect failed');
      disconnectSpy.mockRejectedValueOnce(disconnectError);

      await expect(service.onModuleDestroy()).rejects.toThrow(disconnectError);
    });
  });
});
