import { describe, expect, expectTypeOf, it } from 'vitest';
import type * as publicApi from './index';
import type { components, operations, paths, ProblemDetails } from './index';

describe('public types', () => {
  it('derives ProblemDetails from the generated schema, never redeclared', () => {
    expectTypeOf<ProblemDetails>().toEqualTypeOf<
      components['schemas']['ProblemDetailsDto']
    >();
    expect(true).toBe(true);
  });

  it('re-exports paths and operations of the generated contract', () => {
    expectTypeOf<keyof paths>().toEqualTypeOf<
      '/api/v1/health/live' | '/api/v1/health/ready'
    >();
    expectTypeOf<keyof operations>().toEqualTypeOf<
      'health_live' | 'health_ready'
    >();
    expect(true).toBe(true);
  });

  it('exposes only the intended public surface', () => {
    type Exported = keyof typeof publicApi;

    expectTypeOf<Exported>().toEqualTypeOf<'createApiClient'>();
    expect(true).toBe(true);
  });
});
