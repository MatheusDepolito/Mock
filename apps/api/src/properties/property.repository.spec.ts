import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  AggregateNotFoundError,
  OptimisticConcurrencyError,
  PersistenceInvariantError,
  UnexpectedPersistenceError,
} from '../persistence/errors';
import { PrismaService } from '../prisma/prisma.service';
import { PropertyRepository } from './property.repository';
import type {
  CreatePropertyCommand,
  UpdatePropertyStatusCommand,
} from './property.types';

/** Stands in for a Prisma `Decimal` instance — only `.toFixed` is exercised by the mapping code. */
function fakeDecimal(value: string): { toFixed: (dp: number) => string } {
  return { toFixed: () => value };
}

const SELECTED_PROPERTY = {
  id: 'property-1',
  workspaceId: 'workspace-1',
  responsibleAgentUserId: 'agent-1',
  title: 'Cozy Loft',
  price: fakeDecimal('250000.50'),
  currency: 'USD',
  status: 'DRAFT' as const,
  publishedAt: null,
  archivedAt: null,
  version: 1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const ADDRESS_ROW = {
  id: 'address-1',
  address_line_1: '123 Main St',
  address_line_2: null,
  district: null,
  country_code: 'US',
  region_code: 'CA',
  locality: 'San Francisco',
  postal_code: '94105',
  latitude: 37.7749,
  longitude: -122.4194,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
};

const EXPECTED_ADDRESS_RECORD = {
  id: ADDRESS_ROW.id,
  addressLine1: ADDRESS_ROW.address_line_1,
  addressLine2: ADDRESS_ROW.address_line_2,
  district: ADDRESS_ROW.district,
  countryCode: ADDRESS_ROW.country_code,
  regionCode: ADDRESS_ROW.region_code,
  locality: ADDRESS_ROW.locality,
  postalCode: ADDRESS_ROW.postal_code,
  latitude: ADDRESS_ROW.latitude,
  longitude: ADDRESS_ROW.longitude,
  createdAt: ADDRESS_ROW.created_at,
  updatedAt: ADDRESS_ROW.updated_at,
};

const ACTIVE_AGENT_ROW = { status: 'ACTIVE' };

const CAS_ROW = {
  id: 'property-1',
  workspace_id: 'workspace-1',
  responsible_agent_user_id: 'agent-1',
  title: 'Cozy Loft',
  price: '250000.50',
  currency: 'USD',
  status: 'PUBLISHED' as const,
  published_at: new Date('2026-02-01T00:00:00.000Z'),
  archived_at: null,
  version: 2,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-02-01T00:00:00.000Z'),
};

function validCommand(
  overrides: Partial<CreatePropertyCommand> = {},
): CreatePropertyCommand {
  return {
    workspaceId: 'workspace-1',
    responsibleAgentUserId: 'agent-1',
    title: 'Cozy Loft',
    price: '250000.50',
    currency: 'USD',
    address: {
      addressLine1: '123 Main St',
      countryCode: 'US',
      regionCode: 'CA',
      locality: 'San Francisco',
      postalCode: '94105',
      latitude: 37.7749,
      longitude: -122.4194,
    },
    ...overrides,
  };
}

function updateCommand(
  overrides: Partial<UpdatePropertyStatusCommand> = {},
): UpdatePropertyStatusCommand {
  return {
    workspaceId: 'workspace-1',
    propertyId: 'property-1',
    expectedVersion: 1,
    status: 'PUBLISHED',
    ...overrides,
  };
}

function createTxMock(overrides: Record<string, unknown> = {}) {
  return {
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([ACTIVE_AGENT_ROW])
      .mockResolvedValueOnce([ADDRESS_ROW]),
    property: {
      create: vi.fn().mockResolvedValue(SELECTED_PROPERTY),
      findUnique: vi.fn(),
    },
    ...overrides,
  };
}

/**
 * `$transaction` mock is a bare pass-through, same convention as
 * workspace.repository.spec.ts — never intercepts what the callback
 * throws/resolves.
 */
function createPrismaMock(
  txMock: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) {
  return {
    $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) =>
      callback(txMock),
    ),
    $queryRaw: vi.fn(),
    property: { findUnique: vi.fn() },
    ...overrides,
  } as unknown as PrismaService;
}

async function catchError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return undefined;
  } catch (error) {
    return error;
  }
}

interface SqlLike {
  text: string;
  values: unknown[];
}

function asSql(call: unknown): SqlLike {
  return call as SqlLike;
}

