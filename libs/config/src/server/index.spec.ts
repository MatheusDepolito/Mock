import { describe, expect, it } from 'vitest';
import { loadServerConfig, ServerConfigError } from './index';

const VALID_DATABASE_URL = 'postgresql://mockp:mockp@localhost:5432/mockp';
const VALID_REDIS_URL = 'redis://localhost:6379';

/**
 * Every call already carries syntactically valid DATABASE_URL/REDIS_URL —
 * both are mandatory since Tarefa 3.1, with no default value — so tests
 * that aren't specifically exercising those two fields don't need to
 * repeat them. Tests that DO exercise them override or delete the key
 * explicitly (e.g. `env({ DATABASE_URL: undefined })`).
 */
function env(overrides: Record<string, string | undefined> = {}) {
  return {
    DATABASE_URL: VALID_DATABASE_URL,
    REDIS_URL: VALID_REDIS_URL,
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe('loadServerConfig', () => {
  it('applies documented defaults when no other env vars are set', () => {
    const config = loadServerConfig(env());

    expect(config).toEqual({
      nodeEnv: 'development',
      port: 3333,
      host: '0.0.0.0',
      logLevel: 'info',
      corsAllowedOrigins: ['http://localhost:3000'],
      databaseUrl: VALID_DATABASE_URL,
      redisUrl: VALID_REDIS_URL,
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
      databaseUrl: VALID_DATABASE_URL,
      redisUrl: VALID_REDIS_URL,
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

  describe('DATABASE_URL', () => {
    it('rejects a missing DATABASE_URL', () => {
      expect(() => loadServerConfig(env({ DATABASE_URL: undefined }))).toThrow(
        ServerConfigError,
      );
    });

    it('rejects an empty DATABASE_URL', () => {
      expect(() => loadServerConfig(env({ DATABASE_URL: '' }))).toThrow(
        ServerConfigError,
      );
    });

    it('rejects a DATABASE_URL with an invalid protocol', () => {
      expect(() =>
        loadServerConfig(
          env({ DATABASE_URL: 'mysql://mockp:mockp@localhost:3306/mockp' }),
        ),
      ).toThrow(ServerConfigError);
    });

    it('rejects a syntactically invalid URL', () => {
      expect(() =>
        loadServerConfig(env({ DATABASE_URL: 'postgres:// not-a-url' })),
      ).toThrow(ServerConfigError);
    });

    it('rejects a URL with no hostname and no database', () => {
      expect(() =>
        loadServerConfig(env({ DATABASE_URL: 'postgresql://' })),
      ).toThrow(ServerConfigError);
    });

    it('rejects a URL with a hostname but no database in the path', () => {
      expect(() =>
        loadServerConfig(env({ DATABASE_URL: 'postgresql://localhost:5432/' })),
      ).toThrow(ServerConfigError);
    });

    it('never includes the raw DATABASE_URL value in the error message', () => {
      const secretUrl =
        'postgresql://mockp:super-secret-password@localhost:5432/';

      try {
        loadServerConfig(env({ DATABASE_URL: secretUrl }));
        expect.unreachable('loadServerConfig should have thrown');
      } catch (error) {
        expect((error as Error).message).not.toContain('super-secret-password');
        expect((error as Error).message).not.toContain(secretUrl);
      }
    });

    it('accepts both postgresql:// and postgres:// protocols', () => {
      expect(
        loadServerConfig(
          env({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db' }),
        ).databaseUrl,
      ).toBe('postgresql://u:p@localhost:5432/db');
      expect(
        loadServerConfig(
          env({ DATABASE_URL: 'postgres://u:p@localhost:5432/db' }),
        ).databaseUrl,
      ).toBe('postgres://u:p@localhost:5432/db');
    });
  });

  describe('REDIS_URL', () => {
    it('rejects a missing REDIS_URL', () => {
      expect(() => loadServerConfig(env({ REDIS_URL: undefined }))).toThrow(
        ServerConfigError,
      );
    });

    it('rejects an empty REDIS_URL', () => {
      expect(() => loadServerConfig(env({ REDIS_URL: '' }))).toThrow(
        ServerConfigError,
      );
    });

    it('rejects a REDIS_URL with an invalid protocol', () => {
      expect(() =>
        loadServerConfig(env({ REDIS_URL: 'http://localhost:6379' })),
      ).toThrow(ServerConfigError);
    });

    it('rejects a URL with no hostname', () => {
      expect(() => loadServerConfig(env({ REDIS_URL: 'redis://' }))).toThrow(
        ServerConfigError,
      );
    });

    it('rejects a syntactically invalid URL', () => {
      expect(() =>
        loadServerConfig(env({ REDIS_URL: 'rediss:// bad' })),
      ).toThrow(ServerConfigError);
    });

    it('never includes the raw REDIS_URL value in the error message', () => {
      const secretUrl = 'rediss://:super-secret-password@';

      try {
        loadServerConfig(env({ REDIS_URL: secretUrl }));
        expect.unreachable('loadServerConfig should have thrown');
      } catch (error) {
        expect((error as Error).message).not.toContain('super-secret-password');
        expect((error as Error).message).not.toContain(secretUrl);
      }
    });

    it('accepts both redis:// and rediss:// protocols', () => {
      expect(
        loadServerConfig(env({ REDIS_URL: 'redis://localhost:6379' })).redisUrl,
      ).toBe('redis://localhost:6379');
      expect(
        loadServerConfig(env({ REDIS_URL: 'rediss://localhost:6380' }))
          .redisUrl,
      ).toBe('rediss://localhost:6380');
    });
  });

  it('never exposes TEST_DATABASE_URL on the returned config, even when present in the environment', () => {
    const config = loadServerConfig(
      env({
        TEST_DATABASE_URL: 'postgresql://mockp:mockp@localhost:5432/mockp_test',
      }),
    );

    expect(config).not.toHaveProperty('testDatabaseUrl');
    expect(Object.keys(config)).not.toContain('testDatabaseUrl');
    // Presence of TEST_DATABASE_URL in the environment never affects
    // validation success or the value of the unrelated, mandatory fields.
    expect(config.databaseUrl).toBe(VALID_DATABASE_URL);
  });
});
