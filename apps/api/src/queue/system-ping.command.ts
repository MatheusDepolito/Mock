import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import {
  loadEnvFile,
  loadServerConfig,
  ServerConfigError,
} from '@mockp/config/server';
import { SystemPingCommandModule } from './system-ping-command.module';
import { SystemPingPublisher } from './system-ping.publisher';

/**
 * Internal smoke command — never an HTTP endpoint, never listed in
 * Swagger/OpenAPI (see docs/TARGET_ARCHITECTURE.md, section 4, and
 * docs/IMPLEMENTATION_ROADMAP.md, Fase 4). Publishes exactly one
 * `system.ping` job against real Redis and exits. Run via
 * `yarn nx run api:queue:smoke:system-ping` — deliberately not part of
 * `yarn validate`/`yarn validate:infra`.
 */
async function main(): Promise<void> {
  // Optional: a missing .env is fine (e.g. CI, or a developer relying on
  // real environment variables). Must run before loadServerConfig() reads
  // process.env — see @mockp/config/server's loadEnvFile().
  loadEnvFile();

  const serverConfig = loadServerConfig(process.env);

  const app = await NestFactory.createApplicationContext(
    SystemPingCommandModule.forRoot(serverConfig),
    { bufferLogs: true },
  );

  app.useLogger(app.get(PinoLogger));

  try {
    await app.get(SystemPingPublisher).publish();
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof ServerConfigError) {
    console.error(error.message);
  } else {
    console.error('Fatal error while publishing system.ping:', error);
  }
  process.exitCode = 1;
});
