import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp } from './support/create-test-app';

describe('Swagger documentation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /docs serves the Swagger UI', async () => {
    const response = await request(app.getHttpServer()).get('/docs');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/html/);
  });

  it('GET /docs-json serves a valid OpenAPI document', async () => {
    const response = await request(app.getHttpServer()).get('/docs-json');

    expect(response.status).toBe(200);
    expect(response.body.openapi).toMatch(/^3\./);
    expect(response.body.info.title).toBe('Mockp API');
  });

  it('documents only the two health endpoints — no test-only or unmatched routes', async () => {
    const response = await request(app.getHttpServer()).get('/docs-json');

    const paths = Object.keys(response.body.paths);

    expect(paths.sort()).toEqual([
      '/api/v1/health/live',
      '/api/v1/health/ready',
    ]);
  });
});
