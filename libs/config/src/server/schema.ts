import { z } from 'zod';

export const NODE_ENV_VALUES = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENV_VALUES)[number];

export const LOG_LEVEL_VALUES = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;
export type LogLevel = (typeof LOG_LEVEL_VALUES)[number];

export const DEFAULT_CORS_ALLOWED_ORIGINS = ['http://localhost:3000'];

export interface ServerConfig {
  nodeEnv: NodeEnv;
  port: number;
  host: string;
  logLevel: LogLevel;
  corsAllowedOrigins: string[];
  rateLimit: {
    ttlMs: number;
    limit: number;
  };
}

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(NODE_ENV_VALUES).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  LOG_LEVEL: z.enum(LOG_LEVEL_VALUES).default('info'),
  CORS_ALLOWED_ORIGINS: z.string().trim().optional(),
  RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(100),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
