import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  const controller = new HealthController(new HealthService());

  it('delegates liveness to the service', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('delegates readiness to the service', () => {
    expect(controller.ready()).toEqual({
      status: 'ok',
      checks: { application: 'up' },
    });
  });
});
