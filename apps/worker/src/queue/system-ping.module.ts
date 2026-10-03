import { Module, type DynamicModule } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import type Redis from 'ioredis';
import { SYSTEM_QUEUE_NAME } from '@mockp/queue';
import { QueueRedisModule } from './queue-redis.module';
import { SystemPingProcessor } from './system-ping.processor';
import { WORKER_REDIS_CONNECTION } from './worker-redis-connection.token';

/**
 * Wires the `system.ping` queue and its consumer (`SystemPingProcessor`)
 * together via `@nestjs/bullmq`, sharing the worker's own dedicated
 * Redis connection (`QueueRedisModule`, never the API's `RedisService`).
 *
 * Imported by `AppModule` as of Tarefa 4.5, validated against real
 * Redis via `yarn validate:infra` — deferred from Tarefa 4.3 for the
 * reason `queue-redis.module.ts`'s docstring explains: `@nestjs/bullmq`'s
 * automatic shutdown hook closes the underlying BullMQ `Worker` without
 * `force`, which hangs indefinitely if Redis is unreachable — composing
 * this module into any offline test (no real Redis) would have hung
 * `app.close()`.
 */
@Module({})
export class SystemPingModule {
  static forRoot(): DynamicModule {
    return {
      module: SystemPingModule,
      imports: [
        BullModule.forRootAsync({
          imports: [QueueRedisModule.forRoot()],
          inject: [WORKER_REDIS_CONNECTION],
          useFactory: (connection: Redis) => ({ connection }),
        }),
        BullModule.registerQueue({ name: SYSTEM_QUEUE_NAME }),
      ],
      providers: [SystemPingProcessor],
    };
  }
}
