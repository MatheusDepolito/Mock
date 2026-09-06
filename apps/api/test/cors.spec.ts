import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import {
  ALLOWED_TEST_ORIGIN,
  DISALLOWED_TEST_ORIGIN,
  createTestApp,
} from './support/create-test-app';

describe('CORS', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns Access-Control-Allow-Origin for an allowed origin', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('Origin', ALLOWED_TEST_ORIGIN);

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(
      ALLOWED_TEST_ORIGIN,
    );
  });

  it('does not return Access-Control-Allow-Origin for a disallowed origin', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('Origin', DISALLOWED_TEST_ORIGIN);

    // The request itself is not rejected — only the CORS header is withheld,
    // which is what actually blocks the browser from reading the response.
    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('serves requests with no Origin header at all', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/v1/health/live',
    );

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
