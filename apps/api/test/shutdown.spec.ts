import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp } from './support/create-test-app';

describe('Graceful shutdown', () => {
  it('serves requests before close() and resolves close() cleanly', async () => {
    const { app } = await createTestApp();

    const response = await request(app.getHttpServer()).get(
      '/api/v1/health/live',
    );
    expect(response.status).toBe(200);

    await expect(app.close()).resolves.toBeUndefined();
  });
});
