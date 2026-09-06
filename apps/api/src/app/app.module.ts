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

export const SERVER_CONFIG = Symbol('SERVER_CONFIG');

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
        HealthModule,
      ],
      providers: [
        { provide: SERVER_CONFIG, useValue: serverConfig },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
      ],
      exports: [SERVER_CONFIG],
    };
  }
}
