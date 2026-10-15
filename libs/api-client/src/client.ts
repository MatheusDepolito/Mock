import createClient, { type ClientOptions } from 'openapi-fetch';
import type { paths } from './types';

export interface ApiClientOptions {
  /** Base URL of the API (for example the origin of the deployed API). Required: there is no default. */
  baseUrl: string;
  /**
   * Custom `fetch` (same type as the `openapi-fetch` option) — for tests and
   * for frameworks that provide their own. Omit it to use `globalThis.fetch`.
   */
  fetch?: NonNullable<ClientOptions['fetch']>;
}

export type ApiClient = ReturnType<typeof createClient<paths>>;

/**
 * Creates a typed client for the Mockp REST API. A thin wrapper over
 * `openapi-fetch`'s `createClient<paths>`: all request and response types
 * come from the generated contract. Not a singleton — every caller decides
 * its own `baseUrl`; there is no authentication or domain logic here.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const clientOptions: ClientOptions = { baseUrl: options.baseUrl };

  // `exactOptionalPropertyTypes`: never pass `fetch: undefined`.
  if (options.fetch !== undefined) {
    clientOptions.fetch = options.fetch;
  }

  return createClient<paths>(clientOptions);
}
