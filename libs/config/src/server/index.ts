import {
  DEFAULT_CORS_ALLOWED_ORIGINS,
  serverEnvSchema,
  type ServerConfig,
} from './schema';
import type { z } from 'zod';

export type { ServerConfig, NodeEnv, LogLevel } from './schema';
export { loadEnvFile } from './env-file';

/**
 * Thrown when the API server environment fails validation. Bootstrap must
 * not proceed past this error — the message is meant to be surfaced
 * directly to whoever starts the process.
 */
export class ServerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServerConfigError';
  }
}

/**
 * Validates and loads the server-only runtime configuration for the API
 * (and, in later phases, the worker). This is the only entrypoint exposed
 * by `@mockp/config` in this phase — see docs/adr/005-api-runtime.md.
 */
export function loadServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const parsed = serverEnvSchema.safeParse(env);

  if (!parsed.success) {
    throw new ServerConfigError(formatZodError(parsed.error));
  }

  const data = parsed.data;
  const corsAllowedOrigins = parseCorsAllowedOrigins(data.CORS_ALLOWED_ORIGINS);

  if (data.NODE_ENV === 'production' && corsAllowedOrigins.length === 0) {
    throw new ServerConfigError(
      'Invalid server configuration: CORS_ALLOWED_ORIGINS is required and must not be empty in production.',
    );
  }

  return {
    nodeEnv: data.NODE_ENV,
    port: data.PORT,
    host: data.HOST,
    logLevel: data.LOG_LEVEL,
    corsAllowedOrigins:
      corsAllowedOrigins.length > 0
        ? corsAllowedOrigins
        : DEFAULT_CORS_ALLOWED_ORIGINS,
    rateLimit: {
      ttlMs: data.RATE_LIMIT_TTL_MS,
      limit: data.RATE_LIMIT_LIMIT,
    },
  };
}

function parseCorsAllowedOrigins(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function formatZodError(error: z.ZodError): string {
  const issues = error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  return `Invalid server configuration: ${issues}`;
}
