import { Module, type DynamicModule } from '@nestjs/common';
import type { WorkerConfig } from '@mockp/config/worker';
import { WORKER_CONFIG } from './worker-config.token';

/**
 * Provides `WORKER_CONFIG` application-wide — the worker's counterpart
 * to the API's `RuntimeConfigModule`
 * (`apps/api/src/common/runtime-config.module.ts`), never imported from
 * there. Registered exactly once, from `AppModule.forRoot(workerConfig)`,
 * with the same `WorkerConfig` already loaded and validated by
 * `main.ts` (or a test harness) — this module never reads
 * `process.env` itself.
 */
@Module({})
export class RuntimeConfigModule {
  static forRoot(config: WorkerConfig): DynamicModule {
    return {
      module: RuntimeConfigModule,
      global: true,
      providers: [{ provide: WORKER_CONFIG, useValue: config }],
      exports: [WORKER_CONFIG],
    };
  }
}
