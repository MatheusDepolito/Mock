import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { SYSTEM_QUEUE_NAME, type SystemPingJobPayload } from '@mockp/queue';

/**
 * Consumer of the technical `system.ping` job — proves the API → Redis
 * → worker separation end to end (Fase 4). Every log line for a given
 * job includes its `requestId`/`jobId`/`publishedAt` as top-level JSON
 * fields, via the object-first calling convention
 * (`logger.log(fields, message)`) — never `logger.log(message, fields)`,
 * which `nestjs-pino` silently drops when the logger is instantiated
 * with its own context name (`new Logger(ClassName)`); see
 * `apps/api/src/queue/system-ping.publisher.ts`'s comment for the full
 * explanation, and `system-ping.processor.spec.ts`'s real-serialization
 * test for the proof.
 *
 * The error path never logs the raw `Error`, its `message`, `cause`,
 * or any other driver detail that could embed sensitive data — only
 * the same safe context fields, mirroring
 * `apps/api/src/redis/redis.service.ts`/
 * `apps/api/src/queue/queue-redis-connection.closer.ts`'s logging
 * discipline. The error is still rethrown so BullMQ applies its
 * configured retry (`SYSTEM_PING_JOB_OPTIONS`).
 */
@Processor(SYSTEM_QUEUE_NAME)
export class SystemPingProcessor extends WorkerHost {
  private readonly logger = new Logger(SystemPingProcessor.name);

  async process(job: Job<SystemPingJobPayload>): Promise<void> {
    const context = {
      requestId: job.data.requestId,
      publishedAt: job.data.publishedAt,
      jobId: job.id,
    };

    this.logger.log(context, 'Processing system.ping job');

    try {
      // Purely technical job — nothing to actually do besides proving
      // the job reached the worker with its payload intact.
      this.logger.log(context, 'Processed system.ping job');
    } catch (error) {
      this.logger.error(context, 'Failed to process system.ping job');
      throw error;
    }
  }
}
