import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { RuntimeConfigModule } from '../../../src/common/runtime-config.module';
import { Prisma } from '../../../src/generated/prisma-client/client';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { WorkspaceRepository } from '../../../src/workspaces/workspace.repository';
import { WorkspacesModule } from '../../../src/workspaces/workspaces.module';
import { buildInfraServerConfig } from '../../support/infra-server-config';

const RESPONSIBLE_AGENT_COMPOSITE_FK_CONSTRAINT =
  'properties_workspace_id_responsible_agent_user_id_fkey';

/**
 * Contract test for the composite FK
 * `properties(workspace_id, responsible_agent_user_id) → workspace_agents(workspace_id, user_id)`
 * (ADR 007 "Property e Address escopados por workspaceId") —
 * `PropertyRepository.createProperty` already prevents this in the
 * normal path via the `SELECT ... FOR UPDATE` check (ADR 008 §4.3/§6.1),
 * so this constraint is defense in depth, structurally unreachable
 * through the Repository once that check passes. This test bypasses the
 * Repository deliberately, talking to `PrismaService` directly, to prove
 * the database itself also rejects it — independent of the Repository's
 * own application-level check. No insecure method is added to the
 * Repository just to make this reachable.
 */
describe('Property responsible-agent composite FK constraint (real mockp_test)', () => {
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
      data: { email: `responsible-agent-fk-${suffix}@example.com` },
    });
    await prisma.agentProfile.create({ data: { userId: owner.id } });
    const workspace = await workspaceRepository.createIndividualWorkspace({
      ownerUserId: owner.id,
      name: `Responsible Agent FK ${suffix}`,
      slug: `responsible-agent-fk-${suffix}`,
    });
    return { workspaceId: workspace.id, agentUserId: owner.id };
  }

  it('rejects creating a Property whose responsibleAgentUserId has no WorkspaceAgent in that same workspace, even though the user is a real WorkspaceAgent elsewhere', async () => {
    const { app, prisma, workspaceRepository } = await bootstrap();
    try {
      const { agentUserId } = await createActiveAgentWorkspace(
        prisma,
        workspaceRepository,
        'agent-home',
      );
      const { workspaceId: otherWorkspaceId } =
        await createActiveAgentWorkspace(
          prisma,
          workspaceRepository,
          'other-workspace',
        );

      let caught: unknown;
      try {
        await prisma.property.create({
          data: {
            workspaceId: otherWorkspaceId,
            responsibleAgentUserId: agentUserId,
            title: 'Orphaned Assignment',
            price: '500.00',
            currency: 'USD',
          },
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      const knownError = caught as Prisma.PrismaClientKnownRequestError;
      expect(knownError.code).toBe('P2003');
      const meta = knownError.meta as
        | {
            driverAdapterError?: {
              cause?: { constraint?: { index?: unknown } };
            };
          }
        | undefined;
      expect(meta?.driverAdapterError?.cause?.constraint?.index).toBe(
        RESPONSIBLE_AGENT_COMPOSITE_FK_CONSTRAINT,
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
});
