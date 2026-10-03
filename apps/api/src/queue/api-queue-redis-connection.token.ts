/**
 * Injection token for the API's own `ioredis` connection, dedicated to
 * the BullMQ producer side (`system.ping`). Deliberately never
 * `RedisService` (`apps/api/src/redis/redis.service.ts`) — its options
 * are the opposite of what BullMQ needs
 * (`maxRetriesPerRequest: 1` there, appropriate for a bounded HTTP
 * response deadline, vs. `null` here). See
 * docs/adr/006-persistence-and-local-infrastructure.md (§3.2) and
 * docs/adr/008-runtime-persistence-and-repositories.md (§3.2).
 */
export const API_QUEUE_REDIS_CONNECTION = Symbol('API_QUEUE_REDIS_CONNECTION');
