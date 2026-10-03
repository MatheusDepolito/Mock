import { Writable } from 'node:stream';
import { getQueueToken } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import { LoggerModule, Logger as PinoLogger } from 'nestjs-pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SYSTEM_PING_JOB_NAME,
  SYSTEM_PING_JOB_OPTIONS,
  SYSTEM_QUEUE_NAME,
  type SystemPingJobPayload,
} from '@mockp/queue';
import { SystemPingPublisher } from './system-ping.publisher';

/** Captures raw pino output lines for real-serialization assertions — mirrors apps/api/test/logging.spec.ts's own CapturingStream. */
class CapturingStream extends Writable {
  readonly lines: string[] = [];

  override _write(
    chunk: Buffer | string,
    _encoding: string,
    callback: (error?: Error | null) => void,
  ): void {
    this.lines.push(chunk.toString());
    callback();
  }

  /** Parses every non-empty captured line as JSON — throws if any line isn't. */
  parsedLines(): Record<string, unknown>[] {
    return this.lines
      .flatMap((chunk) => chunk.split('\n'))
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }
}

function fakeQueue(): {
  queue: Queue<SystemPingJobPayload>;
  add: ReturnType<typeof vi.fn>;
} {
  const add = vi.fn().mockResolvedValue({ id: 'job-1' });
  return { queue: { add } as unknown as Queue<SystemPingJobPayload>, add };
}

describe('SystemPingPublisher', () => {
  // Every test above the real-serialization one below spies on
  // `Logger.prototype.log` without restoring it — a leaked spy would
  // silently swallow the real test's log calls too (a mocked
  // `Logger.prototype.log` never reaches nestjs-pino at all).
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('publishes exactly one system.ping job with SYSTEM_PING_JOB_OPTIONS and a requestId, without touching real Redis', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { queue, add } = fakeQueue();
    const publisher = new SystemPingPublisher(queue);

    const job = await publisher.publish();

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      SYSTEM_PING_JOB_NAME,
      expect.objectContaining({
        requestId: expect.any(String),
        publishedAt: expect.any(String),
      }),
      SYSTEM_PING_JOB_OPTIONS,
    );
    expect(job).toEqual({ id: 'job-1' });
  });

  it('reuses a given requestId instead of generating a new one', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { queue, add } = fakeQueue();
    const publisher = new SystemPingPublisher(queue);

    await publisher.publish('given-request-id');

    expect(add).toHaveBeenCalledWith(
      SYSTEM_PING_JOB_NAME,
      expect.objectContaining({ requestId: 'given-request-id' }),
      SYSTEM_PING_JOB_OPTIONS,
    );
  });

  it('generates a fresh UUID requestId on every call when none is given', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { queue, add } = fakeQueue();
    const publisher = new SystemPingPublisher(queue);

    await publisher.publish();
    await publisher.publish();

    const [, firstPayload] = add.mock.calls[0] ?? [];
    const [, secondPayload] = add.mock.calls[1] ?? [];
    expect(firstPayload).toBeDefined();
    expect(secondPayload).toBeDefined();
    expect((firstPayload as SystemPingJobPayload).requestId).not.toBe(
      (secondPayload as SystemPingJobPayload).requestId,
    );
  });

  it('calls the logger with the fields object first, the fixed message second', async () => {
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const { queue } = fakeQueue();
    const publisher = new SystemPingPublisher(queue);

    await publisher.publish('log-request-id');

    expect(logSpy).toHaveBeenCalledWith(
      { jobId: 'job-1', requestId: 'log-request-id' },
      'Published system.ping job',
    );
  });

  describe('real Pino serialization (no mocked Logger)', () => {
    it('surfaces jobId and requestId as top-level JSON fields in the real, serialized log line — not just as call arguments to a spy', async () => {
      // Deliberately does NOT mock Logger.prototype — this is the one
      // test in this file that exercises the real nestjs-pino pipeline
      // end to end (a real pino instance writing to an in-memory
      // stream), because a spy on the call arguments alone cannot
      // detect that a plain object passed as the wrong argument
      // position gets silently dropped by pino — see
      // system-ping.publisher.ts's comment on the object-first
      // calling convention this depends on.
      const capturing = new CapturingStream();
      const { add } = fakeQueue();

      const moduleRef = await Test.createTestingModule({
        imports: [LoggerModule.forRoot({ pinoHttp: { stream: capturing } })],
        providers: [
          SystemPingPublisher,
          {
            provide: getQueueToken(SYSTEM_QUEUE_NAME),
            useValue: { add } as unknown as Queue<SystemPingJobPayload>,
          },
        ],
      }).compile();

      const app = moduleRef.createNestApplication();
      await app.init();
      app.useLogger(app.get(PinoLogger));

      try {
        await app.get(SystemPingPublisher).publish('real-pino-request-id');
      } finally {
        await app.close();
      }

      const publishedLine = capturing
        .parsedLines()
        .find((line) => line.msg === 'Published system.ping job');

      expect(publishedLine).toMatchObject({
        jobId: 'job-1',
        requestId: 'real-pino-request-id',
        msg: 'Published system.ping job',
      });
    });
  });
});
