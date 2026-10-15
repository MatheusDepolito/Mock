import { NestFactory } from '@nestjs/core';
import type { OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from '../app/app.module';
import { applyHttpSetup } from '../app/configure-app';
import { createSwaggerDocument } from '../app/swagger';
import { CONTRACT_SERVER_CONFIG } from './contract-server-config';

/**
 * Builds the OpenAPI document with exactly the code the running API uses
 * (`AppModule`, `applyHttpSetup`, `createSwaggerDocument`), without a
 * server and without real dependencies:
 *
 * - `preview: true` — Nest does not instantiate or resolve providers and
 *   controllers, so `PrismaService`/`RedisService` are never constructed
 *   and nothing connects to PostgreSQL or Redis (proven in the Fase 5
 *   spike and by `apps/api/test/contract-generator.spec.ts`).
 * - never `listen()` nor `init()`.
 * - `CONTRACT_SERVER_CONFIG`, a fixed synthetic config — never the
 *   process environment.
 *
 * This module never touches the filesystem: callers decide what to do with
 * the document (write it, or compare it in a read-only check).
 */
export async function buildOpenApiDocument(): Promise<OpenAPIObject> {
  const app = await NestFactory.create(
    AppModule.forRoot(CONTRACT_SERVER_CONFIG),
    { logger: false, preview: true },
  );

  try {
    applyHttpSetup(app, CONTRACT_SERVER_CONFIG);
    return createSwaggerDocument(app);
  } finally {
    await app.close();
  }
}
