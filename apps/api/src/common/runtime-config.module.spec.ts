import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { ServerConfig } from '@mockp/config/server';
import { RuntimeConfigModule } from './runtime-config.module';
import { SERVER_CONFIG } from './server-config.token';

const TEST_CONFIG: ServerConfig = {
  nodeEnv: 'test',
  port: 0,
  host: '127.0.0.1',
  logLevel: 'silent',
  corsAllowedOrigins: ['https://example.test'],
  databaseUrl: 'postgresql://user:pass@localhost:5432/db',
  redisUrl: 'redis://localhost:6379',
  rateLimit: { ttlMs: 1000, limit: 10 },
};

describe('RuntimeConfigModule', () => {
  it('resolves SERVER_CONFIG as exactly the object passed to forRoot()', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RuntimeConfigModule.forRoot(TEST_CONFIG)],
    }).compile();

    expect(moduleRef.get(SERVER_CONFIG)).toBe(TEST_CONFIG);
  });

  it('never transforms the config: every field is preserved exactly, including nested rateLimit', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RuntimeConfigModule.forRoot(TEST_CONFIG)],
    }).compile();

    expect(moduleRef.get(SERVER_CONFIG)).toEqual(TEST_CONFIG);
  });

  it('is global: SERVER_CONFIG is injectable from a sibling module that never imports RuntimeConfigModule itself', async () => {
    @Module({})
    class ConsumerModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [RuntimeConfigModule.forRoot(TEST_CONFIG), ConsumerModule],
    }).compile();

    // Resolved through ConsumerModule's own container, not the root
    // testing module — proves application-wide (global) visibility,
    // not just root-level provider registration.
    const consumerRef = moduleRef.select(ConsumerModule);
    expect(consumerRef.get(SERVER_CONFIG)).toBe(TEST_CONFIG);
  });

  it('never reads process.env: the resolved value only ever depends on the argument passed to forRoot()', async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL =
      'postgresql://should-be-ignored@localhost:5432/ignored';

    try {
      const moduleRef = await Test.createTestingModule({
        imports: [RuntimeConfigModule.forRoot(TEST_CONFIG)],
      }).compile();

      expect(moduleRef.get<ServerConfig>(SERVER_CONFIG).databaseUrl).toBe(
        TEST_CONFIG.databaseUrl,
      );
    } finally {
      if (originalDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
    }
  });
});
