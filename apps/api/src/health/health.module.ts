import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/**
 * Imports PrismaModule/RedisModule explicitly (both static, non-global) so
 * HealthService can inject PrismaService/RedisService for the readiness
 * probes — see docs/adr/008-runtime-persistence-and-repositories.md (§2.4).
 * Reuses the same singleton instances already registered elsewhere in the
 * module graph; no Repository exists here because there is nothing to
 * persist.
 */
@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
