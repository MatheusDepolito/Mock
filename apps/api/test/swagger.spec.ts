import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp } from './support/create-test-app';

interface DocResponse {
  content?: Record<string, { schema?: unknown }>;
  headers?: Record<string, { schema?: Record<string, unknown> }>;
}
interface DocOperation {
  operationId: string;
  summary?: string;
  parameters?: Array<{
    name: string;
    in: string;
    required?: boolean;
    schema?: Record<string, unknown>;
  }>;
  responses: Record<string, DocResponse>;
}
interface Doc {
  openapi: string;
  info: { title: string; description: string; version: string };
  paths: Record<string, { get: DocOperation }>;
  components: { schemas: Record<string, Record<string, unknown>> };
}

const PROBLEM_REF = { $ref: '#/components/schemas/ProblemDetailsDto' };
const REQUEST_ID_PATTERN = '^[A-Za-z0-9_-]{1,128}$';

describe('Swagger documentation', () => {
  let app: INestApplication;
  let doc: Doc;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    const response = await request(app.getHttpServer()).get('/docs-json');
    doc = response.body as Doc;
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

  it('documents only the two health endpoints — no test-only or unmatched routes', () => {
    const paths = Object.keys(doc.paths);

    expect(paths.sort()).toEqual([
      '/api/v1/health/live',
      '/api/v1/health/ready',
    ]);
  });

  it('has the exact info block (title, version and a description without phase references)', () => {
    expect(doc.info).toEqual({
      title: 'Mockp API',
      description: 'Mockp platform REST API.',
      version: '1',
      contact: {},
    });
  });

  it('uses the explicit operationIds, without controller or version suffix', () => {
    expect(doc.paths['/api/v1/health/live']?.get.operationId).toBe(
      'health_live',
    );
    expect(doc.paths['/api/v1/health/ready']?.get.operationId).toBe(
      'health_ready',
    );
  });

  it('documents exactly 200 and 500 for live, and exactly 200, 503 and 500 for ready', () => {
    const live = doc.paths['/api/v1/health/live']?.get.responses;
    const ready = doc.paths['/api/v1/health/ready']?.get.responses;

    expect(Object.keys(live ?? {}).sort()).toEqual(['200', '500']);
    expect(Object.keys(ready ?? {}).sort()).toEqual(['200', '500', '503']);
  });

  it('documents 200 as application/json and every error as application/problem+json with the ProblemDetailsDto $ref', () => {
    const operations = Object.values(doc.paths).map((p) => p.get);

    for (const operation of operations) {
      for (const [status, response] of Object.entries(operation.responses)) {
        const contentTypes = Object.keys(response.content ?? {});
        if (status === '200') {
          expect(contentTypes).toEqual(['application/json']);
        } else {
          expect(contentTypes).toEqual(['application/problem+json']);
          expect(
            response.content?.['application/problem+json']?.schema,
          ).toEqual(PROBLEM_REF);
        }
      }
    }
  });

  it('points each 200 at its response DTO', () => {
    const live = doc.paths['/api/v1/health/live']?.get.responses['200'];
    const ready = doc.paths['/api/v1/health/ready']?.get.responses['200'];

    expect(live?.content?.['application/json']?.schema).toEqual({
      $ref: '#/components/schemas/HealthLiveResponseDto',
    });
    expect(ready?.content?.['application/json']?.schema).toEqual({
      $ref: '#/components/schemas/HealthReadyResponseDto',
    });
  });

  it('documents X-Request-Id on every response and as an optional request header', () => {
    for (const { get } of Object.values(doc.paths)) {
      for (const response of Object.values(get.responses)) {
        expect(Object.keys(response.headers ?? {})).toEqual(['X-Request-Id']);
        expect(response.headers?.['X-Request-Id']?.schema).toEqual({
          type: 'string',
          maxLength: 128,
          pattern: REQUEST_ID_PATTERN,
        });
      }

      const requestHeader = get.parameters?.find(
        (p) => p.name === 'X-Request-Id',
      );
      expect(get.parameters).toHaveLength(1);
      expect(requestHeader).toMatchObject({ in: 'header', required: false });
      expect(requestHeader?.schema).toEqual({
        type: 'string',
        maxLength: 128,
        pattern: REQUEST_ID_PATTERN,
      });
    }
  });

  it('defines the ProblemDetailsDto schema with every Problem Details field and the catalog codes', () => {
    const schema = doc.components.schemas['ProblemDetailsDto'] as {
      properties: Record<string, { enum?: string[] }>;
      required: string[];
    };

    expect(Object.keys(schema.properties).sort()).toEqual(
      [
        'code',
        'detail',
        'errors',
        'instance',
        'requestId',
        'status',
        'title',
        'type',
      ].sort(),
    );
    expect(schema.required.sort()).toEqual(
      [
        'code',
        'detail',
        'instance',
        'requestId',
        'status',
        'title',
        'type',
      ].sort(),
    );
    expect(schema.properties['code']?.enum).toEqual([
      'VALIDATION_ERROR',
      'NOT_FOUND',
      'RATE_LIMIT_EXCEEDED',
      'INTERNAL_SERVER_ERROR',
      'SERVICE_UNAVAILABLE',
    ]);
  });

  it('does not document 400, 404 or 429 on the health operations', () => {
    for (const { get } of Object.values(doc.paths)) {
      for (const status of ['400', '404', '429']) {
        expect(get.responses).not.toHaveProperty(status);
      }
    }
  });
});
