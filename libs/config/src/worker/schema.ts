import { z } from 'zod';
import {
  LOG_LEVEL_VALUES,
  NODE_ENV_VALUES,
  validateRedisUrl,
  type LogLevel,
  type NodeEnv,
} from '../server/schema';

export interface WorkerConfig {
  nodeEnv: NodeEnv;
  logLevel: LogLevel;
  /**
   * Redis connection string. Required in every NODE_ENV — the worker
   * does not start without it. The worker builds its own `ioredis`
   * instance from this value with BullMQ-compatible options
   * (`maxRetriesPerRequest: null`), never reusing the API's
   * `RedisService`. See
   * docs/adr/006-persistence-and-local-infrastructure.md (§3.2).
   */
  redisUrl: string;
}

// Deliberately smaller than ServerEnv: the worker never serves HTTP, so
// it has no PORT/HOST/CORS/rate-limit/DATABASE_URL surface — see
// docs/TARGET_ARCHITECTURE.md, section 9 ("schemas de ambiente
// separados por app").
export const workerEnvSchema = z.object({
  NODE_ENV: z.enum(NODE_ENV_VALUES).default('development'),
  LOG_LEVEL: z.enum(LOG_LEVEL_VALUES).default('info'),
  REDIS_URL: z.string().trim().min(1).superRefine(validateRedisUrl),
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;
