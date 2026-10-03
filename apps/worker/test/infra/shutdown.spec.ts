import { NestFactory } from '@nestjs/core';
import type Redis from 'ioredis';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app/app.module';
import { WORKER_REDIS_CONNECTION } from '../../src/queue/worker-redis-connection.token';
import { buildInfraWorkerConfig } from './support/infra-worker-config';

/**
 * In-process counterpart to `shutdown-process.spec.ts` — deterministic
 * and cross-platform, unlike a real OS signal (see that file's comment
 * for why `SIGTERM`/`SIGINT` can't be observed gracefully on Windows).
 * Mirrors apps/api/test/shutdown.spec.ts's own `app.close()` pattern:
 * proves the module graph's lifecycle hooks (the same ones a real
 * SIGTERM triggers via `app.enableShutdownHooks()` in `src/main.ts`)
 * run and resolve cleanly, independent of whether the OS actually
 * delivers the signal.
 *
 * Real Redis, not offline (moved here from apps/worker/test/ as of
 * Tarefa 4.5): `AppModule.forRoot()` now wires `SystemPingModule` in,
 * whose real BullMQ `Worker` registers an automatic shutdown hook that
 * hangs indefinitely (`worker.close()`, no `force`) if Redis is
 * unreachable — see `apps/worker/src/queue/queue-redis.module.ts`'s
 * docstring. Composing the full `AppModule` is therefore only safe
 * where real Redis is guaranteed, i.e. here, under
 * `yarn validate:infra` — never in the fully offline `yarn validate`.
 */
describe('Graceful shutdown (in-process, real Redis)', () => {
  it("resolves app.close() cleanly AND actually closes the worker's ioredis socket — not just that the promise settled", async () => {
    const app = await NestFactory.createApplicationContext(
      AppModule.forRoot(buildInfraWorkerConfig()),
      { logger: false },
    );

    // Grabbed before close() so this test can inspect the connection
    // afterward — `app.close()` resolving is not, by itself, proof
    // that the socket underneath was actually torn down (see
    // `queue-redis-connection.closer.ts`'s docstring: before that
    // class existed, neither `@nestjs/bullmq` nor a plain `ioredis`
    // instance closed this connection on shutdown, and `status`
    // stayed `'ready'` even after `app.close()` resolved).
    const connection = app.get<Redis>(WORKER_REDIS_CONNECTION);
    // The connection starts connecting as soon as `Redis` is
    // constructed (no `lazyConnect`), but reaching `'ready'` is
    // asynchronous — it can still be `'connecting'` at this exact
    // point even though the BullMQ `Worker` already issued its first
    // command. Wait for the real `'ready'` event rather than assuming
    // it has already fired.
    if (connection.status !== 'ready') {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Connection did not become ready in time.')),
          5000,
        );
        connection.once('ready', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    expect(connection.status).toBe('ready');

    await expect(app.close()).resolves.toBeUndefined();

    // The real, decisive proof: the socket itself is gone.
    // `QueueRedisConnectionCloser` transitions it to `'end'` via
    // `quit()`/`disconnect()` — a leaked socket would leave `status`
    // at `'ready'` (or `'close'` mid-teardown) instead.
    expect(connection.status).toBe('end');
  }, 20000);
});
