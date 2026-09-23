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
 * 7 + `@prisma/adapter-pg`): a `CHECK` violation raised by a **raw**
 * `prisma.$executeRaw`/`$queryRaw` call surfaces as
 * `PrismaClientKnownRequestError` with `code: 'P2010'` ("Raw query
 * failed") and an **empty** `meta` object — a different `code` than the
 * one typed `prisma.property.create()` calls produce for the same kind
 * of violation (`P2039`, see `assertPropertyCurrencyCheckViolation`
 * below and property-lifecycle.contract.spec.ts). Neither path exposes a
 * structured field for the SQLSTATE or the constraint name — both are
 * only available as plain text inside `error.message`, in Prisma's own
 * fixed phrasing: "Raw query failed. Code: `<sqlstate>`. Message:
 * `<postgres message>`", where the Postgres message ends with `violates
 * check constraint "<name>"`. This helper checks the `code`, the
 * SQLSTATE, and the exact, full constraint name — never a generic
 * substring search across the whole serialized error object.
 */
function assertAddressCheckViolation(
  error: unknown,
  constraintName: string,
): void {
  expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  const knownError = error as Prisma.PrismaClientKnownRequestError;
  expect(knownError.code).toBe('P2010');
  expect(knownError.message).toContain(
    `Code: \`${CHECK_VIOLATION_SQLSTATE}\`.`,
  );
  expect(knownError.message).toContain(
    `violates check constraint "${constraintName}"`,
  );
}

/**
 * Same underlying `CHECK` violation as `assertAddressCheckViolation`,
 * but through a **typed** `prisma.property.create()` call instead of raw
 * SQL — empirically confirmed to produce `code: 'P2039'` ("Database
 * error") rather than `P2010`, with the same empty `meta` and the same
 * "Code: `<sqlstate>`. Message: `<postgres message>`" text format.
 */
function assertPropertyCurrencyCheckViolation(error: unknown): void {
  expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  const knownError = error as Prisma.PrismaClientKnownRequestError;
  expect(knownError.code).toBe('P2039');
  expect(knownError.message).toContain(
    `Code: \`${CHECK_VIOLATION_SQLSTATE}\`.`,
  );
  expect(knownError.message).toContain(
    'violates check constraint "properties_currency_format"',
  );
}

interface AddressFields {
  addressLine1: string;
  addressLine2: string | null;
  district: string | null;
  countryCode: string;
  regionCode: string;
  locality: string;
  postalCode: string;
}

const VALID_ADDRESS_FIELDS: AddressFields = {
  addressLine1: '123 Main St',
  addressLine2: null,
  district: null,
  countryCode: 'US',
  regionCode: 'CA',
  locality: 'San Francisco',
  postalCode: '94105',
};

/**
 * Every Address format `CHECK` bypasses `PropertyRepository` deliberately
 * (ADR 008 §7.4) — `Address.location` is `Unsupported` by the Prisma
 * Client, so `PropertyRepository` itself (and this fixture) always
 * writes `Address` rows via parameterized raw SQL, never `prisma.address.create()`.
 */
async function insertAddressRaw(
  prisma: PrismaService,
  workspaceId: string,
  propertyId: string,
  overrides: Partial<AddressFields>,
): Promise<unknown> {
  const fields = { ...VALID_ADDRESS_FIELDS, ...overrides };
  // `updated_at` has no database-level DEFAULT (`@updatedAt` is a
  // Prisma-Client-only convenience) — set explicitly to the database's
  // own clock, same as property.repository.ts's own INSERT.
  return prisma.$executeRaw`
    INSERT INTO addresses (
      workspace_id, property_id, address_line_1, address_line_2, district,
      country_code, region_code, locality, postal_code, location, updated_at
    ) VALUES (
      ${workspaceId}::uuid, ${propertyId}::uuid, ${fields.addressLine1},
      ${fields.addressLine2}, ${fields.district}, ${fields.countryCode},
      ${fields.regionCode}, ${fields.locality}, ${fields.postalCode},
      ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography,
      CURRENT_TIMESTAMP
    )
  `;
}

