import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import type { ServerConfig } from '@mockp/config/server';
import { RedisService } from './redis.service';
import { RedisUnavailableError } from './redis-unavailable.error';

// Fully offline: `ioredis` is mocked at the module level below — this
// suite never opens a real socket, never touches Docker/a real Redis.
// See docs/adr/008-runtime-persistence-and-repositories.md (§3/§7.1).
vi.mock('ioredis', () => ({ default: vi.fn() }));

const REDIS_URL_WITH_CREDENTIALS = 'redis://:s3cr3t-password@localhost:6379';

const TEST_CONFIG: ServerConfig = {
  nodeEnv: 'test',
  port: 0,
  host: '127.0.0.1',
  logLevel: 'silent',
  corsAllowedOrigins: ['https://example.test'],
  databaseUrl: 'postgresql://mockp:mockp@localhost:5432/mockp_test',
  redisUrl: REDIS_URL_WITH_CREDENTIALS,
  rateLimit: { ttlMs: 1000, limit: 10 },
};

type MockRedisStatus =
  | 'wait'
  | 'connecting'
  | 'connect'
  | 'reconnecting'
  | 'ready'
  | 'close'
  | 'end';

/** Minimal ioredis-shaped fake: a real EventEmitter (so `.on`/`.once`/`.off`/`.emit` behave exactly like the real client) plus spies for the four methods RedisService actually calls. */
class MockRedisClient extends EventEmitter {
  status: MockRedisStatus = 'wait';
  connect: Mock = vi.fn().mockResolvedValue(undefined);
  ping: Mock = vi.fn().mockResolvedValue('PONG');
  quit: Mock = vi.fn().mockResolvedValue('OK');
  disconnect: Mock = vi.fn();
}

let mockClient: MockRedisClient;

