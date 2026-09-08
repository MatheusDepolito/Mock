import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Static, non-global module — every consumer that injects
 * `PrismaService` must import `PrismaModule` explicitly (unlike
 * `RuntimeConfigModule`, this is not global). See
 * docs/adr/008-runtime-persistence-and-repositories.md (§2.2/§2.4).
 *
 * `AppModule` imports this directly in Tarefa 3.3.2 to register
 * `PrismaService`'s lifecycle (`OnModuleDestroy`) even before any
 * domain module consumes it — same pattern already used for
 * `RedisModule` in Tarefa 3.3.1.
 */
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
