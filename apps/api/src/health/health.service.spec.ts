import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import { HealthService } from './health.service';

type FakeTx = { $queryRaw: ReturnType<typeof vi.fn> };

function healthyPrisma(): PrismaService {
  const queryRaw = vi
    .fn()
    .mockResolvedValueOnce(undefined) // SELECT set_config(...)
    .mockResolvedValueOnce([{ postgisVersion: '3.6 USE_GEOS=1' }]); // SELECT PostGIS_Version()
  const tx: FakeTx = { $queryRaw: queryRaw };
  return {
    $transaction: vi.fn((fn: (tx: FakeTx) => unknown) => fn(tx)),
  } as unknown as PrismaService;
}

function dbDownPrisma(): PrismaService {
  return {
    $transaction: vi.fn().mockRejectedValue(new Error('connection refused')),
  } as unknown as PrismaService;
}

function dbInvalidResultPrisma(): PrismaService {
  const queryRaw = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce([{ postgisVersion: null }]);
  const tx: FakeTx = { $queryRaw: queryRaw };
  return {
    $transaction: vi.fn((fn: (tx: FakeTx) => unknown) => fn(tx)),
  } as unknown as PrismaService;
}

function healthyRedis(): RedisService {
  return { ping: vi.fn().mockResolvedValue('PONG') } as unknown as RedisService;
}

function downRedis(): RedisService {
  return {
    ping: vi.fn().mockRejectedValue(new Error('Redis is unavailable.')),
  } as unknown as RedisService;
}

describe('HealthService', () => {
  it('reports liveness as ok without touching any dependency', () => {
    const prisma = dbDownPrisma();
    const redis = downRedis();
    const service = new HealthService(prisma, redis);

    expect(service.checkLive()).toEqual({ status: 'ok' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(redis.ping).not.toHaveBeenCalled();
  });

  it('reports readiness with all three checks up when both dependencies are healthy', async () => {
    const service = new HealthService(healthyPrisma(), healthyRedis());

    await expect(service.checkReady()).resolves.toEqual({
      status: 'ok',
      checks: { application: 'up', database: 'up', redis: 'up' },
    });
  });

  it('passes the approved maxWait/timeout options to $transaction', async () => {
    const prisma = healthyPrisma();
    const service = new HealthService(prisma, healthyRedis());

    await service.checkReady();

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 1000,
      timeout: 3000,
    });
  });

  it('runs set_config before PostGIS_Version() in the same transaction', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ postgisVersion: '3.6 USE_GEOS=1' }]);
    const tx: FakeTx = { $queryRaw: queryRaw };
    const prisma = {
      $transaction: vi.fn((fn: (tx: FakeTx) => unknown) => fn(tx)),
    } as unknown as PrismaService;
    const service = new HealthService(prisma, healthyRedis());

    await service.checkReady();

    expect(queryRaw).toHaveBeenCalledTimes(2);
    const [firstCallArgs] = queryRaw.mock.calls[0] as [TemplateStringsArray];
    expect(firstCallArgs[0]).toContain('set_config');
    const [secondCallArgs] = queryRaw.mock.calls[1] as [TemplateStringsArray];
    expect(secondCallArgs.join('')).toContain('PostGIS_Version');
  });

  it('throws 503 identifying PostgreSQL when only the database probe fails', async () => {
    const service = new HealthService(dbDownPrisma(), healthyRedis());

    await expect(service.checkReady()).rejects.toThrow(
      new ServiceUnavailableException('PostgreSQL is not ready.'),
    );
  });

  it('throws 503 identifying PostgreSQL when PostGIS_Version() returns no usable result', async () => {
    const service = new HealthService(dbInvalidResultPrisma(), healthyRedis());

    await expect(service.checkReady()).rejects.toThrow(
      new ServiceUnavailableException('PostgreSQL is not ready.'),
    );
  });

  it('throws 503 identifying Redis when only the Redis probe fails', async () => {
    const service = new HealthService(healthyPrisma(), downRedis());

    await expect(service.checkReady()).rejects.toThrow(
      new ServiceUnavailableException('Redis is not ready.'),
    );
  });

  it('throws 503 identifying both dependencies when both probes fail', async () => {
    const service = new HealthService(dbDownPrisma(), downRedis());

    await expect(service.checkReady()).rejects.toThrow(
      new ServiceUnavailableException('PostgreSQL and Redis are not ready.'),
    );
  });

  it('logs only the logical check name on failure — never the raw error, cause, or driver message', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const secretUrl = 'postgresql://mockp:s3cr3t@localhost:5432/mockp_test';
    const prisma = {
      $transaction: vi
        .fn()
        .mockRejectedValue(new Error(`connect to ${secretUrl} failed`)),
    } as unknown as PrismaService;
    const service = new HealthService(prisma, downRedis());

    await service.checkReady().catch(() => undefined);

    expect(warnSpy).toHaveBeenCalledWith('Readiness probe failed', {
      check: 'database',
    });
    expect(warnSpy).toHaveBeenCalledWith('Readiness probe failed', {
      check: 'redis',
    });
    const loggedText = warnSpy.mock.calls
      .map((call) => call.map(String).join(' '))
      .join(' | ');
    expect(loggedText).not.toContain('s3cr3t');
    expect(loggedText).not.toContain(secretUrl);
    warnSpy.mockRestore();
  });
});
