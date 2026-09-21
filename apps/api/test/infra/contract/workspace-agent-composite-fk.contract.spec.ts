import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { RuntimeConfigModule } from '../../../src/common/runtime-config.module';
import { Prisma } from '../../../src/generated/prisma-client/client';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { buildInfraServerConfig } from '../../support/infra-server-config';

const COMPOSITE_FK_CONSTRAINT = 'workspace_agents_workspace_id_user_id_fkey';

/**
 * Contract test for the composite FK
 * `workspace_agents(workspace_id, user_id) → workspace_memberships(workspace_id, user_id)`
 * (ADR 008 §4.2) — bypasses `WorkspaceRepository` deliberately: this
 * constraint is structurally unreachable through the Repository's
 * normal write path (the membership is always created moments earlier
 * in the same transaction), so the Repository never needs to recognize
 * or translate it. No insecure method is added to the Repository just
 * to make this reachable.
 */
describe('WorkspaceAgent composite FK constraint (real mockp_test)', () => {
  async function bootstrap() {
    const config = buildInfraServerConfig();
    const moduleRef = await Test.createTestingModule({
      imports: [RuntimeConfigModule.forRoot(config), PrismaModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return { app, prisma: app.get(PrismaService) };
  }

  it('rejects creating a WorkspaceAgent for a workspace where the user has no WorkspaceMembership, even though the simple AgentProfile FK is satisfied', async () => {
    const { app, prisma } = await bootstrap();
    try {
      const user = await prisma.user.create({
        data: { email: 'composite-fk-test@example.com' },
      });
      // Satisfies the SIMPLE FK (workspace_agents_user_id_fkey) — this
      // must not fire; only the composite FK should.
      await prisma.agentProfile.create({ data: { userId: user.id } });

      const workspaceA = await prisma.workspace.create({
        data: {
          type: 'INDIVIDUAL',
          name: 'Workspace A (has membership)',
          slug: 'composite-fk-workspace-a',
          ownerUserId: user.id,
        },
      });
      await prisma.workspaceMembership.create({
        data: { workspaceId: workspaceA.id, userId: user.id, status: 'ACTIVE' },
      });

      const workspaceB = await prisma.workspace.create({
        data: {
          type: 'INDIVIDUAL',
          name: 'Workspace B (no membership)',
          slug: 'composite-fk-workspace-b',
          ownerUserId: user.id,
        },
      });
      // Deliberately no WorkspaceMembership created for (workspaceB, user).

      let caught: unknown;
      try {
        await prisma.workspaceAgent.create({
          data: {
            workspaceId: workspaceB.id,
            userId: user.id,
            status: 'ACTIVE',
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
        COMPOSITE_FK_CONSTRAINT,
      );
    } finally {
      await app.close();
    }
  });
});
