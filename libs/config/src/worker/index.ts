import { workerEnvSchema, type WorkerConfig } from './schema';
import type { z } from 'zod';

export type { WorkerConfig, WorkerEnv } from './schema';
export type { NodeEnv, LogLevel } from '../server/schema';
export { loadEnvFile } from '../server/env-file';

/**
 * Thrown when the worker environment fails validation. Bootstrap must
 * not proceed past this error — the message is meant to be surfaced
 * directly to whoever starts the process.
 */
export class WorkerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkerConfigError';
  }
}

/**
 * Validates and loads the server-only runtime configuration for
 * `apps/worker`. Deliberately separate from `loadServerConfig`
 * (`@mockp/config/server`) — the worker never accepts HTTP traffic and
 * never touches Prisma/PostgreSQL, so its schema has no
 * PORT/HOST/CORS/rate-limit/DATABASE_URL surface. See
 * docs/TARGET_ARCHITECTURE.md, section 9.
 */
export function loadWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  const parsed = workerEnvSchema.safeParse(env);

  if (!parsed.success) {
    throw new WorkerConfigError(formatZodError(parsed.error));
  }

  const data = parsed.data;

  return {
    nodeEnv: data.NODE_ENV,
    logLevel: data.LOG_LEVEL,
    redisUrl: data.REDIS_URL,
  };
}

function formatZodError(error: z.ZodError): string {
  const issues = error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  return `Invalid worker configuration: ${issues}`;
}
