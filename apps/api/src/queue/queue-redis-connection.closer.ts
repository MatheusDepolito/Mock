import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { API_QUEUE_REDIS_CONNECTION } from './api-queue-redis-connection.token';

const SHUTDOWN_TIMEOUT_MS = 2000;

/**
 * Races `promise` against a timeout, always clearing the timer in
 * `finally` so it never keeps the event loop alive even when `promise`
 * settles before the timeout fires. Mirrors
 * apps/api/src/redis/redis.service.ts's own `withTimeout()`.
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
 * provides. That connection is a plain `ioredis` instance — required
 * as-is by `@nestjs/bullmq`'s `connection` option — so it can't
 * implement a Nest lifecycle hook itself; this is the one thing in the
 * module graph responsible for closing it.
 *
 * Registered as an `onApplicationShutdown` provider so that, per Nest's
 * documented module-teardown order (reverse of initialization), the
 * BullMQ `Queue` registered by `SystemPingProducerModule` — which
 * depends on this connection — is expected to already be
 * closing/closed by the time this runs. That expected ordering is a
 * design assumption, not yet independently confirmed against a real
 * `@nestjs/bullmq` + real Redis run; treat it as pending verification
 * during the first real execution of `system-ping.command.ts`.
 *
 * Mirrors `apps/api/src/redis/redis.service.ts`'s own
 * quit()-under-timeout-then-disconnect() shutdown: only attempts a
 * graceful `quit()` when the connection is already `'ready'`
 * (otherwise `quit()` itself would send a command that can wait
 * forever under `maxRetriesPerRequest: null`); falls back to an
 * immediate, synchronous `disconnect()` in every other case, or if
 * `quit()` doesn't respond in time. The 2s timeout below bounds only
 * *this* connection's own `quit()` call — it says nothing about, and
 * cannot bound, whatever the BullMQ `Queue`'s own shutdown hook does
 * before this one runs; a hang there would not be caught by this
 * class. Nothing here ever calls `process.exit()` to mask a connection
 * left open.
 */
@Injectable()
export class QueueRedisConnectionCloser implements OnApplicationShutdown {
  private readonly logger = new Logger(QueueRedisConnectionCloser.name);

  constructor(
    @Inject(API_QUEUE_REDIS_CONNECTION) private readonly connection: Redis,
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
