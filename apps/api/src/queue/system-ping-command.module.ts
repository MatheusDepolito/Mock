import { Module, type DynamicModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { ServerConfig } from '@mockp/config/server';
import { RuntimeConfigModule } from '../common/runtime-config.module';
import { SystemPingProducerModule } from './system-ping-producer.module';

/**
 * Minimal module for `system-ping.command.ts` — deliberately NOT the
 * full `AppModule.forRoot()` (apps/api/src/app/app.module.ts): this
 * command never serves HTTP and never touches Prisma, so it never
 * initializes `PrismaModule`/`ThrottlerModule`/CORS/Helmet/Swagger,
 * none of which it needs.
 */
@Module({})
export class SystemPingCommandModule {
  static forRoot(serverConfig: ServerConfig): DynamicModule {
    return {
      module: SystemPingCommandModule,
      imports: [
        RuntimeConfigModule.forRoot(serverConfig),
        LoggerModule.forRoot({ pinoHttp: { level: serverConfig.logLevel } }),
        SystemPingProducerModule.forRoot(),
      ],
    };
  }
}
