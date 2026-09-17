import { describe, expect, it, vi } from 'vitest';
import { TruncateGuardViolationError } from './truncate-guard';
import {
  MUTABLE_TEST_DATABASE_TABLES,
  truncateMutableTestDatabaseTables,
} from './truncate-mutable-tables';

describe('truncateMutableTestDatabaseTables', () => {
  it('never issues a TRUNCATE (or even queries the database) when the guard rejects', async () => {
    const client = {
      $queryRawUnsafe: vi.fn(),
      $executeRawUnsafe: vi.fn(),
    };

    await expect(
      truncateMutableTestDatabaseTables({
        client,
        nodeEnv: 'development',
        testDatabaseUrl: 'postgresql://mockp:mockp@localhost:5432/mockp_test',
      }),
    ).rejects.toBeInstanceOf(TruncateGuardViolationError);

    expect(client.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(client.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('issues a single static TRUNCATE covering exactly the 14 mutable tables once the guard passes', async () => {
    const client = {
      $queryRawUnsafe: vi
        .fn()
        .mockResolvedValue([{ current_database: 'mockp_test' }]),
      $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    };

    await truncateMutableTestDatabaseTables({
      client,
      nodeEnv: 'test',
      testDatabaseUrl: 'postgresql://mockp:mockp@localhost:5432/mockp_test',
    });

    expect(MUTABLE_TEST_DATABASE_TABLES).toHaveLength(14);
    expect(client.$executeRawUnsafe).toHaveBeenCalledTimes(1);

    const [sql] = client.$executeRawUnsafe.mock.calls[0] as [string];
    expect(sql.startsWith('TRUNCATE TABLE ')).toBe(true);
    for (const table of MUTABLE_TEST_DATABASE_TABLES) {
      expect(sql).toContain(table);
    }
    // `roles` and `_prisma_migrations` are never part of the statement —
    // the word-boundary regex avoids false positives on "user_roles" /
    // "workspace_membership_roles", which legitimately contain "roles" as
    // a suffix.
    expect(sql.match(/\broles\b/g)).toBeNull();
    expect(sql).not.toContain('_prisma_migrations');
  });
});
