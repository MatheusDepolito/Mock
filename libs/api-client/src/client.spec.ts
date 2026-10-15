import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { createApiClient, type ProblemDetails } from './index';

const BASE_URL = 'http://api.test';

function jsonResponse(
  body: unknown,
  init: { status: number; contentType: string },
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status,
    headers: { 'content-type': init.contentType },
  });
}

function recordingFetch(response: () => Response): {
  fetch: (request: Request) => Promise<Response>;
  requests: Request[];
} {
  const requests: Request[] = [];
  return {
    requests,
    fetch: async (request) => {
      requests.push(request);
      return response();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createApiClient (runtime, injected fetch, no network)', () => {
  it('GET /api/v1/health/live calls ${baseUrl}/api/v1/health/live with GET and types the 200 body', async () => {
    const { fetch, requests } = recordingFetch(() =>
      jsonResponse(
        { status: 'ok' },
        { status: 200, contentType: 'application/json' },
      ),
    );
    const client = createApiClient({ baseUrl: BASE_URL, fetch });

    const { data, error, response } = await client.GET('/api/v1/health/live');

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(`${BASE_URL}/api/v1/health/live`);
    expect(requests[0]?.method).toBe('GET');
    expect(response.status).toBe(200);
    expect(error).toBeUndefined();
    expect(data?.status).toBe('ok');
    expectTypeOf(data).toEqualTypeOf<{ status: 'ok' } | undefined>();
  });

  it('GET /api/v1/health/ready with a 503 problem+json types the error as ProblemDetails', async () => {
    const problem: ProblemDetails = {
      type: 'https://api.mockp.dev/problems/service-unavailable',
      title: 'Service Unavailable',
      status: 503,
      detail: 'Redis is not ready.',
      instance: '/api/v1/health/ready',
      code: 'SERVICE_UNAVAILABLE',
      requestId: 'req-123',
    };
    const { fetch } = recordingFetch(() =>
      jsonResponse(problem, {
        status: 503,
        contentType: 'application/problem+json',
      }),
    );
    const client = createApiClient({ baseUrl: BASE_URL, fetch });

    const { data, error } = await client.GET('/api/v1/health/ready');

    expect(data).toBeUndefined();
    if (error === undefined) {
      throw new Error('expected an error body');
    }
    expectTypeOf(error).toEqualTypeOf<ProblemDetails>();
    expect(error.code).toBe('SERVICE_UNAVAILABLE');
    expect(error.requestId).toBe('req-123');
    expect(error.detail).toBe('Redis is not ready.');
  });

  it('sends the optional X-Request-Id header when it is given', async () => {
    const { fetch, requests } = recordingFetch(() =>
      jsonResponse(
        { status: 'ok' },
        { status: 200, contentType: 'application/json' },
      ),
    );
    const client = createApiClient({ baseUrl: BASE_URL, fetch });

    await client.GET('/api/v1/health/live', {
      params: { header: { 'X-Request-Id': 'abc' } },
    });

    expect(requests[0]?.headers.get('x-request-id')).toBe('abc');
  });

  it('does not send X-Request-Id when it is not given', async () => {
    const { fetch, requests } = recordingFetch(() =>
      jsonResponse(
        { status: 'ok' },
        { status: 200, contentType: 'application/json' },
      ),
    );
    const client = createApiClient({ baseUrl: BASE_URL, fetch });

    await client.GET('/api/v1/health/live');

    expect(requests[0]?.headers.has('x-request-id')).toBe(false);
  });

  it('uses globalThis.fetch when no fetch option is informed', async () => {
    const globalFetch = vi.fn(async () =>
      jsonResponse(
        { status: 'ok' },
        { status: 200, contentType: 'application/json' },
      ),
    );
    vi.stubGlobal('fetch', globalFetch);

    const client = createApiClient({ baseUrl: BASE_URL });
    const { data } = await client.GET('/api/v1/health/live');

    expect(globalFetch).toHaveBeenCalledTimes(1);
    expect(data?.status).toBe('ok');
  });
});

describe('createApiClient (types)', () => {
  it('rejects, at compile time, unknown paths and methods, wrongly typed headers and a missing baseUrl', () => {
    const typeChecksOnly = (client: ReturnType<typeof createApiClient>) => {
      // @ts-expect-error '/api/v1/nope' is not a path of the contract
      void client.GET('/api/v1/nope');
      // @ts-expect-error the health endpoints only expose GET
      void client.POST('/api/v1/health/live', {});
      const params = { header: { 'X-Request-Id': 1 } };
      // @ts-expect-error X-Request-Id must be a string
      void client.GET('/api/v1/health/live', { params });
      // @ts-expect-error baseUrl is required
      void createApiClient({});
      // @ts-expect-error `fetch: undefined` is not allowed (exactOptionalPropertyTypes)
      void createApiClient({ baseUrl: BASE_URL, fetch: undefined });
    };

    expect(typeChecksOnly).toBeTypeOf('function');
  });
});
