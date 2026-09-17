import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma-client/client';
import {
  PersistenceConflictError,
  PersistenceInvariantError,
  UnexpectedPersistenceError,
} from '../persistence/errors';
import { PrismaService } from '../prisma/prisma.service';
import { UserRepository } from './user.repository';

const SELECTED_USER = {
  id: 'user-1',
  email: 'user@example.com',
  status: 'ACTIVE' as const,
  version: 1,
  deactivatedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const CUSTOMER_ROLE = { id: 'role-customer', name: 'CUSTOMER' as const };

/**
 * Mirrors `USER_SELECT` in user.repository.ts (kept as a local constant
 * here rather than exporting it from production code just for the test)
 * — asserted verbatim so a future accidental widening of the real
 * `select` (e.g. adding a relation) fails these tests instead of passing
 * silently under `expect.any(Object)`.
 */
const EXPECTED_USER_SELECT = {
  id: true,
  email: true,
  status: true,
  version: true,
  deactivatedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function createTxMock(overrides: Record<string, unknown> = {}) {
  return {
    role: { findMany: vi.fn().mockResolvedValue([CUSTOMER_ROLE]) },
    user: { create: vi.fn().mockResolvedValue(SELECTED_USER) },
    credential: { create: vi.fn().mockResolvedValue({}) },
    authIdentity: { create: vi.fn().mockResolvedValue({}) },
    userRole: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    ...overrides,
  };
}

/**
 * `$transaction` mock is a bare pass-through — `vi.fn((callback) =>
 * callback(txMock))` — with no `try/catch` of its own, so it never
 * intercepts or alters whatever the callback throws/resolves, exactly
 * like the real `PrismaService.$transaction`.
 */
function createPrismaMock(
  txMock: ReturnType<typeof createTxMock>,
  overrides: Record<string, unknown> = {},
) {
  return {
    $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) =>
      callback(txMock),
    ),
    user: { findUnique: vi.fn() },
    ...overrides,
  } as unknown as PrismaService;
}

/** Classic (binary-engine) Prisma error shape — kept as the columns-based fallback path. */
function uniqueViolationByColumns(
  columns: string[],
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed.', {
    code: 'P2002',
    clientVersion: '7.10.0',
    meta: { target: columns },
  });
}

/**
 * Real shape empirically observed against `mockp_test` for this stack
 * (Prisma 7 + `@prisma/adapter-pg`, driver-adapter architecture): the
 * constraint name lives at
 * `meta.driverAdapterError.cause.constraint.index`, not at a top-level
 * `meta.target` string.
 */
function uniqueViolationByConstraintName(
  constraintName: string,
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed.', {
    code: 'P2002',
    clientVersion: '7.10.0',
    meta: {
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: '23505',
          originalMessage: `duplicate key value violates unique constraint "${constraintName}"`,
          kind: 'UniqueConstraintViolation',
          constraint: { index: constraintName },
        },
      },
    },
  });
}

function assertUnexpected(error: unknown, cause: unknown): void {
  expect(error).toBeInstanceOf(UnexpectedPersistenceError);
  const persistenceError = error as UnexpectedPersistenceError;
  expect(persistenceError.reason).toBe('UNEXPECTED_PERSISTENCE_ERROR');
  expect(persistenceError.cause).toBe(cause);
  expect(persistenceError.message).toBe('Unexpected persistence error.');
}

