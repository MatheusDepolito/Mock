import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { HealthService } from './health.service';
import { HealthController } from './health.controller';

function fakeHealthService(overrides: Partial<HealthService> = {}) {
  return {
    checkLive: vi.fn().mockReturnValue({ status: 'ok' }),
    checkReady: vi.fn().mockResolvedValue({
      status: 'ok',
      checks: { application: 'up', database: 'up', redis: 'up' },
    }),
    ...overrides,
  } as unknown as HealthService;
}

describe('HealthController', () => {
  it('delegates liveness to the service', () => {
    const service = fakeHealthService();
    const controller = new HealthController(service);

    expect(controller.live()).toEqual({ status: 'ok' });
    expect(service.checkLive).toHaveBeenCalledTimes(1);
  });

  it('delegates readiness to the service and returns its resolved value unchanged', async () => {
    const service = fakeHealthService();
    const controller = new HealthController(service);

    await expect(controller.ready()).resolves.toEqual({
      status: 'ok',
      checks: { application: 'up', database: 'up', redis: 'up' },
    });
    expect(service.checkReady).toHaveBeenCalledTimes(1);
  });

  it('propagates a readiness failure from the service unchanged, adding no business logic of its own', async () => {
    const error = new ServiceUnavailableException('PostgreSQL is not ready.');
    const service = fakeHealthService({
      checkReady: vi.fn().mockRejectedValue(error),
    });
    const controller = new HealthController(service);

    await expect(controller.ready()).rejects.toBe(error);
  });
});
