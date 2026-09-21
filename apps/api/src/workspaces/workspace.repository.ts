import { Injectable } from '@nestjs/common';
import {
  isForeignKeyViolation,
  isUniqueViolation,
  wrapUnexpectedPersistenceError,
  type KnownUniqueViolationTarget,
} from '../persistence/prisma-errors';
import {
  AggregateNotFoundError,
  PersistenceConflictError,
  PersistenceInvariantError,
} from '../persistence/errors';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateBrokerageWorkspaceCommand,
  CreateIndividualWorkspaceCommand,
  WorkspaceRecord,
  WorkspaceStatus,
  WorkspaceType,
} from './workspace.types';

/** `workspaces.slug` (`citext`, unique) — see apps/api/prisma/schema.prisma. */
const WORKSPACES_SLUG_UNIQUE_TARGET: KnownUniqueViolationTarget = {
  constraintName: 'workspaces_slug_key',
  columns: ['slug'],
};

/** `workspaces.owner_user_id → users.id` — residual race, same reason as the proactive check. */
const WORKSPACES_OWNER_USER_ID_FK = 'workspaces_owner_user_id_fkey';

/** `workspace_agents.user_id → agent_profiles.user_id` (simple FK) — residual race, same reason as the proactive check. Never confused with the composite FK below. */
const WORKSPACE_AGENTS_USER_ID_FK = 'workspace_agents_user_id_fkey';

