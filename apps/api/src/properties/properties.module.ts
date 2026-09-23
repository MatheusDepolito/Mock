import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PropertyRepository } from './property.repository';

/**
 * Static, non-global module — declares/exports only `PropertyRepository`,
 * no Controller. Never imports `UsersModule`/`WorkspacesModule` or any
 * other Repository — `PropertyRepository` reads `workspace_agents`
 * directly through `PrismaService` inside its own transaction (ADR 008
 * §4.3/§6.1). See docs/adr/008-runtime-persistence-and-repositories.md
 * (§2.4/§4.3).
 */
@Module({
  imports: [PrismaModule],
  providers: [PropertyRepository],
  exports: [PropertyRepository],
})
export class PropertiesModule {}
