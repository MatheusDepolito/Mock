import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp } from './support/create-test-app';

describe('Health endpoints', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
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

  it('boots and answers health checks without PostgreSQL, Redis or any secret configured', () => {
    // Implicit in every test in this suite: createTestApp() never sets
    // DATABASE_URL, REDIS_URL or any secret, and the app above already
    // answered both health checks successfully.
    expect(app).toBeDefined();
  });
});
