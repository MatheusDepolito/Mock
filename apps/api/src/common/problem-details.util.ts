import { PROBLEM_CATALOG } from './problem-details.constants';
import type { ProblemCode, ProblemDetailsBody } from './problem-details.types';

export interface BuildProblemDetailsInput {
  status: number;
  code: ProblemCode;
  detail: string;
  instance: string;
  requestId: string;
  errors?: Record<string, string[]>;
}

/**
 * Single place that assembles the RFC-Problem-Details body — used both by
 * the global exception filter and by the last-resort 404 handler in
 * main.ts, so the two never drift in shape.
 */
export function buildProblemDetailsBody(
  input: BuildProblemDetailsInput,
): ProblemDetailsBody {
  const { type, title } = PROBLEM_CATALOG[input.code];

  return {
    type,
    title,
    status: input.status,
    detail: input.detail,
    instance: input.instance,
    code: input.code,
    requestId: input.requestId,
    ...(input.errors ? { errors: input.errors } : {}),
  };
}
