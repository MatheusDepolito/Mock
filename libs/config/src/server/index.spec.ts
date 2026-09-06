import { describe, expect, it } from 'vitest';
import { loadServerConfig, ServerConfigError } from './index';

function env(overrides: Record<string, string | undefined> = {}) {
  return { ...overrides } as NodeJS.ProcessEnv;
}

describe('loadServerConfig', () => {
  it('applies documented defaults when no env vars are set', () => {
    const config = loadServerConfig(env());

    expect(config).toEqual({
      nodeEnv: 'development',
      port: 3333,
      host: '0.0.0.0',
      logLevel: 'info',
      corsAllowedOrigins: ['http://localhost:3000'],
      rateLimit: { ttlMs: 60000, limit: 100 },
    });
  });

  it('parses and trims a comma-separated CORS allowlist', () => {
    const config = loadServerConfig(
      env({
        CORS_ALLOWED_ORIGINS: ' https://a.mockp.dev , https://b.mockp.dev ,',
      }),
    );

    expect(config.corsAllowedOrigins).toEqual([
      'https://a.mockp.dev',
      'https://b.mockp.dev',
    ]);
  });

  it('accepts a fully overridden environment', () => {
    const config = loadServerConfig(
      env({
        NODE_ENV: 'production',
        PORT: '8080',
        HOST: '127.0.0.1',
        LOG_LEVEL: 'warn',
        CORS_ALLOWED_ORIGINS: 'https://mockp.dev',
        RATE_LIMIT_TTL_MS: '1000',
        RATE_LIMIT_LIMIT: '5',
      }),
    );

    expect(config).toEqual({
      nodeEnv: 'production',
      port: 8080,
      host: '127.0.0.1',
      logLevel: 'warn',
      corsAllowedOrigins: ['https://mockp.dev'],
      rateLimit: { ttlMs: 1000, limit: 5 },
    });
  });

  it('rejects an invalid NODE_ENV', () => {
    expect(() => loadServerConfig(env({ NODE_ENV: 'staging' }))).toThrow(
      ServerConfigError,
    );
  });

  it('rejects a PORT outside the valid range', () => {
    expect(() => loadServerConfig(env({ PORT: '70000' }))).toThrow(
      ServerConfigError,
    );
    expect(() => loadServerConfig(env({ PORT: '0' }))).toThrow(
      ServerConfigError,
    );
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => loadServerConfig(env({ PORT: 'not-a-number' }))).toThrow(
      ServerConfigError,
    );
  });

  it('rejects an invalid LOG_LEVEL', () => {
    expect(() => loadServerConfig(env({ LOG_LEVEL: 'verbose' }))).toThrow(
      ServerConfigError,
    );
  });

  it('rejects a non-positive RATE_LIMIT_TTL_MS or RATE_LIMIT_LIMIT', () => {
    expect(() => loadServerConfig(env({ RATE_LIMIT_TTL_MS: '0' }))).toThrow(
      ServerConfigError,
    );
    expect(() => loadServerConfig(env({ RATE_LIMIT_LIMIT: '-1' }))).toThrow(
      ServerConfigError,
    );
  });

  it('requires a non-empty CORS_ALLOWED_ORIGINS in production', () => {
    expect(() => loadServerConfig(env({ NODE_ENV: 'production' }))).toThrow(
      ServerConfigError,
    );

    expect(() =>
      loadServerConfig(
        env({ NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: '   ' }),
      ),
    ).toThrow(ServerConfigError);
  });

  it('does not require CORS_ALLOWED_ORIGINS outside production', () => {
    expect(() =>
      loadServerConfig(env({ NODE_ENV: 'development' })),
    ).not.toThrow();
    expect(() => loadServerConfig(env({ NODE_ENV: 'test' }))).not.toThrow();
  });

  it('produces a single, readable error message for multiple issues', () => {
    try {
      loadServerConfig(env({ NODE_ENV: 'bogus', PORT: 'nan' }));
      expect.unreachable('loadServerConfig should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ServerConfigError);
      expect((error as Error).message).toContain('NODE_ENV');
      expect((error as Error).message).toContain('PORT');
    }
  });
});
