import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma-client/client';
import {
  AggregateNotFoundError,
  OptimisticConcurrencyError,
  PersistenceInvariantError,
} from '../persistence/errors';
import { wrapUnexpectedPersistenceError } from '../persistence/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertValidCreatePropertyCommand,
  type CreatePropertyCommand,
  type PropertyStatus,
  type PropertyWithAddressResult,
  type UpdatePropertyStatusCommand,
} from './property.types';

const PROPERTY_SELECT = {
  id: true,
  workspaceId: true,
  responsibleAgentUserId: true,
  title: true,
  price: true,
  currency: true,
  status: true,
  publishedAt: true,
  archivedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface SelectedPropertyRow {
  id: string;
  workspaceId: string;
  responsibleAgentUserId: string;
  title: string;
  price: Prisma.Decimal;
  currency: string;
  status: PropertyStatus;
  publishedAt: Date | null;
  archivedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Row shape of the CAS `UPDATE ... RETURNING` — snake_case columns, `price` already cast to `text` in SQL. */
interface CasPropertyRow {
  id: string;
  workspace_id: string;
  responsible_agent_user_id: string;
  title: string;
  price: string;
  currency: string;
  status: PropertyStatus;
  published_at: Date | null;
  archived_at: Date | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

type PropertyCore = Omit<PropertyWithAddressResult, 'address'>;

function fromSelectedPropertyRow(row: SelectedPropertyRow): PropertyCore {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    responsibleAgentUserId: row.responsibleAgentUserId,
    title: row.title,
    // `Decimal(12, 2)` in Postgres always has exactly two decimal
    // digits — `.toFixed(2)` matches that scale exactly; decimal.js's
    // default `.toString()` would silently drop trailing zeros (ADR 006
    // "Decimal, nunca Float").
    price: row.price.toFixed(2),
    currency: row.currency,
    status: row.status,
    publishedAt: row.publishedAt,
    archivedAt: row.archivedAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function fromCasPropertyRow(row: CasPropertyRow): PropertyCore {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    responsibleAgentUserId: row.responsible_agent_user_id,
    title: row.title,
    price: row.price,
    currency: row.currency,
    status: row.status,
    publishedAt: row.published_at,
    archivedAt: row.archived_at,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Row shape shared by the `Address` `INSERT ... RETURNING` and the `SELECT` used by reads — never exposes the PostGIS binary format. */
interface AddressRow {
  id: string;
  address_line_1: string;
  address_line_2: string | null;
  district: string | null;
  country_code: string;
  region_code: string;
  locality: string;
  postal_code: string;
  latitude: number;
  longitude: number;
  created_at: Date;
  updated_at: Date;
}

function toPropertyWithAddressResult(
  core: PropertyCore,
  addressRow: AddressRow,
): PropertyWithAddressResult {
  return {
    ...core,
    address: {
      id: addressRow.id,
      addressLine1: addressRow.address_line_1,
      addressLine2: addressRow.address_line_2,
      district: addressRow.district,
      countryCode: addressRow.country_code,
      regionCode: addressRow.region_code,
      locality: addressRow.locality,
      postalCode: addressRow.postal_code,
      latitude: addressRow.latitude,
      longitude: addressRow.longitude,
      createdAt: addressRow.created_at,
      updatedAt: addressRow.updated_at,
    },
  };
}

/** Columns returned by both the `Address` INSERT (createProperty) and the plain SELECT (findByIdInWorkspace/updatePropertyStatus) — kept identical so both call sites share the same `AddressRow` shape. */
const ADDRESS_RETURNING_COLUMNS = Prisma.sql`
  id, address_line_1, address_line_2, district, country_code, region_code,
  locality, postal_code,
  ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude,
  created_at, updated_at
`;

/**
 * Builds the CAS `UPDATE ... RETURNING` for `updatePropertyStatus`. The
 * destination `status` is always a bound parameter, never interpolated
 * as literal SQL text (ADR 008 §4.3, "SQL raw parametrizado"); the
 * `WHEN 'DRAFT'/'PUBLISHED'/'ARCHIVED'` branch labels are fixed SQL
 * syntax written by this module, not derived from any runtime value.
 * Encodes the "Máquina de estados de `Property.status`" from ADR 007:
 * `DRAFT` clears both timestamps; `PUBLISHED` preserves an existing
 * `publishedAt` or sets it to `now()` when null, and clears
 * `archivedAt`; `ARCHIVED` preserves `publishedAt` as-is and sets
 * `archivedAt` to `now()`.
 */
function buildUpdateStatusCasQuery(cmd: UpdatePropertyStatusCommand) {
  return Prisma.sql`
    UPDATE properties
    SET status = ${cmd.status}::"PropertyStatus",
        published_at = CASE ${cmd.status}::"PropertyStatus"
          WHEN 'DRAFT' THEN NULL
          WHEN 'PUBLISHED' THEN COALESCE(published_at, now())
          ELSE published_at
        END,
        archived_at = CASE ${cmd.status}::"PropertyStatus"
          WHEN 'ARCHIVED' THEN now()
          WHEN 'PUBLISHED' THEN NULL
          ELSE NULL
        END,
        version = version + 1,
        updated_at = now()
    WHERE workspace_id = ${cmd.workspaceId}::uuid
      AND id = ${cmd.propertyId}::uuid
      AND version = ${cmd.expectedVersion}::int
    RETURNING id, workspace_id, responsible_agent_user_id, title,
      price::text AS price, currency, status, published_at, archived_at,
      version, created_at, updated_at
  `;
}

/**
 * Aggregate (ADR 008 §4.3): `Property` + `Address`. `Address.location`
 * (PostGIS `geography(Point, 4326)`) is `Unsupported` by the Prisma
 * Client — every read/write of it goes through parameterized raw SQL
 * (`Prisma.sql` tagged templates only, never `$queryRawUnsafe`/
 * `$executeRawUnsafe`/string concatenation), scoped exclusively to this
 * Repository (ADR 006).
 */
@Injectable()
export class PropertyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createProperty(
    cmd: CreatePropertyCommand,
  ): Promise<PropertyWithAddressResult> {
    // Step 0 — format guard, before any database access (ADR 008 §4.3/§7.4).
    assertValidCreatePropertyCommand(cmd);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // First statement of the transaction: locks the WorkspaceAgent
        // row so a concurrent revocation can't race past this check
        // (ADR 008 §6.1).
        const agentRows = await tx.$queryRaw<{ status: string }[]>(Prisma.sql`
          SELECT status FROM workspace_agents
          WHERE workspace_id = ${cmd.workspaceId}::uuid
            AND user_id = ${cmd.responsibleAgentUserId}::uuid
          FOR UPDATE
        `);
        const agentRow = agentRows[0];
        if (!agentRow || agentRow.status !== 'ACTIVE') {
          throw new PersistenceInvariantError(
            'Responsible agent is not active in this workspace.',
            'RESPONSIBLE_AGENT_NOT_ACTIVE',
          );
        }

        const property = await tx.property.create({
          data: {
            workspaceId: cmd.workspaceId,
            responsibleAgentUserId: cmd.responsibleAgentUserId,
            title: cmd.title,
            price: cmd.price,
            currency: cmd.currency,
          },
          select: PROPERTY_SELECT,
        });

        // `updated_at` has no database-level DEFAULT (`@updatedAt` is a
        // Prisma-Client-only convenience, never translated into a SQL
        // DEFAULT — see the migration's `addresses` DDL) — a raw INSERT
        // that omits it fails the column's `NOT NULL` constraint. Set
        // explicitly to the database's own clock, never a JS-computed
        // timestamp. `id` stays omitted, preserving the native
        // `uuidv7()` column default.
        const addressRows = await tx.$queryRaw<AddressRow[]>(Prisma.sql`
          INSERT INTO addresses (
            workspace_id, property_id, address_line_1, address_line_2,
            district, country_code, region_code, locality, postal_code,
            location, updated_at
          ) VALUES (
            ${cmd.workspaceId}::uuid, ${property.id}::uuid,
            ${cmd.address.addressLine1}, ${cmd.address.addressLine2 ?? null},
            ${cmd.address.district ?? null}, ${cmd.address.countryCode},
            ${cmd.address.regionCode}, ${cmd.address.locality},
            ${cmd.address.postalCode},
            ST_SetSRID(
              ST_MakePoint(
                ${cmd.address.longitude}::double precision,
                ${cmd.address.latitude}::double precision
              ),
              4326
            )::geography,
            CURRENT_TIMESTAMP
          )
          RETURNING ${ADDRESS_RETURNING_COLUMNS}
        `);
        const addressRow = addressRows[0];
        if (!addressRow) {
          // Unreachable in practice (a successful INSERT ... RETURNING
          // always returns exactly one row) — normalized like any other
          // unexpected condition, never guessed into a specific reason.
          throw new Error('Address insert returned no row.');
        }

        return toPropertyWithAddressResult(
          fromSelectedPropertyRow(property),
          addressRow,
        );
      });
    } catch (error) {
      throw wrapUnexpectedPersistenceError(error);
    }
  }

  async findByIdInWorkspace(
    workspaceId: string,
    id: string,
  ): Promise<PropertyWithAddressResult | null> {
    try {
      const property = await this.prisma.property.findUnique({
        where: { workspaceId_id: { workspaceId, id } },
        select: PROPERTY_SELECT,
      });
      if (!property) {
        return null;
      }

      const addressRows = await this.prisma.$queryRaw<AddressRow[]>(Prisma.sql`
        SELECT ${ADDRESS_RETURNING_COLUMNS}
        FROM addresses
        WHERE workspace_id = ${workspaceId}::uuid AND property_id = ${id}::uuid
      `);
      const addressRow = addressRows[0];
      if (!addressRow) {
        throw new PersistenceInvariantError(
          'Property has no Address.',
          'PROPERTY_ADDRESS_MISSING',
        );
      }

      return toPropertyWithAddressResult(
        fromSelectedPropertyRow(property),
        addressRow,
      );
    } catch (error) {
      throw wrapUnexpectedPersistenceError(error);
    }
  }

  async updatePropertyStatus(
    cmd: UpdatePropertyStatusCommand,
  ): Promise<PropertyWithAddressResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const casRows = await tx.$queryRaw<CasPropertyRow[]>(
          buildUpdateStatusCasQuery(cmd),
        );
        const updated = casRows[0];

        if (!updated) {
          const existing = await tx.property.findUnique({
            where: {
              workspaceId_id: {
                workspaceId: cmd.workspaceId,
                id: cmd.propertyId,
              },
            },
            select: { id: true },
          });
          if (!existing) {
            throw new AggregateNotFoundError(
              'Property not found.',
              'PROPERTY_NOT_FOUND',
            );
          }
          throw new OptimisticConcurrencyError(
            'Property version conflict.',
            'PROPERTY_VERSION_CONFLICT',
          );
        }

        const addressRows = await tx.$queryRaw<AddressRow[]>(Prisma.sql`
          SELECT ${ADDRESS_RETURNING_COLUMNS}
          FROM addresses
          WHERE workspace_id = ${cmd.workspaceId}::uuid
            AND property_id = ${cmd.propertyId}::uuid
        `);
        const addressRow = addressRows[0];
        if (!addressRow) {
          // Causes the whole transaction to roll back — the CAS UPDATE
          // above is undone, `status`/timestamps/`version` return to
          // their pre-call values (ADR 008 §4.3/§7.3).
          throw new PersistenceInvariantError(
            'Property has no Address.',
            'PROPERTY_ADDRESS_MISSING',
          );
        }

        return toPropertyWithAddressResult(
          fromCasPropertyRow(updated),
          addressRow,
        );
      });
    } catch (error) {
      throw wrapUnexpectedPersistenceError(error);
    }
  }
}
