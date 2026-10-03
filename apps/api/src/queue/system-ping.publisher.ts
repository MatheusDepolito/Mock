import { randomUUID } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import {
  SYSTEM_PING_JOB_NAME,
  SYSTEM_PING_JOB_OPTIONS,
  SYSTEM_QUEUE_NAME,
  type SystemPingJobPayload,
} from '@mockp/queue';

/**
 * Publishes the technical `system.ping` job — never exposed via HTTP,
 * used only by `system-ping.command.ts` in this phase. Kept as its own
 * injectable, rather than inline in the command's `main()`, so it can
 * be unit-tested against a fake `Queue` (no real Redis, no full Nest
 * bootstrap) — see `system-ping.publisher.spec.ts`.
 */
@Injectable()
export class SystemPingPublisher {
  private readonly logger = new Logger(SystemPingPublisher.name);

  constructor(
    @InjectQueue(SYSTEM_QUEUE_NAME)
    private readonly queue: Queue<SystemPingJobPayload>,
  ) {}

  /**
   * Publishes exactly one `system.ping` job, always with a correlation
   * ID: the given `requestId` when this is called from within a real
   * HTTP request's flow (not the case yet — no endpoint publishes this
   * job), otherwise a freshly generated UUID (same utility as
   * `apps/api/src/common/request-id.ts`), so the job is always
   * traceable end to end even for a standalone smoke-test run. See
   * docs/TARGET_ARCHITECTURE.md, section 4 ("Correlation ID").
   */
  async publish(
    requestId: string = randomUUID(),
  ): Promise<Job<SystemPingJobPayload>> {
    const payload: SystemPingJobPayload = {
      publishedAt: new Date().toISOString(),
      requestId,
    };

    const job = await this.queue.add(
      SYSTEM_PING_JOB_NAME,
      payload,
      SYSTEM_PING_JOB_OPTIONS,
    );

    // Object-first call, never `.log(message, extraFields)`: with
    // nestjs-pino, a per-instance `Logger` (constructed with a context
    // name, as above) appends that context as the LAST argument when
    // delegating — so a plain object passed as the second argument
    // never reaches pino as a merge target; it is silently dropped
    // (confirmed against the real serialized JSON output, not just a
    // spy on the call arguments). Passing the fields object FIRST and
    // the fixed message SECOND is the calling convention that actually
    // surfaces `jobId`/`requestId` as top-level JSON fields — see
    // `system-ping.publisher.spec.ts`'s real-serialization test.
    this.logger.log(
      { jobId: job.id, requestId: payload.requestId },
      'Published system.ping job',
    );

    return job;
  }
}
