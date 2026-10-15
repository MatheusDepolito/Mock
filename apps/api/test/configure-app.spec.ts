import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app/app.module';
import { applyHttpSetup } from '../src/app/configure-app';
import { createSwaggerDocument } from '../src/app/swagger';
import { createTestApp, TEST_SERVER_CONFIG } from './support/create-test-app';

describe('createSwaggerDocument', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the exact document the running API serves at /docs-json', async () => {
    const served = await request(app.getHttpServer()).get('/docs-json');

    expect(served.status).toBe(200);
    // JSON round-trip: the served body is plain JSON, the in-memory
    // document may hold `undefined` values that JSON drops.
    expect(JSON.parse(JSON.stringify(createSwaggerDocument(app)))).toEqual(
      served.body,
    );
  });

  it('carries the current title, version and description, and only the two health paths', () => {
    const document = createSwaggerDocument(app);

    expect(document.openapi).toMatch(/^3\./);
    expect(document.info).toEqual({
      title: 'Mockp API',
      description: 'Mockp platform REST API.',
      version: '1',
      contact: {},
    });
    expect(Object.keys(document.paths).sort()).toEqual([
      '/api/v1/health/live',
      '/api/v1/health/ready',
    ]);
  });

  it('is repeatable: two builds from the same app are identical', () => {
    expect(JSON.stringify(createSwaggerDocument(app))).toBe(
      JSON.stringify(createSwaggerDocument(app)),
    );
  });
});

describe('applyHttpSetup (without Swagger)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(TEST_SERVER_CONFIG)],
    }).compile();
    app = moduleRef.createNestApplication();
    applyHttpSetup(app, TEST_SERVER_CONFIG);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('applies the request id middleware, Helmet, the /api prefix and URI versioning', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/v1/health/live',
    );

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('does not mount Swagger UI or /docs-json by itself', async () => {
    const ui = await request(app.getHttpServer()).get('/docs');
    const json = await request(app.getHttpServer()).get('/docs-json');

    expect(ui.status).toBe(404);
    expect(json.status).toBe(404);
  });

  it('forms the public paths that createSwaggerDocument documents, without mounting anything', async () => {
    const document = createSwaggerDocument(app);

    expect(Object.keys(document.paths).sort()).toEqual([
      '/api/v1/health/live',
      '/api/v1/health/ready',
    ]);
    // Creating the document is pure: it still does not mount /docs-json.
    const json = await request(app.getHttpServer()).get('/docs-json');
    expect(json.status).toBe(404);
  });
});
