import { Logger, Module, type DynamicModule } from '@nestjs/common';
import Redis from 'ioredis';
import type { WorkerConfig } from '@mockp/config/worker';
import { WORKER_CONFIG } from '../common/worker-config.token';
import { QueueRedisConnectionCloser } from './queue-redis-connection.closer';
import { WORKER_REDIS_CONNECTION } from './worker-redis-connection.token';

/**
 * Provides the worker's own, dedicated `ioredis` connection for BullMQ
 * — never `RedisService` from `apps/api` (which doesn't exist here).
 * `maxRetriesPerRequest: null` is BullMQ's own documented requirement
 * for its internal blocking commands (`BRPOPLPUSH` and similar); the
 * API's `RedisService` deliberately uses the opposite
 * (`maxRetriesPerRequest: 1`, appropriate for a bounded HTTP response
 * deadline) — see
 * docs/adr/006-persistence-and-local-infrastructure.md (§3.2).
 *
 * Imported by `AppModule` (via `SystemPingModule`) as of Tarefa 4.5,
 * validated against real Redis via `yarn validate:infra` — deferred
 * from Tarefa 4.3 because an offline `yarn validate` run has no real
 * Redis, and `@nestjs/bullmq`'s automatic shutdown hook hangs
 * indefinitely without one.
 *
 * `QueueRedisConnectionCloser` (also registered here) owns this
 * connection's graceful shutdown — see its own docstring for why
 * neither `@nestjs/bullmq` nor a plain `ioredis` instance can do that
 * on their own.
 */
@Module({})
export class QueueRedisModule {
  static forRoot(): DynamicModule {
    return {
      module: QueueRedisModule,
      providers: [
        {
          provide: WORKER_REDIS_CONNECTION,
          inject: [WORKER_CONFIG],
          useFactory: (config: WorkerConfig): Redis => {
            const connection = new Redis(config.redisUrl, {
              maxRetriesPerRequest: null,
            });

            // ioredis (EventEmitter) crashes the process with an
            // unhandled exception if no 'error' listener is registered
            // — mirrors apps/api/src/redis/redis.service.ts. Logs only
            // the error code, never the full Error object, which can
            // embed the connection URL or credentials. Object-first
            // call — see apps/api/src/queue/system-ping.publisher.ts's
            // comment on why a plain object as the *second* argument
            // to a per-instance Logger never reaches nestjs-pino's
            // real JSON output (the `code` field would otherwise be
            // silently dropped, exactly like `system-ping.processor.ts`
            // was before Tarefa 4.5).
            connection.on('error', (err: NodeJS.ErrnoException) => {
              new Logger(QueueRedisModule.name).error(
                { code: err.code ?? 'UNKNOWN' },
                'Redis client error',
              );
            });

            return connection;
          },
        },
        QueueRedisConnectionCloser,
      ],
      exports: [WORKER_REDIS_CONNECTION],
    };
  }
}
