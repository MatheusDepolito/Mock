import { Test, type TestingModuleBuilder } from '@nestjs/testing';
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
  // Syntactically valid but never dialed: PrismaModule/PrismaService
  // (Tarefa 3.3.2) and RedisModule/RedisService (Tarefa 3.3.1) both
  // exist and are part of AppModule now, but both connect exclusively
  // lazily — constructing either never opens a socket, and no test in
  // this suite issues a Prisma query or calls RedisService.ping() — so
  // this value never causes a real connection attempt. Every test in
  // this suite proves the API boots and answers health checks with no
  // PostgreSQL/Redis process reachable from these values.
  databaseUrl: 'postgresql://mockp:mockp@localhost:5432/mockp_test',
  redisUrl: 'redis://localhost:6379',
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
  /**
   * Overrides Nest providers on the compiled module graph before
   * `.compile()` — e.g.
   * `builder.overrideProvider(PrismaService).useValue(fake)`. Test-only
   * hook; `AppModule.forRoot()` itself is never touched. Introduced for
   * Tarefa 3.4 so HTTP tests of `/api/v1/health/ready` can replace
   * `PrismaService`/`RedisService` with deterministic fakes and keep
   * `api:test:integration` fully offline, instead of relying on those
   * services' real (but lazy) connections never being dialed — which
   * stops being true once readiness actually calls them. See
   * docs/adr/008-runtime-persistence-and-repositories.md (§2.4).
   */
  overrideProviders?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
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

  const builder = Test.createTestingModule({
    imports: [
      AppModule.forRoot(
        config,
        options.loggerStream ? { loggerStream: options.loggerStream } : {},
      ),
      ...(options.includeTestingSupport ? [TestingModule] : []),
    ],
  });

  const moduleRef = await (
    options.overrideProviders?.(builder) ?? builder
  ).compile();

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
