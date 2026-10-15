import { ApiProperty } from '@nestjs/swagger';
import { PROBLEM_CATALOG } from '../problem-details.constants';
import type { ProblemCode, ProblemDetailsBody } from '../problem-details.types';

/**
 * Every code the global ProblemDetailsFilter can emit, derived from the
 * catalog so the OpenAPI enum never drifts from it.
 */
export const PROBLEM_CODES = Object.keys(PROBLEM_CATALOG) as ProblemCode[];

/**
 * OpenAPI schema of the RFC Problem Details body the API returns for every
 * error (`application/problem+json`). `implements ProblemDetailsBody` makes
 * the compiler reject any divergence from the runtime shape; every
 * `@ApiProperty` states its type explicitly so the schema never depends on
 * implicit `design:type` metadata.
 */
export class ProblemDetailsDto implements ProblemDetailsBody {
  @ApiProperty({
    type: String,
    description: 'Stable URI-reference identifying the problem type.',
    example: 'https://api.mockp.dev/problems/service-unavailable',
  })
  type!: string;

  @ApiProperty({
    type: String,
    description: 'Short, human-readable summary of the problem type.',
    example: 'Service Unavailable',
  })
  title!: string;

  @ApiProperty({
    type: Number,
    description: 'HTTP status code, repeated in the body.',
    example: 503,
  })
  status!: number;

  @ApiProperty({
    type: String,
    description:
      'Explanation specific to this occurrence, meant for diagnostics and logging (not for UI text).',
    example: 'PostgreSQL is not ready.',
  })
  detail!: string;

  @ApiProperty({
    type: String,
    description: 'Path of the request that produced the error.',
    example: '/api/v1/health/ready',
  })
  instance!: string;

  @ApiProperty({
    enum: PROBLEM_CODES,
    description: 'Stable error code, from the API error catalog.',
    example: 'SERVICE_UNAVAILABLE',
  })
  code!: ProblemCode;

  @ApiProperty({
    type: String,
    description:
      'The same correlation id returned in the X-Request-Id response header.',
    example: '4d0f2d7a-3b9a-4c8e-9a52-6b1f7f1c2a10',
  })
  requestId!: string;

  @ApiProperty({
    required: false,
    type: Object,
    additionalProperties: { type: 'array', items: { type: 'string' } },
    description:
      'Validation failures only: field name to the list of messages for that field.',
  })
  errors?: Record<string, string[]>;
}
