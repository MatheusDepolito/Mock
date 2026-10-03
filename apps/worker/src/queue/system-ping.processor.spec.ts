import { Writable } from 'node:stream';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Job } from 'bullmq';
import { LoggerModule, Logger as PinoLogger } from 'nestjs-pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SystemPingJobPayload } from '@mockp/queue';
import { SystemPingProcessor } from './system-ping.processor';

function fakeJob(data: SystemPingJobPayload): Job<SystemPingJobPayload> {
  return { id: 'job-1', data } as Job<SystemPingJobPayload>;
}

/** Captures raw pino output lines for real-serialization assertions — mirrors apps/api/src/queue/system-ping.publisher.spec.ts's own CapturingStream. */
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

describe('SystemPingProcessor', () => {
  // Every test above the real-serialization one below spies on
  // `Logger.prototype.log`/`error` without restoring — a leaked spy
  // would silently swallow the real test's log calls too (a mocked
  // `Logger.prototype.log` never reaches nestjs-pino at all).
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('processes an example payload without touching Redis, logging the requestId object-first', async () => {
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    const processor = new SystemPingProcessor();
    const payload: SystemPingJobPayload = {
      publishedAt: '2026-09-25T00:00:00.000Z',
      requestId: 'a1b2c3d4-0000-0000-0000-000000000000',
    };

    await expect(processor.process(fakeJob(payload))).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: payload.requestId }),
      'Processing system.ping job',
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: payload.requestId }),
      'Processed system.ping job',
    );
  });

  it('never touches a real Redis client — the job is a plain object, not a live BullMQ Job', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const processor = new SystemPingProcessor();
    const job = fakeJob({
      publishedAt: '2026-09-25T00:00:00.000Z',
      requestId: 'test-request-id',
    });

    // A live BullMQ Job would expose methods like updateProgress()/
    // moveToCompleted() backed by a real Redis connection — this fake
    // has none, so if the processor ever called one, this would throw
    // synchronously (a plain object has no such methods) rather than
    // silently reaching out to Redis.
    await processor.process(job);
  });

  it('rethrows so BullMQ can retry, without logging the raw Error, its message, or any sensitive text', async () => {
    // process()'s try block only wraps the second log call today (the
    // job itself never fails) — this test exercises the catch branch
    // by making that specific call throw, without touching production
    // code, to prove the catch path's own logging is safe regardless
    // of what actually failed.
    const secretUrl = 'redis://:s3cr3t-password@localhost:6379';
    const thrown = new Error(`connect to ${secretUrl} failed`);
    vi.spyOn(Logger.prototype, 'log')
      .mockImplementationOnce(() => undefined) // "Processing system.ping job"
      .mockImplementationOnce(() => {
        throw thrown; // "Processed system.ping job"
      });
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const processor = new SystemPingProcessor();
    const payload: SystemPingJobPayload = {
      publishedAt: '2026-09-25T00:00:00.000Z',
      requestId: 'test-request-id',
    };

    await expect(processor.process(fakeJob(payload))).rejects.toBe(thrown);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: payload.requestId }),
      'Failed to process system.ping job',
    );
    for (const call of errorSpy.mock.calls) {
      for (const arg of call) {
        const serialized = typeof arg === 'string' ? arg : JSON.stringify(arg);
        expect(serialized).not.toContain('s3cr3t-password');
        expect(serialized).not.toContain(secretUrl);
      }
    }
  });

  describe('real Pino serialization (no mocked Logger)', () => {
    it('surfaces requestId and jobId as top-level JSON fields in the real, serialized log line — not just as call arguments to a spy', async () => {
      const capturing = new CapturingStream();

      const moduleRef = await Test.createTestingModule({
        imports: [LoggerModule.forRoot({ pinoHttp: { stream: capturing } })],
        providers: [SystemPingProcessor],
      }).compile();

      const app = moduleRef.createNestApplication();
      await app.init();
      app.useLogger(app.get(PinoLogger));

      const payload: SystemPingJobPayload = {
        publishedAt: '2026-09-25T00:00:00.000Z',
        requestId: 'real-pino-request-id',
      };

      try {
        await app.get(SystemPingProcessor).process(fakeJob(payload));
      } finally {
        await app.close();
      }

      const lines = capturing.parsedLines();
      const processingLine = lines.find(
        (line) => line.msg === 'Processing system.ping job',
      );
      const processedLine = lines.find(
        (line) => line.msg === 'Processed system.ping job',
      );

      expect(processingLine).toMatchObject({
        requestId: 'real-pino-request-id',
        jobId: 'job-1',
      });
      expect(processedLine).toMatchObject({
        requestId: 'real-pino-request-id',
        jobId: 'job-1',
      });
    });
  });
});
