import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { createTestApp } from './support/create-test-app';

describe('Rate limiting', () => {
  describe('a route-specific throttle override', () => {
    let app: INestApplication;

    beforeAll(async () => {
      ({ app } = await createTestApp({ includeTestingSupport: true }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns 429 RATE_LIMIT_EXCEEDED once the per-route limit is exceeded', async () => {
      const server = app.getHttpServer();

      // The /__test__/throttled route overrides the default policy down to
      // 2 requests per 2s specifically so this test doesn't need to send
      // hundreds of requests against the (much higher) global default.
      const first = await request(server).get('/api/v1/__test__/throttled');
      const second = await request(server).get('/api/v1/__test__/throttled');
      const third = await request(server).get('/api/v1/__test__/throttled');

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(third.status).toBe(429);
      expect(third.headers['content-type']).toMatch(
        /application\/problem\+json/,
      );
      expect(third.body).toMatchObject({
        type: 'https://api.mockp.dev/problems/rate-limit-exceeded',
        title: 'Too Many Requests',
        status: 429,
        code: 'RATE_LIMIT_EXCEEDED',
      });
    });
  });

  describe('the global default policy and its exemptions', () => {
    let app: INestApplication;

    beforeAll(async () => {
      // GET /api/v1/health/ready now actually calls PrismaService/
      // RedisService (Tarefa 3.4) — mocked healthy here so this suite stays
      // fully offline while still exercising the real @SkipThrottle()
      // exemption below.
      ({ app } = await createTestApp({
        configOverrides: { rateLimit: { limit: 2, ttlMs: 5000 } },
        includeTestingSupport: true,
        overrideProviders: (builder) =>
          builder
            .overrideProvider(PrismaService)
            .useValue({
              $transaction: vi.fn((fn: (tx: unknown) => unknown) =>
                fn({
                  $queryRaw: vi
                    .fn()
                    .mockResolvedValue([{ postgisVersion: '3.6 USE_GEOS=1' }]),
                }),
              ),
            })
            .overrideProvider(RedisService)
            .useValue({ ping: vi.fn().mockResolvedValue('PONG') }),
      }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('applies the low global limit to a route without an override', async () => {
      const server = app.getHttpServer();
      const payload = { name: 'valid-name', email: 'user@example.com' };

      const first = await request(server)
        .post('/api/v1/__test__/validation')
        .send(payload);
      const second = await request(server)
        .post('/api/v1/__test__/validation')
        .send(payload);
      const third = await request(server)
        .post('/api/v1/__test__/validation')
        .send(payload);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(third.status).toBe(429);
    });

    it('never throttles liveness, readiness, Swagger UI or the OpenAPI JSON', async () => {
      const server = app.getHttpServer();
      const routes = [
        '/api/v1/health/live',
        '/api/v1/health/ready',
        '/docs',
        '/docs-json',
      ];

      for (const route of routes) {
        for (let i = 0; i < 5; i += 1) {
          const response = await request(server).get(route);
          expect(response.status).not.toBe(429);
        }
      }
    });
  });
});
