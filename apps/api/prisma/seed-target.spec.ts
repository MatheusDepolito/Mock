import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { selectSeedEnvVar } from './seed-target';

const MANAGED_KEYS = ['DATABASE_URL', 'TEST_DATABASE_URL'] as const;

describe('selectSeedEnvVar', () => {
  let originalValues: Record<string, string | undefined>;

  beforeEach(() => {
    originalValues = Object.fromEntries(
      MANAGED_KEYS.map((key) => [key, process.env[key]]),
    );
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

  it('selects DATABASE_URL when given as the sole argument', () => {
    expect(selectSeedEnvVar(['DATABASE_URL'])).toBe('DATABASE_URL');
  });

  it('selects TEST_DATABASE_URL when given as the sole argument', () => {
    expect(selectSeedEnvVar(['TEST_DATABASE_URL'])).toBe('TEST_DATABASE_URL');
  });

  it('never prefers one variable over the other based on what is set in the environment', () => {
    // Both present simultaneously — selection must depend only on the
    // argument, never on which of the two env vars happens to exist.
    process.env['DATABASE_URL'] =
      'postgresql://mockp:mockp@localhost:5432/mockp';
    process.env['TEST_DATABASE_URL'] =
      'postgresql://mockp:mockp@localhost:5432/mockp_test';

    expect(selectSeedEnvVar(['DATABASE_URL'])).toBe('DATABASE_URL');
    expect(selectSeedEnvVar(['TEST_DATABASE_URL'])).toBe('TEST_DATABASE_URL');
  });

  it('rejects a missing argument', () => {
    expect(() => selectSeedEnvVar([])).toThrow(/Expected exactly one argument/);
  });

  it('rejects an unknown argument', () => {
    expect(() => selectSeedEnvVar(['REDIS_URL'])).toThrow(
      'Unknown seed target. Expected DATABASE_URL or TEST_DATABASE_URL.',
    );
  });

  it('rejects additional arguments', () => {
    expect(() =>
      selectSeedEnvVar(['DATABASE_URL', 'TEST_DATABASE_URL']),
    ).toThrow(/Expected exactly one argument/);
  });

  it('never includes a URL or credential in its error messages, even when the argument itself is one', () => {
    // The dangerous case: someone passes a connection string as the
    // argument itself (not via process.env) — the error message must
    // still never echo it back.
    const argumentContainingCredentials =
      'postgresql://user:super-secret-password@localhost:5432/mockp';

    try {
      selectSeedEnvVar([argumentContainingCredentials]);
      expect.unreachable('selectSeedEnvVar should have thrown');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain(argumentContainingCredentials);
      expect(message).not.toContain('super-secret-password');
      expect(message).not.toMatch(/:\/\//);
    }
  });
});
