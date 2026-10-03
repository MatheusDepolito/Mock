/**
 * Injection token for the worker's own `ioredis` connection, dedicated
 * to BullMQ. Deliberately never `RedisService`
 * (`apps/api/src/redis/redis.service.ts`) — that class doesn't even
 * exist in `apps/worker` (the worker never imports `apps/api/src/**`),
 * and its options are the opposite of what BullMQ requires
 * (`maxRetriesPerRequest: 1` there vs. `null` here). See
 * docs/adr/006-persistence-and-local-infrastructure.md (§3.2).
 */
export const WORKER_REDIS_CONNECTION = Symbol('WORKER_REDIS_CONNECTION');
