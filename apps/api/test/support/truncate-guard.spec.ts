import { describe, expect, it, vi } from 'vitest';
import {
  assertSafeToTruncateTestDatabase,
  TruncateGuardViolationError,
} from './truncate-guard';

const VALID_TEST_DATABASE_URL =
  'postgresql://mockp:mockp@localhost:5432/mockp_test';

describe('assertSafeToTruncateTestDatabase', () => {
  it('resolves and queries the real database only once all checks pass', async () => {
    const queryCurrentDatabase = vi.fn().mockResolvedValue('mockp_test');

    await expect(
      assertSafeToTruncateTestDatabase({
        nodeEnv: 'test',
        testDatabaseUrl: VALID_TEST_DATABASE_URL,
        queryCurrentDatabase,
      }),
    ).resolves.toBeUndefined();

    expect(queryCurrentDatabase).toHaveBeenCalledTimes(1);
  });

  it('accepts the "postgres" Compose service hostname', async () => {
    const queryCurrentDatabase = vi.fn().mockResolvedValue('mockp_test');

    await expect(
      assertSafeToTruncateTestDatabase({
        nodeEnv: 'test',
        testDatabaseUrl: 'postgresql://mockp:mockp@postgres:5432/mockp_test',
        queryCurrentDatabase,
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects and never queries the database when NODE_ENV is not "test"', async () => {
    const queryCurrentDatabase = vi.fn();

    await expect(
      assertSafeToTruncateTestDatabase({
        nodeEnv: 'development',
        testDatabaseUrl: VALID_TEST_DATABASE_URL,
        queryCurrentDatabase,
      }),
    ).rejects.toBeInstanceOf(TruncateGuardViolationError);

    expect(queryCurrentDatabase).not.toHaveBeenCalled();
  });

  it('rejects and never queries the database when the host is outside the local allowlist', async () => {
    const queryCurrentDatabase = vi.fn();

    await expect(
      assertSafeToTruncateTestDatabase({
        nodeEnv: 'test',
        testDatabaseUrl:
          'postgresql://mockp:mockp@remote.example.com:5432/mockp_test',
        queryCurrentDatabase,
      }),
    ).rejects.toBeInstanceOf(TruncateGuardViolationError);

    expect(queryCurrentDatabase).not.toHaveBeenCalled();
  });

  it('rejects and never queries the database when the URL database name is not exactly "mockp_test"', async () => {
    const queryCurrentDatabase = vi.fn();

    await expect(
      assertSafeToTruncateTestDatabase({
        nodeEnv: 'test',
        testDatabaseUrl: 'postgresql://mockp:mockp@localhost:5432/mockp',
        queryCurrentDatabase,
      }),
    ).rejects.toBeInstanceOf(TruncateGuardViolationError);

    expect(queryCurrentDatabase).not.toHaveBeenCalled();
  });

  it('rejects when the runtime-confirmed database does not match, even though the URL claims mockp_test', async () => {
    const queryCurrentDatabase = vi.fn().mockResolvedValue('some_other_db');

    await expect(
      assertSafeToTruncateTestDatabase({
        nodeEnv: 'test',
        testDatabaseUrl: VALID_TEST_DATABASE_URL,
        queryCurrentDatabase,
      }),
    ).rejects.toBeInstanceOf(TruncateGuardViolationError);

    expect(queryCurrentDatabase).toHaveBeenCalledTimes(1);
  });

  it('never includes the raw connection URL (credentials) in a thrown error message', async () => {
    const queryCurrentDatabase = vi.fn();
    const urlWithCredentials =
      'postgresql://mockp:s3cr3t@remote.example.com:5432/mockp_test';

    await expect(
      assertSafeToTruncateTestDatabase({
        nodeEnv: 'test',
        testDatabaseUrl: urlWithCredentials,
        queryCurrentDatabase,
      }),
    ).rejects.toThrow(/^(?!.*s3cr3t).*$/s);
  });
});
