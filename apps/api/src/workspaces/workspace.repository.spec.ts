import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma-client/client';
import {
  AggregateNotFoundError,
  PersistenceConflictError,
  PersistenceInvariantError,
  UnexpectedPersistenceError,
} from '../persistence/errors';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceRepository } from './workspace.repository';
import type { CreateBrokerageWorkspaceCommand } from './workspace.types';

const SELECTED_WORKSPACE = {
  id: 'workspace-1',
  type: 'INDIVIDUAL' as const,
  name: 'Acme Realty',
  slug: 'acme-realty',
  ownerUserId: 'owner-1',
  status: 'ACTIVE' as const,
  version: 1,
  archivedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

/** What `workspace.create` resolves to in the BROKERAGE flow — a BROKERAGE row, so the mapped record's type is meaningful. */
const SELECTED_BROKERAGE_WORKSPACE = {
  ...SELECTED_WORKSPACE,
  id: 'workspace-2',
  type: 'BROKERAGE' as const,
  name: 'Acme Brokerage',
  slug: 'acme-brokerage',
};

const EXISTING_USER = { id: 'owner-1' };
const EXISTING_AGENT_PROFILE = { userId: 'owner-1' };
const EXISTING_MEMBERSHIP = { id: 'membership-1' };

/**
 * Mirrors `WORKSPACE_SELECT` in workspace.repository.ts (kept as a local
 * constant here rather than exporting it from production code just for
 * the test) — asserted verbatim so a future accidental widening of the
 * real `select` fails these tests instead of passing silently.
 */
const EXPECTED_WORKSPACE_SELECT = {
  id: true,
  type: true,
  name: true,
  slug: true,
  ownerUserId: true,
  status: true,
  version: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function createTxMock(overrides: Record<string, unknown> = {}) {
  return {
    user: { findUnique: vi.fn().mockResolvedValue(EXISTING_USER) },
    agentProfile: {
      findUnique: vi.fn().mockResolvedValue(EXISTING_AGENT_PROFILE),
    },
    workspace: { create: vi.fn().mockResolvedValue(SELECTED_WORKSPACE) },
    brokerage: { create: vi.fn().mockResolvedValue({}) },
    workspaceMembership: {
      create: vi.fn().mockResolvedValue(EXISTING_MEMBERSHIP),
    },
    workspaceMembershipRole: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    workspaceAgent: { create: vi.fn().mockResolvedValue({}) },
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
    workspace: { findUnique: vi.fn() },
    ...overrides,
  } as unknown as PrismaService;
}

function uniqueViolationByColumns(
  columns: string[],
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed.', {
    code: 'P2002',
    clientVersion: '7.10.0',
    meta: { target: columns },
  });
}

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

/** Real driver-adapter shape for P2003, empirically confirmed (Tarefa 3.3.6). */
function foreignKeyViolation(
  constraintName: string,
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Foreign key constraint failed.',
    {
      code: 'P2003',
      clientVersion: '7.10.0',
      meta: {
        driverAdapterError: {
          name: 'DriverAdapterError',
          cause: {
            originalCode: '23503',
            originalMessage: `insert or update on table violates foreign key constraint "${constraintName}"`,
            kind: 'ForeignKeyConstraintViolation',
            constraint: { index: constraintName },
          },
        },
      },
    },
  );
}

/** P2003 with completely absent metadata — must not be recognized. */
function foreignKeyViolationWithoutMeta(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Foreign key constraint failed.',
    { code: 'P2003', clientVersion: '7.10.0' },
  );
}

/** P2003 with a malformed/incomplete metadata chain — must not be recognized. */
function foreignKeyViolationMalformed(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Foreign key constraint failed.',
    {
      code: 'P2003',
      clientVersion: '7.10.0',
      meta: { driverAdapterError: { name: 'DriverAdapterError' } },
    },
  );
}

function assertUnexpected(error: unknown, cause: unknown): void {
  expect(error).toBeInstanceOf(UnexpectedPersistenceError);
  const persistenceError = error as UnexpectedPersistenceError;
  expect(persistenceError.reason).toBe('UNEXPECTED_PERSISTENCE_ERROR');
  expect(persistenceError.cause).toBe(cause);
  expect(persistenceError.message).toBe('Unexpected persistence error.');
}

async function catchError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return undefined;
  } catch (error) {
    return error;
  }
}

/** `createTxMock` whose `workspace.create` resolves to a BROKERAGE row. */
function createBrokerageTxMock(overrides: Record<string, unknown> = {}) {
  return createTxMock({
    workspace: {
      create: vi.fn().mockResolvedValue(SELECTED_BROKERAGE_WORKSPACE),
    },
    ...overrides,
  });
}

