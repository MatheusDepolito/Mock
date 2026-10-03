import { randomUUID } from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { describe, expect, it } from 'vitest';
import {
  SYSTEM_PING_JOB_NAME,
  SYSTEM_PING_JOB_OPTIONS,
  type SystemPingJobPayload,
} from '@mockp/queue';
import { buildInfraServerConfig } from '../../support/infra-server-config';

/**
 * Proves BullMQ's own retry/backoff behavior for `SYSTEM_PING_JOB_OPTIONS`
 * — never the shared `system` queue, never the production
 * `SystemPingProcessor`. Both the `Queue` and the `Worker` here are
 * created only for this test, on a queue name unique to this test run
 * (`randomUUID()`), with a handler that intentionally fails until the
 * last configured attempt, then succeeds. No `failFirstNAttempts` flag,
 * no `NODE_ENV` gate, and nothing here is reachable from
 * `apps/worker/src/queue/system-ping.processor.ts` or
 * `libs/queue/src/system-ping.types.ts` — the retry-forcing logic lives
 * entirely in this test file.
 */
describe('system.ping retry/backoff (test-only queue and worker, never "system")', () => {
  it('retries with the exact exponential backoff delays SYSTEM_PING_JOB_OPTIONS configures, before completing', async () => {
    const config = buildInfraServerConfig();
    const testQueueName = `system-ping-retry-test-${randomUUID()}`;
    const maxAttempts = SYSTEM_PING_JOB_OPTIONS.attempts;
    const baseDelayMs = SYSTEM_PING_JOB_OPTIONS.backoff.delay;

    // BullMQ's own exponential-backoff formula (bullmq's
    // `Backoffs.builtinStrategies.exponential`, no jitter):
    // delay(attemptsMade) = round(2^(attemptsMade - 1) * baseDelay).
    // expectedGaps[i] is the delay BullMQ schedules before the
    // (i + 2)th attempt, i.e. after the (i + 1)th attempt fails —
    // with baseDelayMs = 1000: [1000, 2000, 4000, ...].
    const expectedGapsMs = Array.from({ length: maxAttempts - 1 }, (_, i) =>
      Math.round(2 ** i * baseDelayMs),
    );

    const connection = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
    });
    connection.on('error', () => undefined);

    const queue = new Queue<SystemPingJobPayload>(testQueueName, {
      connection,
    });

    let attemptCount = 0;
    const attemptTimestamps: number[] = [];

    const worker = new Worker<SystemPingJobPayload>(
      testQueueName,
      async () => {
        attemptCount += 1;
        attemptTimestamps.push(Date.now());
        if (attemptCount < maxAttempts) {
          throw new Error(
            'Intentional test-only failure to exercise retry/backoff — never a production code path.',
          );
        }
      },
      { connection },
    );
    worker.on('error', () => undefined);

    let testError: unknown;
    let measuredGapsMs: number[] = [];

    try {
      const completed = new Promise<Job<SystemPingJobPayload>>(
        (resolve, reject) => {
          const timer = setTimeout(() => {
            reject(
              new Error(
                'Timed out waiting for the job to complete after retries.',
              ),
            );
          }, 20000);

          worker.on('completed', (job) => {
            clearTimeout(timer);
            resolve(job);
          });
        },
      );

      await queue.add(
        SYSTEM_PING_JOB_NAME,
        {
          publishedAt: new Date().toISOString(),
          requestId: `retry-test-${randomUUID()}`,
        },
        SYSTEM_PING_JOB_OPTIONS,
      );

      const job = await completed;

      expect(attemptCount).toBe(maxAttempts);
      expect(job.attemptsMade).toBe(maxAttempts);
      expect(attemptTimestamps).toHaveLength(maxAttempts);

      measuredGapsMs = attemptTimestamps
        .slice(1)
        .map((timestamp, i) => timestamp - attemptTimestamps[i]!);

      // Reported unconditionally (not only on failure) so the actual
      // measured intervals are visible in the run's output.
      console.info('system.ping retry/backoff — measured gaps (ms):', {
        expectedGapsMs,
        measuredGapsMs,
      });

      // Distinguishes the ~1s and ~2s delays specifically (not just
      // "each gap grew relative to the last", which a single slow
      // tick could satisfy without the delay actually being close to
      // what SYSTEM_PING_JOB_OPTIONS configures). Tolerance: down to
      // 70% of the expected delay (BullMQ/Redis never fires early by
      // more than a negligible margin in practice, so the real risk
      // is lateness, not earliness) and up to 1.5x + 300ms of fixed
      // overhead, to absorb scheduling/Redis round-trip jitter
      // without accepting a materially different delay.
      expect(measuredGapsMs).toHaveLength(expectedGapsMs.length);
      for (const [i, expectedGapMs] of expectedGapsMs.entries()) {
        const measuredGapMs = measuredGapsMs[i]!;
        expect(measuredGapMs).toBeGreaterThanOrEqual(expectedGapMs * 0.7);
        expect(measuredGapMs).toBeLessThanOrEqual(expectedGapMs * 1.5 + 300);
      }
    } catch (error) {
      testError = error;
    } finally {
      // Every cleanup step below is individually isolated (its own
      // try/catch, never letting one step's failure skip the next) —
      // `connection.disconnect()` at the end is unavoidable: nothing
      // above, however it fails, can prevent it from running. Force-
      // close, per the Tarefa 4.3 finding: a graceful close() can hang
      // if anything about the connection is amiss. This is this
      // test's own worker/queue — never the shared "system" queue.
      const cleanupFailures: string[] = [];

      try {
        await worker.close(true);
      } catch {
        // Never the caught error's message — it can embed connection
        // details. Only a fixed, sanitized reason.
        cleanupFailures.push(`worker.close() failed for "${testQueueName}"`);
      }

      try {
        await queue.obliterate({ force: true });
      } catch {
        cleanupFailures.push(
          `queue.obliterate() failed for "${testQueueName}"`,
        );
      }

      try {
        await queue.close();
      } catch {
        cleanupFailures.push(`queue.close() failed for "${testQueueName}"`);
      }

      // Confirms the test-only queue's keys are actually gone — never
      // silently assumed. Scoped to this test's own unique queue name;
      // the shared "system" queue's keys are never scanned or touched
      // here.
      let remainingKeys: string[] = [];
      try {
        remainingKeys = await connection.keys(`bull:${testQueueName}:*`);
      } catch {
        cleanupFailures.push(
          `could not verify leftover keys for "${testQueueName}"`,
        );
      }

      connection.disconnect();

      if (remainingKeys.length > 0) {
        cleanupFailures.push(
          `"${testQueueName}" left ${remainingKeys.length} key(s) behind: ${remainingKeys.join(', ')}`,
        );
      }

      if (cleanupFailures.length > 0) {
        const cleanupError = new Error(
          `Cleanup issue(s): ${cleanupFailures.join('; ')}`,
        );
        if (testError) {
          // The original assertion failure takes precedence — the
          // cleanup issue is still reported, just not thrown over it.
          console.error(cleanupError.message);
        } else {
          testError = cleanupError;
        }
      }
    }

    if (testError) {
      throw testError;
    }
  }, 30000);
});