const WORKSPACE_SELECT = {
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

interface SelectedWorkspaceRow {
  id: string;
  type: WorkspaceType;
  name: string;
  slug: string;
  ownerUserId: string;
  status: WorkspaceStatus;
  version: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toWorkspaceRecord(workspace: SelectedWorkspaceRow): WorkspaceRecord {
  return {
    id: workspace.id,
    type: workspace.type,
    name: workspace.name,
    slug: workspace.slug,
    ownerUserId: workspace.ownerUserId,
    status: workspace.status,
    version: workspace.version,
    archivedAt: workspace.archivedAt,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };
}

/**
 * Aggregate (ADR 008 §4.2): `Workspace` + `WorkspaceMembership` +
 * `WorkspaceMembershipRole` + `WorkspaceAgent` + `Brokerage`. The `User`
 * and `AgentProfile` precondition checks are executed directly by this
 * Repository, inside the same transaction as the writes (via `tx`), as
 * ADR 008 §4.2 specifies — no dependency on `UsersModule`/
 * `UserRepository` is needed.
 */
@Injectable()
export class WorkspaceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createIndividualWorkspace(
    cmd: CreateIndividualWorkspaceCommand,
  ): Promise<WorkspaceRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const owner = await tx.user.findUnique({
          where: { id: cmd.ownerUserId },
        });
        if (!owner) {
          throw new AggregateNotFoundError(
            'Owner user not found.',
            'OWNER_NOT_FOUND',
          );
        }

        const agentProfile = await tx.agentProfile.findUnique({
          where: { userId: cmd.ownerUserId },
        });
        if (!agentProfile) {
          throw new PersistenceInvariantError(
            'Owner has no AgentProfile.',
            'AGENT_PROFILE_REQUIRED',
          );
        }

        let workspace: SelectedWorkspaceRow;
        try {
          workspace = await tx.workspace.create({
            data: {
              type: 'INDIVIDUAL',
              name: cmd.name,
              slug: cmd.slug,
              ownerUserId: cmd.ownerUserId,
            },
            select: WORKSPACE_SELECT,
          });
        } catch (error) {
          if (isUniqueViolation(error, WORKSPACES_SLUG_UNIQUE_TARGET)) {
            throw new PersistenceConflictError(
              'Workspace slug already registered.',
              'DUPLICATE_WORKSPACE_SLUG',
              { cause: error },
            );
          }
          if (isForeignKeyViolation(error, WORKSPACES_OWNER_USER_ID_FK)) {
            throw new AggregateNotFoundError(
              'Owner user not found.',
              'OWNER_NOT_FOUND',
              { cause: error },
            );
          }
          throw error;
        }

        const membership = await tx.workspaceMembership.create({
          data: {
            workspaceId: workspace.id,
            userId: cmd.ownerUserId,
            status: 'ACTIVE',
          },
        });

        await tx.workspaceMembershipRole.createMany({
          data: [
            { membershipId: membership.id, role: 'MANAGER' },
            { membershipId: membership.id, role: 'AGENT' },
          ],
        });

        try {
          await tx.workspaceAgent.create({
            data: {
              workspaceId: workspace.id,
              userId: cmd.ownerUserId,
              status: 'ACTIVE',
            },
          });
        } catch (error) {
          if (isForeignKeyViolation(error, WORKSPACE_AGENTS_USER_ID_FK)) {
            throw new PersistenceInvariantError(
              'Owner has no AgentProfile.',
              'AGENT_PROFILE_REQUIRED',
              { cause: error },
            );
          }
          throw error;
        }

        return toWorkspaceRecord(workspace);
      });
    } catch (error) {
      throw wrapUnexpectedPersistenceError(error);
    }
  }

  async createBrokerageWorkspace(
    cmd: CreateBrokerageWorkspaceCommand,
  ): Promise<WorkspaceRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const owner = await tx.user.findUnique({
          where: { id: cmd.ownerUserId },
        });
        if (!owner) {
          throw new AggregateNotFoundError(
            'Owner user not found.',
            'OWNER_NOT_FOUND',
          );
        }

        if (cmd.ownerActsAsAgent) {
          const agentProfile = await tx.agentProfile.findUnique({
            where: { userId: cmd.ownerUserId },
          });
          if (!agentProfile) {
            throw new PersistenceInvariantError(
              'Owner has no AgentProfile.',
              'AGENT_PROFILE_REQUIRED',
            );
          }
        }

        let workspace: SelectedWorkspaceRow;
        try {
          workspace = await tx.workspace.create({
            data: {
              type: 'BROKERAGE',
              name: cmd.name,
              slug: cmd.slug,
              ownerUserId: cmd.ownerUserId,
            },
            select: WORKSPACE_SELECT,
          });
        } catch (error) {
          if (isUniqueViolation(error, WORKSPACES_SLUG_UNIQUE_TARGET)) {
            throw new PersistenceConflictError(
              'Workspace slug already registered.',
              'DUPLICATE_WORKSPACE_SLUG',
              { cause: error },
            );
          }
          if (isForeignKeyViolation(error, WORKSPACES_OWNER_USER_ID_FK)) {
            throw new AggregateNotFoundError(
              'Owner user not found.',
              'OWNER_NOT_FOUND',
              { cause: error },
            );
          }
          throw error;
        }

        await tx.brokerage.create({
          data: {
            workspaceId: workspace.id,
            legalName: cmd.brokerageLegalName,
          },
        });

        const membership = await tx.workspaceMembership.create({
          data: {
            workspaceId: workspace.id,
            userId: cmd.ownerUserId,
            status: 'ACTIVE',
          },
        });

        await tx.workspaceMembershipRole.createMany({
          data: cmd.ownerActsAsAgent
            ? [
                { membershipId: membership.id, role: 'MANAGER' },
                { membershipId: membership.id, role: 'AGENT' },
              ]
            : [{ membershipId: membership.id, role: 'MANAGER' }],
        });

        if (cmd.ownerActsAsAgent) {
          try {
            await tx.workspaceAgent.create({
              data: {
                workspaceId: workspace.id,
                userId: cmd.ownerUserId,
                status: 'ACTIVE',
              },
            });
          } catch (error) {
            if (isForeignKeyViolation(error, WORKSPACE_AGENTS_USER_ID_FK)) {
              throw new PersistenceInvariantError(
                'Owner has no AgentProfile.',
                'AGENT_PROFILE_REQUIRED',
                { cause: error },
              );
            }
            throw error;
          }
        }

        return toWorkspaceRecord(workspace);
      });
    } catch (error) {
      throw wrapUnexpectedPersistenceError(error);
    }
  }

  async findById(id: string): Promise<WorkspaceRecord | null> {
    try {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id },
        select: WORKSPACE_SELECT,
      });
      return workspace ? toWorkspaceRecord(workspace) : null;
    } catch (error) {
      throw wrapUnexpectedPersistenceError(error);
    }
  }
}
