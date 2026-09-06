import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp } from './support/create-test-app';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('X-Request-Id', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('reuses a valid client-supplied request id', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('X-Request-Id', 'client-provided-id_123');

    expect(response.headers['x-request-id']).toBe('client-provided-id_123');
  });

  it('generates a UUID when the header is absent', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/v1/health/live',
    );

    expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
  });

  it('generates a UUID when the header contains disallowed characters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('X-Request-Id', 'not valid! id/with slashes');

    expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
  });

  it('generates a UUID when the header exceeds 128 characters', async () => {
    const tooLong = 'a'.repeat(129);

    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('X-Request-Id', tooLong);

    expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
    expect(response.headers['x-request-id']).not.toBe(tooLong);
  });

  it('accepts a 128-character header at the boundary', async () => {
    const exactlyMax = 'a'.repeat(128);

    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('X-Request-Id', exactlyMax);

    expect(response.headers['x-request-id']).toBe(exactlyMax);
  });

  it('echoes the same request id in the Problem Details body on error', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .set('X-Request-Id', 'error-path-id');

    expect(response.headers['x-request-id']).toBe('error-path-id');
    expect(response.body.requestId).toBe('error-path-id');
  });
});
