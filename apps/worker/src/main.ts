import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import {
  loadEnvFile,
  loadWorkerConfig,
  WorkerConfigError,
} from '@mockp/config/worker';
import { AppModule } from './app/app.module';

async function bootstrap(): Promise<void> {
  // Optional: a missing .env is fine (e.g. CI, or a developer relying on
  // real environment variables). Must run before loadWorkerConfig() reads
  // process.env — see @mockp/config/worker's loadEnvFile().
  loadEnvFile();

  const workerConfig = loadWorkerConfig(process.env);

  // Standalone application context, never NestFactory.create(): the
  // worker never accepts HTTP traffic (no app.listen()), it only
  // consumes BullMQ jobs — see docs/TARGET_ARCHITECTURE.md, section 2.
  const app = await NestFactory.createApplicationContext(
    AppModule.forRoot(workerConfig),
    { bufferLogs: true },
  );

  app.useLogger(app.get(PinoLogger));
  // `useProcessExit: true` guarantees a deterministic `process.exit(0)`
  // once shutdown hooks finish running (instead of re-raising the raw
  // signal, whose default handling would not report a 0 exit code) —
  // also the option @nestjs/core's own implementation recommends so an
  // async logger like Pino flushes its buffers before the process
  // terminates.
  app.enableShutdownHooks([], { useProcessExit: true });

  new Logger('Bootstrap').log('Worker started');

  // The real BullMQ Worker registered by SystemPingModule (wired into
  // AppModule as of Tarefa 4.5) keeps its own active `ioredis`
  // connection open, which keeps the Node.js event loop alive on its
  // own — no artificial keep-alive needed anymore (Tarefa 4.2's
  // `setInterval` stand-in has been removed).
}

bootstrap().catch((error: unknown) => {
  if (error instanceof WorkerConfigError) {
    console.error(error.message);
  } else {
    console.error('Fatal error during worker bootstrap:', error);
  }
  process.exitCode = 1;
});
