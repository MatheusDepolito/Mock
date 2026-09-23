import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { RuntimeConfigModule } from '../../../src/common/runtime-config.module';
import { Prisma } from '../../../src/generated/prisma-client/client';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { WorkspaceRepository } from '../../../src/workspaces/workspace.repository';
import { WorkspacesModule } from '../../../src/workspaces/workspaces.module';
import { buildInfraServerConfig } from '../../support/infra-server-config';

const ADDRESS_COMPOSITE_FK_CONSTRAINT =
  'addresses_workspace_id_property_id_fkey';
/** SQLSTATE for a Postgres foreign-key constraint violation (`foreign_key_violation`). */
const FOREIGN_KEY_VIOLATION_SQLSTATE = '23503';

/**
 * Contract test for the composite FK
 * `addresses(workspace_id, property_id) → properties(workspace_id, id)`
 * (ADR 007 "Property e Address escopados por workspaceId") — bypasses
 * `PropertyRepository` deliberately: this constraint is structurally
 * unreachable through the Repository's normal write path (`createProperty`
 * always inserts the Address with the same `workspaceId` as the Property
 * it just created, in the same transaction), so the Repository never
 * needs to recognize or translate it. No insecure method is added to
 * the Repository just to make this reachable — `Address.location` is
 * `Unsupported` by the Prisma Client, so this fixture is created via
 * parameterized raw SQL directly, the same way `PropertyRepository`
 * itself writes `Address` rows.
 *
 * **FK-via-raw-SQL error shape — empirically confirmed against a live
 * `mockp_test` (this session)**: unlike a FK violation from a **typed**
 * Client operation (`prisma.property.create()`, see
 * property-responsible-agent-fk.contract.spec.ts and
 * workspace-agent-composite-fk.contract.spec.ts — both `code: 'P2003'`
 * with `meta.driverAdapterError.cause.constraint.index` carrying the
 * constraint name), a FK violation raised by `prisma.$executeRaw`
 * surfaces as `code: 'P2010'` ("Raw query failed") with an **empty**
 * `meta` object. There is no structured field for the SQLSTATE or the
 * constraint name on this path — both are only available as plain text
 * inside `error.message`, in Prisma's own fixed phrasing: "Raw query
 * failed. Code: `<sqlstate>`. Message: `<postgres message>`", where the
 * Postgres message ends with `violates foreign key constraint
 * "<name>"`. This assertion checks the `code`, the SQLSTATE, and the
 * exact, full constraint name in that text — never a generic substring
 * search across the whole serialized error object.
 */
function assertAddressForeignKeyViolation(error: unknown): void {
  expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  const knownError = error as Prisma.PrismaClientKnownRequestError;
  expect(knownError.code).toBe('P2010');
  expect(knownError.message).toContain(
    `Code: \`${FOREIGN_KEY_VIOLATION_SQLSTATE}\`.`,
  );
  expect(knownError.message).toContain(
    `violates foreign key constraint "${ADDRESS_COMPOSITE_FK_CONSTRAINT}"`,
  );
}
describe('Address cross-tenant composite FK constraint (real mockp_test)', () => {
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
      data: { email: `cross-tenant-${suffix}@example.com` },
    });
    await prisma.agentProfile.create({ data: { userId: owner.id } });
    const workspace = await workspaceRepository.createIndividualWorkspace({
      ownerUserId: owner.id,
      name: `Cross Tenant ${suffix}`,
      slug: `cross-tenant-${suffix}`,
    });
    return { workspaceId: workspace.id, agentUserId: owner.id };
  }

  it("rejects inserting an Address whose workspace_id does not match its Property's workspace_id, even though the Property exists", async () => {
    const { app, prisma, workspaceRepository } = await bootstrap();
    try {
      const { workspaceId: workspaceA, agentUserId: agentA } =
        await createActiveAgentWorkspace(prisma, workspaceRepository, 'a');
      const { workspaceId: workspaceB } = await createActiveAgentWorkspace(
        prisma,
        workspaceRepository,
        'b',
      );

      const property = await prisma.property.create({
        data: {
          workspaceId: workspaceA,
          responsibleAgentUserId: agentA,
          title: 'Tenant A Listing',
          price: '1000.00',
          currency: 'USD',
        },
      });

      let caught: unknown;
      try {
        // Deliberately uses workspaceB (a real workspace) with a
        // propertyId that only exists under workspaceA — the composite
        // FK must reject this even though both individual ids are real.
        // `updated_at` has no database-level DEFAULT (`@updatedAt` is a
        // Prisma-Client-only convenience) — set explicitly to the
        // database's own clock, same as property.repository.ts's own
        // INSERT.
        await prisma.$executeRaw`
          INSERT INTO addresses (
            workspace_id, property_id, address_line_1, address_line_2,
            district, country_code, region_code, locality, postal_code,
            location, updated_at
          ) VALUES (
            ${workspaceB}::uuid, ${property.id}::uuid, '123 Main St', NULL,
            NULL, 'US', 'CA', 'San Francisco', '94105',
            ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography,
            CURRENT_TIMESTAMP
          )
        `;
      } catch (error) {
        caught = error;
      }

      assertAddressForeignKeyViolation(caught);

      expect(
        await prisma.address.count({ where: { propertyId: property.id } }),
      ).toBe(0);
    } finally {
      await app.close();
    }
  });
});
