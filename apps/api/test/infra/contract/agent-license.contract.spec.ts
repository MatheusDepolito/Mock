import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { RuntimeConfigModule } from '../../../src/common/runtime-config.module';
import { Prisma } from '../../../src/generated/prisma-client/client';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { buildInfraServerConfig } from '../../support/infra-server-config';

const AGENT_LICENSE_UNIQUE_CONSTRAINT =
  'agent_licenses_country_code_jurisdiction_code_license_numbe_key';

/**
 * Contract test for the `agent_licenses` unique constraint (ADR 008
 * §7.4) — bypasses `UserRepository` deliberately (it has no method for
 * `AgentProfile`/`AgentLicense` in this subtask, see user.repository.ts
 * module doc) and talks to `PrismaService` directly. No insecure method
 * is added to the Repository just to make this reachable.
 */
describe('AgentLicense unique constraint (real mockp_test)', () => {
  async function bootstrap() {
    const config = buildInfraServerConfig();
    const moduleRef = await Test.createTestingModule({
      imports: [RuntimeConfigModule.forRoot(config), PrismaModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return { app, prisma: app.get(PrismaService) };
  }

  async function createAgentProfile(prisma: PrismaService, email: string) {
    const user = await prisma.user.create({ data: { email } });
    return prisma.agentProfile.create({ data: { userId: user.id } });
  }

  /**
   * Empirically confirmed against `mockp_test`: this stack (Prisma 7 +
   * `@prisma/adapter-pg`) reports the Postgres constraint name at
   * `meta.driverAdapterError.cause.constraint.index`, not at a top-level
   * `meta.target` string — see apps/api/src/persistence/prisma-errors.ts.
   */
  function assertAgentLicenseUniqueViolation(error: unknown): void {
    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    const knownError = error as Prisma.PrismaClientKnownRequestError;
    expect(knownError.code).toBe('P2002');
    const meta = knownError.meta as
      | {
          driverAdapterError?: { cause?: { constraint?: { index?: unknown } } };
        }
      | undefined;
    expect(meta?.driverAdapterError?.cause?.constraint?.index).toBe(
      AGENT_LICENSE_UNIQUE_CONSTRAINT,
    );
  }

  it('rejects the same profile creating the same license twice with different case (citext case-insensitivity)', async () => {
    const { app, prisma } = await bootstrap();
    try {
      const agentProfile = await createAgentProfile(
        prisma,
        'same-profile-case-test@example.com',
      );

      await prisma.agentLicense.create({
        data: {
          agentProfileId: agentProfile.id,
          countryCode: 'BR',
          jurisdictionCode: 'sp',
          licenseNumber: 'abc123',
        },
      });

      let caught: unknown;
      try {
        await prisma.agentLicense.create({
          data: {
            agentProfileId: agentProfile.id,
            countryCode: 'BR',
            jurisdictionCode: 'SP',
            licenseNumber: 'ABC123',
          },
        });
      } catch (error) {
        caught = error;
      }

      assertAgentLicenseUniqueViolation(caught);
    } finally {
      await app.close();
    }
  });

  it('rejects two different AgentProfiles creating the exact same license (global uniqueness, not scoped by agentProfileId)', async () => {
    const { app, prisma } = await bootstrap();
    try {
      const firstProfile = await createAgentProfile(
        prisma,
        'first-profile-global-test@example.com',
      );
      const secondProfile = await createAgentProfile(
        prisma,
        'second-profile-global-test@example.com',
      );

      await prisma.agentLicense.create({
        data: {
          agentProfileId: firstProfile.id,
          countryCode: 'BR',
          jurisdictionCode: 'rj',
          licenseNumber: 'xyz789',
        },
      });

      let caught: unknown;
      try {
        await prisma.agentLicense.create({
          data: {
            agentProfileId: secondProfile.id,
            countryCode: 'BR',
            jurisdictionCode: 'rj',
            licenseNumber: 'xyz789',
          },
        });
      } catch (error) {
        caught = error;
      }

      assertAgentLicenseUniqueViolation(caught);
    } finally {
      await app.close();
    }
  });

  it('rejects two different AgentProfiles creating the same license with different case (combined proof)', async () => {
    const { app, prisma } = await bootstrap();
    try {
      const firstProfile = await createAgentProfile(
        prisma,
        'first-profile-combined-test@example.com',
      );
      const secondProfile = await createAgentProfile(
        prisma,
        'second-profile-combined-test@example.com',
      );

      await prisma.agentLicense.create({
        data: {
          agentProfileId: firstProfile.id,
          countryCode: 'BR',
          jurisdictionCode: 'mg',
          licenseNumber: 'combo001',
        },
      });

      let caught: unknown;
      try {
        await prisma.agentLicense.create({
          data: {
            agentProfileId: secondProfile.id,
            countryCode: 'BR',
            jurisdictionCode: 'MG',
            licenseNumber: 'COMBO001',
          },
        });
      } catch (error) {
        caught = error;
      }

      assertAgentLicenseUniqueViolation(caught);
    } finally {
      await app.close();
    }
  });
});
