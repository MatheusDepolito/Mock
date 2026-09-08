import { Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Static, non-global module — every consumer that injects
 * `RedisService` must import `RedisModule` explicitly (unlike
 * `RuntimeConfigModule`, this is not global). See
 * docs/adr/008-runtime-persistence-and-repositories.md (§2.3/§2.4).
 *
 * `AppModule` imports this directly in Tarefa 3.3.1 to register
 * `RedisService`'s lifecycle (`OnModuleDestroy`) even before any
 * domain module consumes it.
 */
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
