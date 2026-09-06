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
    // connection with them — no PrismaModule/RedisModule or real client
    // exists yet (that arrives in Tarefas 3.3/3.4).
    expect(config.databaseUrl).toMatch(/^postgres(ql)?:\/\//);
    expect(config.redisUrl).toMatch(/^rediss?:\/\//);
    expect(app).toBeDefined();
  });
});
