import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { RuntimeConfigModule } from '../../src/common/runtime-config.module';
import {
  AggregateNotFoundError,
  OptimisticConcurrencyError,
  PersistenceInvariantError,
} from '../../src/persistence/errors';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PropertiesModule } from '../../src/properties/properties.module';
import { PropertyRepository } from '../../src/properties/property.repository';
import type { CreatePropertyCommand } from '../../src/properties/property.types';
import { WorkspaceRepository } from '../../src/workspaces/workspace.repository';
import { WorkspacesModule } from '../../src/workspaces/workspaces.module';
import { buildInfraServerConfig } from '../support/infra-server-config';

/**
 * A deterministic "before" timestamp used to prove a column was
 * actually rewritten by a later call, without any sleep or artificial
 * delay: the fixture sets the column to this fixed past value directly
 * (bypassing the Repository), then the assertion only needs to show the
 * real call's result differs from — and is later than — this known
 * constant, regardless of how close in real time the two calls land.
 */
const STALE_TIMESTAMP = new Date('2020-01-01T00:00:00.000Z');

function requireDate(value: Date | null, label: string): Date {
  if (!value) {
    throw new Error(`Expected ${label} to be a Date, got null.`);
  }
  return value;
}

/**
 * Real-infrastructure tests for `PropertyRepository` (Tarefa 3.3.7) —
 * real PostgreSQL/PostGIS (`mockp_test`), no mocks. Each `it()` gets a
 * clean slate via the guarded `beforeEach` in test/infra/setup.ts.
 * `User`/`AgentProfile`/an ACTIVE `WorkspaceAgent` are bootstrapped
 * through `WorkspaceRepository`'s real public API (no repository owns
 * bare `User`/`AgentProfile` creation yet, so those two still go
 * directly through `PrismaService`, same convention as
 * workspace-repository.infra.spec.ts); every `Property`/`Address` in
 * these tests is created through `PropertyRepository`'s public API,
 * except the one fixture explicitly documented as bypassing it (ADR 008
 * §7.3, the `PROPERTY_ADDRESS_MISSING` rollback proof).
 */
