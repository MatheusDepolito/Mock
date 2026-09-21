import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { RuntimeConfigModule } from '../../src/common/runtime-config.module';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  AggregateNotFoundError,
  PersistenceConflictError,
  PersistenceInvariantError,
} from '../../src/persistence/errors';
import { WorkspaceRepository } from '../../src/workspaces/workspace.repository';
import { WorkspacesModule } from '../../src/workspaces/workspaces.module';
import { buildInfraServerConfig } from '../support/infra-server-config';

/**
 * Real-infrastructure tests for `WorkspaceRepository` (Tarefa 3.3.6) —
 * real PostgreSQL (`mockp_test`), no mocks. Each `it()` gets a clean
 * slate via the guarded `beforeEach` in test/infra/setup.ts (unchanged
 * from 3.3.4). Fixtures for `User`/`AgentProfile` are created directly
 * via `PrismaService` (no repository owns their creation yet); every
 * `Workspace` in these tests is created through the Repository's public
 * API, never as a direct Prisma fixture.
 */
describe('WorkspaceRepository (real mockp_test)', () => {
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
      repository: app.get(WorkspaceRepository),
      prisma: app.get(PrismaService),
    };
  }

  async function createUser(prisma: PrismaService, email: string) {
    return prisma.user.create({ data: { email } });
  }

  async function createUserWithAgentProfile(
    prisma: PrismaService,
    email: string,
  ) {
    const user = await createUser(prisma, email);
    await prisma.agentProfile.create({ data: { userId: user.id } });
    return user;
  }

  it('creates an INDIVIDUAL workspace with ACTIVE membership, MANAGER+AGENT roles, and an ACTIVE WorkspaceAgent', async () => {
    const { app, repository, prisma } = await bootstrap();
    try {
      const owner = await createUserWithAgentProfile(
        prisma,
        'individual-owner@example.com',
      );

      const record = await repository.createIndividualWorkspace({
        ownerUserId: owner.id,
        name: 'Acme Realty',
        slug: 'acme-individual',
      });

      expect(record.status).toBe('ACTIVE');

      const membership = await prisma.workspaceMembership.findUnique({
        where: {
          workspaceId_userId: { workspaceId: record.id, userId: owner.id },
        },
      });
      expect(membership?.status).toBe('ACTIVE');

      const roles = await prisma.workspaceMembershipRole.findMany({
        where: { membershipId: membership!.id },
      });
      expect(roles.map((r) => r.role).sort()).toEqual(['AGENT', 'MANAGER']);

      const agent = await prisma.workspaceAgent.findUnique({
        where: {
          workspaceId_userId: { workspaceId: record.id, userId: owner.id },
        },
      });
      expect(agent?.status).toBe('ACTIVE');
    } finally {
      await app.close();
    }
  });

  it('creates a BROKERAGE workspace with ownerActsAsAgent=false: exactly one Brokerage, only MANAGER, no WorkspaceAgent, no AgentProfile required', async () => {
    const { app, repository, prisma } = await bootstrap();
    try {
      const owner = await createUser(prisma, 'brokerage-no-agent@example.com');

      const record = await repository.createBrokerageWorkspace({
        ownerUserId: owner.id,
        name: 'Acme Brokerage',
        slug: 'acme-brokerage-false',
        brokerageLegalName: 'Acme Realty LLC',
        ownerActsAsAgent: false,
      });

      expect(record.type).toBe('BROKERAGE');
      const workspaceRow = await prisma.workspace.findUnique({
        where: { id: record.id },
      });
      expect(workspaceRow?.type).toBe('BROKERAGE');

      const brokerages = await prisma.brokerage.findMany({
        where: { workspaceId: record.id },
      });
      expect(brokerages).toHaveLength(1);
      expect(brokerages[0]?.legalName).toBe('Acme Realty LLC');

      const membership = await prisma.workspaceMembership.findUnique({
        where: {
          workspaceId_userId: { workspaceId: record.id, userId: owner.id },
        },
      });
      const roles = await prisma.workspaceMembershipRole.findMany({
        where: { membershipId: membership!.id },
      });
      expect(roles.map((r) => r.role)).toEqual(['MANAGER']);

      const agent = await prisma.workspaceAgent.findUnique({
        where: {
          workspaceId_userId: { workspaceId: record.id, userId: owner.id },
        },
      });
      expect(agent).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('creates a BROKERAGE workspace with ownerActsAsAgent=true: exactly one Brokerage, MANAGER+AGENT, ACTIVE WorkspaceAgent', async () => {
    const { app, repository, prisma } = await bootstrap();
    try {
      const owner = await createUserWithAgentProfile(
        prisma,
        'brokerage-with-agent@example.com',
      );

      const record = await repository.createBrokerageWorkspace({
        ownerUserId: owner.id,
        name: 'Acme Brokerage',
        slug: 'acme-brokerage-true',
        brokerageLegalName: 'Acme Realty LLC',
        ownerActsAsAgent: true,
      });

      expect(record.type).toBe('BROKERAGE');
      const workspaceRow = await prisma.workspace.findUnique({
        where: { id: record.id },
      });
      expect(workspaceRow?.type).toBe('BROKERAGE');

      const brokerages = await prisma.brokerage.findMany({
        where: { workspaceId: record.id },
      });
      expect(brokerages).toHaveLength(1);

      const membership = await prisma.workspaceMembership.findUnique({
        where: {
          workspaceId_userId: { workspaceId: record.id, userId: owner.id },
        },
      });
      const roles = await prisma.workspaceMembershipRole.findMany({
        where: { membershipId: membership!.id },
      });
      expect(roles.map((r) => r.role).sort()).toEqual(['AGENT', 'MANAGER']);

      const agent = await prisma.workspaceAgent.findUnique({
        where: {
          workspaceId_userId: { workspaceId: record.id, userId: owner.id },
        },
      });
      expect(agent?.status).toBe('ACTIVE');
    } finally {
      await app.close();
    }
  });

  it('rejects with OWNER_NOT_FOUND and creates no Workspace row when the owner does not exist', async () => {
    const { app, repository, prisma } = await bootstrap();
    try {
      const fakeOwnerId = '00000000-0000-4000-8000-000000000999';

      const caught = await repository
        .createIndividualWorkspace({
          ownerUserId: fakeOwnerId,
          name: 'Ghost Realty',
          slug: 'ghost-realty',
        })
        .catch((error: unknown) => error);

      expect(caught).toBeInstanceOf(AggregateNotFoundError);
      expect((caught as AggregateNotFoundError).reason).toBe('OWNER_NOT_FOUND');

      const workspace = await prisma.workspace.findUnique({
        where: { slug: 'ghost-realty' },
      });
      expect(workspace).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('rejects with AGENT_PROFILE_REQUIRED and creates no Workspace row when the owner exists but has no AgentProfile', async () => {
    const { app, repository, prisma } = await bootstrap();
    try {
      const owner = await createUser(prisma, 'no-agent-profile@example.com');

      const caught = await repository
        .createIndividualWorkspace({
          ownerUserId: owner.id,
          name: 'No Agent Realty',
          slug: 'no-agent-realty',
        })
        .catch((error: unknown) => error);

      expect(caught).toBeInstanceOf(PersistenceInvariantError);
      expect((caught as PersistenceInvariantError).reason).toBe(
        'AGENT_PROFILE_REQUIRED',
      );

      const workspace = await prisma.workspace.findUnique({
        where: { slug: 'no-agent-realty' },
      });
      expect(workspace).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('rejects DUPLICATE_WORKSPACE_SLUG on case-only difference (citext): the first Workspace still exists, exactly one Workspace exists for that slug, and the second owner has no Workspace, membership or WorkspaceAgent', async () => {
    const { app, repository, prisma } = await bootstrap();
    try {
      const firstOwner = await createUserWithAgentProfile(
        prisma,
        'slug-owner-1@example.com',
      );
      const secondOwner = await createUserWithAgentProfile(
        prisma,
        'slug-owner-2@example.com',
      );

      await repository.createIndividualWorkspace({
        ownerUserId: firstOwner.id,
        name: 'Original Realty',
        slug: 'duplicate-slug-case',
      });

      const caught = await repository
        .createIndividualWorkspace({
          ownerUserId: secondOwner.id,
          name: 'Second Realty',
          slug: 'DUPLICATE-SLUG-CASE',
        })
        .catch((error: unknown) => error);

      expect(caught).toBeInstanceOf(PersistenceConflictError);
      expect((caught as PersistenceConflictError).reason).toBe(
        'DUPLICATE_WORKSPACE_SLUG',
      );

      // The first Workspace still exists.
      const firstOwnerWorkspaces = await prisma.workspace.findMany({
        where: { ownerUserId: firstOwner.id },
      });
      expect(firstOwnerWorkspaces).toHaveLength(1);
      expect(firstOwnerWorkspaces[0]?.slug).toBe('duplicate-slug-case');

      // Exactly one Workspace exists for the logical slug — `citext`
      // makes both spellings match the same single row.
      expect(
        await prisma.workspace.count({
          where: { slug: 'duplicate-slug-case' },
        }),
      ).toBe(1);
      expect(
        await prisma.workspace.count({
          where: { slug: 'DUPLICATE-SLUG-CASE' },
        }),
      ).toBe(1);

      // Nothing from the second flow was persisted.
      const secondOwnerWorkspaces = await prisma.workspace.findMany({
        where: { ownerUserId: secondOwner.id },
      });
      expect(secondOwnerWorkspaces).toHaveLength(0);

      const secondOwnerMemberships = await prisma.workspaceMembership.findMany({
        where: { userId: secondOwner.id },
      });
      expect(secondOwnerMemberships).toHaveLength(0);

      const secondOwnerAgents = await prisma.workspaceAgent.findMany({
        where: { userId: secondOwner.id },
      });
      expect(secondOwnerAgents).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('rejects createBrokerageWorkspace with OWNER_NOT_FOUND and creates no Workspace and no Brokerage when the owner does not exist', async () => {
    const { app, repository, prisma } = await bootstrap();
    try {
      const caught = await repository
        .createBrokerageWorkspace({
          ownerUserId: '00000000-0000-4000-8000-000000000998',
          name: 'Ghost Brokerage',
          slug: 'ghost-brokerage',
          brokerageLegalName: 'Ghost Brokerage LLC',
          ownerActsAsAgent: false,
        })
        .catch((error: unknown) => error);

      expect(caught).toBeInstanceOf(AggregateNotFoundError);
      expect((caught as AggregateNotFoundError).reason).toBe('OWNER_NOT_FOUND');

      expect(await prisma.workspace.count()).toBe(0);
      expect(await prisma.brokerage.count()).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('rejects createBrokerageWorkspace(ownerActsAsAgent=true) with AGENT_PROFILE_REQUIRED and creates no Workspace and no Brokerage when the owner has no AgentProfile', async () => {
    const { app, repository, prisma } = await bootstrap();
    try {
      const owner = await createUser(
        prisma,
        'brokerage-no-profile@example.com',
      );

      const caught = await repository
        .createBrokerageWorkspace({
          ownerUserId: owner.id,
          name: 'No Profile Brokerage',
          slug: 'no-profile-brokerage',
          brokerageLegalName: 'No Profile Brokerage LLC',
          ownerActsAsAgent: true,
        })
        .catch((error: unknown) => error);

      expect(caught).toBeInstanceOf(PersistenceInvariantError);
      expect((caught as PersistenceInvariantError).reason).toBe(
        'AGENT_PROFILE_REQUIRED',
      );

      expect(await prisma.workspace.count()).toBe(0);
      expect(await prisma.brokerage.count()).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('finds a workspace by id and returns null for a missing one', async () => {
    const { app, repository, prisma } = await bootstrap();
    try {
      const owner = await createUserWithAgentProfile(
        prisma,
        'findable-owner@example.com',
      );
      const created = await repository.createIndividualWorkspace({
        ownerUserId: owner.id,
        name: 'Findable Realty',
        slug: 'findable-realty',
      });

      const found = await repository.findById(created.id);
      expect(found?.id).toBe(created.id);

      const missing = await repository.findById(
        '00000000-0000-4000-8000-999999999999',
      );
      expect(missing).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('preserves the exact ADMIN/CUSTOMER catalog after creating workspaces', async () => {
    const { app, repository, prisma } = await bootstrap();
    try {
      const owner = await createUserWithAgentProfile(
        prisma,
        'catalog-check-owner@example.com',
      );
      await repository.createIndividualWorkspace({
        ownerUserId: owner.id,
        name: 'Catalog Check Realty',
        slug: 'catalog-check-realty',
      });

      const roles = await prisma.role.findMany({ select: { name: true } });
      expect(roles.map((r) => r.name).sort()).toEqual(['ADMIN', 'CUSTOMER']);
    } finally {
      await app.close();
    }
  });

  it('shuts down the application cleanly', async () => {
    const { app } = await bootstrap();
    await expect(app.close()).resolves.toBeUndefined();
  });
});
