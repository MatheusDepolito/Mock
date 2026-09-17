import { Test } from '@nestjs/testing';
import type { DynamicModule } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { ServerConfig } from '@mockp/config/server';
import { AppModule } from '../src/app/app.module';
import { RuntimeConfigModule } from '../src/common/runtime-config.module';
import { SERVER_CONFIG } from '../src/common/server-config.token';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisModule } from '../src/redis/redis.module';
import { RedisService } from '../src/redis/redis.service';
import { TEST_SERVER_CONFIG } from './support/create-test-app';

describe('AppModule composition', () => {
  it('composes runtime config, Prisma, and Redis as single instances without connecting', async () => {
    const appModule = AppModule.forRoot(TEST_SERVER_CONFIG);
    const runtimeConfigModule = appModule.imports?.find(
      (importedModule): importedModule is DynamicModule =>
        typeof importedModule === 'object' &&
        importedModule !== null &&
        'module' in importedModule &&
        importedModule.module === RuntimeConfigModule,
    );
    if (!runtimeConfigModule) {
      throw new Error('AppModule did not import RuntimeConfigModule.');
    }

    const rootModuleRef = await Test.createTestingModule({
      imports: [appModule],
    }).compile();
    const moduleRef = rootModuleRef.select(appModule);
    const app = rootModuleRef.createNestApplication();

    try {
      await app.init();

      const config = moduleRef
        .select(runtimeConfigModule)
        .get<ServerConfig>(SERVER_CONFIG, { strict: true });
      expect(config).toBe(TEST_SERVER_CONFIG);

      const prismaFromRoot = rootModuleRef.get(PrismaService, {
        strict: false,
      });
      const prismaFromModule = moduleRef
        .select(PrismaModule)
        .get(PrismaService, { strict: true });
      expect(prismaFromRoot).toBe(prismaFromModule);

      const redisFromRoot = rootModuleRef.get(RedisService, {
        strict: false,
      });
      const redisFromModule = moduleRef
        .select(RedisModule)
        .get(RedisService, { strict: true });
      expect(redisFromRoot).toBe(redisFromModule);
    } finally {
      await expect(app.close()).resolves.toBeUndefined();
    }
  });
});
