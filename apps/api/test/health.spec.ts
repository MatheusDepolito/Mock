import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { ServerConfig } from '@mockp/config/server';
import { createTestApp } from './support/create-test-app';

describe('Health endpoints', () => {
  let app: INestApplication;
  let config: ServerConfig;

  beforeAll(async () => {
    ({ app, config } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health/live returns the documented shape', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/v1/health/live',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('GET /api/v1/health/ready returns the documented shape', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/v1/health/ready',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      checks: { application: 'up' },
    });
  });

  it('carries valid databaseUrl/redisUrl in ServerConfig, and neither is dialed by the app yet', () => {
    // This does NOT prove PostgreSQL/Redis are unreachable — no socket is
    // ever opened or probed here, on purpose. It proves only what Tarefa
    // 3.1 actually changed: ServerConfig.databaseUrl/redisUrl are
    // mandatory and well-formed (TEST_SERVER_CONFIG in
    // apps/api/test/support/create-test-app.ts carries syntactically valid
    // values for both), and that the app still boots and answers both
    // health checks above without any code attempting to open a
    // connection with them. As of Tarefa 3.3.1, RedisModule/RedisService
    // do exist and are part of AppModule — the client is constructed with
    // `lazyConnect: true`, and no endpoint/test in this suite ever calls
    // RedisService.ping(), so constructing it never opens a socket.
    // As of Tarefa 3.3.2, PrismaModule/PrismaService also exist and are
    // part of AppModule — PrismaService extends the generated
    // PrismaClient constructed with a PrismaPg adapter, but no test in
    // this suite ever issues a query, so constructing it never opens a
    // socket either. Real readiness (actually probing PostgreSQL/Redis)
    // continues to be Tarefa 3.4.
    expect(config.databaseUrl).toMatch(/^postgres(ql)?:\/\//);
    expect(config.redisUrl).toMatch(/^rediss?:\/\//);
    expect(app).toBeDefined();
  });
});
