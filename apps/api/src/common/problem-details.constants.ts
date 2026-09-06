import type { ProblemCode } from './problem-details.types';

export const PROBLEM_BASE_URL = 'https://api.mockp.dev/problems';

export const PROBLEM_CATALOG: Record<
  ProblemCode,
  { type: string; title: string }
> = {
  VALIDATION_ERROR: {
    type: `${PROBLEM_BASE_URL}/validation-error`,
    title: 'Validation Failed',
  },
  NOT_FOUND: {
    type: `${PROBLEM_BASE_URL}/not-found`,
    title: 'Not Found',
  },
  RATE_LIMIT_EXCEEDED: {
    type: `${PROBLEM_BASE_URL}/rate-limit-exceeded`,
    title: 'Too Many Requests',
  },
  INTERNAL_SERVER_ERROR: {
    type: `${PROBLEM_BASE_URL}/internal-server-error`,
    title: 'Internal Server Error',
  },
  SERVICE_UNAVAILABLE: {
    type: `${PROBLEM_BASE_URL}/service-unavailable`,
    title: 'Service Unavailable',
  },
};

export const PROBLEM_DETAILS_CONTENT_TYPE = 'application/problem+json';
