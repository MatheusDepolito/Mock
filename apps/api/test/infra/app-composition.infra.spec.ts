import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { RuntimeConfigModule } from '../../src/common/runtime-config.module';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisModule } from '../../src/redis/redis.module';
import { RedisService } from '../../src/redis/redis.service';
import { buildInfraServerConfig } from '../support/infra-server-config';

/**
 * First real-infrastructure spec (Tarefa 3.3.4, ADR 008 §7.3/§8 item 4):
 * compiles RuntimeConfigModule + PrismaModule + RedisModule against the
 * real, seeded `mockp_test` database and the real local Redis — no mocks.
 * Only reads (`role.findMany`, `PING`); never writes to either.
 */
describe('Real infrastructure: RuntimeConfigModule + PrismaModule + RedisModule', () => {
  it('runs a real Prisma query against the seeded role catalog and a real Redis PING, then shuts down cleanly', async () => {
    const config = buildInfraServerConfig();

    const moduleRef = await Test.createTestingModule({
      imports: [RuntimeConfigModule.forRoot(config), PrismaModule, RedisModule],
    }).compile();

    const app = moduleRef.createNestApplication();

    try {
      await app.init();

      const prisma = app.get(PrismaService);
      const roles = await prisma.role.findMany({ select: { name: true } });
      expect(roles.map((role) => role.name).sort()).toEqual([
        'ADMIN',
        'CUSTOMER',
      ]);

      const redis = app.get(RedisService);
      await expect(redis.ping()).resolves.toBe('PONG');
    } finally {
      await expect(app.close()).resolves.toBeUndefined();
    }
  });
});
