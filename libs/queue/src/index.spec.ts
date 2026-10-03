import { describe, expect, it } from 'vitest';
import {
  SYSTEM_PING_JOB_NAME,
  SYSTEM_PING_JOB_OPTIONS,
  SYSTEM_QUEUE_NAME,
} from './index';

describe('system queue constants', () => {
  it('names the queue and the job', () => {
    expect(SYSTEM_QUEUE_NAME).toBe('system');
    expect(SYSTEM_PING_JOB_NAME).toBe('system.ping');
  });

  it('defines finite retry with backoff, never an infinite retry', () => {
    expect(SYSTEM_PING_JOB_OPTIONS.attempts).toBeGreaterThan(0);
    expect(Number.isFinite(SYSTEM_PING_JOB_OPTIONS.attempts)).toBe(true);
    expect(SYSTEM_PING_JOB_OPTIONS.backoff.type).toBe('exponential');
    expect(SYSTEM_PING_JOB_OPTIONS.backoff.delay).toBeGreaterThan(0);
  });
});