beforeEach(() => {
  mockClient = new MockRedisClient();
  vi.mocked(Redis).mockClear();
  // A regular function, never an arrow function: `new Redis(...)` in
  // redis.service.ts requires the mocked implementation to be
  // constructable — arrow functions can never be invoked with `new`.
  // Returning an object from a constructor call makes `new` use that
  // object instead of `this`, which is what wires `mockClient` in as
  // `this.client` inside RedisService.
  vi.mocked(Redis).mockImplementation(function (this: unknown) {
    return mockClient as unknown as Redis;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('RedisService', () => {
  describe('construction', () => {
    it('never calls connect() when constructed', () => {
      void new RedisService(TEST_CONFIG);

      expect(mockClient.connect).not.toHaveBeenCalled();
    });

    it('passes the exact approved options to the ioredis constructor', () => {
      void new RedisService(TEST_CONFIG);

      expect(Redis).toHaveBeenCalledTimes(1);
      expect(Redis).toHaveBeenCalledWith(TEST_CONFIG.redisUrl, {
        lazyConnect: true,
        enableOfflineQueue: false,
        connectTimeout: 2000,
        commandTimeout: 2000,
        maxRetriesPerRequest: 1,
        retryStrategy: expect.any(Function),
      });

      const call = vi.mocked(Redis).mock.calls[0] as unknown as [
        string,
        { retryStrategy: (attempt: number) => number },
      ];
      const options = call[1];
      expect(options.retryStrategy(1)).toBe(200);
      expect(options.retryStrategy(20)).toBe(2000);
      expect(options.retryStrategy(100)).toBe(2000);
    });

    it('registers exactly one permanent error listener, never removed by construction alone', () => {
      void new RedisService(TEST_CONFIG);

      expect(mockClient.listenerCount('error')).toBe(1);
      expect(mockClient.listenerCount('ready')).toBe(0);
    });
  });

  describe('ping() — status handling', () => {
    it("status 'wait': calls connect() and then PING", async () => {
      mockClient.status = 'wait';
      mockClient.connect.mockImplementation(() => {
        mockClient.status = 'ready';
        return Promise.resolve();
      });
      const service = new RedisService(TEST_CONFIG);

      await expect(service.ping()).resolves.toBe('PONG');

      expect(mockClient.connect).toHaveBeenCalledTimes(1);
      expect(mockClient.ping).toHaveBeenCalledTimes(1);
    });

    it("status 'ready': calls PING directly, never connect()", async () => {
      mockClient.status = 'ready';
      const service = new RedisService(TEST_CONFIG);

      await expect(service.ping()).resolves.toBe('PONG');

      expect(mockClient.connect).not.toHaveBeenCalled();
      expect(mockClient.ping).toHaveBeenCalledTimes(1);
    });

    it("status 'connecting': waits for 'ready' before PING", async () => {
      mockClient.status = 'connecting';
      const service = new RedisService(TEST_CONFIG);

      const pending = service.ping();
      await Promise.resolve(); // let waitUntilReady() register its listeners
      mockClient.status = 'ready';
      mockClient.emit('ready');

      await expect(pending).resolves.toBe('PONG');
      expect(mockClient.ping).toHaveBeenCalledTimes(1);
    });

    it("status 'reconnecting': waits for 'ready' before PING", async () => {
      mockClient.status = 'reconnecting';
      const service = new RedisService(TEST_CONFIG);

      const pending = service.ping();
      await Promise.resolve();
      mockClient.status = 'ready';
      mockClient.emit('ready');

      await expect(pending).resolves.toBe('PONG');
      expect(mockClient.ping).toHaveBeenCalledTimes(1);
    });

    it("status 'connect' (TCP socket up, handshake not finished): waits for 'ready' before PING, cleaning up listeners", async () => {
      // 'connect' is a real, transitional ioredis status — the socket is
      // already established but the client hasn't finished its initial
      // handshake yet, so it isn't ready to take a command. Treated
      // exactly like 'connecting'/'reconnecting'.
      mockClient.status = 'connect';
      const service = new RedisService(TEST_CONFIG);
      expect(mockClient.listenerCount('error')).toBe(1); // permanent only, so far

      const pending = service.ping();
      await Promise.resolve(); // let waitUntilReady() register its listeners
      expect(mockClient.connect).not.toHaveBeenCalled();
      expect(mockClient.listenerCount('ready')).toBe(1);
      expect(mockClient.listenerCount('error')).toBe(2); // permanent + temporary

      mockClient.status = 'ready';
      mockClient.emit('ready');

      await expect(pending).resolves.toBe('PONG');
      expect(mockClient.ping).toHaveBeenCalledTimes(1);
      expect(mockClient.listenerCount('ready')).toBe(0);
      expect(mockClient.listenerCount('error')).toBe(1); // back to permanent only
    });

    it("status 'close': fails immediately, never attempts PING", async () => {
      mockClient.status = 'close';
      const service = new RedisService(TEST_CONFIG);

      await expect(service.ping()).rejects.toThrow(
        new RedisUnavailableError('Redis connection is closed.'),
      );
      expect(mockClient.ping).not.toHaveBeenCalled();
      expect(mockClient.connect).not.toHaveBeenCalled();
    });

    it("status 'end': fails immediately, never attempts PING", async () => {
      mockClient.status = 'end';
      const service = new RedisService(TEST_CONFIG);

      await expect(service.ping()).rejects.toThrow(
        new RedisUnavailableError('Redis connection is closed.'),
      );
      expect(mockClient.ping).not.toHaveBeenCalled();
    });

    it('unforeseen status fails immediately (defense against a future/unknown ioredis status)', async () => {
      // Every real ioredis status is now explicitly handled by ping()'s
      // switch (wait/connecting/connect/reconnecting/ready/close/end) —
      // there is no real status left to exercise the `default` branch.
      // Assigning a value outside MockRedisStatus, with an explicit cast,
      // verifies that branch stays a safe fallback if a future ioredis
      // version ever introduces a new status this code doesn't know
      // about yet.
      mockClient.status = 'bogus-future-status' as MockRedisStatus;
      const service = new RedisService(TEST_CONFIG);

      await expect(service.ping()).rejects.toThrow(
        new RedisUnavailableError('Redis client is in an unexpected state.'),
      );
      expect(mockClient.ping).not.toHaveBeenCalled();
    });
  });

  describe('ping() — error normalization', () => {
    it('normalizes a connect() rejection as RedisUnavailableError with cause preserved', async () => {
      mockClient.status = 'wait';
      const driverError = new Error('connect ECONNREFUSED');
      mockClient.connect.mockRejectedValue(driverError);
      const service = new RedisService(TEST_CONFIG);

      const error = await service.ping().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RedisUnavailableError);
      expect((error as RedisUnavailableError).message).toBe(
        'Redis is unavailable.',
      );
      expect((error as RedisUnavailableError).cause).toBe(driverError);
    });

    it('normalizes a PING rejection as RedisUnavailableError with cause preserved', async () => {
      mockClient.status = 'ready';
      const driverError = new Error('write EPIPE');
      mockClient.ping.mockRejectedValue(driverError);
      const service = new RedisService(TEST_CONFIG);

      const error = await service.ping().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RedisUnavailableError);
      expect((error as RedisUnavailableError).message).toBe(
        'Redis is unavailable.',
      );
      expect((error as RedisUnavailableError).cause).toBe(driverError);
    });

    it('never wraps an already-normalized RedisUnavailableError a second time', async () => {
      mockClient.status = 'wait';
      const alreadyNormalized = new RedisUnavailableError(
        'Custom already normalized.',
      );
      mockClient.connect.mockRejectedValue(alreadyNormalized);
      const service = new RedisService(TEST_CONFIG);

      await expect(service.ping()).rejects.toBe(alreadyNormalized);
    });

    it('never lets the raw driver message or the redisUrl leak into the thrown error', async () => {
      mockClient.status = 'wait';
      mockClient.connect.mockRejectedValue(
        new Error(`failed to reach ${REDIS_URL_WITH_CREDENTIALS}`),
      );
      const service = new RedisService(TEST_CONFIG);

      const error = await service.ping().catch((e: unknown) => e);

      expect((error as RedisUnavailableError).message).not.toContain(
        REDIS_URL_WITH_CREDENTIALS,
      );
      expect((error as RedisUnavailableError).message).toBe(
        'Redis is unavailable.',
      );
    });
  });

  describe('ping() — timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('normalizes a connect() that never settles as a timeout error', async () => {
      mockClient.status = 'wait';
      mockClient.connect.mockImplementation(() => new Promise(() => {}));
      const service = new RedisService(TEST_CONFIG);

      const pending = service.ping();
      const assertion = expect(pending).rejects.toThrow(
        new RedisUnavailableError('Redis operation timed out.'),
      );
      await vi.advanceTimersByTimeAsync(2000);
      await assertion;
    });
  });

  describe('waitUntilReady() — listener and timer cleanup', () => {
    it("removes the temporary listeners after 'ready' (permanent error listener untouched)", async () => {
      mockClient.status = 'connecting';
      const service = new RedisService(TEST_CONFIG);
      expect(mockClient.listenerCount('error')).toBe(1); // permanent only, so far

      const pending = service.ping();
      await Promise.resolve();
      expect(mockClient.listenerCount('ready')).toBe(1);
      expect(mockClient.listenerCount('error')).toBe(2); // permanent + temporary

      mockClient.status = 'ready';
      mockClient.emit('ready');
      await pending;

      expect(mockClient.listenerCount('ready')).toBe(0);
      expect(mockClient.listenerCount('error')).toBe(1); // back to permanent only
    });

    it("removes the temporary listeners after 'error' (permanent error listener untouched)", async () => {
      const errorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      mockClient.status = 'connecting';
      const service = new RedisService(TEST_CONFIG);

      const pending = service.ping();
      await Promise.resolve();
      expect(mockClient.listenerCount('ready')).toBe(1);
      expect(mockClient.listenerCount('error')).toBe(2);

      mockClient.emit('error', new Error('connection reset'));
      await expect(pending).rejects.toThrow(RedisUnavailableError);

      expect(mockClient.listenerCount('ready')).toBe(0);
      expect(mockClient.listenerCount('error')).toBe(1); // permanent listener remains, still fired
      expect(errorSpy).toHaveBeenCalled();
    });

    it('removes the temporary listeners after a timeout', async () => {
      vi.useFakeTimers();
      mockClient.status = 'connecting';
      const service = new RedisService(TEST_CONFIG);

      const pending = service.ping();
      const assertion = expect(pending).rejects.toThrow(
        new RedisUnavailableError('Redis connection timed out.'),
      );
      await vi.advanceTimersByTimeAsync(2000);
      await assertion;

      expect(mockClient.listenerCount('ready')).toBe(0);
      expect(mockClient.listenerCount('error')).toBe(1); // permanent only
    });

    it('clears the timer once resolved, never leaving a pending timer behind', async () => {
      vi.useFakeTimers();
      mockClient.status = 'connecting';
      const service = new RedisService(TEST_CONFIG);

      const pending = service.ping();
      await vi.advanceTimersByTimeAsync(0);
      mockClient.status = 'ready';
      mockClient.emit('ready');
      await pending;

      // If the timeout's setTimeout hadn't been cleared, a timer would
      // still be pending at this point.
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('isReady()', () => {
    it('returns true only when status is exactly "ready"', () => {
      const service = new RedisService(TEST_CONFIG);

      const statuses: MockRedisStatus[] = [
        'wait',
        'connecting',
        'connect',
        'reconnecting',
        'close',
        'end',
      ];
      for (const status of statuses) {
        mockClient.status = status;
        expect(service.isReady()).toBe(false);
      }

      mockClient.status = 'ready';
      expect(service.isReady()).toBe(true);
    });
  });

  describe('onModuleDestroy()', () => {
    it('calls quit() when status is ready', async () => {
      mockClient.status = 'ready';
      const service = new RedisService(TEST_CONFIG);

      await service.onModuleDestroy();

      expect(mockClient.quit).toHaveBeenCalledTimes(1);
      expect(mockClient.disconnect).not.toHaveBeenCalled();
    });

    it('falls back to disconnect() when quit() rejects', async () => {
      mockClient.status = 'ready';
      mockClient.quit.mockRejectedValue(new Error('quit failed'));
      const service = new RedisService(TEST_CONFIG);

      await expect(service.onModuleDestroy()).resolves.toBeUndefined();

      expect(mockClient.quit).toHaveBeenCalledTimes(1);
      expect(mockClient.disconnect).toHaveBeenCalledTimes(1);
    });

    it('falls back to disconnect() when quit() times out', async () => {
      vi.useFakeTimers();
      mockClient.status = 'ready';
      mockClient.quit.mockImplementation(() => new Promise(() => {}));
      const service = new RedisService(TEST_CONFIG);

      const pending = service.onModuleDestroy();
      const assertion = expect(pending).resolves.toBeUndefined();
      await vi.advanceTimersByTimeAsync(2000);
      await assertion;

      expect(mockClient.disconnect).toHaveBeenCalledTimes(1);
    });

    it('uses disconnect() directly (never connect/quit) when the client never connected', async () => {
      mockClient.status = 'wait';
      const service = new RedisService(TEST_CONFIG);

      await service.onModuleDestroy();

      expect(mockClient.connect).not.toHaveBeenCalled();
      expect(mockClient.quit).not.toHaveBeenCalled();
      expect(mockClient.disconnect).toHaveBeenCalledTimes(1);
    });

    it('is safe to call repeatedly — never throws on a second call', async () => {
      mockClient.status = 'ready';
      const service = new RedisService(TEST_CONFIG);

      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
      mockClient.status = 'end';
      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });
  });

  describe('observability — no sensitive data in logs', () => {
    it('logs only a fixed message and the error code, never the redisUrl, credentials, or the raw driver message', () => {
      const errorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      void new RedisService(TEST_CONFIG);

      const driverError = Object.assign(
        new Error(
          `connect ECONNREFUSED ${REDIS_URL_WITH_CREDENTIALS} (auth failed for password s3cr3t-password)`,
        ),
        { code: 'ECONNREFUSED' },
      );
      mockClient.emit('error', driverError);

      expect(errorSpy).toHaveBeenCalledWith('Redis client error', {
        code: 'ECONNREFUSED',
      });

      const loggedText = errorSpy.mock.calls
        .map((call) => call.map(String).join(' '))
        .join(' | ');
      expect(loggedText).not.toContain('s3cr3t-password');
      expect(loggedText).not.toContain(REDIS_URL_WITH_CREDENTIALS);
      expect(loggedText).not.toContain(driverError.message);
    });
  });
});
