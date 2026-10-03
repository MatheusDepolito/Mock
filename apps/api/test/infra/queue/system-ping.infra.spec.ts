import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { getQueueToken } from '@nestjs/bullmq';
import { NestFactory } from '@nestjs/core';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { afterEach, describe, expect, it } from 'vitest';
import { SYSTEM_QUEUE_NAME, type SystemPingJobPayload } from '@mockp/queue';
import { SystemPingCommandModule } from '../../../src/queue/system-ping-command.module';
import { SystemPingPublisher } from '../../../src/queue/system-ping.publisher';
import { buildInfraServerConfig } from '../../support/infra-server-config';

/**
 * A dedicated Redis *logical database* (`SELECT`) for this test's
 * `system` queue — never database 0, which is where `RedisService`,
 * `apps/api/src/queue/queue-redis.module.ts`, and any real producer
 * actually operate. This is the isolation ADR 006 (§7.6) left for
 * "quando a primeira escrita real no Redis for introduzida": that
 * moment is this test. Redis (and the local Compose image) supports 16
 * logical databases by default; switching the URL's path component is
 * enough for both `ioredis` and the worker's own `REDIS_URL` env var to
 * select it — no production code changes at all.
 *
 * Database 1 is reserved for this test **by convention only** — there
 * is no technical guarantee (no ACL, no separate credential, nothing
 * Redis itself enforces) that stops another process from writing to
 * it. This suite does not rely on the reservation alone: `assertReady()`
 * below re-checks, read-only, immediately before every run that the
 * "system" queue in this database has no pending job before the
 * worker is ever started — closed by default, never processing or
 * removing a job it did not itself observe being created. (Residual
 * risk this cannot rule out: a job arriving in the narrow window
 * between that check and the worker actually starting to consume —
 * acceptable for local, single-machine `yarn validate:infra`, not a
 * substitute for real ACL-based isolation in a shared environment.)
 */
const TEST_REDIS_DB = 1;

function withTestRedisDb(redisUrl: string): string {
  const url = new URL(redisUrl);
  url.pathname = `/${TEST_REDIS_DB}`;
  return url.toString();
}

/**
 * Fails closed, read-only, before the worker is ever spawned — this
 * function never processes, removes, or otherwise touches any job it
 * finds; it only counts and reports. Two independent preconditions,
 * both required:
 *
 * 1. `redisUrl` resolves to a local host. This suite only makes sense
 *    against the local Compose Redis; refusing to run against anything
 *    else is a cheap, decisive guard against accidentally pointing at
 *    a shared or remote instance. Never logs the hostname itself (kept
 *    out of the thrown message) — only that the check failed.
 * 2. The `system` queue in `TEST_REDIS_DB` has zero jobs in any state
 *    the worker could pick up (`waiting`, `waiting-children`, `active`,
 *    `delayed`, `prioritized`). Since database 1 is a *convention*, not
 *    an enforced boundary (see the docstring above), this is the
 *    actual safety net — if it ever finds something, it stops here,
 *    before spawning a worker that could otherwise consume it.
 */
async function assertReadyForIsolatedRun(redisUrl: string): Promise<void> {
  const url = new URL(redisUrl);
  const allowedHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (!allowedHosts.has(url.hostname)) {
    throw new Error(
      'Refusing to run: REDIS_URL does not resolve to a local host. ' +
        'This suite only runs against the local Compose Redis.',
    );
  }

  const checkConnection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  checkConnection.on('error', () => undefined);
  try {
    await checkConnection.connect();
    const checkQueue = new Queue(SYSTEM_QUEUE_NAME, {
      connection: checkConnection,
    });
    try {
      const counts = await checkQueue.getJobCounts(
        'waiting',
        'waiting-children',
        'active',
        'delayed',
        'prioritized',
      );
      const pending = Object.values(counts).reduce(
        (sum, count) => sum + count,
        0,
      );
      if (pending > 0) {
        throw new Error(
          `Refusing to start the worker: the "system" queue in database ${TEST_REDIS_DB} already has ${pending} pending job(s) (${JSON.stringify(counts)}) it could consume. ` +
            'This suite never processes or removes a job it did not create — inspect and clear that database manually if this is unexpected.',
        );
      }
    } finally {
      await checkQueue.close();
    }
  } finally {
    checkConnection.disconnect();
  }
}

