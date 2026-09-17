import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { RuntimeConfigModule } from '../../src/common/runtime-config.module';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PersistenceConflictError } from '../../src/persistence/errors';
import { UserRepository } from '../../src/users/user.repository';
import { UsersModule } from '../../src/users/users.module';
import { buildInfraServerConfig } from '../support/infra-server-config';

/**
 * Real-infrastructure tests for `UserRepository` (Tarefa 3.3.5) — real
 * PostgreSQL (`mockp_test`), no mocks. Each `it()` gets a clean slate via
 * the guarded `beforeEach` in test/infra/setup.ts (unchanged from 3.3.4).
 */
describe('UserRepository (real mockp_test)', () => {
  async function bootstrap() {
    const config = buildInfraServerConfig();
    const moduleRef = await Test.createTestingModule({
      imports: [RuntimeConfigModule.forRoot(config), PrismaModule, UsersModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return {
      app,
      repository: app.get(UserRepository),
      prisma: app.get(PrismaService),
    };
  }

  it('creates a user with credential and persists User + Credential + UserRole atomically', async () => {
    const { app, repository, prisma } = await bootstrap();
    try {
      const result = await repository.createWithCredential({
        email: 'credential-user@example.com',
        passwordHash: 'hashed-password',
        roleNames: ['CUSTOMER'],
      });

      expect(result.status).toBe('ACTIVE');
      expect(result.version).toBe(1);

      const users = await prisma.user.findMany({
        where: { email: 'credential-user@example.com' },
      });
      expect(users).toHaveLength(1);

      const credentials = await prisma.credential.findMany({
        where: { userId: result.id },
      });
      expect(credentials).toHaveLength(1);

      const userRoles = await prisma.userRole.findMany({
        where: { userId: result.id },
        include: { role: true },
      });
      expect(userRoles.map((ur) => ur.role.name)).toEqual(['CUSTOMER']);
    } finally {
      await app.close();
    }
  });

  it('creates a user with auth identity and never creates a Credential row', async () => {
    const { app, repository, prisma } = await bootstrap();
    try {
      const result = await repository.createWithAuthIdentity({
        email: 'auth-identity-user@example.com',
        provider: 'google',
        providerAccountId: 'external-account-1',
        roleNames: ['ADMIN'],
      });

      const credentials = await prisma.credential.findMany({
        where: { userId: result.id },
      });
      expect(credentials).toHaveLength(0);

      const authIdentities = await prisma.authIdentity.findMany({
        where: { userId: result.id },
      });
      expect(authIdentities).toHaveLength(1);
      expect(authIdentities[0]?.provider).toBe('google');
      expect(authIdentities[0]?.providerAccountId).toBe('external-account-1');
    } finally {
      await app.close();
    }
  });

  it('finds a user by id and by email after creation', async () => {
    const { app, repository } = await bootstrap();
    try {
      const created = await repository.createWithCredential({
        email: 'findable-user@example.com',
        passwordHash: 'hashed-password',
        roleNames: ['CUSTOMER'],
      });

      const byId = await repository.findById(created.id);
      const byEmail = await repository.findByEmail('findable-user@example.com');

      expect(byId?.id).toBe(created.id);
      expect(byEmail?.id).toBe(created.id);
      expect(
        await repository.findById('00000000-0000-4000-8000-999999999999'),
      ).toBeNull();
      expect(await repository.findByEmail('missing@example.com')).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('rejects the second createWithCredential with DUPLICATE_EMAIL and leaves only one User persisted', async () => {
    const { app, repository, prisma } = await bootstrap();
    try {
      await repository.createWithCredential({
        email: 'duplicate-email@example.com',
        passwordHash: 'hashed-password',
        roleNames: ['CUSTOMER'],
      });

      let caught: unknown;
      try {
        await repository.createWithCredential({
          email: 'duplicate-email@example.com',
          passwordHash: 'another-hash',
          roleNames: ['ADMIN'],
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(PersistenceConflictError);
      expect((caught as PersistenceConflictError).reason).toBe(
        'DUPLICATE_EMAIL',
      );

      const users = await prisma.user.findMany({
        where: { email: 'duplicate-email@example.com' },
      });
      expect(users).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it('rejects a second createWithAuthIdentity with DUPLICATE_AUTH_IDENTITY (different emails, same provider/providerAccountId) and rolls back the second User entirely', async () => {
    const { app, repository, prisma } = await bootstrap();
    try {
      await repository.createWithAuthIdentity({
        email: 'first-oauth-user@example.com',
        provider: 'google',
        providerAccountId: 'shared-external-id',
        roleNames: ['CUSTOMER'],
      });

      let caught: unknown;
      try {
        await repository.createWithAuthIdentity({
          email: 'second-oauth-user@example.com',
          provider: 'google',
          providerAccountId: 'shared-external-id',
          roleNames: ['CUSTOMER'],
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(PersistenceConflictError);
      expect((caught as PersistenceConflictError).reason).toBe(
        'DUPLICATE_AUTH_IDENTITY',
      );

      // Rollback proof: the second attempt's own User.create (which runs
      // before the failing authIdentity.create, inside the same
      // transaction) must have been undone entirely.
      const secondUser = await prisma.user.findUnique({
        where: { email: 'second-oauth-user@example.com' },
      });
      expect(secondUser).toBeNull();

      const firstUserStillExists = await prisma.user.findUnique({
        where: { email: 'first-oauth-user@example.com' },
      });
      expect(firstUserStillExists).not.toBeNull();
    } finally {
      await app.close();
    }
  });

  it('preserves the exact ADMIN/CUSTOMER catalog after creating users', async () => {
    const { app, repository, prisma } = await bootstrap();
    try {
      await repository.createWithCredential({
        email: 'catalog-check-user@example.com',
        passwordHash: 'hashed-password',
        roleNames: ['CUSTOMER', 'ADMIN'],
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
