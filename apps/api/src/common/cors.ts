import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

function normalizeOrigin(origin: string): string {
  return origin.trim().toLowerCase().replace(/\/+$/, '');
}

/**
 * Requests without an `Origin` header (curl, server-to-server, same-origin
 * navigation) are allowed through, since there is no origin to check. For
 * requests that do carry one, only origins present in the allowlist get an
 * `Access-Control-Allow-Origin` header back — anything else is silently
 * denied the header rather than rejected with an error.
 */
export function buildCorsOptions(allowedOrigins: string[]): CorsOptions {
  const allowed = new Set(allowedOrigins.map(normalizeOrigin));

  return {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(null, allowed.has(normalizeOrigin(origin)));
    },
    credentials: false,
  };
}
