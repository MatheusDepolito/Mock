/**
 * Internal error catalog shared by every Repository — never translated to
 * Problem Details here (that translation is a future Controller/Service
 * concern, out of scope for this ADR). See
 * docs/adr/008-runtime-persistence-and-repositories.md (§5).
 */
export type PersistenceErrorReason =
  | 'DUPLICATE_EMAIL'
  | 'DUPLICATE_AUTH_IDENTITY'
  | 'DUPLICATE_WORKSPACE_SLUG'
  | 'OWNER_NOT_FOUND'
  | 'AGENT_PROFILE_REQUIRED'
  | 'RESPONSIBLE_AGENT_NOT_ACTIVE'
  | 'ROLE_REQUIRED'
  | 'DUPLICATE_ROLE_NAME'
  | 'ROLE_NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'INVALID_PROPERTY_INPUT'
  | 'PROPERTY_NOT_FOUND'
  | 'PROPERTY_VERSION_CONFLICT'
  | 'PROPERTY_ADDRESS_MISSING'
  | 'UNEXPECTED_PERSISTENCE_ERROR';

/**
 * `message` is always a static, application-controlled string — never
 * `error.message` from a driver/Prisma error. The original error (when one
 * exists) is preserved only via `cause`, for internal diagnostics/logs —
 * never surfaced through the public `message` property. `reason` is a
 * closed catalog, never a free-form string. `name` resolves to the
 * concrete subclass automatically (e.g. "DuplicateEmail" is not a class —
 * see subclasses below — `this.constructor.name` yields the real subclass
 * name), so no subclass needs to redeclare it.
 */
export abstract class PersistenceError extends Error {
  constructor(
    message: string,
    readonly reason: PersistenceErrorReason,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

export class AggregateNotFoundError extends PersistenceError {}
export class OptimisticConcurrencyError extends PersistenceError {}
export class PersistenceConflictError extends PersistenceError {}
export class PersistenceInvariantError extends PersistenceError {}
/** Driver/Prisma error not recognized for that specific call site — never labeled not-found/conflict by guesswork. */
export class UnexpectedPersistenceError extends PersistenceError {}