function brokerageCommand(
  overrides: Partial<CreateBrokerageWorkspaceCommand> = {},
): CreateBrokerageWorkspaceCommand {
  return {
    ownerUserId: 'owner-1',
    name: 'Acme Brokerage',
    slug: 'acme-brokerage',
    brokerageLegalName: 'Acme Realty LLC',
    ownerActsAsAgent: false,
    ...overrides,
  };
}

interface OrderedStep {
  label: string;
  mock: { mock: { invocationCallOrder: number[] } };
}

/**
 * Fails unless every step was called exactly once and the calls happened
 * in the exact order given (strictly increasing `invocationCallOrder`) —
 * `toHaveBeenCalled` alone would not notice a reordering.
 */
function expectStrictCallOrder(steps: readonly OrderedStep[]): void {
  let previousOrder = 0;
  for (const { label, mock } of steps) {
    const orders = mock.mock.invocationCallOrder;
    expect(orders, `${label} must be called exactly once`).toHaveLength(1);
    const order = orders[0] as number;
    expect(
      order,
      `${label} must be called after the previous step`,
    ).toBeGreaterThan(previousOrder);
    previousOrder = order;
  }
}

describe('WorkspaceRepository.createIndividualWorkspace', () => {
  it('creates Workspace + WorkspaceMembership + MANAGER/AGENT roles + WorkspaceAgent inside a single transaction', async () => {
    const txMock = createTxMock();
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const result = await repository.createIndividualWorkspace({
      ownerUserId: 'owner-1',
      name: 'Acme Realty',
      slug: 'acme-realty',
    });

    expect(txMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'owner-1' },
    });
    expect(txMock.agentProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: 'owner-1' },
    });
    expect(txMock.workspace.create).toHaveBeenCalledWith({
      data: {
        type: 'INDIVIDUAL',
        name: 'Acme Realty',
        slug: 'acme-realty',
        ownerUserId: 'owner-1',
      },
      select: EXPECTED_WORKSPACE_SELECT,
    });
    expect(txMock.workspaceMembership.create).toHaveBeenCalledWith({
      data: {
        workspaceId: SELECTED_WORKSPACE.id,
        userId: 'owner-1',
        status: 'ACTIVE',
      },
    });
    expect(txMock.workspaceMembershipRole.createMany).toHaveBeenCalledWith({
      data: [
        { membershipId: EXISTING_MEMBERSHIP.id, role: 'MANAGER' },
        { membershipId: EXISTING_MEMBERSHIP.id, role: 'AGENT' },
      ],
    });
    expect(txMock.workspaceAgent.create).toHaveBeenCalledWith({
      data: {
        workspaceId: SELECTED_WORKSPACE.id,
        userId: 'owner-1',
        status: 'ACTIVE',
      },
    });
    expect(result).toEqual({
      id: SELECTED_WORKSPACE.id,
      type: SELECTED_WORKSPACE.type,
      name: SELECTED_WORKSPACE.name,
      slug: SELECTED_WORKSPACE.slug,
      ownerUserId: SELECTED_WORKSPACE.ownerUserId,
      status: SELECTED_WORKSPACE.status,
      version: SELECTED_WORKSPACE.version,
      archivedAt: SELECTED_WORKSPACE.archivedAt,
      createdAt: SELECTED_WORKSPACE.createdAt,
      updatedAt: SELECTED_WORKSPACE.updatedAt,
    });
  });

  it('executes the six INDIVIDUAL steps exactly once each, in strict order', async () => {
    const txMock = createTxMock();
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    await repository.createIndividualWorkspace({
      ownerUserId: 'owner-1',
      name: 'Acme Realty',
      slug: 'acme-realty',
    });

    expectStrictCallOrder([
      { label: 'user.findUnique', mock: txMock.user.findUnique },
      {
        label: 'agentProfile.findUnique',
        mock: txMock.agentProfile.findUnique,
      },
      { label: 'workspace.create', mock: txMock.workspace.create },
      {
        label: 'workspaceMembership.create',
        mock: txMock.workspaceMembership.create,
      },
      {
        label: 'workspaceMembershipRole.createMany',
        mock: txMock.workspaceMembershipRole.createMany,
      },
      { label: 'workspaceAgent.create', mock: txMock.workspaceAgent.create },
    ]);
    expect(txMock.brokerage.create).not.toHaveBeenCalled();
  });

  it('rejects with OWNER_NOT_FOUND (proactive) and performs no write when the owner does not exist', async () => {
    const txMock = createTxMock({
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createIndividualWorkspace({
        ownerUserId: 'owner-1',
        name: 'Acme Realty',
        slug: 'acme-realty',
      }),
    );

    expect(caught).toBeInstanceOf(AggregateNotFoundError);
    expect((caught as AggregateNotFoundError).reason).toBe('OWNER_NOT_FOUND');
    expect(txMock.agentProfile.findUnique).not.toHaveBeenCalled();
    expect(txMock.workspace.create).not.toHaveBeenCalled();
    expect(txMock.workspaceMembership.create).not.toHaveBeenCalled();
    expect(txMock.workspaceMembershipRole.createMany).not.toHaveBeenCalled();
    expect(txMock.workspaceAgent.create).not.toHaveBeenCalled();
  });

  it('rejects with AGENT_PROFILE_REQUIRED (proactive) and performs no write when the owner has no AgentProfile', async () => {
    const txMock = createTxMock({
      agentProfile: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createIndividualWorkspace({
        ownerUserId: 'owner-1',
        name: 'Acme Realty',
        slug: 'acme-realty',
      }),
    );

    expect(caught).toBeInstanceOf(PersistenceInvariantError);
    expect((caught as PersistenceInvariantError).reason).toBe(
      'AGENT_PROFILE_REQUIRED',
    );
    expect(txMock.workspace.create).not.toHaveBeenCalled();
    expect(txMock.workspaceMembership.create).not.toHaveBeenCalled();
    expect(txMock.workspaceMembershipRole.createMany).not.toHaveBeenCalled();
    expect(txMock.workspaceAgent.create).not.toHaveBeenCalled();
  });

  it('translates a unique violation on workspace.create (matched by columns) into DUPLICATE_WORKSPACE_SLUG', async () => {
    const error = uniqueViolationByColumns(['slug']);
    const txMock = createTxMock({
      workspace: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createIndividualWorkspace({
        ownerUserId: 'owner-1',
        name: 'Acme Realty',
        slug: 'acme-realty',
      }),
    );

    expect(caught).toBeInstanceOf(PersistenceConflictError);
    expect((caught as PersistenceConflictError).reason).toBe(
      'DUPLICATE_WORKSPACE_SLUG',
    );
    expect((caught as PersistenceConflictError).cause).toBe(error);
  });

  it('translates a unique violation on workspace.create (matched by constraint name) into DUPLICATE_WORKSPACE_SLUG', async () => {
    const error = uniqueViolationByConstraintName('workspaces_slug_key');
    const txMock = createTxMock({
      workspace: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createIndividualWorkspace({
        ownerUserId: 'owner-1',
        name: 'Acme Realty',
        slug: 'acme-realty',
      }),
    );

    expect(caught).toBeInstanceOf(PersistenceConflictError);
    expect((caught as PersistenceConflictError).reason).toBe(
      'DUPLICATE_WORKSPACE_SLUG',
    );
    expect((caught as PersistenceConflictError).cause).toBe(error);
  });

  it('translates a residual OWNER_NOT_FOUND race (P2003 on workspace.create, exact constraint) even though the proactive check passed', async () => {
    const error = foreignKeyViolation('workspaces_owner_user_id_fkey');
    const txMock = createTxMock({
      workspace: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createIndividualWorkspace({
        ownerUserId: 'owner-1',
        name: 'Acme Realty',
        slug: 'acme-realty',
      }),
    );

    expect(caught).toBeInstanceOf(AggregateNotFoundError);
    expect((caught as AggregateNotFoundError).reason).toBe('OWNER_NOT_FOUND');
    expect((caught as AggregateNotFoundError).cause).toBe(error);
  });

  it('translates a residual AGENT_PROFILE_REQUIRED race (P2003 on workspaceAgent.create, exact constraint) even though the proactive check passed', async () => {
    const error = foreignKeyViolation('workspace_agents_user_id_fkey');
    const txMock = createTxMock({
      workspaceAgent: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createIndividualWorkspace({
        ownerUserId: 'owner-1',
        name: 'Acme Realty',
        slug: 'acme-realty',
      }),
    );

    expect(caught).toBeInstanceOf(PersistenceInvariantError);
    expect((caught as PersistenceInvariantError).reason).toBe(
      'AGENT_PROFILE_REQUIRED',
    );
    expect((caught as PersistenceInvariantError).cause).toBe(error);
  });

  it('never guesses a reason when workspace.create fails with an unrecognized P2003 constraint', async () => {
    const error = foreignKeyViolation('some_other_fkey');
    const txMock = createTxMock({
      workspace: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createIndividualWorkspace({
        ownerUserId: 'owner-1',
        name: 'Acme Realty',
        slug: 'acme-realty',
      }),
    );

    assertUnexpected(caught, error);
  });

  it('never labels the composite FK (workspace_agents_workspace_id_user_id_fkey) as AGENT_PROFILE_REQUIRED', async () => {
    const error = foreignKeyViolation(
      'workspace_agents_workspace_id_user_id_fkey',
    );
    const txMock = createTxMock({
      workspaceAgent: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createIndividualWorkspace({
        ownerUserId: 'owner-1',
        name: 'Acme Realty',
        slug: 'acme-realty',
      }),
    );

    assertUnexpected(caught, error);
  });

  it('normalizes a P2003 error with completely absent metadata as UnexpectedPersistenceError', async () => {
    const error = foreignKeyViolationWithoutMeta();
    const txMock = createTxMock({
      workspace: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createIndividualWorkspace({
        ownerUserId: 'owner-1',
        name: 'Acme Realty',
        slug: 'acme-realty',
      }),
    );

    assertUnexpected(caught, error);
  });

  it('normalizes a P2003 error with a malformed/incomplete metadata chain as UnexpectedPersistenceError', async () => {
    const error = foreignKeyViolationMalformed();
    const txMock = createTxMock({
      workspaceAgent: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createIndividualWorkspace({
        ownerUserId: 'owner-1',
        name: 'Acme Realty',
        slug: 'acme-realty',
      }),
    );

    assertUnexpected(caught, error);
  });

  it('never guesses a reason for an unrecognized P2002 target on workspace.create', async () => {
    const error = uniqueViolationByColumns(['some_other_column']);
    const txMock = createTxMock({
      workspace: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createIndividualWorkspace({
        ownerUserId: 'owner-1',
        name: 'Acme Realty',
        slug: 'acme-realty',
      }),
    );

    assertUnexpected(caught, error);
  });

  it('normalizes a non-P2002/P2003 Prisma error on workspace.create as UnexpectedPersistenceError', async () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Some other failure.',
      { code: 'P2025', clientVersion: '7.10.0' },
    );
    const txMock = createTxMock({
      workspace: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createIndividualWorkspace({
        ownerUserId: 'owner-1',
        name: 'Acme Realty',
        slug: 'acme-realty',
      }),
    );

    assertUnexpected(caught, error);
  });

  it('normalizes an error from user.findUnique as UnexpectedPersistenceError', async () => {
    const error = new Error('connection reset');
    const txMock = createTxMock({
      user: { findUnique: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createIndividualWorkspace({
        ownerUserId: 'owner-1',
        name: 'Acme Realty',
        slug: 'acme-realty',
      }),
    );

    assertUnexpected(caught, error);
  });

  it('normalizes an error from agentProfile.findUnique as UnexpectedPersistenceError', async () => {
    const error = new Error('connection reset');
    const txMock = createTxMock({
      agentProfile: { findUnique: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createIndividualWorkspace({
        ownerUserId: 'owner-1',
        name: 'Acme Realty',
        slug: 'acme-realty',
      }),
    );

    assertUnexpected(caught, error);
  });

  it('normalizes an error from workspaceMembership.create as UnexpectedPersistenceError (never a specific reason)', async () => {
    const error = new Error('unexpected constraint');
    const txMock = createTxMock({
      workspaceMembership: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createIndividualWorkspace({
        ownerUserId: 'owner-1',
        name: 'Acme Realty',
        slug: 'acme-realty',
      }),
    );

    assertUnexpected(caught, error);
  });

  it('normalizes an error from workspaceMembershipRole.createMany as UnexpectedPersistenceError', async () => {
    const error = new Error('write failed');
    const txMock = createTxMock({
      workspaceMembershipRole: { createMany: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createIndividualWorkspace({
        ownerUserId: 'owner-1',
        name: 'Acme Realty',
        slug: 'acme-realty',
      }),
    );

    assertUnexpected(caught, error);
  });

  it('normalizes an error thrown directly by $transaction (open/commit failure) as UnexpectedPersistenceError', async () => {
    const error = new Error('could not open transaction');
    const prisma = {
      $transaction: vi.fn().mockRejectedValue(error),
      workspace: { findUnique: vi.fn() },
    } as unknown as PrismaService;
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createIndividualWorkspace({
        ownerUserId: 'owner-1',
        name: 'Acme Realty',
        slug: 'acme-realty',
      }),
    );

    assertUnexpected(caught, error);
  });

  it('returns a pre-existing PersistenceError as the exact same instance through the outer boundary (identity, not just structural equality)', async () => {
    const original = new PersistenceInvariantError(
      'Owner has no AgentProfile.',
      'AGENT_PROFILE_REQUIRED',
    );
    const txMock = createTxMock({
      workspaceMembership: { create: vi.fn().mockRejectedValue(original) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createIndividualWorkspace({
        ownerUserId: 'owner-1',
        name: 'Acme Realty',
        slug: 'acme-realty',
      }),
    );

    expect(caught).toBe(original);
  });

  it('passes name and slug through unchanged, without any normalization', async () => {
    const txMock = createTxMock();
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    await repository.createIndividualWorkspace({
      ownerUserId: 'owner-1',
      name: '  Acme Realty  ',
      slug: '  ACME-Realty  ',
    });

    expect(txMock.workspace.create).toHaveBeenCalledWith({
      data: {
        type: 'INDIVIDUAL',
        name: '  Acme Realty  ',
        slug: '  ACME-Realty  ',
        ownerUserId: 'owner-1',
      },
      select: EXPECTED_WORKSPACE_SELECT,
    });
  });
});

describe('WorkspaceRepository.createBrokerageWorkspace', () => {
  it('with ownerActsAsAgent=false: creates a BROKERAGE workspace with exact arguments, one Brokerage, only MANAGER, and no AgentProfile/WorkspaceAgent involvement', async () => {
    const txMock = createBrokerageTxMock();
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const result = await repository.createBrokerageWorkspace(
      brokerageCommand({ ownerActsAsAgent: false }),
    );

    expect(txMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'owner-1' },
    });
    expect(txMock.agentProfile.findUnique).not.toHaveBeenCalled();
    expect(txMock.workspace.create).toHaveBeenCalledWith({
      data: {
        type: 'BROKERAGE',
        name: 'Acme Brokerage',
        slug: 'acme-brokerage',
        ownerUserId: 'owner-1',
      },
      select: EXPECTED_WORKSPACE_SELECT,
    });
    expect(txMock.brokerage.create).toHaveBeenCalledTimes(1);
    expect(txMock.brokerage.create).toHaveBeenCalledWith({
      data: {
        workspaceId: SELECTED_BROKERAGE_WORKSPACE.id,
        legalName: 'Acme Realty LLC',
      },
    });
    expect(txMock.workspaceMembership.create).toHaveBeenCalledWith({
      data: {
        workspaceId: SELECTED_BROKERAGE_WORKSPACE.id,
        userId: 'owner-1',
        status: 'ACTIVE',
      },
    });
    expect(txMock.workspaceMembershipRole.createMany).toHaveBeenCalledWith({
      data: [{ membershipId: EXISTING_MEMBERSHIP.id, role: 'MANAGER' }],
    });
    expect(txMock.workspaceAgent.create).not.toHaveBeenCalled();
    expect(result.type).toBe('BROKERAGE');
    expect(result).toEqual({
      id: SELECTED_BROKERAGE_WORKSPACE.id,
      type: 'BROKERAGE',
      name: SELECTED_BROKERAGE_WORKSPACE.name,
      slug: SELECTED_BROKERAGE_WORKSPACE.slug,
      ownerUserId: SELECTED_BROKERAGE_WORKSPACE.ownerUserId,
      status: SELECTED_BROKERAGE_WORKSPACE.status,
      version: SELECTED_BROKERAGE_WORKSPACE.version,
      archivedAt: SELECTED_BROKERAGE_WORKSPACE.archivedAt,
      createdAt: SELECTED_BROKERAGE_WORKSPACE.createdAt,
      updatedAt: SELECTED_BROKERAGE_WORKSPACE.updatedAt,
    });
  });

  it('with ownerActsAsAgent=true: creates a BROKERAGE workspace with exact arguments, one Brokerage, MANAGER+AGENT, and an ACTIVE WorkspaceAgent', async () => {
    const txMock = createBrokerageTxMock();
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const result = await repository.createBrokerageWorkspace(
      brokerageCommand({ ownerActsAsAgent: true }),
    );

    expect(txMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'owner-1' },
    });
    expect(txMock.agentProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: 'owner-1' },
    });
    expect(txMock.workspace.create).toHaveBeenCalledWith({
      data: {
        type: 'BROKERAGE',
        name: 'Acme Brokerage',
        slug: 'acme-brokerage',
        ownerUserId: 'owner-1',
      },
      select: EXPECTED_WORKSPACE_SELECT,
    });
    expect(txMock.brokerage.create).toHaveBeenCalledTimes(1);
    expect(txMock.brokerage.create).toHaveBeenCalledWith({
      data: {
        workspaceId: SELECTED_BROKERAGE_WORKSPACE.id,
        legalName: 'Acme Realty LLC',
      },
    });
    expect(txMock.workspaceMembership.create).toHaveBeenCalledWith({
      data: {
        workspaceId: SELECTED_BROKERAGE_WORKSPACE.id,
        userId: 'owner-1',
        status: 'ACTIVE',
      },
    });
    expect(txMock.workspaceMembershipRole.createMany).toHaveBeenCalledWith({
      data: [
        { membershipId: EXISTING_MEMBERSHIP.id, role: 'MANAGER' },
        { membershipId: EXISTING_MEMBERSHIP.id, role: 'AGENT' },
      ],
    });
    expect(txMock.workspaceAgent.create).toHaveBeenCalledWith({
      data: {
        workspaceId: SELECTED_BROKERAGE_WORKSPACE.id,
        userId: 'owner-1',
        status: 'ACTIVE',
      },
    });
    expect(result.type).toBe('BROKERAGE');
    expect(result.id).toBe(SELECTED_BROKERAGE_WORKSPACE.id);
  });

  it('with ownerActsAsAgent=false: executes the five steps exactly once each, in strict order, and never touches AgentProfile/WorkspaceAgent', async () => {
    const txMock = createBrokerageTxMock();
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    await repository.createBrokerageWorkspace(
      brokerageCommand({ ownerActsAsAgent: false }),
    );

    expectStrictCallOrder([
      { label: 'user.findUnique', mock: txMock.user.findUnique },
      { label: 'workspace.create', mock: txMock.workspace.create },
      { label: 'brokerage.create', mock: txMock.brokerage.create },
      {
        label: 'workspaceMembership.create',
        mock: txMock.workspaceMembership.create,
      },
      {
        label: 'workspaceMembershipRole.createMany',
        mock: txMock.workspaceMembershipRole.createMany,
      },
    ]);
    expect(txMock.agentProfile.findUnique).not.toHaveBeenCalled();
    expect(txMock.workspaceAgent.create).not.toHaveBeenCalled();
  });

  it('with ownerActsAsAgent=true: executes the seven steps exactly once each, in strict order', async () => {
    const txMock = createBrokerageTxMock();
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    await repository.createBrokerageWorkspace(
      brokerageCommand({ ownerActsAsAgent: true }),
    );

    expectStrictCallOrder([
      { label: 'user.findUnique', mock: txMock.user.findUnique },
      {
        label: 'agentProfile.findUnique',
        mock: txMock.agentProfile.findUnique,
      },
      { label: 'workspace.create', mock: txMock.workspace.create },
      { label: 'brokerage.create', mock: txMock.brokerage.create },
      {
        label: 'workspaceMembership.create',
        mock: txMock.workspaceMembership.create,
      },
      {
        label: 'workspaceMembershipRole.createMany',
        mock: txMock.workspaceMembershipRole.createMany,
      },
      { label: 'workspaceAgent.create', mock: txMock.workspaceAgent.create },
    ]);
  });

  it('rejects with AGENT_PROFILE_REQUIRED (proactive) only when ownerActsAsAgent=true, before any write', async () => {
    const txMock = createTxMock({
      agentProfile: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createBrokerageWorkspace({
        ownerUserId: 'owner-1',
        name: 'Acme Brokerage',
        slug: 'acme-brokerage',
        brokerageLegalName: 'Acme Realty LLC',
        ownerActsAsAgent: true,
      }),
    );

    expect(caught).toBeInstanceOf(PersistenceInvariantError);
    expect((caught as PersistenceInvariantError).reason).toBe(
      'AGENT_PROFILE_REQUIRED',
    );
    expect(txMock.workspace.create).not.toHaveBeenCalled();
    expect(txMock.brokerage.create).not.toHaveBeenCalled();
  });

  it('translates a residual AGENT_PROFILE_REQUIRED race (P2003 on workspaceAgent.create) when ownerActsAsAgent=true', async () => {
    const error = foreignKeyViolation('workspace_agents_user_id_fkey');
    const txMock = createTxMock({
      workspaceAgent: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createBrokerageWorkspace({
        ownerUserId: 'owner-1',
        name: 'Acme Brokerage',
        slug: 'acme-brokerage',
        brokerageLegalName: 'Acme Realty LLC',
        ownerActsAsAgent: true,
      }),
    );

    expect(caught).toBeInstanceOf(PersistenceInvariantError);
    expect((caught as PersistenceInvariantError).reason).toBe(
      'AGENT_PROFILE_REQUIRED',
    );
    expect((caught as PersistenceInvariantError).cause).toBe(error);
  });

  it('rejects with OWNER_NOT_FOUND (proactive) before any write', async () => {
    const txMock = createTxMock({
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createBrokerageWorkspace({
        ownerUserId: 'owner-1',
        name: 'Acme Brokerage',
        slug: 'acme-brokerage',
        brokerageLegalName: 'Acme Realty LLC',
        ownerActsAsAgent: false,
      }),
    );

    expect(caught).toBeInstanceOf(AggregateNotFoundError);
    expect((caught as AggregateNotFoundError).reason).toBe('OWNER_NOT_FOUND');
    expect(txMock.workspace.create).not.toHaveBeenCalled();
  });

  it('translates a unique violation on workspace.create into DUPLICATE_WORKSPACE_SLUG', async () => {
    const error = uniqueViolationByConstraintName('workspaces_slug_key');
    const txMock = createTxMock({
      workspace: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createBrokerageWorkspace({
        ownerUserId: 'owner-1',
        name: 'Acme Brokerage',
        slug: 'acme-brokerage',
        brokerageLegalName: 'Acme Realty LLC',
        ownerActsAsAgent: false,
      }),
    );

    expect(caught).toBeInstanceOf(PersistenceConflictError);
    expect((caught as PersistenceConflictError).reason).toBe(
      'DUPLICATE_WORKSPACE_SLUG',
    );
    expect((caught as PersistenceConflictError).cause).toBe(error);
  });

  it('normalizes an error from brokerage.create as UnexpectedPersistenceError', async () => {
    const error = new Error('unexpected constraint');
    const txMock = createTxMock({
      brokerage: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createBrokerageWorkspace({
        ownerUserId: 'owner-1',
        name: 'Acme Brokerage',
        slug: 'acme-brokerage',
        brokerageLegalName: 'Acme Realty LLC',
        ownerActsAsAgent: false,
      }),
    );

    assertUnexpected(caught, error);
  });

  it('passes brokerageLegalName through unchanged, without any normalization', async () => {
    const txMock = createTxMock();
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    await repository.createBrokerageWorkspace({
      ownerUserId: 'owner-1',
      name: 'Acme Brokerage',
      slug: 'acme-brokerage',
      brokerageLegalName: '  Acme Realty, LLC  ',
      ownerActsAsAgent: false,
    });

    expect(txMock.brokerage.create).toHaveBeenCalledWith({
      data: {
        workspaceId: SELECTED_WORKSPACE.id,
        legalName: '  Acme Realty, LLC  ',
      },
    });
  });

  // The BROKERAGE method has its own copies of the translation blocks and
  // of the outer boundary — each is covered here in its own right. These
  // tests prove translation and propagation only (mocks cannot prove a
  // real PostgreSQL rollback).

  it('translates a residual OWNER_NOT_FOUND race (P2003 workspaces_owner_user_id_fkey on workspace.create) in the BROKERAGE flow', async () => {
    const error = foreignKeyViolation('workspaces_owner_user_id_fkey');
    const txMock = createBrokerageTxMock({
      workspace: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createBrokerageWorkspace(brokerageCommand()),
    );

    expect(caught).toBeInstanceOf(AggregateNotFoundError);
    expect((caught as AggregateNotFoundError).reason).toBe('OWNER_NOT_FOUND');
    expect((caught as AggregateNotFoundError).cause).toBe(error);
    expect(txMock.brokerage.create).not.toHaveBeenCalled();
  });

  it('translates a unique violation on workspace.create (matched by columns) into DUPLICATE_WORKSPACE_SLUG in the BROKERAGE flow', async () => {
    const error = uniqueViolationByColumns(['slug']);
    const txMock = createBrokerageTxMock({
      workspace: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createBrokerageWorkspace(brokerageCommand()),
    );

    expect(caught).toBeInstanceOf(PersistenceConflictError);
    expect((caught as PersistenceConflictError).reason).toBe(
      'DUPLICATE_WORKSPACE_SLUG',
    );
    expect((caught as PersistenceConflictError).cause).toBe(error);
  });

  it('never labels an unrecognized P2003 constraint on workspace.create as OWNER_NOT_FOUND in the BROKERAGE flow', async () => {
    const error = foreignKeyViolation('some_other_fkey');
    const txMock = createBrokerageTxMock({
      workspace: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createBrokerageWorkspace(brokerageCommand()),
    );

    assertUnexpected(caught, error);
    expect((caught as UnexpectedPersistenceError).reason).not.toBe(
      'OWNER_NOT_FOUND',
    );
  });

  it('never labels an unrecognized P2003 constraint on workspaceAgent.create as AGENT_PROFILE_REQUIRED in the BROKERAGE flow', async () => {
    const error = foreignKeyViolation(
      'workspace_agents_workspace_id_user_id_fkey',
    );
    const txMock = createBrokerageTxMock({
      workspaceAgent: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createBrokerageWorkspace(
        brokerageCommand({ ownerActsAsAgent: true }),
      ),
    );

    assertUnexpected(caught, error);
    expect((caught as UnexpectedPersistenceError).reason).not.toBe(
      'AGENT_PROFILE_REQUIRED',
    );
  });

  it('normalizes an error from user.findUnique as UnexpectedPersistenceError in the BROKERAGE flow', async () => {
    const error = new Error('connection reset');
    const txMock = createBrokerageTxMock({
      user: { findUnique: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createBrokerageWorkspace(brokerageCommand()),
    );

    assertUnexpected(caught, error);
  });

  it('normalizes an error from agentProfile.findUnique (ownerActsAsAgent=true) as UnexpectedPersistenceError', async () => {
    const error = new Error('connection reset');
    const txMock = createBrokerageTxMock({
      agentProfile: { findUnique: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createBrokerageWorkspace(
        brokerageCommand({ ownerActsAsAgent: true }),
      ),
    );

    assertUnexpected(caught, error);
    expect(txMock.workspace.create).not.toHaveBeenCalled();
  });

  it('normalizes an error from workspaceMembership.create as UnexpectedPersistenceError in the BROKERAGE flow', async () => {
    const error = new Error('unexpected constraint');
    const txMock = createBrokerageTxMock({
      workspaceMembership: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createBrokerageWorkspace(brokerageCommand()),
    );

    assertUnexpected(caught, error);
  });

  it('normalizes an error from workspaceMembershipRole.createMany as UnexpectedPersistenceError in the BROKERAGE flow', async () => {
    const error = new Error('write failed');
    const txMock = createBrokerageTxMock({
      workspaceMembershipRole: { createMany: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createBrokerageWorkspace(brokerageCommand()),
    );

    assertUnexpected(caught, error);
  });

  it('normalizes a generic error from workspaceAgent.create (ownerActsAsAgent=true) as UnexpectedPersistenceError', async () => {
    const error = new Error('driver failure');
    const txMock = createBrokerageTxMock({
      workspaceAgent: { create: vi.fn().mockRejectedValue(error) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createBrokerageWorkspace(
        brokerageCommand({ ownerActsAsAgent: true }),
      ),
    );

    assertUnexpected(caught, error);
  });

  it('normalizes an error thrown directly by $transaction as UnexpectedPersistenceError in the BROKERAGE flow', async () => {
    const error = new Error('could not open transaction');
    const prisma = {
      $transaction: vi.fn().mockRejectedValue(error),
      workspace: { findUnique: vi.fn() },
    } as unknown as PrismaService;
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createBrokerageWorkspace(brokerageCommand()),
    );

    assertUnexpected(caught, error);
  });

  it('returns a pre-existing PersistenceError as the exact same instance through the BROKERAGE outer boundary', async () => {
    const original = new PersistenceInvariantError(
      'Owner has no AgentProfile.',
      'AGENT_PROFILE_REQUIRED',
    );
    const txMock = createBrokerageTxMock({
      brokerage: { create: vi.fn().mockRejectedValue(original) },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.createBrokerageWorkspace(brokerageCommand()),
    );

    expect(caught).toBe(original);
  });
});

describe('WorkspaceRepository.findById', () => {
  it('returns the mapped record when found, selecting only WorkspaceRecord fields', async () => {
    const prisma = {
      $transaction: vi.fn(),
      workspace: { findUnique: vi.fn().mockResolvedValue(SELECTED_WORKSPACE) },
    } as unknown as PrismaService;
    const repository = new WorkspaceRepository(prisma);

    const result = await repository.findById(SELECTED_WORKSPACE.id);

    expect(prisma.workspace.findUnique).toHaveBeenCalledWith({
      where: { id: SELECTED_WORKSPACE.id },
      select: EXPECTED_WORKSPACE_SELECT,
    });
    expect(result?.id).toBe(SELECTED_WORKSPACE.id);
  });

  it('returns null when not found', async () => {
    const prisma = {
      $transaction: vi.fn(),
      workspace: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const repository = new WorkspaceRepository(prisma);

    await expect(repository.findById('missing')).resolves.toBeNull();
  });

  it('normalizes an error from workspace.findUnique as UnexpectedPersistenceError', async () => {
    const error = new Error('connection lost');
    const prisma = {
      $transaction: vi.fn(),
      workspace: { findUnique: vi.fn().mockRejectedValue(error) },
    } as unknown as PrismaService;
    const repository = new WorkspaceRepository(prisma);

    const caught = await catchError(() =>
      repository.findById(SELECTED_WORKSPACE.id),
    );

    assertUnexpected(caught, error);
  });
});
