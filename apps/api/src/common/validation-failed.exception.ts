import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

/**
 * Thrown by the global ValidationPipe's exceptionFactory instead of Nest's
 * default BadRequestException, so the global filter can render the field
 * errors as `Record<string, string[]>` in the Problem Details body.
 */
export class ValidationFailedException extends BadRequestException {
  constructor(public readonly fieldErrors: Record<string, string[]>) {
    super('Validation failed');
  }
}

export function toValidationFailedException(
  errors: ValidationError[],
): ValidationFailedException {
  const fieldErrors: Record<string, string[]> = {};
  collectFieldErrors(errors, '', fieldErrors);
  return new ValidationFailedException(fieldErrors);
}

function collectFieldErrors(
  errors: ValidationError[],
  pathPrefix: string,
  out: Record<string, string[]>,
): void {
  for (const error of errors) {
    const path = pathPrefix
      ? `${pathPrefix}.${error.property}`
      : error.property;

    if (error.constraints) {
      out[path] = [...(out[path] ?? []), ...Object.values(error.constraints)];
    }

    if (error.children && error.children.length > 0) {
      collectFieldErrors(error.children, path, out);
    }
  }
}
