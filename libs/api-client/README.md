# api-client

Typed HTTP client for the Mockp REST API (`@mockp/api-client`): a thin
wrapper over [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) whose
every type comes from the generated API contract. No TanStack Query hooks,
no singleton, no authentication.

## Usage

```ts
import { createApiClient, type ProblemDetails } from '@mockp/api-client';

const client = createApiClient({ baseUrl: 'https://api.example.com' });

const { data, error } = await client.GET('/api/v1/health/ready', {
  params: { header: { 'X-Request-Id': 'optional-correlation-id' } },
});

if (error) {
  const problem: ProblemDetails = error; // RFC Problem Details body
  console.error(problem.code, problem.requestId);
} else {
  console.log(data.status);
}
```

- `baseUrl` is required and has no default; the caller decides it.
- `fetch` is optional (`createApiClient({ baseUrl, fetch })`) — use it to
  inject a fetch in tests or in frameworks that provide their own. When
  omitted, `globalThis.fetch` is used.
- Public surface: `createApiClient`, `ApiClientOptions`, `ApiClient`, and
  the types `paths`, `components`, `operations` and `ProblemDetails`.

## Types come from the generated contract

Request and response types are never written by hand here:

- `openapi/openapi.json` is generated from the API code;
- `src/generated/schema.d.ts` is generated from `openapi/openapi.json`;
- `ProblemDetails` is derived from `components['schemas']['ProblemDetailsDto']`.

Both files are versioned. After changing a DTO or a controller of the API,
regenerate them explicitly and review the diff:

```bash
yarn contract:generate   # writes openapi.json, then schema.d.ts
yarn contract:check      # read-only: fails when either file is out of date
```

`contract:generate` is never part of `yarn validate`; `contract:check` is
read-only and compares bytes.

## Building

Run `nx build api-client` to build the library.

## Running unit tests

Run `nx test api-client` to execute the unit tests via
[Vitest](https://vitest.dev/). They never use the network: `fetch` is always
injected.
