import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { RuntimeConfigModule } from '../../../src/common/runtime-config.module';
import { Prisma } from '../../../src/generated/prisma-client/client';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { WorkspaceRepository } from '../../../src/workspaces/workspace.repository';
import { WorkspacesModule } from '../../../src/workspaces/workspaces.module';
import { buildInfraServerConfig } from '../../support/infra-server-config';

/** SQLSTATE for a Postgres `CHECK` constraint violation (`check_violation`). */
const CHECK_VIOLATION_SQLSTATE = '23514';

/**
 * Empirically confirmed against a live `mockp_test` (this session, Prisma
 * 7 + `@prisma/adapter-pg`, driver-adapter architecture): a `CHECK`
 * constraint violation raised by a **typed** `prisma.property.create()`
 * call surfaces as `PrismaClientKnownRequestError` with `code: 'P2039'`
 * and an **empty** `meta` object — never the
 * `meta.driverAdapterError.cause.constraint.index` shape used by the
 * P2002/P2003 unique/FK errors from other typed Client operations (see
 * apps/api/src/persistence/prisma-errors.ts). This is a genuine
 * limitation of this stack for `CHECK` violations specifically: there is
 * no structured field carrying the SQLSTATE or the constraint name —
 * both are only available as plain text inside `error.message`, in
 * Prisma's own fixed phrasing: "Database error. Code: `<sqlstate>`.
 * Message: `<postgres message>`", where the Postgres message itself ends
 * with `violates check constraint "<name>"`. This helper checks the
 * `code`, the SQLSTATE, and the exact, full constraint name — never a
 * generic substring search across the whole serialized error object.
 */
function assertPropertyCheckViolation(
  error: unknown,
  constraintName: string,
): void {
  expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  const knownError = error as Prisma.PrismaClientKnownRequestError;
  expect(knownError.code).toBe('P2039');
  expect(knownError.message).toContain(
    `Code: \`${CHECK_VIOLATION_SQLSTATE}\`.`,
  );
  expect(knownError.message).toContain(
    `violates check constraint "${constraintName}"`,
  );
}

describe('Property lifecycle coherence + version CHECK constraints (real mockp_test)', () => {
  async function bootstrap() {
    const config = buildInfraServerConfig();
    const moduleRef = await Test.createTestingModule({
      imports: [
        RuntimeConfigModule.forRoot(config),
        PrismaModule,
        WorkspacesModule,
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return {
      app,
      prisma: app.get(PrismaService),
      workspaceRepository: app.get(WorkspaceRepository),
    };
  }

  async function createActiveAgentWorkspace(
    prisma: PrismaService,
    workspaceRepository: WorkspaceRepository,
    suffix: string,
  ) {
    const owner = await prisma.user.create({
      data: { email: `lifecycle-${suffix}@example.com` },
    });
    await prisma.agentProfile.create({ data: { userId: owner.id } });
    const workspace = await workspaceRepository.createIndividualWorkspace({
      ownerUserId: owner.id,
      name: `Lifecycle ${suffix}`,
      slug: `lifecycle-${suffix}`,
    });
    return { workspaceId: workspace.id, agentUserId: owner.id };
  }

  it('rejects a DRAFT Property created with a non-null publishedAt (properties_lifecycle_coherence)', async () => {
    const { app, prisma, workspaceRepository } = await bootstrap();
    try {
      const { workspaceId, agentUserId } = await createActiveAgentWorkspace(
        prisma,
        workspaceRepository,
        'draft-published-at',
      );

      const caught = await prisma.property
        .create({
          data: {
            workspaceId,
            responsibleAgentUserId: agentUserId,
            title: 'Incoherent Draft',
            price: '1.00',
            currency: 'USD',
            status: 'DRAFT',
            publishedAt: new Date(),
          },
        })
        .catch((error: unknown) => error);

      assertPropertyCheckViolation(caught, 'properties_lifecycle_coherence');
      expect(await prisma.property.count({ where: { workspaceId } })).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('rejects a PUBLISHED Property created with a null publishedAt (properties_lifecycle_coherence)', async () => {
    const { app, prisma, workspaceRepository } = await bootstrap();
    try {
      const { workspaceId, agentUserId } = await createActiveAgentWorkspace(
        prisma,
        workspaceRepository,
        'published-no-date',
      );

      const caught = await prisma.property
        .create({
          data: {
            workspaceId,
            responsibleAgentUserId: agentUserId,
            title: 'Incoherent Published',
            price: '1.00',
            currency: 'USD',
            status: 'PUBLISHED',
            publishedAt: null,
          },
        })
        .catch((error: unknown) => error);

      assertPropertyCheckViolation(caught, 'properties_lifecycle_coherence');
      expect(await prisma.property.count({ where: { workspaceId } })).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('rejects an ARCHIVED Property created with a null archivedAt (properties_lifecycle_coherence)', async () => {
    const { app, prisma, workspaceRepository } = await bootstrap();
    try {
      const { workspaceId, agentUserId } = await createActiveAgentWorkspace(
        prisma,
        workspaceRepository,
        'archived-no-date',
      );

      const caught = await prisma.property
        .create({
          data: {
            workspaceId,
            responsibleAgentUserId: agentUserId,
            title: 'Incoherent Archived',
            price: '1.00',
            currency: 'USD',
            status: 'ARCHIVED',
            archivedAt: null,
          },
        })
        .catch((error: unknown) => error);

      assertPropertyCheckViolation(caught, 'properties_lifecycle_coherence');
      expect(await prisma.property.count({ where: { workspaceId } })).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('rejects a Property created with version = 0 (properties_version_positive)', async () => {
    const { app, prisma, workspaceRepository } = await bootstrap();
    try {
      const { workspaceId, agentUserId } = await createActiveAgentWorkspace(
        prisma,
        workspaceRepository,
        'version-zero',
      );

      const caught = await prisma.property
        .create({
          data: {
            workspaceId,
            responsibleAgentUserId: agentUserId,
            title: 'Zero Version',
            price: '1.00',
            currency: 'USD',
            version: 0,
          },
        })
        .catch((error: unknown) => error);

      assertPropertyCheckViolation(caught, 'properties_version_positive');
      expect(await prisma.property.count({ where: { workspaceId } })).toBe(0);
    } finally {
      await app.close();
    }
  });
});
