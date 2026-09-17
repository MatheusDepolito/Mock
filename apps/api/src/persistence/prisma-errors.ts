import { Prisma } from '../generated/prisma-client/client';
import { PersistenceError, UnexpectedPersistenceError } from './errors';

/**
 * A unique-violation target known in advance for one specific call site —
 * either the exact Postgres constraint name, or the exact set of Prisma
 * field names (no more, no fewer). See
 * docs/adr/008-runtime-persistence-and-repositories.md (§5.1).
 *
 * **Empirically confirmed shape (this stack — Prisma 7 + `@prisma/adapter-pg`,
 * driver-adapter architecture, no Rust query engine binary)**: a `P2002`
 * error's `error.meta` does NOT carry a top-level `target` field the way
 * the classic (binary-engine) Prisma Client does. Instead, the Postgres
 * constraint name lives at
 * `error.meta.driverAdapterError.cause.constraint.index` — verified
 * directly against `mockp_test` (`users_email_key` observed on a real
 * duplicate-email violation). `extractConstraintName`/`extractTargetColumns`
 * below check this real, adapter-specific path first, falling back to the
 * classic `meta.target` shape defensively (still exact-match only) in case
 * a future Prisma/adapter version ever produces it — never a heuristic or
 * partial match either way.
 */
export interface KnownUniqueViolationTarget {
  readonly constraintName?: string;
  readonly columns?: readonly string[];
}

interface DriverAdapterErrorMeta {
  target?: unknown;
  driverAdapterError?: {
    cause?: {
      constraint?: {
        index?: unknown;
      };
    };
  };
}

function extractConstraintName(
  error: Prisma.PrismaClientKnownRequestError,
): string | undefined {
  const meta = error.meta as DriverAdapterErrorMeta | undefined;
  const driverAdapterConstraintName =
    meta?.driverAdapterError?.cause?.constraint?.index;
  if (typeof driverAdapterConstraintName === 'string') {
    return driverAdapterConstraintName;
  }
  if (typeof meta?.target === 'string') {
    return meta.target;
  }
  return undefined;
}

function extractTargetColumns(
  error: Prisma.PrismaClientKnownRequestError,
): readonly string[] | undefined {
  const target = (error.meta as DriverAdapterErrorMeta | undefined)?.target;
  return Array.isArray(target) ? target : undefined;
}

/**
 * Recognizes a `P2002` unique-constraint violation ONLY when the
 * constraint name or column set known in advance for `expected` matches
 * exactly — never by substring, `includes`, or any other heuristic. Any
 * other code, missing/malformed metadata, or a value that does not match
 * exactly is NOT recognized here (the caller falls back to
 * `wrapUnexpectedPersistenceError`).
 */
export function isUniqueViolation(
  error: unknown,
  expected: KnownUniqueViolationTarget,
): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2002') return false;

  if (expected.constraintName !== undefined) {
    if (extractConstraintName(error) === expected.constraintName) {
      return true;
    }
  }

  if (expected.columns !== undefined) {
    const columns = extractTargetColumns(error);
    if (
      columns !== undefined &&
      columns.length === expected.columns.length &&
      expected.columns.every((column) => columns.includes(column))
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Normalizes any error that escapes a Repository's public method boundary.
 * Idempotent: an error that is already a `PersistenceError` (thrown
 * deliberately by a known validation/translation inside the method) is
 * returned as the SAME instance, never wrapped twice. Anything else
 * becomes an `UnexpectedPersistenceError` with a static public `message`
 * and the original error preserved only via `cause` — never copied into
 * `message`.
 */
export function wrapUnexpectedPersistenceError(
  error: unknown,
): PersistenceError {
  if (error instanceof PersistenceError) {
    return error;
  }
  return new UnexpectedPersistenceError(
    'Unexpected persistence error.',
    'UNEXPECTED_PERSISTENCE_ERROR',
    { cause: error },
  );
}
