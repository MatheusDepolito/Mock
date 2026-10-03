import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { QueueRedisConnectionCloser } from './queue-redis-connection.closer';

type MockRedisStatus =
  | 'wait'
  | 'connecting'
  | 'connect'
  | 'reconnecting'
  | 'ready'
  | 'close'
  | 'end';

/** Minimal ioredis-shaped fake — only the two members this closer touches. */
class MockRedisConnection extends EventEmitter {
  status: MockRedisStatus = 'wait';
  quit: Mock = vi.fn().mockResolvedValue('OK');
  disconnect: Mock = vi.fn();
}

describe('QueueRedisConnectionCloser', () => {
  it('calls quit() when status is ready, never disconnect()', async () => {
    const connection = new MockRedisConnection();
    connection.status = 'ready';
    const closer = new QueueRedisConnectionCloser(
      connection as unknown as Redis,
    );

    await closer.onApplicationShutdown();

    expect(connection.quit).toHaveBeenCalledTimes(1);
    expect(connection.disconnect).not.toHaveBeenCalled();
  });

  it.each<MockRedisStatus>([
    'wait',
    'connecting',
    'connect',
    'reconnecting',
    'close',
    'end',
  ])(
    'disconnects immediately, without attempting quit(), when status is %s',
    async (status) => {
      const connection = new MockRedisConnection();
      connection.status = status;
      const closer = new QueueRedisConnectionCloser(
        connection as unknown as Redis,
      );

      await closer.onApplicationShutdown();

      expect(connection.quit).not.toHaveBeenCalled();
      expect(connection.disconnect).toHaveBeenCalledTimes(1);
    },
  );

  it('falls back to disconnect() when quit() rejects', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const connection = new MockRedisConnection();
    connection.status = 'ready';
    connection.quit.mockRejectedValue(new Error('quit failed'));
    const closer = new QueueRedisConnectionCloser(
      connection as unknown as Redis,
    );

    await expect(closer.onApplicationShutdown()).resolves.toBeUndefined();

    expect(connection.quit).toHaveBeenCalledTimes(1);
    expect(connection.disconnect).toHaveBeenCalledTimes(1);
  });

  it('falls back to disconnect() when quit() times out — never hangs app.close()', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.useFakeTimers();
    const connection = new MockRedisConnection();
    connection.status = 'ready';
    // Never resolves — simulates a connection stuck retrying under
    // `maxRetriesPerRequest: null` (e.g. Redis unreachable).
    connection.quit.mockImplementation(() => new Promise(() => undefined));
    const closer = new QueueRedisConnectionCloser(
      connection as unknown as Redis,
    );

    const pending = closer.onApplicationShutdown();
    const assertion = expect(pending).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(2000);
    await assertion;

    expect(connection.disconnect).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('never logs the rejection reason, cause, or Error object — only a fixed, static message', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const connection = new MockRedisConnection();
    connection.status = 'ready';
    const secretUrl = 'redis://:s3cr3t-password@localhost:6379';
    connection.quit.mockRejectedValue(
      new Error(`connect to ${secretUrl} failed`),
    );
    const closer = new QueueRedisConnectionCloser(
      connection as unknown as Redis,
    );

    await closer.onApplicationShutdown();

    // `warnSpy` is a shared spy on `Logger.prototype.warn` across every
    // test in this file — asserting call *content*, never an exact
    // call *count*, which would be flaky depending on test order (see
    // apps/api/src/redis/redis.service.spec.ts's own
    // "no sensitive data in logs" test for the same pattern).
    expect(warnSpy).toHaveBeenCalledWith(
      'Redis quit() did not complete in time',
    );
    for (const call of warnSpy.mock.calls) {
      // The fixed message alone, never a second argument (no error,
      // cause, or object).
      expect(call).toHaveLength(1);
      for (const arg of call) {
        const serialized = typeof arg === 'string' ? arg : JSON.stringify(arg);
        expect(serialized).not.toContain('s3cr3t-password');
        expect(serialized).not.toContain(secretUrl);
      }
    }
  });

  it('is safe to call repeatedly — never throws on a second call', async () => {
    const connection = new MockRedisConnection();
    connection.status = 'ready';
    const closer = new QueueRedisConnectionCloser(
      connection as unknown as Redis,
    );

    await expect(closer.onApplicationShutdown()).resolves.toBeUndefined();
    connection.status = 'end';
    await expect(closer.onApplicationShutdown()).resolves.toBeUndefined();
  });
});
