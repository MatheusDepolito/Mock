import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkspaceRepository } from './workspace.repository';

/**
 * Static, non-global module — declares/exports only
 * `WorkspaceRepository`, no Controller. The `User`/`AgentProfile`
 * precondition checks are executed directly by `WorkspaceRepository`
 * inside its transaction (ADR 008 §4.2), through `PrismaService`, so no
 * dependency on `UsersModule`/`UserRepository` is needed. See
 * docs/adr/008-runtime-persistence-and-repositories.md (§2.4/§4.2).
 */
@Module({
  imports: [PrismaModule],
  providers: [WorkspaceRepository],
  exports: [WorkspaceRepository],
})
export class WorkspacesModule {}
