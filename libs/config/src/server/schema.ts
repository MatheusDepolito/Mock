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
  /**
   * PostgreSQL connection string. Required in every NODE_ENV — the API
   * does not start without it. Not consumed by any Prisma/repository code
   * yet (that arrives in Tarefa 3.3); this is only the validated config
   * surface. See docs/adr/006-persistence-and-local-infrastructure.md.
   */
  databaseUrl: string;
  /**
   * Redis connection string. Required in every NODE_ENV — the API does
   * not start without it. Not consumed by any Redis client yet (that
   * arrives in Tarefa 3.3/3.4). See
   * docs/adr/006-persistence-and-local-infrastructure.md.
   */
  redisUrl: string;
  rateLimit: {
    ttlMs: number;
    limit: number;
  };
}

/**
 * Structural validation via Node's native `URL` — never a regex — so a
 * syntactically odd but regex-matching string (e.g. `postgresql://` with
 * no host/database) is still rejected. Error messages never include the
 * raw value: a connection string carries credentials, and Zod's error
 * output can end up in logs.
 */
function validateDatabaseUrl(value: string, ctx: z.RefinementCtx): void {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'DATABASE_URL must be a syntactically valid URL.',
    });
    return;
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'DATABASE_URL must use the postgresql:// or postgres:// protocol.',
    });
  }

  if (url.hostname.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'DATABASE_URL must include a non-empty hostname.',
    });
  }

  // `pathname` is always at least "/" once a host is present; a real
  // database name means something after that leading slash.
  if (url.pathname.length <= 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'DATABASE_URL must include a database name in its path.',
    });
  }
}

function validateRedisUrl(value: string, ctx: z.RefinementCtx): void {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'REDIS_URL must be a syntactically valid URL.',
    });
    return;
  }

  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'REDIS_URL must use the redis:// or rediss:// protocol.',
    });
  }

  if (url.hostname.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'REDIS_URL must include a non-empty hostname.',
    });
  }
}

// TEST_DATABASE_URL is deliberately absent from this schema and from
// ServerConfig: it is exclusive to tests/scripts, never read by the
// server-only runtime config, and never required to start the API. See
// docs/adr/006-persistence-and-local-infrastructure.md ("Configuração:
// runtime vs. testes").
export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(NODE_ENV_VALUES).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  LOG_LEVEL: z.enum(LOG_LEVEL_VALUES).default('info'),
  CORS_ALLOWED_ORIGINS: z.string().trim().optional(),
  DATABASE_URL: z.string().trim().min(1).superRefine(validateDatabaseUrl),
  REDIS_URL: z.string().trim().min(1).superRefine(validateRedisUrl),
  RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(100),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
