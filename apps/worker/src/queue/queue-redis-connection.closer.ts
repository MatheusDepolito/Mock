import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { WORKER_REDIS_CONNECTION } from './worker-redis-connection.token';

const SHUTDOWN_TIMEOUT_MS = 2000;

/**
 * Races `promise` against a timeout, always clearing the timer in
 * `finally` so it never keeps the event loop alive even when `promise`
 * settles before the timeout fires. Mirrors
 * apps/api/src/queue/queue-redis-connection.closer.ts's own
 * `withTimeout()`.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer!: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Redis quit() timed out.')),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Owns the graceful shutdown of the connection `QueueRedisModule`
 * provides. Investigated during Tarefa 4.5 (a review point flagged
 * when this module was first wired into `AppModule`): neither
 * `@nestjs/bullmq`'s automatic `Queue.onApplicationShutdown`
 * (`bull.providers.js`, only disconnects when `forceDisconnectOnShutdown`
 * is set — never the default here) nor `BullExplorer.onApplicationShutdown`
 * (which only closes the `Worker`, via `worker.close()`, never the
 * connection object it was given) ever calls `.quit()`/`.disconnect()`
 * on an externally-provided `ioredis` instance like this one. Without
 * this class, the socket stayed open after `app.close()` resolved —
 * confirmed by inspecting `this.connection.status` post-shutdown before
 * this fix existed (still `'ready'`, not `'end'`).
 *
 * Registered as an `onApplicationShutdown` provider so that, per Nest's
 * documented module-teardown order (reverse of initialization), the
 * BullMQ `Queue`/`Worker` registered by `SystemPingModule` — which
 * depends on this connection — closes first; this class only tears
 * down the socket once nothing else is expected to still be using it.
 *
 * Mirrors `apps/api/src/queue/queue-redis-connection.closer.ts`'s own
 * quit()-under-timeout-then-disconnect() shutdown: only attempts a
 * graceful `quit()` when the connection is already `'ready'`
 * (otherwise `quit()` itself would send a command that can wait
 * forever under `maxRetriesPerRequest: null`); falls back to an
 * immediate, synchronous `disconnect()` in every other case, or if
 * `quit()` doesn't respond in time. The 2s timeout below bounds only
 * *this* connection's own `quit()` call — it says nothing about, and
 * cannot bound, whatever the BullMQ `Worker`'s own shutdown hook does
 * before this one runs. Nothing here ever calls `process.exit()` to
 * mask a connection left open.
 */
@Injectable()
export class QueueRedisConnectionCloser implements OnApplicationShutdown {
  private readonly logger = new Logger(QueueRedisConnectionCloser.name);

  constructor(
    @Inject(WORKER_REDIS_CONNECTION) private readonly connection: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.connection.status === 'ready') {
      try {
        await withTimeout(this.connection.quit(), SHUTDOWN_TIMEOUT_MS);
        return;
      } catch {
        // Never logs the caught error/cause: it can embed the
        // connection URL or credentials (some driver error messages
        // do). Only a fixed, static reason is logged.
        this.logger.warn('Redis quit() did not complete in time');
        // Falls through to the forced, synchronous disconnect below.
      }
    }

    this.connection.disconnect();
  }
}
