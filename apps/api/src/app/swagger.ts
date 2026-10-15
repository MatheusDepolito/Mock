import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';

/**
 * Builds the OpenAPI document for an application whose HTTP setup
 * (global prefix, URI versioning — see `applyHttpSetup`) has already been
 * applied. Pure document creation: it never mounts Swagger UI or any
 * route (that is `configureApp`'s `SwaggerModule.setup`), so a caller
 * that only needs the document — the contract generator planned for
 * Fase 5 — shares exactly the same title/version/description and the
 * same scanning as the running API.
 */
export function createSwaggerDocument(app: INestApplication): OpenAPIObject {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Mockp API')
    .setDescription('Mockp platform REST API.')
    .setVersion('1')
    .build();
  return SwaggerModule.createDocument(app, swaggerConfig);
}
