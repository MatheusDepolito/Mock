import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp } from './support/create-test-app';

const PROBLEM_JSON = /application\/problem\+json/;

describe('Problem Details', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp({ includeTestingSupport: true }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('400 VALIDATION_ERROR groups multiple messages per field', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/__test__/validation')
      .send({ name: 1, email: 'not-an-email' });

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(response.body).toMatchObject({
      type: 'https://api.mockp.dev/problems/validation-error',
      title: 'Validation Failed',
      status: 400,
      code: 'VALIDATION_ERROR',
      instance: '/api/v1/__test__/validation',
    });
    expect(response.body.requestId).toEqual(expect.any(String));
    expect(response.body.errors.name.length).toBeGreaterThanOrEqual(2);
    expect(response.body.errors.email).toHaveLength(1);
  });

  it('400 also reports an unknown property when forbidNonWhitelisted applies', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/__test__/validation')
      .send({ name: 'valid-name', email: 'user@example.com', extra: 'nope' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(response.body.errors)).toContain('extra');
  });

  it('accepts a fully valid payload', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/__test__/validation')
      .send({ name: 'valid-name', email: 'user@example.com' });

    expect(response.status).toBe(201);
  });

  it('404 NOT_FOUND for an unmatched route, without leaking a stack trace', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/v1/this-route-does-not-exist',
    );

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(response.body).toMatchObject({
      type: 'https://api.mockp.dev/problems/not-found',
      title: 'Not Found',
      status: 404,
      code: 'NOT_FOUND',
      instance: '/api/v1/this-route-does-not-exist',
    });
    expect(response.body.detail).not.toMatch(/at .*\(.*:\d+:\d+\)/);
  });

  it('instance carries only the path, never the query string', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/v1/this-route-does-not-exist?secret=abc&other=1',
    );

    expect(response.body.instance).toBe('/api/v1/this-route-does-not-exist');
  });

  it('500 INTERNAL_SERVER_ERROR hides the real error message and stack', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/v1/__test__/boom',
    );

    expect(response.status).toBe(500);
    expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(response.body).toMatchObject({
      type: 'https://api.mockp.dev/problems/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(response.body.detail).not.toContain('boom');
    expect(JSON.stringify(response.body)).not.toMatch(/at .*:\d+:\d+/);
  });

  it('503 SERVICE_UNAVAILABLE surfaces a dependency-not-ready detail', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/v1/__test__/unavailable',
    );

    expect(response.status).toBe(503);
    expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(response.body).toMatchObject({
      type: 'https://api.mockp.dev/problems/service-unavailable',
      title: 'Service Unavailable',
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
  });
});
