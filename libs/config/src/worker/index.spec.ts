import { describe, expect, it } from 'vitest';
import { loadWorkerConfig, WorkerConfigError } from './index';

const VALID_REDIS_URL = 'redis://localhost:6379';

function env(overrides: Record<string, string | undefined> = {}) {
  return {
    REDIS_URL: VALID_REDIS_URL,
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe('loadWorkerConfig', () => {
  it('applies documented defaults when no other env vars are set', () => {
    const config = loadWorkerConfig(env());

    expect(config).toEqual({
      nodeEnv: 'development',
      logLevel: 'info',
      redisUrl: VALID_REDIS_URL,
    });
  });

  it('accepts a fully overridden environment', () => {
    const config = loadWorkerConfig(
      env({ NODE_ENV: 'production', LOG_LEVEL: 'warn' }),
    );

    expect(config).toEqual({
      nodeEnv: 'production',
      logLevel: 'warn',
      redisUrl: VALID_REDIS_URL,
    });
  });

  it('rejects an invalid NODE_ENV', () => {
    expect(() => loadWorkerConfig(env({ NODE_ENV: 'staging' }))).toThrow(
      WorkerConfigError,
    );
  });

  it('rejects an invalid LOG_LEVEL', () => {
    expect(() => loadWorkerConfig(env({ LOG_LEVEL: 'verbose' }))).toThrow(
      WorkerConfigError,
    );
  });

  describe('REDIS_URL', () => {
    it('rejects a missing REDIS_URL', () => {
      expect(() => loadWorkerConfig(env({ REDIS_URL: undefined }))).toThrow(
        WorkerConfigError,
      );
    });

    it('rejects an empty REDIS_URL', () => {
      expect(() => loadWorkerConfig(env({ REDIS_URL: '' }))).toThrow(
        WorkerConfigError,
      );
    });

    it('rejects a REDIS_URL with an invalid protocol', () => {
      expect(() =>
        loadWorkerConfig(env({ REDIS_URL: 'http://localhost:6379' })),
      ).toThrow(WorkerConfigError);
    });

    it('never includes the raw REDIS_URL value in the error message', () => {
      const secretUrl = 'rediss://:super-secret-password@';

      try {
        loadWorkerConfig(env({ REDIS_URL: secretUrl }));
        expect.unreachable('loadWorkerConfig should have thrown');
      } catch (error) {
        expect((error as Error).message).not.toContain('super-secret-password');
        expect((error as Error).message).not.toContain(secretUrl);
      }
    });

    it('accepts both redis:// and rediss:// protocols', () => {
      expect(
        loadWorkerConfig(env({ REDIS_URL: 'redis://localhost:6379' })).redisUrl,
      ).toBe('redis://localhost:6379');
      expect(
        loadWorkerConfig(env({ REDIS_URL: 'rediss://localhost:6380' }))
          .redisUrl,
      ).toBe('rediss://localhost:6380');
    });
  });

  it('never exposes unrelated ServerEnv fields (e.g. DATABASE_URL) on the returned config', () => {
    const config = loadWorkerConfig(
      env({
        DATABASE_URL: 'postgresql://mockp:mockp@localhost:5432/mockp',
        PORT: '3333',
      }),
    );

    expect(Object.keys(config)).toEqual(['nodeEnv', 'logLevel', 'redisUrl']);
  });
});
