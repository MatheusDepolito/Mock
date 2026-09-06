import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import type { ServerConfig } from '@mockp/config/server';
import { AppModule } from '../../src/app/app.module';
import { configureApp } from '../../src/app/configure-app';
import { TestingModule } from './testing.module';

export const ALLOWED_TEST_ORIGIN = 'https://allowed.example.com';
export const DISALLOWED_TEST_ORIGIN = 'https://not-allowed.example.com';

export const TEST_SERVER_CONFIG: ServerConfig = {
  nodeEnv: 'test',
  port: 0,
  host: '127.0.0.1',
  logLevel: 'silent',
  corsAllowedOrigins: [ALLOWED_TEST_ORIGIN],
  rateLimit: { ttlMs: 60000, limit: 1000 },
};

export interface CreateTestAppOptions {
  configOverrides?: Partial<ServerConfig>;
  loggerStream?: DestinationStream;
  /**
   * Explicitly mounts the test-only TestingModule (apps/api/test/support)
   * alongside AppModule. Defaults to false — production's AppModule never
   * mounts it on its own (see apps/api/src/app/app.module.ts); a test that
   * needs the `/__test__/*` routes must opt in here.
   */
  includeTestingSupport?: boolean;
}

export async function createTestApp(
  options: CreateTestAppOptions = {},
): Promise<{ app: INestApplication; config: ServerConfig }> {
  const config: ServerConfig = {
    ...TEST_SERVER_CONFIG,
    ...options.configOverrides,
    rateLimit: {
      ...TEST_SERVER_CONFIG.rateLimit,
      ...options.configOverrides?.rateLimit,
    },
  };

  const moduleRef = await Test.createTestingModule({
    imports: [
      AppModule.forRoot(
        config,
        options.loggerStream ? { loggerStream: options.loggerStream } : {},
      ),
      ...(options.includeTestingSupport ? [TestingModule] : []),
    ],
  }).compile();

  const app = moduleRef.createNestApplication();

  // Matches main.ts: without this, Nest's own ConsoleLogger (not Pino)
  // handles internal Logger calls (e.g. the global filter's error log for
  // unhandled exceptions), so it never reaches loggerStream and is never
  // subject to redaction.
  app.useLogger(app.get(Logger));

  configureApp(app, config);

  // Supertest talks to the underlying HTTP server directly via
  // app.getHttpServer() without ever calling app.listen(), so routes must
  // be bound explicitly here.
  await app.init();

  return { app, config };
}