describe('PropertyRepository (real mockp_test)', () => {
  async function bootstrap() {
    const config = buildInfraServerConfig();
    const moduleRef = await Test.createTestingModule({
      imports: [
        RuntimeConfigModule.forRoot(config),
        PrismaModule,
        WorkspacesModule,
        PropertiesModule,
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return {
      app,
      propertyRepository: app.get(PropertyRepository),
      workspaceRepository: app.get(WorkspaceRepository),
      prisma: app.get(PrismaService),
    };
  }

  /** Creates a User + AgentProfile + INDIVIDUAL Workspace with an ACTIVE WorkspaceAgent for that same user, through the real `WorkspaceRepository`. */
  async function createActiveAgentWorkspace(
    prisma: PrismaService,
    workspaceRepository: WorkspaceRepository,
    slugSuffix: string,
  ) {
    const owner = await prisma.user.create({
      data: { email: `agent-${slugSuffix}@example.com` },
    });
    await prisma.agentProfile.create({ data: { userId: owner.id } });
    const workspace = await workspaceRepository.createIndividualWorkspace({
      ownerUserId: owner.id,
      name: `Workspace ${slugSuffix}`,
      slug: `property-workspace-${slugSuffix}`,
    });
    return { workspaceId: workspace.id, agentUserId: owner.id };
  }

  function validCommand(
    overrides: Partial<CreatePropertyCommand> = {},
  ): CreatePropertyCommand {
    return {
      workspaceId: 'REPLACE_ME',
      responsibleAgentUserId: 'REPLACE_ME',
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

  it('creates a Property with its Address, round-tripping PostGIS coordinates exactly, with a native UUIDv7 Address.id', async () => {
    const { app, propertyRepository, workspaceRepository, prisma } =
      await bootstrap();
    try {
      const { workspaceId, agentUserId } = await createActiveAgentWorkspace(
        prisma,
        workspaceRepository,
        'happy-path',
      );

      const result = await propertyRepository.createProperty(
        validCommand({
          workspaceId,
          responsibleAgentUserId: agentUserId,
        }),
      );

      expect(result.price).toBe('250000.50');
      expect(result.status).toBe('DRAFT');
      expect(result.address.latitude).toBeCloseTo(37.7749, 10);
      expect(result.address.longitude).toBeCloseTo(-122.4194, 10);
      // Native uuidv7() default — the version nibble ('7') and the
      // variant bits ([89ab]) are checked explicitly, not just "any
      // UUID" — never equal to Property.id, never empty.
      expect(result.address.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(result.address.id).not.toBe(result.id);

      const addressRow = await prisma.address.findUnique({
        where: {
          workspaceId_propertyId: { workspaceId, propertyId: result.id },
        },
      });
      expect(addressRow?.id).toBe(result.address.id);
    } finally {
      await app.close();
    }
  });

  it('rejects RESPONSIBLE_AGENT_NOT_ACTIVE and persists nothing when the agent belongs to a different workspace', async () => {
    const { app, propertyRepository, workspaceRepository, prisma } =
      await bootstrap();
    try {
      const { agentUserId } = await createActiveAgentWorkspace(
        prisma,
        workspaceRepository,
        'agent-elsewhere',
      );
      const { workspaceId: otherWorkspaceId } =
        await createActiveAgentWorkspace(
          prisma,
          workspaceRepository,
          'other-workspace',
        );

      const error = await propertyRepository
        .createProperty(
          validCommand({
            workspaceId: otherWorkspaceId,
            responsibleAgentUserId: agentUserId,
          }),
        )
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(PersistenceInvariantError);
      expect((error as PersistenceInvariantError).reason).toBe(
        'RESPONSIBLE_AGENT_NOT_ACTIVE',
      );
      expect(
        await prisma.property.count({
          where: { workspaceId: otherWorkspaceId },
        }),
      ).toBe(0);
    } finally {
      await app.close();
    }
  });

  it.each(['SUSPENDED', 'REVOKED'] as const)(
    'rejects RESPONSIBLE_AGENT_NOT_ACTIVE and persists nothing when the WorkspaceAgent is %s',
    async (status) => {
      const { app, propertyRepository, workspaceRepository, prisma } =
        await bootstrap();
      try {
        const { workspaceId, agentUserId } = await createActiveAgentWorkspace(
          prisma,
          workspaceRepository,
          `not-active-${status.toLowerCase()}`,
        );
        await prisma.workspaceAgent.update({
          where: { workspaceId_userId: { workspaceId, userId: agentUserId } },
          data: {
            status,
            revokedAt: status === 'REVOKED' ? new Date() : null,
          },
        });

        const error = await propertyRepository
          .createProperty(
            validCommand({ workspaceId, responsibleAgentUserId: agentUserId }),
          )
          .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(PersistenceInvariantError);
        expect((error as PersistenceInvariantError).reason).toBe(
          'RESPONSIBLE_AGENT_NOT_ACTIVE',
        );
        expect(await prisma.property.count({ where: { workspaceId } })).toBe(0);
        expect(await prisma.address.count({ where: { workspaceId } })).toBe(0);
      } finally {
        await app.close();
      }
    },
  );

  it('findByIdInWorkspace never leaks cross-tenant existence: the same id in another workspace returns null', async () => {
    const { app, propertyRepository, workspaceRepository, prisma } =
      await bootstrap();
    try {
      const { workspaceId, agentUserId } = await createActiveAgentWorkspace(
        prisma,
        workspaceRepository,
        'tenant-a',
      );
      const { workspaceId: otherWorkspaceId } =
        await createActiveAgentWorkspace(
          prisma,
          workspaceRepository,
          'tenant-b',
        );

      const created = await propertyRepository.createProperty(
        validCommand({ workspaceId, responsibleAgentUserId: agentUserId }),
      );

      const foundInOwnWorkspace = await propertyRepository.findByIdInWorkspace(
        workspaceId,
        created.id,
      );
      expect(foundInOwnWorkspace?.id).toBe(created.id);

      const foundInOtherWorkspace =
        await propertyRepository.findByIdInWorkspace(
          otherWorkspaceId,
          created.id,
        );
      expect(foundInOtherWorkspace).toBeNull();

      const missing = await propertyRepository.findByIdInWorkspace(
        workspaceId,
        '00000000-0000-4000-8000-000000000999',
      );
      expect(missing).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('applies the Property.status state machine: DRAFT -> PUBLISHED sets publishedAt; ARCHIVED preserves it; re-publishing after archiving preserves the original publishedAt; back to DRAFT clears both', async () => {
    const { app, propertyRepository, workspaceRepository, prisma } =
      await bootstrap();
    try {
      const { workspaceId, agentUserId } = await createActiveAgentWorkspace(
        prisma,
        workspaceRepository,
        'lifecycle',
      );
      const created = await propertyRepository.createProperty(
        validCommand({ workspaceId, responsibleAgentUserId: agentUserId }),
      );
      expect(created.publishedAt).toBeNull();
      expect(created.archivedAt).toBeNull();

      const published = await propertyRepository.updatePropertyStatus({
        workspaceId,
        propertyId: created.id,
        expectedVersion: created.version,
        status: 'PUBLISHED',
      });
      expect(published.status).toBe('PUBLISHED');
      expect(published.publishedAt).not.toBeNull();
      expect(published.archivedAt).toBeNull();
      expect(published.version).toBe(created.version + 1);

      const archived = await propertyRepository.updatePropertyStatus({
        workspaceId,
        propertyId: created.id,
        expectedVersion: published.version,
        status: 'ARCHIVED',
      });
      expect(archived.status).toBe('ARCHIVED');
      expect(archived.archivedAt).not.toBeNull();
      // publishedAt is preserved as-is when archiving.
      expect(archived.publishedAt).toEqual(published.publishedAt);

      const republished = await propertyRepository.updatePropertyStatus({
        workspaceId,
        propertyId: created.id,
        expectedVersion: archived.version,
        status: 'PUBLISHED',
      });
      expect(republished.status).toBe('PUBLISHED');
      expect(republished.archivedAt).toBeNull();
      // Republishing preserves the original publishedAt — never reset to
      // a new "now()" when one already existed.
      expect(republished.publishedAt).toEqual(published.publishedAt);

      const backToDraft = await propertyRepository.updatePropertyStatus({
        workspaceId,
        propertyId: created.id,
        expectedVersion: republished.version,
        status: 'DRAFT',
      });
      expect(backToDraft.status).toBe('DRAFT');
      expect(backToDraft.publishedAt).toBeNull();
      expect(backToDraft.archivedAt).toBeNull();

      const republishedAfterDraft =
        await propertyRepository.updatePropertyStatus({
          workspaceId,
          propertyId: created.id,
          expectedVersion: backToDraft.version,
          status: 'PUBLISHED',
        });
      // Having gone through DRAFT, the original publishedAt is gone —
      // this publish sets a brand new timestamp.
      expect(republishedAfterDraft.publishedAt).not.toBeNull();
      expect(republishedAfterDraft.publishedAt).not.toEqual(
        published.publishedAt,
      );
    } finally {
      await app.close();
    }
  });

  it('updatePropertyStatus PUBLISHED -> PUBLISHED: each call increments version and updatedAt while preserving the original publishedAt', async () => {
    const { app, propertyRepository, workspaceRepository, prisma } =
      await bootstrap();
    try {
      const { workspaceId, agentUserId } = await createActiveAgentWorkspace(
        prisma,
        workspaceRepository,
        'publish-idempotent',
      );
      const created = await propertyRepository.createProperty(
        validCommand({ workspaceId, responsibleAgentUserId: agentUserId }),
      );

      const firstPublish = await propertyRepository.updatePropertyStatus({
        workspaceId,
        propertyId: created.id,
        expectedVersion: created.version,
        status: 'PUBLISHED',
      });
      const firstPublishedAt = requireDate(
        firstPublish.publishedAt,
        'firstPublish.publishedAt',
      );

      // No sleeps: a known, deterministic "before" updatedAt is written
      // directly (bypassing the Repository), so the second call's
      // returned updatedAt can be proven to have actually advanced
      // without depending on two real transactions landing in different
      // milliseconds.
      await prisma.property.update({
        where: { id: created.id },
        data: { updatedAt: STALE_TIMESTAMP },
      });

      const secondPublish = await propertyRepository.updatePropertyStatus({
        workspaceId,
        propertyId: created.id,
        expectedVersion: firstPublish.version,
        status: 'PUBLISHED',
      });

      expect(secondPublish.status).toBe('PUBLISHED');
      // Requesting the same status twice still counts as a real CAS
      // update — version and updatedAt advance, never a silent no-op
      // (ADR 008 §4.3).
      expect(secondPublish.version).toBe(firstPublish.version + 1);
      expect(secondPublish.updatedAt.getTime()).toBeGreaterThan(
        STALE_TIMESTAMP.getTime(),
      );
      // publishedAt is preserved bit-for-bit across the redundant call —
      // COALESCE(published_at, now()) never touches an already-set
      // value (ADR 007, "Máquina de estados de Property.status").
      expect(secondPublish.publishedAt).toEqual(firstPublishedAt);
      expect(secondPublish.archivedAt).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('updatePropertyStatus ARCHIVED -> ARCHIVED: each call increments version and renews archivedAt', async () => {
    const { app, propertyRepository, workspaceRepository, prisma } =
      await bootstrap();
    try {
      const { workspaceId, agentUserId } = await createActiveAgentWorkspace(
        prisma,
        workspaceRepository,
        'archive-idempotent',
      );
      const created = await propertyRepository.createProperty(
        validCommand({ workspaceId, responsibleAgentUserId: agentUserId }),
      );

      const firstArchive = await propertyRepository.updatePropertyStatus({
        workspaceId,
        propertyId: created.id,
        expectedVersion: created.version,
        status: 'ARCHIVED',
      });
      requireDate(firstArchive.archivedAt, 'firstArchive.archivedAt');

      // Same technique as the PUBLISHED case above: a known,
      // deterministic "before" value for both archivedAt and
      // updatedAt, set directly, no sleep — the second call must
      // overwrite both away from it.
      await prisma.property.update({
        where: { id: created.id },
        data: { archivedAt: STALE_TIMESTAMP, updatedAt: STALE_TIMESTAMP },
      });

      const secondArchive = await propertyRepository.updatePropertyStatus({
        workspaceId,
        propertyId: created.id,
        expectedVersion: firstArchive.version,
        status: 'ARCHIVED',
      });

      expect(secondArchive.status).toBe('ARCHIVED');
      expect(secondArchive.version).toBe(firstArchive.version + 1);
      expect(secondArchive.updatedAt.getTime()).toBeGreaterThan(
        STALE_TIMESTAMP.getTime(),
      );
      // archivedAt is renewed on every ARCHIVED destination, even when
      // re-archiving — asymmetric with PUBLISHED's preserve-via-COALESCE
      // behavior above, and exactly as documented in ADR 007's "Máquina
      // de estados de Property.status".
      const secondArchivedAt = requireDate(
        secondArchive.archivedAt,
        'secondArchive.archivedAt',
      );
      expect(secondArchivedAt.getTime()).toBeGreaterThan(
        STALE_TIMESTAMP.getTime(),
      );
      expect(secondArchive.publishedAt).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('archives a DRAFT Property directly (never published): archivedAt is set, publishedAt stays null', async () => {
    const { app, propertyRepository, workspaceRepository, prisma } =
      await bootstrap();
    try {
      const { workspaceId, agentUserId } = await createActiveAgentWorkspace(
        prisma,
        workspaceRepository,
        'draft-to-archived',
      );
      const created = await propertyRepository.createProperty(
        validCommand({ workspaceId, responsibleAgentUserId: agentUserId }),
      );

      const archived = await propertyRepository.updatePropertyStatus({
        workspaceId,
        propertyId: created.id,
        expectedVersion: created.version,
        status: 'ARCHIVED',
      });

      expect(archived.status).toBe('ARCHIVED');
      expect(archived.archivedAt).not.toBeNull();
      expect(archived.publishedAt).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('CAS: succeeds and bumps version/updatedAt with the correct expectedVersion; rejects with PROPERTY_VERSION_CONFLICT on a stale one', async () => {
    const { app, propertyRepository, workspaceRepository, prisma } =
      await bootstrap();
    try {
      const { workspaceId, agentUserId } = await createActiveAgentWorkspace(
        prisma,
        workspaceRepository,
        'cas',
      );
      const created = await propertyRepository.createProperty(
        validCommand({ workspaceId, responsibleAgentUserId: agentUserId }),
      );

      const staleError = await propertyRepository
        .updatePropertyStatus({
          workspaceId,
          propertyId: created.id,
          expectedVersion: created.version + 41,
          status: 'PUBLISHED',
        })
        .catch((caught: unknown) => caught);
      expect(staleError).toBeInstanceOf(OptimisticConcurrencyError);
      expect((staleError as OptimisticConcurrencyError).reason).toBe(
        'PROPERTY_VERSION_CONFLICT',
      );

      const succeeded = await propertyRepository.updatePropertyStatus({
        workspaceId,
        propertyId: created.id,
        expectedVersion: created.version,
        status: 'PUBLISHED',
      });
      expect(succeeded.version).toBe(created.version + 1);
      expect(succeeded.updatedAt.getTime()).toBeGreaterThanOrEqual(
        created.updatedAt.getTime(),
      );
    } finally {
      await app.close();
    }
  });

  it('rejects with PROPERTY_NOT_FOUND when the Property does not exist in that workspace', async () => {
    const { app, propertyRepository, workspaceRepository, prisma } =
      await bootstrap();
    try {
      const { workspaceId } = await createActiveAgentWorkspace(
        prisma,
        workspaceRepository,
        'not-found',
      );

      const error = await propertyRepository
        .updatePropertyStatus({
          workspaceId,
          propertyId: '00000000-0000-4000-8000-000000000999',
          expectedVersion: 1,
          status: 'PUBLISHED',
        })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AggregateNotFoundError);
      expect((error as AggregateNotFoundError).reason).toBe(
        'PROPERTY_NOT_FOUND',
      );
    } finally {
      await app.close();
    }
  });

  it('rejects with PROPERTY_NOT_FOUND — never PROPERTY_VERSION_CONFLICT — when the Property exists for real but in a different workspace, and never alters the original record', async () => {
    const { app, propertyRepository, workspaceRepository, prisma } =
      await bootstrap();
    try {
      const { workspaceId: ownWorkspaceId, agentUserId } =
        await createActiveAgentWorkspace(
          prisma,
          workspaceRepository,
          'cas-tenant-owner',
        );
      const { workspaceId: otherWorkspaceId } =
        await createActiveAgentWorkspace(
          prisma,
          workspaceRepository,
          'cas-tenant-other',
        );

      const created = await propertyRepository.createProperty(
        validCommand({
          workspaceId: ownWorkspaceId,
          responsibleAgentUserId: agentUserId,
        }),
      );
      const beforeCall = await prisma.property.findUniqueOrThrow({
        where: { id: created.id },
      });

      // Same id, same (correct) version, real Property — just the
      // wrong workspace. Proves the composite workspaceId_id lookup
      // used to disambiguate a zero-row CAS never leaks across tenants
      // by misreporting this as a version conflict instead of a
      // not-found.
      const error = await propertyRepository
        .updatePropertyStatus({
          workspaceId: otherWorkspaceId,
          propertyId: created.id,
          expectedVersion: created.version,
          status: 'PUBLISHED',
        })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AggregateNotFoundError);
      expect((error as AggregateNotFoundError).reason).toBe(
        'PROPERTY_NOT_FOUND',
      );

      const afterCall = await prisma.property.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(afterCall.status).toBe(beforeCall.status);
      expect(afterCall.version).toBe(beforeCall.version);
      expect(afterCall.publishedAt).toEqual(beforeCall.publishedAt);
      expect(afterCall.archivedAt).toEqual(beforeCall.archivedAt);
      expect(afterCall.updatedAt).toEqual(beforeCall.updatedAt);
    } finally {
      await app.close();
    }
  });

  it('rolls back the entire CAS when the Property has no Address: status/publishedAt/archivedAt/version return to their exact pre-call values', async () => {
    const { app, propertyRepository, workspaceRepository, prisma } =
      await bootstrap();
    try {
      const { workspaceId, agentUserId } = await createActiveAgentWorkspace(
        prisma,
        workspaceRepository,
        'orphan-property',
      );

      // Bypasses PropertyRepository deliberately (same mechanism as the
      // contract tests, ADR 008 §7.3/§7.4) — PropertyRepository's normal
      // write path has no way to produce a Property without an Address.
      const orphan = await prisma.property.create({
        data: {
          workspaceId,
          responsibleAgentUserId: agentUserId,
          title: 'Orphan Listing',
          price: '99999.99',
          currency: 'USD',
        },
      });

      const beforeCall = await prisma.property.findUniqueOrThrow({
        where: { id: orphan.id },
      });

      const error = await propertyRepository
        .updatePropertyStatus({
          workspaceId,
          propertyId: orphan.id,
          expectedVersion: orphan.version,
          status: 'PUBLISHED',
        })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(PersistenceInvariantError);
      expect((error as PersistenceInvariantError).reason).toBe(
        'PROPERTY_ADDRESS_MISSING',
      );

      const afterCall = await prisma.property.findUniqueOrThrow({
        where: { id: orphan.id },
      });
      expect(afterCall.status).toBe(beforeCall.status);
      expect(afterCall.publishedAt).toEqual(beforeCall.publishedAt);
      expect(afterCall.archivedAt).toEqual(beforeCall.archivedAt);
      expect(afterCall.version).toBe(beforeCall.version);
      expect(afterCall.updatedAt).toEqual(beforeCall.updatedAt);
    } finally {
      await app.close();
    }
  });

  it(
    'proves the ADR 008 §6.1 race deterministically: createProperty waits on the WorkspaceAgent lock (confirmed via ' +
      'pg_stat_activity.wait_event_type + pg_blocking_pids, never a bare sleep), observes REVOKED after the lock releases, ' +
      'and persists nothing',
    async () => {
      const { app, propertyRepository, workspaceRepository, prisma } =
        await bootstrap();

      let releaseTransactionA: () => void = () => undefined;
      let transactionA: Promise<unknown> = Promise.resolve();

      try {
        const { workspaceId, agentUserId } = await createActiveAgentWorkspace(
          prisma,
          workspaceRepository,
          'race',
        );

        const goAhead = new Promise<void>((resolve) => {
          releaseTransactionA = resolve;
        });
        let lockAcquired!: () => void;
        const lockAcquiredPromise = new Promise<void>((resolve) => {
          lockAcquired = resolve;
        });
        let transactionAPid = -1;

        // Poll deadline below is 5000ms; the transaction's own timeout
        // must comfortably exceed that, plus margin for the UPDATE and
        // commit that happen right after release — otherwise Prisma
        // could abort transaction A out from under the test while it is
        // still polling. Stays safely under this suite's 20000ms
        // `testTimeout` (vitest.integration.infra.config.mts).
        const TRANSACTION_A_TIMEOUT_MS = 15000;

        transactionA = prisma.$transaction(
          async (tx) => {
            const pidRows = await tx.$queryRaw<
              { pid: number }[]
            >`SELECT pg_backend_pid() AS pid`;
            const pidRow = pidRows[0];
            if (!pidRow) {
              throw new Error('pg_backend_pid() returned no row.');
            }
            transactionAPid = pidRow.pid;

            await tx.$queryRaw`
              SELECT status FROM workspace_agents
              WHERE workspace_id = ${workspaceId}::uuid AND user_id = ${agentUserId}::uuid
              FOR UPDATE
            `;
            lockAcquired();

            // Holds the lock until the test has proven B is genuinely
            // waiting on it.
            await goAhead;

            await tx.workspaceAgent.update({
              where: {
                workspaceId_userId: { workspaceId, userId: agentUserId },
              },
              data: { status: 'REVOKED', revokedAt: new Date() },
            });
          },
          { maxWait: 5000, timeout: TRANSACTION_A_TIMEOUT_MS },
        );

        // If transaction A fails (or somehow resolves) before ever
        // calling `lockAcquired()` — e.g. the `pg_backend_pid()`/
        // `FOR UPDATE` query itself errors, or Prisma's own transaction
        // timeout fires — `lockAcquiredPromise` would otherwise never
        // settle and this test would hang forever. Racing against a
        // branch of `transactionA` surfaces that failure immediately
        // instead. The `.catch()` below keeps that branch from becoming
        // an unhandled rejection on the (expected) path where
        // `lockAcquiredPromise` wins and `transactionA` only settles
        // later, after `releaseTransactionA()`.
        const transactionASettledBeforeLock = transactionA.then(() => {
          throw new Error(
            'Transaction A resolved before the lock was ever acquired — this should be impossible.',
          );
        });
        transactionASettledBeforeLock.catch(() => undefined);
        await Promise.race([
          lockAcquiredPromise,
          transactionASettledBeforeLock,
        ]);

        const attemptedTitle = 'Race Condo';
        const bOutcome = propertyRepository
          .createProperty(
            validCommand({
              workspaceId,
              responsibleAgentUserId: agentUserId,
              title: attemptedTitle,
            }),
          )
          .then(
            (value) => ({ status: 'fulfilled' as const, value }),
            (error: unknown) => ({ status: 'rejected' as const, error }),
          );

        // Deterministic proof that B is actually blocked on A's lock —
        // never a bare `sleep`. `wait_event_type = 'Lock'` is checked
        // (not a `pg_locks`/`NOT granted` filter on the relation alone:
        // a row-lock wait can surface as a wait on the blocking
        // transaction's id instead), combined with `pg_blocking_pids`
        // to confirm B is specifically blocked by A's backend pid.
        // Bounded, short-interval polling — fails loudly on timeout,
        // never hangs indefinitely.
        const deadline = Date.now() + 5000;
        let observedBlocking = false;
        while (Date.now() < deadline) {
          const blocked = await prisma.$queryRaw<{ pid: number }[]>`
            SELECT pid FROM pg_stat_activity
            WHERE datname = current_database()
              AND wait_event_type = 'Lock'
              AND query ILIKE '%workspace_agents%FOR UPDATE%'
              AND ${transactionAPid}::int = ANY(pg_blocking_pids(pid))
          `;
          if (blocked.length > 0) {
            observedBlocking = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expect(
          observedBlocking,
          'createProperty never observed waiting on the WorkspaceAgent lock within the deadline',
        ).toBe(true);

        releaseTransactionA();
        await transactionA;

        const outcome = await bOutcome;
        expect(outcome.status).toBe('rejected');
        if (outcome.status === 'rejected') {
          expect(outcome.error).toBeInstanceOf(PersistenceInvariantError);
          expect((outcome.error as PersistenceInvariantError).reason).toBe(
            'RESPONSIBLE_AGENT_NOT_ACTIVE',
          );
        }

        expect(
          await prisma.property.count({
            where: {
              workspaceId,
              title: attemptedTitle,
              responsibleAgentUserId: agentUserId,
            },
          }),
        ).toBe(0);
        expect(await prisma.address.count({ where: { workspaceId } })).toBe(0);
      } finally {
        // Releases transaction A even if an assertion above failed, so
        // the connection is never left dangling.
        releaseTransactionA();
        await transactionA.catch(() => undefined);
        await app.close();
      }
    },
  );

  it('shuts down the application cleanly', async () => {
    const { app } = await bootstrap();
    await expect(app.close()).resolves.toBeUndefined();
  });
});
