import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UserRepository } from './user.repository';

/**
 * Static, non-global module — declares/exports only `UserRepository`, no
 * Controller. See docs/adr/008-runtime-persistence-and-repositories.md
 * (§2.4/§4.1).
 */
@Module({
  imports: [PrismaModule],
  providers: [UserRepository],
  exports: [UserRepository],
})
export class UsersModule {}
