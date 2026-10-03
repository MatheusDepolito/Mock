/**
 * Name of the BullMQ queue that carries the technical `system.ping` job
 * (Fase 4). Shared between `apps/api` (producer) and `apps/worker`
 * (consumer) so neither side hardcodes a string literal that could drift.
 */
export const SYSTEM_QUEUE_NAME = 'system';

/**
 * Name of the technical `system.ping` job — validates the API → Redis →
 * worker separation end to end. Never exposed via HTTP/OpenAPI. See
 * docs/IMPLEMENTATION_ROADMAP.md, Fase 4.
 */
export const SYSTEM_PING_JOB_NAME = 'system.ping';

/**
 * Shared BullMQ job options for `system.ping`: finite retry with
 * exponential backoff, never `attempts: Infinity`. Values are
 * implementation parameters, not structural decisions — adjustable
 * later without a new planning round, as long as retry stays finite
 * with backoff.
 */
export const SYSTEM_PING_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
} as const;
