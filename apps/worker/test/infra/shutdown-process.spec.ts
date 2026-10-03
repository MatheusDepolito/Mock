import { EventEmitter } from 'node:events';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { buildInfraWorkerConfig } from './support/infra-worker-config';

type WorkerProcess = ChildProcessByStdio<null, Readable, Readable>;

const WORKER_ROOT = path.resolve(__dirname, '../..');

// The `tsx` CLI, invoked with an explicit `--tsconfig`, not `-r tsx/cjs`
// (which resolves the nearest tsconfig.json by walking up from cwd —
// apps/worker/tsconfig.json, which does not itself set
// `experimentalDecorators`; only tsconfig.app.json, referenced but not
// extended, does).
// `apps/worker/src/queue/queue-redis-connection.closer.ts` (Tarefa 4.5)
// is the first file on the worker side to use a *parameter* decorator
// (`@Inject(...)`), which esbuild refuses to transform without that
// flag. Mirrors the identical fix already applied to
// `apps/api/package.json`'s `queue:smoke:system-ping` target (Tarefa
// 4.4) and to `apps/api/test/infra/queue/system-ping.infra.spec.ts`
// (Tarefa 4.5).
const TSX_CLI_PATH = path.join(
  path.dirname(require.resolve('tsx/package.json')),
  'dist/cli.mjs',
);

/**
 * Spawns the worker as a real, separate OS process against real Redis
 * (moved here from apps/worker/test/ as of Tarefa 4.5 — see
 * `shutdown.spec.ts`'s docstring for why: the real BullMQ `Worker`
 * `AppModule.forRoot()` now wires in needs real Redis to close
 * gracefully at all). Runs against `src/main.ts` directly via `tsx`
 * rather than requiring a prior `nx run worker:build` first.
 */
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
 * chunks, so a predicate satisfied by output that arrived before
 * `waitFor` was called is detected immediately, never lost to a
 * timeout. Mirrors
 * apps/api/test/infra/queue/system-ping.infra.spec.ts's own
 * `OutputBuffer`.
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
          `Worker process (pid ${child.pid}) did not exit within ${timeoutMs}ms.`,
        ),
      );
    }, timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

describe('Worker graceful shutdown (real process, real Redis)', () => {
  it('logs a structured startup line and terminates within a finite deadline after SIGTERM', async () => {
    const { redisUrl } = buildInfraWorkerConfig();
    const child = spawnWorker(redisUrl);
    const stdout = new OutputBuffer(child.stdout);
    const stderr = new OutputBuffer(child.stderr);

    let result: { code: number | null; signal: NodeJS.Signals | null };
    try {
      await stdout.waitFor(
        (output) => output.includes('Worker started'),
        15000,
      );

      child.kill('SIGTERM');

      result = await waitForExit(child, 10000);
    } finally {
      // Runs even when an assertion above throws — this spawned
      // process must never be left running after this test.
      // Actually waits for the exit event (with a deadline and a
      // forceful fallback), never fire-and-forgets the kill.
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await waitForExit(child, 5000).catch((error: unknown) => {
          // A genuinely leaked process is worth surfacing loudly,
          // not swallowing — but it must never mask the test's own
          // assertion failure (thrown separately, if any).
          console.error(error);
        });
      }
    }

    if (process.platform === 'win32') {
      // Windows has no real POSIX signals: `child.kill('SIGTERM')`
      // forcibly terminates the process (TerminateProcess) without
      // ever delivering the signal to Node's JS-level listener —
      // confirmed by manual testing during Tarefa 4.2 (both via the
      // OS `kill` command and via this same `child.kill()` API).
      // Real Redis being reachable here does not change this — it
      // is a Windows/Node.js signal-delivery limitation, not a
      // consequence of Redis being unreachable. The graceful path
      // (`app.enableShutdownHooks()` -> `onModuleDestroy` ->
      // `process.exit(0)`, proven independently by
      // `shutdown.spec.ts`'s in-process `app.close()` against this
      // same real Redis) never gets a chance to run here. This is
      // NOT proof that the real SIGTERM path works on Linux — that
      // is only established once the containerized worker (Tarefa
      // 4.6) is validated there. This assertion is deliberately
      // weaker on Windows: it only proves the process does not
      // hang — it terminates within the deadline above, one way or
      // another.
      expect(result.code === 0 || result.signal !== null).toBe(true);
    } else {
      // POSIX: SIGTERM is delivered to the JS listener,
      // `enableShutdownHooks` runs its cleanup and calls
      // `process.exit(0)` deterministically (`useProcessExit: true`).
      // Still not the containerized/Linux-in-Docker proof Tarefa 4.6
      // performs — this is whatever POSIX host happens to run this
      // suite.
      expect(result.code).toBe(0);
      expect(result.signal).toBeNull();
    }

    expect(stderr.value).toBe('');
  }, 30000);
});
