import { PersistenceInvariantError } from '../persistence/errors';

export type PropertyStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface CreateAddressInput {
  addressLine1: string;
  addressLine2?: string;
  district?: string;
  /** ISO 3166-1 alpha-2, uppercase — validated by the Repository before any SQL, see ADR 008 §7.4. Not checked for real-world existence. */
  countryCode: string;
  regionCode: string;
  locality: string;
  postalCode: string;
  latitude: number;
  longitude: number;
}

export interface CreatePropertyCommand {
  workspaceId: string;
  /** Must resolve to a WorkspaceAgent ACTIVE in **this** workspace — see ADR 008 §4.3/§6.1. */
  responsibleAgentUserId: string;
  title: string;
  /** Exact decimal as a string (e.g. "250000.50") — never number/float (ADR 006). Conversion to/from the Prisma-compatible Decimal never leaks outside the Repository. */
  price: string;
  /** ISO 4217, 3 uppercase letters — validated before any SQL, see ADR 008 §7.4. Not checked for real-world existence. */
  currency: string;
  address: CreateAddressInput;
}

export interface UpdatePropertyStatusCommand {
  workspaceId: string;
  propertyId: string;
  /** CAS — see ADR 008 §6. */
  expectedVersion: number;
  status: PropertyStatus;
}

export interface AddressRecord {
  id: string;
  addressLine1: string;
  addressLine2: string | null;
  district: string | null;
  countryCode: string;
  regionCode: string;
  locality: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PropertyWithAddressResult {
  id: string;
  workspaceId: string;
  responsibleAgentUserId: string;
  title: string;
  price: string;
  currency: string;
  status: PropertyStatus;
  publishedAt: Date | null;
  archivedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Always present on the type — never `| null` (the normal write path,
   * `createProperty`, always creates Property+Address together, in the
   * same transaction). The schema alone can't guarantee "exactly one
   * Address per Property" (only "at most one", via the unique
   * `addresses.property_id`) — see ADR 008 §4.3 for what the Repository
   * does if an existing Property is found without an Address (never
   * returns an object with `address` missing; throws
   * `PersistenceInvariantError('PROPERTY_ADDRESS_MISSING')`).
   */
  address: AddressRecord;
}

const COUNTRY_CODE_FORMAT = /^[A-Z]{2}$/;
const CURRENCY_FORMAT = /^[A-Z]{3}$/;

function isTrimmedNonEmpty(value: string): boolean {
  return value.length > 0 && value === value.trim();
}

function rejectInvalidFormat(message: string): never {
  throw new PersistenceInvariantError(message, 'INVALID_PROPERTY_INPUT');
}

/**
 * Mirrors, field by field, the eight format `CHECK` constraints on
 * `addresses`/`properties` (ADR 008 §7.4) — validates, never normalizes:
 * no `trim()`, no case conversion, no verification that an ISO
 * 3166-1/4217 code actually exists. Throws
 * `PersistenceInvariantError('INVALID_PROPERTY_INPUT')` before any SQL
 * is built. Exported so unit tests can exercise every branch without a
 * `PrismaService`.
 */
export function assertValidCreatePropertyCommand(
  cmd: CreatePropertyCommand,
): void {
  if (!CURRENCY_FORMAT.test(cmd.currency)) {
    rejectInvalidFormat('Invalid currency format.');
  }
  assertValidCreateAddressInput(cmd.address);
}

export function assertValidCreateAddressInput(
  address: CreateAddressInput,
): void {
  if (!COUNTRY_CODE_FORMAT.test(address.countryCode)) {
    rejectInvalidFormat('Invalid countryCode format.');
  }
  if (!isTrimmedNonEmpty(address.addressLine1)) {
    rejectInvalidFormat('Invalid addressLine1 format.');
  }
  if (
    address.addressLine2 !== undefined &&
    !isTrimmedNonEmpty(address.addressLine2)
  ) {
    rejectInvalidFormat('Invalid addressLine2 format.');
  }
  if (address.district !== undefined && !isTrimmedNonEmpty(address.district)) {
    rejectInvalidFormat('Invalid district format.');
  }
  if (!isTrimmedNonEmpty(address.regionCode)) {
    rejectInvalidFormat('Invalid regionCode format.');
  }
  if (!isTrimmedNonEmpty(address.locality)) {
    rejectInvalidFormat('Invalid locality format.');
  }
  if (!isTrimmedNonEmpty(address.postalCode)) {
    rejectInvalidFormat('Invalid postalCode format.');
  }
}
