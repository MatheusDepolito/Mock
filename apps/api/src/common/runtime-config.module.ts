import { Module, type DynamicModule } from '@nestjs/common';
import type { ServerConfig } from '@mockp/config/server';
import { SERVER_CONFIG } from './server-config.token';

/**
 * Provides `SERVER_CONFIG` application-wide. The only global module in
 * this codebase besides Nest's own `ConfigModule` — justified because
 * `ServerConfig` is genuinely cross-cutting runtime configuration, not
 * a domain-specific dependency (see
 * docs/adr/008-runtime-persistence-and-repositories.md, §2.1).
 *
 * Registered exactly once, from `AppModule.forRoot(serverConfig)`, with
 * the same `ServerConfig` already loaded and validated by `main.ts` (or
 * a test harness) — this module never reads `process.env` itself, and
 * never re-validates or transforms the value it receives.
 */
@Module({})
export class RuntimeConfigModule {
  static forRoot(config: ServerConfig): DynamicModule {
    return {
      module: RuntimeConfigModule,
      global: true,
      providers: [{ provide: SERVER_CONFIG, useValue: config }],
      exports: [SERVER_CONFIG],
    };
  }
}
