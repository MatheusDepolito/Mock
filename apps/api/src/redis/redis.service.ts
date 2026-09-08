import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import type { ServerConfig } from '@mockp/config/server';
import { SERVER_CONFIG } from '../common/server-config.token';
import { RedisUnavailableError } from './redis-unavailable.error';

const REDIS_CONNECT_TIMEOUT_MS = 2000;
const REDIS_COMMAND_TIMEOUT_MS = 2000;
const REDIS_SHUTDOWN_TIMEOUT_MS = 2000;

/**
 * Races `promise` against a timeout, always clearing the timer in
 * `finally` so it never keeps the event loop alive even when `promise`
 * settles before the timeout fires. See
 * docs/adr/008-runtime-persistence-and-repositories.md (§3).
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer!: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new RedisUnavailableError('Redis operation timed out.')),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Thin, purpose-built wrapper around a single `ioredis` client —
 * composition, never `extends Redis`: `ioredis`'s full command surface
 * (pub/sub, streams, scripting, cluster) isn't what this project needs
 * today (only `PING`), and a future BullMQ worker will use its own
 * dedicated connection/options, never this service. See
 * docs/adr/008-runtime-persistence-and-repositories.md (§3/§3.2). The
 * raw client is never exposed outside this class.
 *
 * Connects lazily — constructing this service never opens a socket, so
 * the offline test suite (and `AppModule` composing this service with
 * no Redis reachable) never attempts a real connection. `SERVER_CONFIG`
 * is injected via the global `RuntimeConfigModule`, never read from
 * `process.env` directly.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(SERVER_CONFIG) config: ServerConfig) {
    this.client = new Redis(config.redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
      // Finite and small — appropriate for an HTTP API with a bounded
      // response deadline. A future BullMQ worker will need its own
      // dedicated connection with `maxRetriesPerRequest: null` instead
      // (BullMQ's own documented requirement) — never this service's
      // configuration. See ADR 008 §3.2.
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt: number) => Math.min(attempt * 200, 2000),
    });

    // Permanent observability listener — never removed, distinct from
    // the temporary listeners registered/removed per call inside
    // waitUntilReady() below (they coexist without conflict: both are
    // notified of the same event). ioredis (EventEmitter) crashes the
    // process with an unhandled exception if no 'error' listener is
    // registered. Logs only a fixed message plus the error code (e.g.
    // 'ECONNREFUSED') — never the full Error object, stack, URL, or
    // credentials, which can be embedded in some driver error messages.
    this.client.on('error', (err: NodeJS.ErrnoException) => {
      this.logger.error('Redis client error', {
        code: err.code ?? 'UNKNOWN',
      });
    });
  }

  /**
   * Never hangs indefinitely, and never lets a raw `ioredis` error
   * escape — every error thrown from here is a normalized
   * `RedisUnavailableError` (static message, `cause` preserved when
   * there is one). Handles every possible `client.status` explicitly
   * before sending the command:
   * - 'wait' (lazyConnect, never connected): explicit `connect()`, under timeout.
   * - 'connecting'/'connect'/'reconnecting': waits for 'ready', under the
   *   same timeout. 'connect' is a real, transitional ioredis status (TCP
   *   socket established, handshake not finished yet) — treated exactly
   *   like 'connecting': the client isn't ready to take a command yet.
   * - 'ready': goes straight to `PING` (already carries `commandTimeout`).
   * - 'close'/'end': fails IMMEDIATELY — never attempts a command on an
   *   already-closed connection.
   * - any other/unforeseen status: fails immediately too.
   */
  async ping(): Promise<string> {
    try {
      switch (this.client.status) {
        case 'wait':
          await withTimeout(this.client.connect(), REDIS_CONNECT_TIMEOUT_MS);
          break;
        case 'connecting':
        case 'connect':
        case 'reconnecting':
          await this.waitUntilReady(REDIS_CONNECT_TIMEOUT_MS);
          break;
        case 'ready':
          break;
        case 'close':
        case 'end':
          throw new RedisUnavailableError('Redis connection is closed.');
        default:
          throw new RedisUnavailableError(
            'Redis client is in an unexpected state.',
          );
      }
      return await this.client.ping();
    } catch (error) {
      // connect()/waitUntilReady()/the state branches above already
      // throw a normalized RedisUnavailableError — preserved as-is,
      // never wrapped twice. Any other error (e.g. connect()/ping()
      // rejecting with a raw driver error outside the timeout path) is
      // encapsulated here, the single exit point of this function —
      // guarantees ping() never leaks error.message, a stack trace, or
      // any driver detail that could embed the connection URL or
      // credentials.
      if (error instanceof RedisUnavailableError) {
        throw error;
      }
      throw new RedisUnavailableError('Redis is unavailable.', {
        cause: error,
      });
    }
  }

  /**
   * Resolves on the 'ready' event, rejects on 'error' or on timeout —
   * and, on ANY of the three exits, removes both temporary listeners
   * and clears the timer, via the shared `cleanup()` below. Never a
   * `Promise.race` that decides externally and abandons a
   * listener/timer still registered on the client: cleanup happens from
   * inside the Promise itself. Always rejects with an already-normalized
   * `RedisUnavailableError` — never re-throws the raw `Error` from the
   * client's `'error'` event.
   */
  private waitUntilReady(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer);
        this.client.off('ready', onReady);
        this.client.off('error', onError);
      };
      const onReady = (): void => {
        cleanup();
        resolve();
      };
      const onError = (err: Error): void => {
        cleanup();
        reject(
          new RedisUnavailableError('Redis connection failed.', {
            cause: err,
          }),
        );
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new RedisUnavailableError('Redis connection timed out.'));
      }, timeoutMs);

      this.client.once('ready', onReady);
      this.client.once('error', onError);
    });
  }

  isReady(): boolean {
    return this.client.status === 'ready';
  }

  /**
   * Idempotent: safe to call more than once (e.g. duplicate shutdown
   * hooks) — rereads `client.status` on every call, never assumes a
   * prior state. Graceful `quit()` when the connection is actually
   * established, under a timeout; falls back to an immediate
   * `disconnect()` (no network I/O) when the client never connected, is
   * already closed, or `quit()` fails/times out — never leaves
   * `app.close()` hanging.
   */
  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'ready') {
      try {
        await withTimeout(this.client.quit(), REDIS_SHUTDOWN_TIMEOUT_MS);
        return;
      } catch {
        // quit() didn't respond in time, or failed — fall through to
        // the forced shutdown below.
      }
    }
    this.client.disconnect();
  }
}
