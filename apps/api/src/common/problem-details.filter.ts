import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { PROBLEM_DETAILS_CONTENT_TYPE } from './problem-details.constants';
import { getRequestId } from './request-id';
import { buildProblemDetailsBody } from './problem-details.util';
import { ValidationFailedException } from './validation-failed.exception';
import type { ProblemCode } from './problem-details.types';

interface ResolvedProblem {
  status: number;
  code: ProblemCode;
  detail: string;
  errors?: Record<string, string[]>;
}

const GENERIC_DETAIL_BY_STATUS: Partial<Record<number, string>> = {
  [HttpStatus.NOT_FOUND]: 'The requested resource was not found.',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'One or more dependencies are not ready.',
  [HttpStatus.TOO_MANY_REQUESTS]:
    'Rate limit exceeded. Please try again later.',
};

/**
 * The single global exception filter for the API. Every error response
 * leaving the process — regardless of where it was thrown — is shaped
 * into RFC Problem Details here. See docs/TARGET_ARCHITECTURE.md, section 4.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const resolved = this.resolve(exception, request);

    if (resolved.status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.path} [requestId=${getRequestId(request)}]`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body = buildProblemDetailsBody({
      status: resolved.status,
      code: resolved.code,
      detail: resolved.detail,
      instance: request.path,
      requestId: getRequestId(request),
      ...(resolved.errors ? { errors: resolved.errors } : {}),
    });

    response
      .status(resolved.status)
      .type(PROBLEM_DETAILS_CONTENT_TYPE)
      .send(body);
  }

  private resolve(exception: unknown, request: Request): ResolvedProblem {
    if (exception instanceof ValidationFailedException) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_ERROR',
        detail: 'One or more fields failed validation.',
        errors: exception.fieldErrors,
      };
    }

    if (exception instanceof ThrottlerException) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: 'RATE_LIMIT_EXCEEDED',
        detail: GENERIC_DETAIL_BY_STATUS[HttpStatus.TOO_MANY_REQUESTS]!,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();

      if (status === HttpStatus.NOT_FOUND) {
        return {
          status,
          code: 'NOT_FOUND',
          detail: GENERIC_DETAIL_BY_STATUS[HttpStatus.NOT_FOUND]!,
        };
      }

      if (status === HttpStatus.SERVICE_UNAVAILABLE) {
        return {
          status,
          code: 'SERVICE_UNAVAILABLE',
          detail:
            this.extractDetail(exception) ??
            GENERIC_DETAIL_BY_STATUS[HttpStatus.SERVICE_UNAVAILABLE]!,
        };
      }

      if (status === HttpStatus.BAD_REQUEST) {
        return {
          status,
          code: 'VALIDATION_ERROR',
          detail:
            this.extractDetail(exception) ??
            'The request could not be processed.',
        };
      }
    }

    void request;

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      detail: 'An unexpected error occurred. Please try again later.',
    };
  }

  private extractDetail(exception: HttpException): string | undefined {
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return response;
    }

    if (
      response &&
      typeof response === 'object' &&
      'message' in response &&
      typeof (response as { message: unknown }).message === 'string'
    ) {
      return (response as { message: string }).message;
    }

    return undefined;
  }
}
