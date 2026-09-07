import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  migrations,
  requireDatabaseUrl,
  schema,
  seed,
} from './prisma-config.shared';

const MANAGED_KEYS = ['DATABASE_URL', 'TEST_DATABASE_URL'] as const;

describe('prisma-config.shared', () => {
  let originalValues: Record<string, string | undefined>;

  beforeEach(() => {
    // Never connects to a database — only exercises pure env-var reads, so
    // isolating process.env here is enough (no network, no adapter).
    originalValues = Object.fromEntries(
      MANAGED_KEYS.map((key) => [key, process.env[key]]),
    );
    for (const key of MANAGED_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of MANAGED_KEYS) {
      if (originalValues[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValues[key];
      }
    }
  });

  describe('paths', () => {
    it('exposes schema, migrations and seed paths relative to apps/api', () => {
      expect(schema).toBe('prisma/schema.prisma');
      expect(migrations).toBe('prisma/migrations');
      expect(seed).toBe('prisma/seed.ts');
    });
  });

  describe('requireDatabaseUrl', () => {
    it('rejects a missing DATABASE_URL', () => {
      expect(() => requireDatabaseUrl('DATABASE_URL')).toThrow(/DATABASE_URL/);
    });

    it('rejects an empty DATABASE_URL', () => {
      process.env['DATABASE_URL'] = '';
      expect(() => requireDatabaseUrl('DATABASE_URL')).toThrow(/DATABASE_URL/);
    });

    it('rejects a whitespace-only DATABASE_URL', () => {
      process.env['DATABASE_URL'] = '   ';
      expect(() => requireDatabaseUrl('DATABASE_URL')).toThrow(/DATABASE_URL/);
    });

    it('rejects a missing TEST_DATABASE_URL', () => {
      expect(() => requireDatabaseUrl('TEST_DATABASE_URL')).toThrow(
        /TEST_DATABASE_URL/,
      );
    });

    it('rejects an empty TEST_DATABASE_URL', () => {
      process.env['TEST_DATABASE_URL'] = '';
      expect(() => requireDatabaseUrl('TEST_DATABASE_URL')).toThrow(
        /TEST_DATABASE_URL/,
      );
    });

    it('returns the exact DATABASE_URL value when present', () => {
      process.env['DATABASE_URL'] =
        'postgresql://mockp:mockp@localhost:5432/mockp';

      expect(requireDatabaseUrl('DATABASE_URL')).toBe(
        'postgresql://mockp:mockp@localhost:5432/mockp',
      );
    });

    it('returns the exact TEST_DATABASE_URL value when present, independently of DATABASE_URL', () => {
      process.env['DATABASE_URL'] =
        'postgresql://mockp:mockp@localhost:5432/mockp';
      process.env['TEST_DATABASE_URL'] =
        'postgresql://mockp:mockp@localhost:5432/mockp_test';

      expect(requireDatabaseUrl('TEST_DATABASE_URL')).toBe(
        'postgresql://mockp:mockp@localhost:5432/mockp_test',
      );
      expect(requireDatabaseUrl('DATABASE_URL')).toBe(
        'postgresql://mockp:mockp@localhost:5432/mockp',
      );
    });

    it('never includes the (potentially credential-bearing) value in the error message', () => {
      // Never set — the point is that the error message can only ever
      // mention the variable NAME, never a value, because no value is
      // interpolated into the message in the first place.
      try {
        requireDatabaseUrl('DATABASE_URL');
        expect.unreachable('requireDatabaseUrl should have thrown');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('DATABASE_URL');
        expect(message).not.toMatch(/:\/\//);
        expect(message).not.toContain('mockp');
      }
    });
  });

  describe('schema-only config (prisma.config.ts)', () => {
    it('loads with no DATABASE_URL, TEST_DATABASE_URL or REDIS_URL set', async () => {
      delete process.env['REDIS_URL'];

      const { default: config } = await import('../prisma.config');

      expect(config.schema).toBe('prisma/schema.prisma');
      expect(config.migrations?.path).toBe('prisma/migrations');
      // Deliberately schema-only: no datasource is configured, so no
      // connection string is ever required to load this file.
      expect(config.datasource).toBeUndefined();
    });
  });
});
