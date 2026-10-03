import { BullModule } from '@nestjs/bullmq';
import { Module, type DynamicModule } from '@nestjs/common';
import type Redis from 'ioredis';
import { SYSTEM_QUEUE_NAME } from '@mockp/queue';
import { API_QUEUE_REDIS_CONNECTION } from './api-queue-redis-connection.token';
import { QueueRedisModule } from './queue-redis.module';
import { SystemPingPublisher } from './system-ping.publisher';

/**
 * Wires the `system.ping` queue's producer side together via
 * `@nestjs/bullmq`, sharing the API's own dedicated Redis connection
 * (`QueueRedisModule`, never `RedisService`). Consumed only by
 * `system-ping.command.ts` (`SystemPingCommandModule`) — never
 * imported into `AppModule.forRoot()` (the HTTP application): this job
 * has no HTTP endpoint, per docs/TARGET_ARCHITECTURE.md, section 4.
 */
@Module({})
export class SystemPingProducerModule {
  static forRoot(): DynamicModule {
    return {
      module: SystemPingProducerModule,
      imports: [
        BullModule.forRootAsync({
          imports: [QueueRedisModule.forRoot()],
          inject: [API_QUEUE_REDIS_CONNECTION],
          useFactory: (connection: Redis) => ({ connection }),
        }),
        BullModule.registerQueue({ name: SYSTEM_QUEUE_NAME }),
      ],
      providers: [SystemPingPublisher],
      exports: [SystemPingPublisher],
    };
  }
}
