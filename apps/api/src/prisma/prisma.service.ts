import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import type { ServerConfig } from '@mockp/config/server';
import { SERVER_CONFIG } from '../common/server-config.token';
import { PrismaClient } from '../generated/prisma-client/client';

/**
 * Extends the generated `PrismaClient` directly (inheritance, not
 * composition, unlike `RedisService`) so every repository gets the full
 * generated Client surface unchanged — the official Prisma pattern for
 * NestJS. See docs/adr/008-runtime-persistence-and-repositories.md
 * (§2.2).
 *
 * Connects lazily — constructing this service never opens a socket: no
 * `OnModuleInit`, no explicit `$connect()`, no query issued here. The
 * generated `PrismaClient` only opens a connection on its first real
 * query, and this class never issues one during construction or
 * shutdown, so the offline test suite (and `AppModule` composing this
 * service with no PostgreSQL reachable) never attempts a real
 * connection. `SERVER_CONFIG` is injected via the global
 * `RuntimeConfigModule`, never read from `process.env` directly — same
 * discipline as `RedisService`.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(SERVER_CONFIG) config: ServerConfig) {
    super({
      adapter: new PrismaPg({ connectionString: config.databaseUrl }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
