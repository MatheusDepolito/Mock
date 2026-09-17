import { Injectable } from '@nestjs/common';
import {
  isUniqueViolation,
  wrapUnexpectedPersistenceError,
  type KnownUniqueViolationTarget,
} from '../persistence/prisma-errors';
import {
  PersistenceInvariantError,
  PersistenceConflictError,
} from '../persistence/errors';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateUserWithAuthIdentityCommand,
  CreateUserWithCredentialCommand,
  UserAggregateResult,
  UserStatus,
} from './user.types';

/** `users.email` (`citext`, unique) — see apps/api/prisma/schema.prisma. */
const USERS_EMAIL_UNIQUE_TARGET: KnownUniqueViolationTarget = {
  constraintName: 'users_email_key',
  columns: ['email'],
};

/** `@@unique([provider, providerAccountId])` on `auth_identities`. */
const AUTH_IDENTITIES_PROVIDER_ACCOUNT_UNIQUE_TARGET: KnownUniqueViolationTarget =
  {
    constraintName: 'auth_identities_provider_provider_account_id_key',
    columns: ['provider', 'providerAccountId'],
  };

const USER_SELECT = {
  id: true,
  email: true,
  status: true,
  version: true,
  deactivatedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface SelectedUserRow {
  id: string;
  email: string;
  status: UserStatus;
  version: number;
  deactivatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toUserAggregateResult(user: SelectedUserRow): UserAggregateResult {
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    version: user.version,
    deactivatedAt: user.deactivatedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Aggregate (ADR 008 §4.1): `User` + `Credential` + `AuthIdentity` +
 * `UserRole` + `CustomerProfile` + `AgentProfile` + `AgentLicense` — all
 * of them within this aggregate's conceptual boundary. `CustomerProfile`,
 * `AgentProfile` and `AgentLicense` are simply outside the four
 * operations implemented so far: none of them is created, read, or
 * returned by any method here yet (see
 * docs/adr/007-multi-tenant-workspace-foundation.md: `AGENT` is no
 * longer a global role — `AgentProfile`'s mere existence denotes it —
 * so no method here has a `roleNames`-driven reason to create one today;
 * the ADR 008 §4.1 result type `UserAggregateResult` never carries these
 * fields either). See docs/adr/008-runtime-persistence-and-repositories.md
 * (§4.1).
 */
@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createWithCredential(
    cmd: CreateUserWithCredentialCommand,
  ): Promise<UserAggregateResult> {
    if (cmd.roleNames.length === 0) {
      throw new PersistenceInvariantError(
        'Role names must not be empty.',
        'ROLE_REQUIRED',
      );
    }
    const uniqueNames = [...new Set(cmd.roleNames)];
    if (uniqueNames.length !== cmd.roleNames.length) {
      throw new PersistenceInvariantError(
        'Duplicate role name.',
        'DUPLICATE_ROLE_NAME',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const roles = await tx.role.findMany({
          where: { name: { in: uniqueNames } },
          select: { id: true, name: true },
        });
        if (roles.length < uniqueNames.length) {
          throw new PersistenceInvariantError(
            'One or more roles do not exist in the catalog.',
            'ROLE_NOT_FOUND',
          );
        }

        let user: SelectedUserRow;
        try {
          user = await tx.user.create({
            data: { email: cmd.email },
            select: USER_SELECT,
          });
        } catch (error) {
          if (isUniqueViolation(error, USERS_EMAIL_UNIQUE_TARGET)) {
            throw new PersistenceConflictError(
              'Email already registered.',
              'DUPLICATE_EMAIL',
              { cause: error },
            );
          }
          throw error;
        }

        // No dedicated translation here: `user.id` was just created in
        // this same transaction, so no unique/FK violation is reachable
        // for this specific insert — any failure is unexpected and is
        // normalized by the outer boundary below, never given a specific
        // reason.
        await tx.credential.create({
          data: { userId: user.id, passwordHash: cmd.passwordHash },
        });

        await tx.userRole.createMany({
          data: roles.map((role) => ({ userId: user.id, roleId: role.id })),
        });

        return toUserAggregateResult(user);
      });
    } catch (error) {
      // Outer boundary: covers transaction open/commit, role.findMany,
      // credential.create, userRole.createMany, and any re-thrown raw
      // error from the user.create catch above. Idempotent on
      // PersistenceError — never wraps twice.
      throw wrapUnexpectedPersistenceError(error);
    }
  }

  async createWithAuthIdentity(
    cmd: CreateUserWithAuthIdentityCommand,
  ): Promise<UserAggregateResult> {
    if (cmd.roleNames.length === 0) {
      throw new PersistenceInvariantError(
        'Role names must not be empty.',
        'ROLE_REQUIRED',
      );
    }
    const uniqueNames = [...new Set(cmd.roleNames)];
    if (uniqueNames.length !== cmd.roleNames.length) {
      throw new PersistenceInvariantError(
        'Duplicate role name.',
        'DUPLICATE_ROLE_NAME',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const roles = await tx.role.findMany({
          where: { name: { in: uniqueNames } },
          select: { id: true, name: true },
        });
        if (roles.length < uniqueNames.length) {
          throw new PersistenceInvariantError(
            'One or more roles do not exist in the catalog.',
            'ROLE_NOT_FOUND',
          );
        }

        let user: SelectedUserRow;
        try {
          user = await tx.user.create({
            data: { email: cmd.email },
            select: USER_SELECT,
          });
        } catch (error) {
          if (isUniqueViolation(error, USERS_EMAIL_UNIQUE_TARGET)) {
            throw new PersistenceConflictError(
              'Email already registered.',
              'DUPLICATE_EMAIL',
              { cause: error },
            );
          }
          throw error;
        }

        try {
          await tx.authIdentity.create({
            data: {
              userId: user.id,
              provider: cmd.provider,
              providerAccountId: cmd.providerAccountId,
            },
          });
        } catch (error) {
          if (
            isUniqueViolation(
              error,
              AUTH_IDENTITIES_PROVIDER_ACCOUNT_UNIQUE_TARGET,
            )
          ) {
            throw new PersistenceConflictError(
              'Auth identity already registered.',
              'DUPLICATE_AUTH_IDENTITY',
              { cause: error },
            );
          }
          throw error;
        }

        await tx.userRole.createMany({
          data: roles.map((role) => ({ userId: user.id, roleId: role.id })),
        });

        return toUserAggregateResult(user);
      });
    } catch (error) {
      throw wrapUnexpectedPersistenceError(error);
    }
  }

  async findById(id: string): Promise<UserAggregateResult | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id },
        select: USER_SELECT,
      });
      return user ? toUserAggregateResult(user) : null;
    } catch (error) {
      throw wrapUnexpectedPersistenceError(error);
    }
  }

  async findByEmail(email: string): Promise<UserAggregateResult | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
        select: USER_SELECT,
      });
      return user ? toUserAggregateResult(user) : null;
    } catch (error) {
      throw wrapUnexpectedPersistenceError(error);
    }
  }
}
