import { Module, type DynamicModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { WorkerConfig } from '@mockp/config/worker';
import { RuntimeConfigModule } from '../common/runtime-config.module';
import { SystemPingModule } from '../queue/system-ping.module';

@Module({})
export class AppModule {
  /**
   * `workerConfig` is loaded once (by main.ts, or by a test harness) and
   * passed in rather than re-read from `process.env` here, mirroring
   * `apps/api/src/app/app.module.ts`. Deliberately minimal: runtime
   * config, the Pino logger, and the `system.ping` queue consumer —
   * never ThrottlerModule/CORS/Helmet/Swagger/Prisma, since the worker
   * never accepts HTTP traffic (`NestFactory.createApplicationContext`,
   * not `NestFactory.create`) and never touches the database.
   *
   * `SystemPingModule` is wired in here only as of Tarefa 4.5 — see its
   * own docstring for why 4.3 deferred this (an offline
   * `yarn validate` run has no real Redis, and `@nestjs/bullmq`'s
   * automatic shutdown hook hangs indefinitely without one).
   */
  static forRoot(workerConfig: WorkerConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        // Global — provides WORKER_CONFIG application-wide from this
        // same workerConfig, never re-reading process.env.
        RuntimeConfigModule.forRoot(workerConfig),
        LoggerModule.forRoot({
          pinoHttp: { level: workerConfig.logLevel },
        }),
        SystemPingModule.forRoot(),
      ],
    };
  }
}
