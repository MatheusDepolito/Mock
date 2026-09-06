import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export interface RequestWithId extends Request {
  id: string;
}

/**
 * Reuses a valid `X-Request-Id` sent by the client, or generates a new
 * UUID. Runs before nestjs-pino's own middleware (registered later, during
 * Nest's module init) so pino-http's `genReqId` can simply read `req.id`
 * instead of generating a second, different id.
 */
export function requestId(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.header(REQUEST_ID_HEADER);
    const value =
      incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();

    (req as RequestWithId).id = value;
    res.setHeader('X-Request-Id', value);
    next();
  };
}

export function getRequestId(req: Request): string {
  return (req as Partial<RequestWithId>).id ?? 'unknown';
}
