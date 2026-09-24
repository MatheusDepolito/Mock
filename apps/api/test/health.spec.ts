import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { createTestApp } from './support/create-test-app';

const PROBLEM_JSON = /application\/problem\+json/;

type FakeTx = { $queryRaw: ReturnType<typeof vi.fn> };

/**
 * These mocks reproduce the exact call shape `HealthService.probeDatabase()`
 * makes — `$transaction(fn, { maxWait, timeout })` invoking `fn` with a
 * transactional client on which `set_config(...)` runs before
 * `PostGIS_Version()` — so this suite exercises the same sequence as
 * production while never opening a real socket (Tarefa 3.4). Real
 * PostgreSQL/PostGIS/Redis are only exercised by
 * apps/api/test/infra/health.infra.spec.ts, under `yarn validate:infra`.
 */
function healthyPrismaMock() {
  const queryRaw = vi
    .fn()
    .mockResolvedValueOnce(undefined) // SELECT set_config(...)
    .mockResolvedValueOnce([{ postgisVersion: '3.6 USE_GEOS=1' }]); // SELECT PostGIS_Version()
  const tx: FakeTx = { $queryRaw: queryRaw };
  return {
    $transaction: vi.fn((fn: (tx: FakeTx) => unknown, options: unknown) => {
      expect(options).toEqual({ maxWait: 1000, timeout: 3000 });
      return fn(tx);
    }),
  };
}

function dbDownPrismaMock() {
  return {
    $transaction: vi.fn().mockRejectedValue(new Error('connection refused')),
  };
}

function dbInvalidResultPrismaMock() {
  const queryRaw = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce([{ postgisVersion: null }]);
  const tx: FakeTx = { $queryRaw: queryRaw };
  return { $transaction: vi.fn((fn: (tx: FakeTx) => unknown) => fn(tx)) };
}

/**
 * `set_config(...)` (the first `$queryRaw` call) resolves normally, but the
 * second call — `PostGIS_Version()` — rejects with a driver-shaped error
 * carrying fictitious sensitive text, simulating a failure that surfaces
 * only after the transaction has already started.
 */
function dbQueryFailsAfterSetConfigMock(sensitiveText: string) {
  const queryRaw = vi
    .fn()
    .mockResolvedValueOnce(undefined) // SELECT set_config(...)
    .mockRejectedValueOnce(new Error(`driver failure: ${sensitiveText}`)); // SELECT PostGIS_Version()
  const tx: FakeTx = { $queryRaw: queryRaw };
  return { $transaction: vi.fn((fn: (tx: FakeTx) => unknown) => fn(tx)) };
}

function healthyRedisMock() {
  return { ping: vi.fn().mockResolvedValue('PONG') };
}

function downRedisMock() {
  return {
    ping: vi.fn().mockRejectedValue(new Error('Redis is unavailable.')),
  };
}

async function bootWith(
  prisma: { $transaction: ReturnType<typeof vi.fn> },
  redis: { ping: ReturnType<typeof vi.fn> },
): Promise<INestApplication> {
  const { app } = await createTestApp({
    overrideProviders: (builder) =>
      builder
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .overrideProvider(RedisService)
        .useValue(redis),
  });
  return app;
}

describe('Health endpoints', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('GET /api/v1/health/live returns the documented shape, independent of any dependency', async () => {
    app = await bootWith(dbDownPrismaMock(), downRedisMock());

    const response = await request(app.getHttpServer()).get(
      '/api/v1/health/live',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('GET /api/v1/health/ready returns 200 with all three checks up when both dependencies are healthy', async () => {
    const prisma = healthyPrismaMock();
    const redis = healthyRedisMock();
    app = await bootWith(prisma, redis);

    const response = await request(app.getHttpServer()).get(
      '/api/v1/health/ready',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      checks: { application: 'up', database: 'up', redis: 'up' },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(redis.ping).toHaveBeenCalledTimes(1);
  });

  it('GET /api/v1/health/ready returns 503 Problem Details identifying PostgreSQL when only the database probe fails', async () => {
    app = await bootWith(dbDownPrismaMock(), healthyRedisMock());
    const clientRequestId = 'health-ready-503-test-id';

    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .set('X-Request-Id', clientRequestId);

    expect(response.status).toBe(503);
    expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(response.headers['x-request-id']).toBe(clientRequestId);
    expect(response.body).toMatchObject({
      type: 'https://api.mockp.dev/problems/service-unavailable',
      title: 'Service Unavailable',
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      detail: 'PostgreSQL is not ready.',
      instance: '/api/v1/health/ready',
      requestId: clientRequestId,
    });
    expect(response.body.checks).toBeUndefined();
  });

  it('GET /api/v1/health/ready returns 503 identifying PostgreSQL when PostGIS_Version() returns no usable result', async () => {
    app = await bootWith(dbInvalidResultPrismaMock(), healthyRedisMock());

    const response = await request(app.getHttpServer()).get(
      '/api/v1/health/ready',
    );

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      detail: 'PostgreSQL is not ready.',
    });
    expect(response.body.checks).toBeUndefined();
  });

  it('GET /api/v1/health/ready returns 503 identifying PostgreSQL when PostGIS_Version() rejects after set_config already succeeded', async () => {
    const sensitiveText = 'password=s3cr3t-fictitious-password@db.internal';
    app = await bootWith(
      dbQueryFailsAfterSetConfigMock(sensitiveText),
      healthyRedisMock(),
    );

    const response = await request(app.getHttpServer()).get(
      '/api/v1/health/ready',
    );

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      detail: 'PostgreSQL is not ready.',
    });
    expect(response.body.checks).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain(sensitiveText);
  });

  it('GET /api/v1/health/ready returns 503 identifying Redis when only the Redis probe fails', async () => {
    app = await bootWith(healthyPrismaMock(), downRedisMock());

    const response = await request(app.getHttpServer()).get(
      '/api/v1/health/ready',
    );

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      detail: 'Redis is not ready.',
    });
    expect(response.body.checks).toBeUndefined();
  });

  it('GET /api/v1/health/ready returns 503 identifying both dependencies when both probes fail', async () => {
    app = await bootWith(dbDownPrismaMock(), downRedisMock());

    const response = await request(app.getHttpServer()).get(
      '/api/v1/health/ready',
    );

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      detail: 'PostgreSQL and Redis are not ready.',
    });
    expect(response.body.checks).toBeUndefined();
  });

  it('never leaks a raw driver error, cause, or connection string in the 503 body', async () => {
    const secretUrl = 'postgresql://mockp:s3cr3t@localhost:5432/mockp_test';
    app = await bootWith(
      {
        $transaction: vi
          .fn()
          .mockRejectedValue(new Error(`connect to ${secretUrl} failed`)),
      },
      healthyRedisMock(),
    );

    const response = await request(app.getHttpServer()).get(
      '/api/v1/health/ready',
    );

    const bodyText = JSON.stringify(response.body);
    expect(bodyText).not.toContain('s3cr3t');
    expect(bodyText).not.toContain(secretUrl);
    expect(bodyText).not.toContain('connection refused');
  });
});
