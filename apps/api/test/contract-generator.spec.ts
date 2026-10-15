import net from 'node:net';
import tls from 'node:tls';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { buildOpenApiDocument } from '../src/contract/build-openapi-document';
import { serializeOpenApi } from '../src/contract/serialize-openapi';
import { HealthService } from '../src/health/health.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { createTestApp } from './support/create-test-app';

describe('contract generator', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs under a transformer that emits decorator metadata (constructor injection works in tests)', () => {
    // The test app is a real, non-preview Nest app: HealthService only gets
    // its dependencies if Vitest's transformer emits `design:paramtypes`.
    const health = app.get(HealthService) as unknown as {
      prisma: unknown;
      redis: unknown;
    };

    // Compared as booleans/identity: Vitest's failure printer recurses on a
    // Prisma client instance, and `instanceof PrismaService` is false even
    // for the real one (PrismaClient wraps itself in a Proxy). Identity with
    // the instance resolved by token is the reliable check.
    expect(health.prisma !== undefined).toBe(true);
    expect(health.redis !== undefined).toBe(true);
    expect(Object.is(health.prisma, app.get(PrismaService))).toBe(true);
    expect(Object.is(health.redis, app.get(RedisService))).toBe(true);
  });

  it('generates, byte for byte, the same document the running API serves at /docs-json', async () => {
    const served = await request(app.getHttpServer()).get('/docs-json');
    expect(served.status).toBe(200);

    const generated = serializeOpenApi(await buildOpenApiDocument());

    expect(generated).toBe(serializeOpenApi(served.body));
  });

  it('opens no network connection while building the document', async () => {
    const socketConnect = vi.spyOn(net.Socket.prototype, 'connect');
    const netConnect = vi.spyOn(net, 'connect');
    const tlsConnect = vi.spyOn(tls, 'connect');

    try {
      await buildOpenApiDocument();

      expect(socketConnect).not.toHaveBeenCalled();
      expect(netConnect).not.toHaveBeenCalled();
      expect(tlsConnect).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('is deterministic: two generations in the same process give identical bytes', async () => {
    const first = serializeOpenApi(await buildOpenApiDocument());
    const second = serializeOpenApi(await buildOpenApiDocument());

    expect(Buffer.from(first, 'utf8').equals(Buffer.from(second, 'utf8'))).toBe(
      true,
    );
  });

  it('documents exactly the two health paths, with no servers and no date/time fields', async () => {
    const document = await buildOpenApiDocument();
    const text = serializeOpenApi(document);

    expect(Object.keys(document.paths).sort()).toEqual([
      '/api/v1/health/live',
      '/api/v1/health/ready',
    ]);
    expect(document).not.toHaveProperty('servers.0');
    expect(JSON.parse(text)).not.toHaveProperty('servers.0');
    expect(text).not.toMatch(/"(date|time|timestamp|generatedAt|createdAt)"/i);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });
});
