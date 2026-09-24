import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { Logger } from 'nestjs-pino';
import { AppModule } from '../../src/app/app.module';
import { configureApp } from '../../src/app/configure-app';
import { buildInfraServerConfig } from '../support/infra-server-config';

/**
 * First real-infrastructure HTTP test for readiness (Tarefa 3.4): boots the
 * real `AppModule` against the seeded `mockp_test` database and the real
 * local Redis — no mocks — and confirms `GET /api/v1/health/ready` reflects
 * both dependencies actually being healthy. Only the happy path: failure
 * scenarios (PostgreSQL down, Redis down, both down) are covered
 * deterministically offline in apps/api/test/health.spec.ts — this suite
 * never stops, restarts, or recreates either container. See
 * docs/adr/008-runtime-persistence-and-repositories.md (§7.3/§7.5) for the
 * harness this reuses (apps/api/test/infra/setup.ts truncates mutable
 * tables between tests; this test never writes to either dependency).
 */
describe('Real infrastructure: GET /api/v1/health/ready', () => {
  it('returns 200 with all three checks up against real PostgreSQL/PostGIS and Redis', async () => {
    const config = buildInfraServerConfig();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(config)],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.useLogger(app.get(Logger));
    configureApp(app, config);

    try {
      await app.init();

      const response = await request(app.getHttpServer()).get(
        '/api/v1/health/ready',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ok',
        checks: { application: 'up', database: 'up', redis: 'up' },
      });
    } finally {
      await app.close();
    }
  });
});