// apps/api/test/infra/queue -> apps/worker (four levels up, then into the
// sibling app) — the worker is a separate app/process, never imported as
// TypeScript source; only spawned as a real OS process.
const WORKER_ROOT = path.resolve(__dirname, '../../../../worker');

// The `tsx` CLI, invoked with an explicit `--tsconfig`, not `-r tsx/cjs`
// (which resolves the nearest tsconfig.json by walking up from cwd —
// apps/worker/tsconfig.json, which does not itself set
// `experimentalDecorators`; only tsconfig.app.json, referenced but not
// extended, does). `apps/worker/src/queue/queue-redis-connection.closer.ts`
// (Tarefa 4.5) is the first file on the worker side to use a
// *parameter* decorator (`@Inject(...)`), which esbuild refuses to
// transform without that flag — confirmed by reproducing the exact
// `-r tsx/cjs` invocation this file used before this fix: the spawned
// worker crashed at startup with `ERROR: Parameter decorators only
// work when experimental decorators are enabled`, before writing a
// single byte to stdout, which is why `stdout.waitFor('Worker
// started', ...)` timed out with an *empty* captured buffer. Mirrors
// the identical fix already applied to `apps/api/package.json`'s
// `queue:smoke:system-ping` target in Tarefa 4.4.
const TSX_CLI_PATH = path.join(
  path.dirname(require.resolve('tsx/package.json')),
  'dist/cli.mjs',
);

type WorkerProcess = ChildProcessByStdio<null, Readable, Readable>;

function spawnWorker(redisUrl: string): WorkerProcess {
  return spawn(
    process.execPath,
    [TSX_CLI_PATH, '--tsconfig', 'tsconfig.app.json', 'src/main.ts'],
    {
      cwd: WORKER_ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        LOG_LEVEL: 'info',
        REDIS_URL: redisUrl,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

/**
 * Accumulates a readable stream into a single, ever-growing buffer from
 * the moment it is constructed — the *only* listener on `stream`, so no
 * chunk is ever missed to a second, competing listener. `waitFor()`
 * checks the buffer already captured *before* subscribing to future
 * chunks: a predicate satisfied by output that arrived before `waitFor`
 * was called (a real race in the naive "attach a listener and wait"
 * pattern) is detected immediately, never lost to a timeout.
 */
class OutputBuffer {
  private content = '';
  private readonly emitter = new EventEmitter();

  constructor(stream: Readable) {
    stream.on('data', (chunk: Buffer) => {
      this.content += chunk.toString();
      this.emitter.emit('data');
    });
  }

  get value(): string {
    return this.content;
  }

  waitFor(
    predicate: (output: string) => boolean,
    timeoutMs: number,
  ): Promise<void> {
    if (predicate(this.content)) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer);
        this.emitter.off('data', onData);
      };
      const onData = (): void => {
        if (predicate(this.content)) {
          cleanup();
          resolve();
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `Timed out waiting for worker output. Output so far:\n${this.content}`,
          ),
        );
      }, timeoutMs);
      this.emitter.on('data', onData);
    });
  }
}

function waitForExit(
  child: WorkerProcess,
  timeoutMs: number,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `Worker process (pid ${child.pid}) did not exit within ${timeoutMs}ms of being killed — possible leaked process.`,
        ),
      );
    }, timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

/** Parses every non-empty line of `output` as JSON, ignoring lines that aren't (e.g. tsx/ts-node banners). */
function parseJsonLines(output: string): Record<string, unknown>[] {
  return output
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Record<string, unknown>];
      } catch {
        return [];
      }
    });
}

