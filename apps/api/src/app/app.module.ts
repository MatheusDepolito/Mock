import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import type { ServerConfig } from '@mockp/config/server';
import { HealthModule } from '../health/health.module';
import { ProblemDetailsFilter } from '../common/problem-details.filter';
import { getRequestId } from '../common/request-id';
import { RuntimeConfigModule } from '../common/runtime-config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';

const REDACTED_HEADER_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

export interface AppModuleOptions {
  /** Test-only hook to capture pino-http output instead of writing to stdout. */
  loggerStream?: DestinationStream;
}

@Module({})
export class AppModule {
  /**
   * `serverConfig` is loaded once (by main.ts, or by a test harness) and
   * passed in rather than re-read from `process.env` here, so tests can
   * build the module graph with an arbitrary config. This module never
   * mounts test-only routes itself — a test harness that needs them
   * imports TestingModule (apps/api/test/support) explicitly alongside
   * this one.
   */
  static forRoot(
    serverConfig: ServerConfig,
    options: AppModuleOptions = {},
  ): DynamicModule {
    const pinoHttpOptions = {
      level: serverConfig.logLevel,
      genReqId: (req: unknown) => getRequestId(req as never),
      redact: {
        paths: REDACTED_HEADER_PATHS,
        censor: '[Redacted]',
      },
    };

    return {
      module: AppModule,
      imports: [
        // Global — provides SERVER_CONFIG application-wide from this
        // same serverConfig, never re-reading process.env. See
        // docs/adr/008-runtime-persistence-and-repositories.md (§2.1).
        RuntimeConfigModule.forRoot(serverConfig),
        // The .env file (if any) is already loaded by main.ts/the test
        // harness, before loadServerConfig() runs — see
        // @mockp/config/server's loadEnvFile(). ConfigModule must not load
        // it a second time.
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        LoggerModule.forRoot({
          pinoHttp: options.loggerStream
            ? [pinoHttpOptions, options.loggerStream]
            : pinoHttpOptions,
        }),
        ThrottlerModule.forRoot([
          {
            name: 'default',
            ttl: serverConfig.rateLimit.ttlMs,
            limit: serverConfig.rateLimit.limit,
          },
        ]),
        // Static, non-global (unlike RuntimeConfigModule above) — both
        // imported directly here to register PrismaService's/
        // RedisService's lifecycle (OnModuleDestroy) even though nothing
        // consumes them yet (Tarefa 3.3.1 for Redis, 3.3.2 for Prisma).
        // Neither import opens a connection: both stay exclusively lazy
        // until a real consumer issues a query/command. See ADR 008
        // §2.4.
        PrismaModule,
        RedisModule,
        HealthModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
      ],
    };
  }
}