describe('UserRepository.createWithCredential', () => {
  it('creates User + Credential + UserRole inside a single transaction', async () => {
    const txMock = createTxMock();
    const prisma = createPrismaMock(txMock);
    const repository = new UserRepository(prisma);

    const result = await repository.createWithCredential({
      email: 'user@example.com',
      passwordHash: 'hashed',
      roleNames: ['CUSTOMER'],
    });

    expect(txMock.role.findMany).toHaveBeenCalledWith({
      where: { name: { in: ['CUSTOMER'] } },
      select: { id: true, name: true },
    });
    expect(txMock.user.create).toHaveBeenCalledWith({
      data: { email: 'user@example.com' },
      select: EXPECTED_USER_SELECT,
    });
    expect(txMock.credential.create).toHaveBeenCalledWith({
      data: { userId: SELECTED_USER.id, passwordHash: 'hashed' },
    });
    expect(txMock.userRole.createMany).toHaveBeenCalledWith({
      data: [{ userId: SELECTED_USER.id, roleId: CUSTOMER_ROLE.id }],
    });
    expect(result).toEqual({
      id: SELECTED_USER.id,
      email: SELECTED_USER.email,
      status: SELECTED_USER.status,
      version: SELECTED_USER.version,
      deactivatedAt: SELECTED_USER.deactivatedAt,
      createdAt: SELECTED_USER.createdAt,
      updatedAt: SELECTED_USER.updatedAt,
    });
  });

  it('rejects with ROLE_REQUIRED before touching $transaction when roleNames is empty', async () => {
    const txMock = createTxMock();
    const prisma = createPrismaMock(txMock);
    const repository = new UserRepository(prisma);

    await expect(
      repository.createWithCredential({
        email: 'user@example.com',
        passwordHash: 'hashed',
        roleNames: [],
      }),
    ).rejects.toMatchObject({ reason: 'ROLE_REQUIRED' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects with DUPLICATE_ROLE_NAME before touching $transaction when roleNames has a duplicate', async () => {
    const txMock = createTxMock();
    const prisma = createPrismaMock(txMock);
    const repository = new UserRepository(prisma);

    await expect(
      repository.createWithCredential({
        email: 'user@example.com',
        passwordHash: 'hashed',
        roleNames: ['CUSTOMER', 'CUSTOMER'],
      }),
    ).rejects.toMatchObject({ reason: 'DUPLICATE_ROLE_NAME' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects with ROLE_NOT_FOUND, without creating User/Credential/UserRole, when a role is missing from the catalog', async () => {
    const txMock = createTxMock({
      role: { findMany: vi.fn().mockResolvedValue([CUSTOMER_ROLE]) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new UserRepository(prisma);

    let caught: unknown;
    try {
      await repository.createWithCredential({
        email: 'user@example.com',
        passwordHash: 'hashed',
        roleNames: ['CUSTOMER', 'ADMIN'],
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PersistenceInvariantError);
    expect((caught as PersistenceInvariantError).reason).toBe('ROLE_NOT_FOUND');
    expect(txMock.user.create).not.toHaveBeenCalled();
    expect(txMock.credential.create).not.toHaveBeenCalled();
    expect(txMock.userRole.createMany).not.toHaveBeenCalled();
  });

  it('translates a unique violation on tx.user.create (matched by columns) into DUPLICATE_EMAIL', async () => {
    const error = uniqueViolationByColumns(['email']);
    const txMock = createTxMock({
      user: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new UserRepository(prisma);

    let caught: unknown;
    try {
      await repository.createWithCredential({
        email: 'user@example.com',
        passwordHash: 'hashed',
        roleNames: ['CUSTOMER'],
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(PersistenceConflictError);
    expect((caught as PersistenceConflictError).reason).toBe('DUPLICATE_EMAIL');
    expect((caught as PersistenceConflictError).cause).toBe(error);
  });

  it('translates a unique violation on tx.user.create (matched by constraint name) into DUPLICATE_EMAIL', async () => {
    const error = uniqueViolationByConstraintName('users_email_key');
    const txMock = createTxMock({
      user: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new UserRepository(prisma);

    let caught: unknown;
    try {
      await repository.createWithCredential({
        email: 'user@example.com',
        passwordHash: 'hashed',
        roleNames: ['CUSTOMER'],
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(PersistenceConflictError);
    expect((caught as PersistenceConflictError).reason).toBe('DUPLICATE_EMAIL');
    // Identity, not just structural equality — proves cause is the exact
    // same object, not merely a structurally similar one.
    expect((caught as PersistenceConflictError).cause).toBe(error);
  });

  it('never guesses a reason for an unrecognized P2002 target on tx.user.create', async () => {
    const error = uniqueViolationByColumns(['some_other_column']);
    const txMock = createTxMock({
      user: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new UserRepository(prisma);

    let caught: unknown;
    try {
      await repository.createWithCredential({
        email: 'user@example.com',
        passwordHash: 'hashed',
        roleNames: ['CUSTOMER'],
      });
    } catch (e) {
      caught = e;
    }

    assertUnexpected(caught, error);
  });

  it('normalizes a non-P2002 Prisma error on tx.user.create as UnexpectedPersistenceError', async () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Some other failure.',
      {
        code: 'P2025',
        clientVersion: '7.10.0',
      },
    );
    const txMock = createTxMock({
      user: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new UserRepository(prisma);

    let caught: unknown;
    try {
      await repository.createWithCredential({
        email: 'user@example.com',
        passwordHash: 'hashed',
        roleNames: ['CUSTOMER'],
      });
    } catch (e) {
      caught = e;
    }

    assertUnexpected(caught, error);
  });

  it('normalizes an error from role.findMany as UnexpectedPersistenceError', async () => {
    const error = new Error('connection reset');
    const txMock = createTxMock({
      role: { findMany: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new UserRepository(prisma);

    let caught: unknown;
    try {
      await repository.createWithCredential({
        email: 'user@example.com',
        passwordHash: 'hashed',
        roleNames: ['CUSTOMER'],
      });
    } catch (e) {
      caught = e;
    }

    assertUnexpected(caught, error);
    expect(txMock.user.create).not.toHaveBeenCalled();
  });

  it('normalizes an error from credential.create as UnexpectedPersistenceError (never a specific reason)', async () => {
    const error = new Error('unexpected constraint');
    const txMock = createTxMock({
      credential: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new UserRepository(prisma);

    let caught: unknown;
    try {
      await repository.createWithCredential({
        email: 'user@example.com',
        passwordHash: 'hashed',
        roleNames: ['CUSTOMER'],
      });
    } catch (e) {
      caught = e;
    }

    assertUnexpected(caught, error);
  });

  it('normalizes an error from userRole.createMany as UnexpectedPersistenceError', async () => {
    const error = new Error('write failed');
    const txMock = createTxMock({
      userRole: { createMany: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new UserRepository(prisma);

    let caught: unknown;
    try {
      await repository.createWithCredential({
        email: 'user@example.com',
        passwordHash: 'hashed',
        roleNames: ['CUSTOMER'],
      });
    } catch (e) {
      caught = e;
    }

    assertUnexpected(caught, error);
  });

  it('normalizes an error thrown directly by $transaction (open/commit failure) as UnexpectedPersistenceError', async () => {
    const error = new Error('could not open transaction');
    const prisma = {
      $transaction: vi.fn().mockRejectedValue(error),
      user: { findUnique: vi.fn() },
    } as unknown as PrismaService;
    const repository = new UserRepository(prisma);

    let caught: unknown;
    try {
      await repository.createWithCredential({
        email: 'user@example.com',
        passwordHash: 'hashed',
        roleNames: ['CUSTOMER'],
      });
    } catch (e) {
      caught = e;
    }

    assertUnexpected(caught, error);
  });

  it('never wraps a PersistenceError raised inside the transaction a second time', async () => {
    const txMock = createTxMock({
      role: { findMany: vi.fn().mockResolvedValue([]) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new UserRepository(prisma);

    let caught: unknown;
    try {
      await repository.createWithCredential({
        email: 'user@example.com',
        passwordHash: 'hashed',
        roleNames: ['CUSTOMER'],
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(PersistenceInvariantError);
    expect((caught as PersistenceInvariantError).reason).toBe('ROLE_NOT_FOUND');
    expect((caught as PersistenceInvariantError).reason).not.toBe(
      'UNEXPECTED_PERSISTENCE_ERROR',
    );
  });

  it('returns a pre-existing PersistenceError as the exact same instance through the outer boundary (identity, not just structural equality)', async () => {
    const original = new PersistenceInvariantError(
      'One or more roles do not exist in the catalog.',
      'ROLE_NOT_FOUND',
    );
    // credential.create has no dedicated inner catch (see user.repository.ts)
    // — this exercises the outer boundary's wrapUnexpectedPersistenceError
    // call directly, independent of the normal ROLE_NOT_FOUND flow tested
    // above.
    const txMock = createTxMock({
      credential: { create: vi.fn().mockRejectedValue(original) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new UserRepository(prisma);

    let caught: unknown;
    try {
      await repository.createWithCredential({
        email: 'user@example.com',
        passwordHash: 'hashed',
        roleNames: ['CUSTOMER'],
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBe(original);
  });

  it('passes email through unchanged, without trimming or lower-casing it', async () => {
    const txMock = createTxMock();
    const prisma = createPrismaMock(txMock);
    const repository = new UserRepository(prisma);

    await repository.createWithCredential({
      email: '  Mixed.Case@Example.com  ',
      passwordHash: 'hashed',
      roleNames: ['CUSTOMER'],
    });

    expect(txMock.user.create).toHaveBeenCalledWith({
      data: { email: '  Mixed.Case@Example.com  ' },
      select: EXPECTED_USER_SELECT,
    });
  });
});

describe('UserRepository.createWithAuthIdentity', () => {
  it('creates User + AuthIdentity + UserRole, and never calls credential.create', async () => {
    const txMock = createTxMock();
    const prisma = createPrismaMock(txMock);
    const repository = new UserRepository(prisma);

    const result = await repository.createWithAuthIdentity({
      email: 'user@example.com',
      provider: 'google',
      providerAccountId: 'ext-1',
      roleNames: ['ADMIN'],
    });

    expect(txMock.authIdentity.create).toHaveBeenCalledWith({
      data: {
        userId: SELECTED_USER.id,
        provider: 'google',
        providerAccountId: 'ext-1',
      },
    });
    expect(txMock.credential.create).not.toHaveBeenCalled();
    expect(result.id).toBe(SELECTED_USER.id);
  });

  it('translates a unique violation on tx.authIdentity.create (matched by columns) into DUPLICATE_AUTH_IDENTITY', async () => {
    const error = uniqueViolationByColumns(['provider', 'providerAccountId']);
    const txMock = createTxMock({
      authIdentity: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new UserRepository(prisma);

    let caught: unknown;
    try {
      await repository.createWithAuthIdentity({
        email: 'user@example.com',
        provider: 'google',
        providerAccountId: 'ext-1',
        roleNames: ['ADMIN'],
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(PersistenceConflictError);
    expect((caught as PersistenceConflictError).reason).toBe(
      'DUPLICATE_AUTH_IDENTITY',
    );
    expect((caught as PersistenceConflictError).cause).toBe(error);
  });

  it('translates a unique violation on tx.authIdentity.create (matched by constraint name) into DUPLICATE_AUTH_IDENTITY', async () => {
    const error = uniqueViolationByConstraintName(
      'auth_identities_provider_provider_account_id_key',
    );
    const txMock = createTxMock({
      authIdentity: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new UserRepository(prisma);

    let caught: unknown;
    try {
      await repository.createWithAuthIdentity({
        email: 'user@example.com',
        provider: 'google',
        providerAccountId: 'ext-1',
        roleNames: ['ADMIN'],
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(PersistenceConflictError);
    expect((caught as PersistenceConflictError).reason).toBe(
      'DUPLICATE_AUTH_IDENTITY',
    );
    expect((caught as PersistenceConflictError).cause).toBe(error);
  });

  it('never guesses a reason for an unrecognized P2002 target on tx.authIdentity.create', async () => {
    const error = uniqueViolationByColumns(['unexpected_field']);
    const txMock = createTxMock({
      authIdentity: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new UserRepository(prisma);

    let caught: unknown;
    try {
      await repository.createWithAuthIdentity({
        email: 'user@example.com',
        provider: 'google',
        providerAccountId: 'ext-1',
        roleNames: ['ADMIN'],
      });
    } catch (e) {
      caught = e;
    }

    assertUnexpected(caught, error);
  });

  it('normalizes a generic error from authIdentity.create as UnexpectedPersistenceError', async () => {
    const error = new Error('driver failure');
    const txMock = createTxMock({
      authIdentity: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new UserRepository(prisma);

    let caught: unknown;
    try {
      await repository.createWithAuthIdentity({
        email: 'user@example.com',
        provider: 'google',
        providerAccountId: 'ext-1',
        roleNames: ['ADMIN'],
      });
    } catch (e) {
      caught = e;
    }

    assertUnexpected(caught, error);
  });

  it('normalizes a non-P2002 Prisma error on tx.user.create as UnexpectedPersistenceError (symmetry with createWithCredential)', async () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Some other failure.',
      {
        code: 'P2025',
        clientVersion: '7.10.0',
      },
    );
    const txMock = createTxMock({
      user: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new UserRepository(prisma);

    let caught: unknown;
    try {
      await repository.createWithAuthIdentity({
        email: 'user@example.com',
        provider: 'google',
        providerAccountId: 'ext-1',
        roleNames: ['ADMIN'],
      });
    } catch (e) {
      caught = e;
    }

    assertUnexpected(caught, error);
  });

  it('passes email through unchanged, without trimming or lower-casing it (symmetry with createWithCredential)', async () => {
    const txMock = createTxMock();
    const prisma = createPrismaMock(txMock);
    const repository = new UserRepository(prisma);

    await repository.createWithAuthIdentity({
      email: '  Mixed.Case@Example.com  ',
      provider: 'google',
      providerAccountId: 'ext-1',
      roleNames: ['ADMIN'],
    });

    expect(txMock.user.create).toHaveBeenCalledWith({
      data: { email: '  Mixed.Case@Example.com  ' },
      select: EXPECTED_USER_SELECT,
    });
  });
});

describe('UserRepository.findById', () => {
  it('returns the mapped aggregate when found, selecting only aggregate fields', async () => {
    const prisma = {
      $transaction: vi.fn(),
      user: { findUnique: vi.fn().mockResolvedValue(SELECTED_USER) },
    } as unknown as PrismaService;
    const repository = new UserRepository(prisma);

    const result = await repository.findById(SELECTED_USER.id);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: SELECTED_USER.id },
      select: EXPECTED_USER_SELECT,
    });
    expect(result?.id).toBe(SELECTED_USER.id);
  });

  it('returns null when not found', async () => {
    const prisma = {
      $transaction: vi.fn(),
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const repository = new UserRepository(prisma);

    await expect(repository.findById('missing')).resolves.toBeNull();
  });

  it('normalizes an error from user.findUnique as UnexpectedPersistenceError', async () => {
    const error = new Error('connection lost');
    const prisma = {
      $transaction: vi.fn(),
      user: { findUnique: vi.fn().mockRejectedValue(error) },
    } as unknown as PrismaService;
    const repository = new UserRepository(prisma);

    let caught: unknown;
    try {
      await repository.findById(SELECTED_USER.id);
    } catch (e) {
      caught = e;
    }

    assertUnexpected(caught, error);
  });
});

describe('UserRepository.findByEmail', () => {
  it('returns the mapped aggregate when found', async () => {
    const prisma = {
      $transaction: vi.fn(),
      user: { findUnique: vi.fn().mockResolvedValue(SELECTED_USER) },
    } as unknown as PrismaService;
    const repository = new UserRepository(prisma);

    const result = await repository.findByEmail(SELECTED_USER.email);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: SELECTED_USER.email },
      select: EXPECTED_USER_SELECT,
    });
    expect(result?.email).toBe(SELECTED_USER.email);
  });

  it('returns null when not found', async () => {
    const prisma = {
      $transaction: vi.fn(),
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const repository = new UserRepository(prisma);

    await expect(
      repository.findByEmail('missing@example.com'),
    ).resolves.toBeNull();
  });

  it('normalizes an error from user.findUnique as UnexpectedPersistenceError', async () => {
    const error = new Error('connection lost');
    const prisma = {
      $transaction: vi.fn(),
      user: { findUnique: vi.fn().mockRejectedValue(error) },
    } as unknown as PrismaService;
    const repository = new UserRepository(prisma);

    let caught: unknown;
    try {
      await repository.findByEmail(SELECTED_USER.email);
    } catch (e) {
      caught = e;
    }

    assertUnexpected(caught, error);
  });
});