describe('system.ping end to end (real Redis, real worker process, real API producer)', () => {
  let worker: WorkerProcess | undefined;

  afterEach(async () => {
    // Runs even when an assertion above throws — the spawned worker
    // process must never be left running after this test, regardless
    // of outcome. Actually waits for the exit event (with a deadline
    // and a forceful fallback), never fire-and-forgets the kill.
    if (worker) {
      const current = worker;
      worker = undefined;
      if (current.exitCode === null && current.signalCode === null) {
        current.kill('SIGKILL');
        await waitForExit(current, 5000).catch((error: unknown) => {
          // A genuinely leaked process is worth surfacing loudly, not
          // swallowing — but it must never mask the test's own
          // assertion failure (thrown separately, if any).
          console.error(error);
        });
      }
    }
  });

  it('the real worker consumes the job published by the real API producer, preserving payload and propagating requestId', async () => {
    const baseConfig = buildInfraServerConfig();
    const testRedisUrl = withTestRedisDb(baseConfig.redisUrl);
    const config = { ...baseConfig, redisUrl: testRedisUrl };
    // Unique per test run regardless — the precondition check below
    // already rules out any preexisting job before the worker starts,
    // but a distinct requestId keeps this test's own assertions
    // unambiguous even if it were ever run twice concurrently against
    // the same database.
    const uniqueRequestId = `e2e-${randomUUID()}`;

    // Read-only, fail-closed: never processes or clears anything it
    // finds — just refuses to start the worker if the queue isn't
    // actually empty. Runs before `spawnWorker()` so the worker never
    // gets a chance to pick up whatever was found.
    await assertReadyForIsolatedRun(testRedisUrl);

    worker = spawnWorker(testRedisUrl);
    const stdout = new OutputBuffer(worker.stdout);
    const stderr = new OutputBuffer(worker.stderr);

    await stdout.waitFor((output) => output.includes('Worker started'), 15000);

    const app = await NestFactory.createApplicationContext(
      SystemPingCommandModule.forRoot(config),
      { logger: false },
    );

    const queue = app.get<Queue<SystemPingJobPayload>>(
      getQueueToken(SYSTEM_QUEUE_NAME),
    );
    let jobId: string | undefined;
    let testError: unknown;

    try {
      const publishedJob = await app
        .get(SystemPingPublisher)
        .publish(uniqueRequestId);
      jobId = publishedJob.id;

      await stdout.waitFor(
        (output) =>
          output.includes('Processed system.ping job') &&
          output.includes(uniqueRequestId),
        15000,
      );

      const processedLine = parseJsonLines(stdout.value).find(
        (line) =>
          line.msg === 'Processed system.ping job' &&
          line.requestId === uniqueRequestId,
      );

      expect(processedLine).toBeDefined();
      expect(processedLine).toMatchObject({
        jobId: publishedJob.id,
        requestId: uniqueRequestId,
      });
      expect(stderr.value).toBe('');

      // Confirms real completion state in Redis, not just the log
      // line — the worker really finished the job, not merely
      // logged that it started to.
      const job = await queue.getJob(jobId as string);
      expect(job).toBeDefined();
      expect(await job?.getState()).toBe('completed');
      expect(job?.data).toEqual(
        expect.objectContaining({ requestId: uniqueRequestId }),
      );
    } catch (error) {
      testError = error;
    } finally {
      // Cleanup: remove only the one job this test created, in its
      // own isolated database — bounded to that single job id,
      // never a broad operation, and never used to "resolve" a job
      // that turns out to still be active/locked. Runs even when an
      // assertion above threw. A cleanup failure is itself a test
      // failure (reported with the job id, never a raw Error or any
      // URL/credential) — but the *original* assertion failure, if
      // there was one, always takes precedence; a cleanup problem
      // discovered afterward is still reported, just not thrown over
      // it.
      if (jobId) {
        let cleanupFailureMessage: string | undefined;
        try {
          const job = await queue.getJob(jobId);
          if (job) {
            await job.remove();
            const stillPresent = await queue.getJob(jobId);
            if (stillPresent) {
              cleanupFailureMessage = `Test job ${jobId} is still present in the "system" queue (database ${TEST_REDIS_DB}) after remove().`;
            }
          }
          // `job` already undefined here means it was already gone
          // — nothing left to clean up.
        } catch {
          // Never includes the caught error's message — it can
          // embed connection details. Only the job id, which is
          // exactly what is needed to find and inspect it manually.
          cleanupFailureMessage = `Failed to clean up test job ${jobId} in the "system" queue (database ${TEST_REDIS_DB}).`;
        }

        if (cleanupFailureMessage) {
          if (testError) {
            console.error(cleanupFailureMessage);
          } else {
            testError = new Error(cleanupFailureMessage);
          }
        }
      }
      await app.close();
    }

    if (testError) {
      throw testError;
    }
  }, 30000);
});
