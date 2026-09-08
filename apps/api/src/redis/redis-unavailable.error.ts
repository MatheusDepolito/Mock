/**
 * Internal error for Redis unavailability — thrown exclusively by
 * `RedisService` (see `redis.service.ts`). Deliberately **not** part of
 * the `PersistenceError` hierarchy that will be introduced alongside
 * the first Prisma-backed repository (Tarefa 3.3.5+): this error is
 * specific to the Redis client, not to a Repository/aggregate. See
 * docs/adr/008-runtime-persistence-and-repositories.md (§3).
 *
 * `message` is always one of a small set of static strings, never the
 * raw `message` of an underlying `ioredis`/driver error — which can
 * embed the connection string or other connection details. `cause` (via
 * the native `Error` `options.cause`) preserves the original error for
 * internal diagnostics only; nothing in this codebase serializes `cause`
 * back to a client.
 */
export class RedisUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RedisUnavailableError';
  }
}
