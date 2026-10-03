import { Logger, Module, type DynamicModule } from '@nestjs/common';
import Redis from 'ioredis';
import type { ServerConfig } from '@mockp/config/server';
import { SERVER_CONFIG } from '../common/server-config.token';
import { API_QUEUE_REDIS_CONNECTION } from './api-queue-redis-connection.token';
import { QueueRedisConnectionCloser } from './queue-redis-connection.closer';

/**
 * Provides the API's own, dedicated `ioredis` connection for the
 * `system.ping` BullMQ producer — never `RedisService`
 * (`apps/api/src/redis/redis.service.ts`). `maxRetriesPerRequest: null`
 * is BullMQ's own documented requirement (its internal commands, on
 * either the producer or consumer side, must not fail prematurely
 * while the connection is retrying); the API's `RedisService`
 * deliberately uses the opposite (`maxRetriesPerRequest: 1`,
 * appropriate for a bounded HTTP response deadline) — see
 * docs/adr/006-persistence-and-local-infrastructure.md (§3.2).
 *
 * Mirrors `apps/worker/src/queue/queue-redis.module.ts` — a separate,
 * independent implementation, never imported from there (the API and
 * the worker share only `libs/queue`, never source files from
 * `apps/api/src/**`/`apps/worker/src/**`).
 *
 * `QueueRedisConnectionCloser` (also registered here) owns this
 * connection's graceful shutdown — see its own docstring for why a
 * plain `ioredis` instance can't own that itself.
 */
@Module({})
export class QueueRedisModule {
  static forRoot(): DynamicModule {
    return {
      module: QueueRedisModule,
      providers: [
        {
          provide: API_QUEUE_REDIS_CONNECTION,
          inject: [SERVER_CONFIG],
          useFactory: (config: ServerConfig): Redis => {
            const connection = new Redis(config.redisUrl, {
              maxRetriesPerRequest: null,
            });

            // ioredis (EventEmitter) crashes the process with an
            // unhandled exception if no 'error' listener is registered
            // — mirrors apps/api/src/redis/redis.service.ts. Logs only
            // the error code, never the full Error object, which can
            // embed the connection URL or credentials. Object-first
            // call — see system-ping.publisher.ts's comment on why a
            // plain object as the *second* argument to a per-instance
            // Logger never reaches nestjs-pino's real JSON output.
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
      exports: [API_QUEUE_REDIS_CONNECTION],
    };
  }
}
