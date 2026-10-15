import type { components } from './generated/schema';

export type { components, operations, paths } from './generated/schema';

/**
 * The RFC Problem Details body every API error uses
 * (`application/problem+json`). Derived from the generated contract —
 * never redeclared by hand — so it can only change when the API contract
 * does.
 */
export type ProblemDetails = components['schemas']['ProblemDetailsDto'];
