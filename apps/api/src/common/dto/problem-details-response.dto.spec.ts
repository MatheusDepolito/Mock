import { describe, expect, expectTypeOf, it } from 'vitest';
import { PROBLEM_CATALOG } from '../problem-details.constants';
import type { ProblemDetailsBody } from '../problem-details.types';
import {
  PROBLEM_CODES,
  ProblemDetailsDto,
} from './problem-details-response.dto';

describe('ProblemDetailsDto', () => {
  it('has exactly the shape of ProblemDetailsBody, in both directions (compile-time)', () => {
    expectTypeOf<ProblemDetailsDto>().toEqualTypeOf<ProblemDetailsBody>();
    // Explicit assignability in each direction, for a clearer compiler error.
    const dtoAsBody: ProblemDetailsBody = {} as ProblemDetailsDto;
    const bodyAsDto: ProblemDetailsDto = {} as ProblemDetailsBody;
    expect([dtoAsBody, bodyAsDto]).toHaveLength(2);
  });

  it('derives the documented code enum from the PROBLEM_CATALOG keys', () => {
    expect(PROBLEM_CODES).toEqual(Object.keys(PROBLEM_CATALOG));
    expect(PROBLEM_CODES).toHaveLength(5);
  });

  it('declares an explicit OpenAPI type or enum on every property', () => {
    const properties = [
      'type',
      'title',
      'status',
      'detail',
      'instance',
      'code',
      'requestId',
      'errors',
    ] as const satisfies ReadonlyArray<keyof ProblemDetailsBody>;

    for (const name of properties) {
      const metadata = Reflect.getMetadata(
        'swagger/apiModelProperties',
        ProblemDetailsDto.prototype,
        name,
      ) as { type?: unknown; enum?: unknown } | undefined;

      expect(metadata, name).toBeDefined();
      expect(
        metadata?.type !== undefined || metadata?.enum !== undefined,
        name,
      ).toBe(true);
    }
  });
});
