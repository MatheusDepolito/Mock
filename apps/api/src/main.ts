import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import {
  loadEnvFile,
  loadServerConfig,
  ServerConfigError,
} from '@mockp/config/server';
import { AppModule } from './app/app.module';
import { configureApp } from './app/configure-app';

async function bootstrap(): Promise<void> {
  // Optional: a missing .env is fine (e.g. CI, or a developer relying on
  // real environment variables). Must run before loadServerConfig() reads
  // process.env — see @mockp/config/server's loadEnvFile().
  loadEnvFile();

  const serverConfig = loadServerConfig(process.env);

  const app = await NestFactory.create(AppModule.forRoot(serverConfig), {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  configureApp(app, serverConfig);
  app.enableShutdownHooks();

  // app.listen() calls app.init() internally, which is what actually binds
  // controller routes to the underlying Express instance.
  await app.listen(serverConfig.port, serverConfig.host);
}

bootstrap().catch((error: unknown) => {
  if (error instanceof ServerConfigError) {
    console.error(error.message);
  } else {
    console.error('Fatal error during API bootstrap:', error);
  }
  process.exitCode = 1;
});