const ADDRESS_FORMAT_CASES: ReadonlyArray<{
  label: string;
  overrides: Partial<AddressFields>;
  constraint: string;
}> = [
  {
    label: 'countryCode is not exactly two uppercase letters',
    // `country_code` is `CHAR(2)` — a 3-character value like 'usa'
    // would fail on column length before ever reaching the format
    // `CHECK`. 'us' is exactly two characters, only lowercase, so this
    // isolates the format `CHECK` specifically.
    overrides: { countryCode: 'us' },
    constraint: 'addresses_country_code_format',
  },
  {
    label: 'addressLine1 has leading whitespace',
    overrides: { addressLine1: ' 123 Main St' },
    constraint: 'addresses_address_line_1_trimmed',
  },
  {
    label: 'addressLine2 is blank when provided',
    overrides: { addressLine2: '' },
    constraint: 'addresses_address_line_2_trimmed',
  },
  {
    label: 'district is blank when provided',
    overrides: { district: '' },
    constraint: 'addresses_district_trimmed',
  },
  {
    label: 'regionCode is blank',
    overrides: { regionCode: '' },
    constraint: 'addresses_region_code_trimmed',
  },
  {
    label: 'locality has trailing whitespace',
    overrides: { locality: 'San Francisco ' },
    constraint: 'addresses_locality_trimmed',
  },
  {
    label: 'postalCode has leading whitespace',
    overrides: { postalCode: ' 94105' },
    constraint: 'addresses_postal_code_trimmed',
  },
];

describe('Address/Property format CHECK constraints (real mockp_test)', () => {
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
      data: { email: `address-format-${suffix}@example.com` },
    });
    await prisma.agentProfile.create({ data: { userId: owner.id } });
    const workspace = await workspaceRepository.createIndividualWorkspace({
      ownerUserId: owner.id,
      name: `Address Format ${suffix}`,
      slug: `address-format-${suffix}`,
    });
    return { workspaceId: workspace.id, agentUserId: owner.id };
  }

  it.each(ADDRESS_FORMAT_CASES)(
    'rejects an Address insert where $label',
    async ({ overrides, constraint }) => {
      const { app, prisma, workspaceRepository } = await bootstrap();
      try {
        const { workspaceId, agentUserId } = await createActiveAgentWorkspace(
          prisma,
          workspaceRepository,
          constraint,
        );
        const property = await prisma.property.create({
          data: {
            workspaceId,
            responsibleAgentUserId: agentUserId,
            title: 'Format Check Listing',
            price: '1.00',
            currency: 'USD',
          },
        });

        const caught = await insertAddressRaw(
          prisma,
          workspaceId,
          property.id,
          overrides,
        ).catch((error: unknown) => error);

        assertAddressCheckViolation(caught, constraint);
        expect(
          await prisma.address.count({ where: { propertyId: property.id } }),
        ).toBe(0);
      } finally {
        await app.close();
      }
    },
  );

  it('rejects a Property created with a currency that is not exactly three uppercase letters (properties_currency_format)', async () => {
    const { app, prisma, workspaceRepository } = await bootstrap();
    try {
      const { workspaceId, agentUserId } = await createActiveAgentWorkspace(
        prisma,
        workspaceRepository,
        'currency-format',
      );

      const caught = await prisma.property
        .create({
          data: {
            workspaceId,
            responsibleAgentUserId: agentUserId,
            title: 'Bad Currency Listing',
            price: '1.00',
            currency: 'usd',
          },
        })
        .catch((error: unknown) => error);

      assertPropertyCurrencyCheckViolation(caught);
      expect(await prisma.property.count({ where: { workspaceId } })).toBe(0);
    } finally {
      await app.close();
    }
  });
});
