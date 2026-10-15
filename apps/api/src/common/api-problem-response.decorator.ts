import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { PROBLEM_DETAILS_CONTENT_TYPE } from './problem-details.constants';
import { REQUEST_ID_RESPONSE_HEADERS } from './api-request-id.decorator';
import { ProblemDetailsDto } from './dto/problem-details-response.dto';

/**
 * Documents one error response of an operation as RFC Problem Details.
 *
 * Uses `content` ONLY — never `type` together with `content`: when both are
 * present `@nestjs/swagger` lets `type` win and the content type silently
 * falls back to `application/json` (spike 5.1). `@ApiProduces` is not used
 * either: it applies to the whole operation and would relabel the 200.
 */
export const ApiProblemResponse = (
  status: number,
  description: string,
): MethodDecorator & ClassDecorator =>
  applyDecorators(
    ApiExtraModels(ProblemDetailsDto),
    ApiResponse({
      status,
      description,
      content: {
        [PROBLEM_DETAILS_CONTENT_TYPE]: {
          schema: { $ref: getSchemaPath(ProblemDetailsDto) },
        },
      },
      headers: REQUEST_ID_RESPONSE_HEADERS,
    }),
  );
