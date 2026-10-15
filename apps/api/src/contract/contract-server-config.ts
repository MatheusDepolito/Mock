import type { ServerConfig } from '@mockp/config/server';

/**
 * Fixed, synthetic configuration used only to compose `AppModule` when the
 * OpenAPI document is generated. It never reads `process.env` or `.env`, so
 * the document cannot depend on the environment it is generated in, and it
 * holds no secrets. The database and Redis URLs point to an unreachable
 * port and are never dialed: generation runs Nest in `preview` mode, where
 * providers (including `PrismaService`/`RedisService`) are not even
 * constructed.
 */
export const CONTRACT_SERVER_CONFIG: ServerConfig = {
  nodeEnv: 'test',
  port: 0,
  host: '127.0.0.1',
  logLevel: 'silent',
  corsAllowedOrigins: ['https://contract.invalid'],
  databaseUrl: 'postgresql://127.0.0.1:1/contract',
  redisUrl: 'redis://127.0.0.1:1',
  rateLimit: { ttlMs: 60000, limit: 1000 },
};
