import { describe, expect, it } from 'vitest';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const service = new HealthService();

  it('reports liveness as ok', () => {
    expect(service.checkLive()).toEqual({ status: 'ok' });
  });

  it('reports readiness with the application check up', () => {
    expect(service.checkReady()).toEqual({
      status: 'ok',
      checks: { application: 'up' },
    });
  });
});