describe('PropertyRepository source — raw SQL discipline', () => {
  it('never calls $queryRawUnsafe or $executeRawUnsafe anywhere in the module', () => {
    // Checks the actual call syntax, not just the substring "RawUnsafe" —
    // the module's own doc comments legitimately name these two methods
    // as the ones it never calls.
    const source = readFileSync(
      join(__dirname, 'property.repository.ts'),
      'utf8',
    );
    expect(source).not.toContain('queryRawUnsafe(');
    expect(source).not.toContain('executeRawUnsafe(');
  });
});

describe('PropertyRepository.createProperty', () => {
  it('rejects invalid currency format before opening a transaction (guard runs before any Prisma access)', async () => {
    const txMock = createTxMock();
    const prisma = createPrismaMock(txMock);
    const repository = new PropertyRepository(prisma);

    const error = await catchError(() =>
      repository.createProperty(validCommand({ currency: 'usd' })),
    );

    expect(error).toBeInstanceOf(PersistenceInvariantError);
    expect((error as PersistenceInvariantError).reason).toBe(
      'INVALID_PROPERTY_INPUT',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects invalid address format (countryCode) before opening a transaction', async () => {
    const txMock = createTxMock();
    const prisma = createPrismaMock(txMock);
    const repository = new PropertyRepository(prisma);

    const error = await catchError(() =>
      repository.createProperty(
        validCommand({
          address: { ...validCommand().address, countryCode: 'usa' },
        }),
      ),
    );

    expect(error).toBeInstanceOf(PersistenceInvariantError);
    expect((error as PersistenceInvariantError).reason).toBe(
      'INVALID_PROPERTY_INPUT',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('locks the WorkspaceAgent row as the first statement, then creates Property, then Address, in strict order', async () => {
    const txMock = createTxMock();
    const prisma = createPrismaMock(txMock);
    const repository = new PropertyRepository(prisma);

    await repository.createProperty(validCommand());

    const queryRawOrder = (
      txMock.$queryRaw as unknown as { mock: { invocationCallOrder: number[] } }
    ).mock.invocationCallOrder;
    const createOrder = (
      txMock.property.create as unknown as {
        mock: { invocationCallOrder: number[] };
      }
    ).mock.invocationCallOrder;

    expect(queryRawOrder).toHaveLength(2);
    expect(createOrder).toHaveLength(1);
    expect(queryRawOrder[0]).toBeLessThan(createOrder[0] as number);
    expect(createOrder[0]).toBeLessThan(queryRawOrder[1] as number);
  });

  it('locks by workspaceId + responsibleAgentUserId, using FOR UPDATE, fully parameterized', async () => {
    const txMock = createTxMock();
    const prisma = createPrismaMock(txMock);
    const repository = new PropertyRepository(prisma);

    await repository.createProperty(validCommand());

    const lockCall = asSql(
      (txMock.$queryRaw as unknown as { mock: { calls: unknown[][] } }).mock
        .calls[0]?.[0],
    );
    expect(lockCall.text).toContain('FOR UPDATE');
    expect(lockCall.text).toContain('workspace_agents');
    expect(lockCall.values).toEqual(['workspace-1', 'agent-1']);
  });

  it.each([
    ['missing WorkspaceAgent row', []],
    ['SUSPENDED WorkspaceAgent', [{ status: 'SUSPENDED' }]],
    ['REVOKED WorkspaceAgent', [{ status: 'REVOKED' }]],
  ])(
    'rejects with RESPONSIBLE_AGENT_NOT_ACTIVE and never creates Property/Address for %s',
    async (_label, lockResult) => {
      const txMock = createTxMock({
        $queryRaw: vi.fn().mockResolvedValueOnce(lockResult),
      });
      const prisma = createPrismaMock(txMock);
      const repository = new PropertyRepository(prisma);

      const error = await catchError(() =>
        repository.createProperty(validCommand()),
      );

      expect(error).toBeInstanceOf(PersistenceInvariantError);
      expect((error as PersistenceInvariantError).reason).toBe(
        'RESPONSIBLE_AGENT_NOT_ACTIVE',
      );
      expect(txMock.property.create).not.toHaveBeenCalled();
      expect(
        (txMock.$queryRaw as unknown as { mock: { calls: unknown[][] } }).mock
          .calls,
      ).toHaveLength(1);
    },
  );

  it('inserts Address via parameterized SQL, omitting id, with optional fields mapped to null', async () => {
    const txMock = createTxMock();
    const prisma = createPrismaMock(txMock);
    const repository = new PropertyRepository(prisma);

    await repository.createProperty(validCommand());

    const insertCall = asSql(
      (txMock.$queryRaw as unknown as { mock: { calls: unknown[][] } }).mock
        .calls[1]?.[0],
    );
    expect(insertCall.text).toContain('INSERT INTO addresses');
    expect(insertCall.text).toContain('RETURNING');
    // 11 parameters, never 12 — `id` is never passed as a value; the
    // column is omitted from the INSERT entirely, relying on the
    // column's native `uuidv7()` default.
    expect(insertCall.values).toHaveLength(11);
    // workspaceId, property.id, addressLine1, addressLine2, district,
    // countryCode, regionCode, locality, postalCode, longitude, latitude.
    expect(insertCall.values).toEqual([
      'workspace-1',
      'property-1',
      '123 Main St',
      null,
      null,
      'US',
      'CA',
      'San Francisco',
      '94105',
      -122.4194,
      37.7749,
    ]);
  });

  it('persists longitude as X and latitude as Y (ST_MakePoint(longitude, latitude)), returning them via ST_X/ST_Y respectively', async () => {
    const txMock = createTxMock();
    const prisma = createPrismaMock(txMock);
    const repository = new PropertyRepository(prisma);

    await repository.createProperty(validCommand());

    const insertCall = asSql(
      (txMock.$queryRaw as unknown as { mock: { calls: unknown[][] } }).mock
        .calls[1]?.[0],
    );
    expect(insertCall.text).toContain('ST_MakePoint');
    expect(insertCall.text).toContain('ST_Y(location::geometry) AS latitude');
    expect(insertCall.text).toContain('ST_X(location::geometry) AS longitude');
    // Longitude is passed to ST_MakePoint before latitude — values[9] is
    // longitude, values[10] is latitude, per the INSERT column order above.
    expect(insertCall.values[9]).toBe(-122.4194);
    expect(insertCall.values[10]).toBe(37.7749);
  });

  it('returns price as an exact decimal string, never a number', async () => {
    const txMock = createTxMock();
    const prisma = createPrismaMock(txMock);
    const repository = new PropertyRepository(prisma);

    const result = await repository.createProperty(validCommand());

    expect(result.price).toBe('250000.50');
    expect(typeof result.price).toBe('string');
  });

  it('returns the full PropertyWithAddressResult, address never null', async () => {
    const txMock = createTxMock();
    const prisma = createPrismaMock(txMock);
    const repository = new PropertyRepository(prisma);

    const result = await repository.createProperty(validCommand());

    expect(result).toEqual({
      id: SELECTED_PROPERTY.id,
      workspaceId: SELECTED_PROPERTY.workspaceId,
      responsibleAgentUserId: SELECTED_PROPERTY.responsibleAgentUserId,
      title: SELECTED_PROPERTY.title,
      price: '250000.50',
      currency: SELECTED_PROPERTY.currency,
      status: SELECTED_PROPERTY.status,
      publishedAt: SELECTED_PROPERTY.publishedAt,
      archivedAt: SELECTED_PROPERTY.archivedAt,
      version: SELECTED_PROPERTY.version,
      createdAt: SELECTED_PROPERTY.createdAt,
      updatedAt: SELECTED_PROPERTY.updatedAt,
      address: EXPECTED_ADDRESS_RECORD,
    });
  });

  it('normalizes an unexpected error raised inside the transaction into UnexpectedPersistenceError', async () => {
    const rawError = new Error('connection reset');
    const txMock = createTxMock({
      $queryRaw: vi.fn().mockRejectedValueOnce(rawError),
    });
    const prisma = createPrismaMock(txMock);
    const repository = new PropertyRepository(prisma);

    const error = await catchError(() =>
      repository.createProperty(validCommand()),
    );

    expect(error).toBeInstanceOf(UnexpectedPersistenceError);
    expect((error as UnexpectedPersistenceError).reason).toBe(
      'UNEXPECTED_PERSISTENCE_ERROR',
    );
    expect((error as UnexpectedPersistenceError).cause).toBe(rawError);
  });

  it('preserves a PersistenceError thrown inside the transaction by identity, never wrapping it twice', async () => {
    const txMock = createTxMock({
      $queryRaw: vi.fn().mockResolvedValueOnce([{ status: 'REVOKED' }]),
    });
    const prisma = createPrismaMock(txMock);
    const repository = new PropertyRepository(prisma);

    const error = await catchError(() =>
      repository.createProperty(validCommand()),
    );

    expect(error).toBeInstanceOf(PersistenceInvariantError);
    expect((error as PersistenceInvariantError).reason).toBe(
      'RESPONSIBLE_AGENT_NOT_ACTIVE',
    );
  });
});

describe('PropertyRepository.findByIdInWorkspace', () => {
  it('returns null when the Property does not exist in that workspace, never querying the Address', async () => {
    const queryRaw = vi.fn();
    const prisma = createPrismaMock(createTxMock(), {
      property: { findUnique: vi.fn().mockResolvedValue(null) },
      $queryRaw: queryRaw,
    });
    const repository = new PropertyRepository(prisma);

    const result = await repository.findByIdInWorkspace(
      'workspace-1',
      'missing',
    );

    expect(result).toBeNull();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('scopes the lookup by workspaceId + id via the composite unique index', async () => {
    const propertyFindUnique = vi.fn().mockResolvedValue(SELECTED_PROPERTY);
    const prisma = createPrismaMock(createTxMock(), {
      property: { findUnique: propertyFindUnique },
      $queryRaw: vi.fn().mockResolvedValue([ADDRESS_ROW]),
    });
    const repository = new PropertyRepository(prisma);

    await repository.findByIdInWorkspace('workspace-1', 'property-1');

    expect(propertyFindUnique).toHaveBeenCalledWith({
      where: {
        workspaceId_id: { workspaceId: 'workspace-1', id: 'property-1' },
      },
      select: expect.any(Object),
    });
  });

  it('throws PROPERTY_ADDRESS_MISSING when the Property exists but has no Address', async () => {
    const prisma = createPrismaMock(createTxMock(), {
      property: { findUnique: vi.fn().mockResolvedValue(SELECTED_PROPERTY) },
      $queryRaw: vi.fn().mockResolvedValue([]),
    });
    const repository = new PropertyRepository(prisma);

    const error = await catchError(() =>
      repository.findByIdInWorkspace('workspace-1', 'property-1'),
    );

    expect(error).toBeInstanceOf(PersistenceInvariantError);
    expect((error as PersistenceInvariantError).reason).toBe(
      'PROPERTY_ADDRESS_MISSING',
    );
  });

  it('returns the full result when both Property and Address exist', async () => {
    const prisma = createPrismaMock(createTxMock(), {
      property: { findUnique: vi.fn().mockResolvedValue(SELECTED_PROPERTY) },
      $queryRaw: vi.fn().mockResolvedValue([ADDRESS_ROW]),
    });
    const repository = new PropertyRepository(prisma);

    const result = await repository.findByIdInWorkspace(
      'workspace-1',
      'property-1',
    );

    expect(result?.address).toEqual(EXPECTED_ADDRESS_RECORD);
    expect(result?.price).toBe('250000.50');
  });

  it('normalizes an unexpected driver error into UnexpectedPersistenceError', async () => {
    const rawError = new Error('connection reset');
    const prisma = createPrismaMock(createTxMock(), {
      property: { findUnique: vi.fn().mockRejectedValue(rawError) },
      $queryRaw: vi.fn(),
    });
    const repository = new PropertyRepository(prisma);

    const error = await catchError(() =>
      repository.findByIdInWorkspace('workspace-1', 'property-1'),
    );

    expect(error).toBeInstanceOf(UnexpectedPersistenceError);
    expect((error as UnexpectedPersistenceError).reason).toBe(
      'UNEXPECTED_PERSISTENCE_ERROR',
    );
    expect((error as UnexpectedPersistenceError).cause).toBe(rawError);
  });
});

describe('PropertyRepository.updatePropertyStatus', () => {
  function txMockForUpdate(
    casResult: unknown[],
    overrides: Record<string, unknown> = {},
  ) {
    return {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce(casResult)
        .mockResolvedValueOnce([ADDRESS_ROW]),
      property: { findUnique: vi.fn() },
      ...overrides,
    };
  }

  it('performs the CAS as a single parameterized UPDATE ... RETURNING, scoped by workspaceId + propertyId + expectedVersion', async () => {
    const txMock = txMockForUpdate([CAS_ROW]);
    const prisma = createPrismaMock(txMock);
    const repository = new PropertyRepository(prisma);

    await repository.updatePropertyStatus(updateCommand());

    const casCall = asSql(
      (txMock.$queryRaw as unknown as { mock: { calls: unknown[][] } }).mock
        .calls[0]?.[0],
    );
    expect(casCall.text).toContain('UPDATE properties');
    expect(casCall.text).toContain('RETURNING');
    expect(casCall.text).not.toContain('RawUnsafe');
    expect(casCall.values).toEqual([
      'PUBLISHED',
      'PUBLISHED',
      'PUBLISHED',
      'workspace-1',
      'property-1',
      1,
    ]);
  });

  it('on success, returns the updated Property with its Address, version/updatedAt bumped by the database', async () => {
    const txMock = txMockForUpdate([CAS_ROW]);
    const prisma = createPrismaMock(txMock);
    const repository = new PropertyRepository(prisma);

    const result = await repository.updatePropertyStatus(updateCommand());

    expect(result.status).toBe('PUBLISHED');
    expect(result.version).toBe(2);
    expect(result.price).toBe('250000.50');
    expect(result.address).toEqual(EXPECTED_ADDRESS_RECORD);
  });

  it('disambiguates zero CAS rows into PROPERTY_NOT_FOUND when the Property does not exist in that workspace, looking it up by the exact composite workspaceId_id key', async () => {
    const propertyFindUnique = vi.fn().mockResolvedValue(null);
    const txMock = txMockForUpdate([], {
      property: { findUnique: propertyFindUnique },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new PropertyRepository(prisma);

    const error = await catchError(() =>
      repository.updatePropertyStatus(updateCommand()),
    );

    expect(error).toBeInstanceOf(AggregateNotFoundError);
    expect((error as AggregateNotFoundError).reason).toBe('PROPERTY_NOT_FOUND');
    // Proves tenant isolation on this specific lookup: a regression that
    // dropped `workspaceId` from the compound key (querying by `id`
    // alone) would not be caught by the assertions above, since a mocked
    // `findUnique` resolves to `null` regardless of its arguments — this
    // is the only thing that would catch it.
    expect(propertyFindUnique).toHaveBeenCalledWith({
      where: {
        workspaceId_id: { workspaceId: 'workspace-1', id: 'property-1' },
      },
      select: { id: true },
    });
  });

  it('disambiguates zero CAS rows into PROPERTY_VERSION_CONFLICT when the Property exists with a different version, looking it up by the exact composite workspaceId_id key', async () => {
    const propertyFindUnique = vi.fn().mockResolvedValue({ id: 'property-1' });
    const txMock = txMockForUpdate([], {
      property: { findUnique: propertyFindUnique },
    });
    const prisma = createPrismaMock(txMock);
    const repository = new PropertyRepository(prisma);

    const error = await catchError(() =>
      repository.updatePropertyStatus(updateCommand()),
    );

    expect(error).toBeInstanceOf(OptimisticConcurrencyError);
    expect((error as OptimisticConcurrencyError).reason).toBe(
      'PROPERTY_VERSION_CONFLICT',
    );
    expect(propertyFindUnique).toHaveBeenCalledWith({
      where: {
        workspaceId_id: { workspaceId: 'workspace-1', id: 'property-1' },
      },
      select: { id: true },
    });
  });

  it('throws PROPERTY_ADDRESS_MISSING after a successful CAS when the Property has no Address', async () => {
    const txMock = txMockForUpdate([CAS_ROW]);
    (txMock.$queryRaw as ReturnType<typeof vi.fn>).mockReset();
    (txMock.$queryRaw as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([CAS_ROW])
      .mockResolvedValueOnce([]);
    const prisma = createPrismaMock(txMock);
    const repository = new PropertyRepository(prisma);

    const error = await catchError(() =>
      repository.updatePropertyStatus(updateCommand()),
    );

    expect(error).toBeInstanceOf(PersistenceInvariantError);
    expect((error as PersistenceInvariantError).reason).toBe(
      'PROPERTY_ADDRESS_MISSING',
    );
  });

  it('normalizes an unexpected driver error into UnexpectedPersistenceError', async () => {
    const rawError = new Error('driver exploded');
    const txMock = {
      $queryRaw: vi.fn().mockRejectedValueOnce(rawError),
      property: { findUnique: vi.fn() },
    };
    const prisma = createPrismaMock(txMock);
    const repository = new PropertyRepository(prisma);

    const error = await catchError(() =>
      repository.updatePropertyStatus(updateCommand()),
    );

    expect(error).toBeInstanceOf(UnexpectedPersistenceError);
    expect((error as UnexpectedPersistenceError).cause).toBe(rawError);
  });
});
