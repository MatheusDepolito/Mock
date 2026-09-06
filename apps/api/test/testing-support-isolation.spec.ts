import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp } from './support/create-test-app';

/**
 * Proves that `nodeEnv: 'test'` alone does not expose the test-only
 * `/__test__/*` routes. AppModule (apps/api/src/app/app.module.ts) never
 * imports TestingModule itself — only a harness that explicitly opts in
 * via `includeTestingSupport` does (see create-test-app.ts). Here we build
 * the app with `nodeEnv: 'test'` but WITHOUT that opt-in, and confirm the
 * route is simply absent.
 */
describe('TestingModule isolation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp({ includeTestingSupport: false }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('does not expose /__test__/validation when nodeEnv is test but TestingModule was not opted into', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/__test__/validation')
      .send({ name: 'valid-name', email: 'user@example.com' });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });

  it('does not expose any other /__test__/* route either', async () => {
    const server = app.getHttpServer();

    const boom = await request(server).get('/api/v1/__test__/boom');
    const throttled = await request(server).get('/api/v1/__test__/throttled');
    const unavailable = await request(server).get(
      '/api/v1/__test__/unavailable',
    );

    expect(boom.status).toBe(404);
    expect(throttled.status).toBe(404);
    expect(unavailable.status).toBe(404);
  });
});
