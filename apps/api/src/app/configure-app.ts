import {
  ValidationPipe,
  VersioningType,
  type INestApplication,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { ServerConfig } from '@mockp/config/server';
import { requestId } from '../common/request-id';
import { buildCorsOptions } from '../common/cors';
import { toValidationFailedException } from '../common/validation-failed.exception';

/**
 * Everything applied to the Nest application instance besides module
 * composition. Shared by main.ts and the integration-test harness so the
 * two never drift — an integration test is only meaningful if it exercises
 * the exact same HTTP setup production uses.
 *
 * There is no manual catch-all for unmatched routes here: Nest's own
 * RoutesResolver registers a not-found handler during app.init() (invoked
 * by app.listen()), and that handler's exception flows through the global
 * ProblemDetailsFilter (registered via APP_FILTER in AppModule) like any
 * other exception, already producing a NOT_FOUND Problem Details body.
 */
export function configureApp(
  app: INestApplication,
  serverConfig: ServerConfig,
): void {
  app.use(requestId());

  // Swagger UI serves inline scripts/styles; a default CSP would block them.
  app.use(helmet({ contentSecurityPolicy: false }));

  app.enableCors(buildCorsOptions(serverConfig.corsAllowedOrigins));
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => toValidationFailedException(errors),
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Mockp API')
    .setDescription('Mockp platform REST API — skeleton (Fase 2).')
    .setVersion('1')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);
}
