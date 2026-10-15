import { afterEach, describe, expect, it, vi } from 'vitest';
import createClient from 'openapi-fetch';
import { createApiClient } from './index';

vi.mock('openapi-fetch', async (importOriginal) => {
  const actual = (await importOriginal()) as {
    default: typeof createClient;
  };
  return { ...actual, default: vi.fn(actual.default) };
});

afterEach(() => {
  vi.mocked(createClient).mockClear();
});

describe('createApiClient options handed to openapi-fetch', () => {
  it('does not pass a fetch key when none is informed (never fetch: undefined)', () => {
    createApiClient({ baseUrl: 'http://api.test' });

    const options = vi.mocked(createClient).mock.calls[0]?.[0];
    expect(options).toEqual({ baseUrl: 'http://api.test' });
    expect(options !== undefined && 'fetch' in options).toBe(false);
  });

  it('passes the informed fetch through unchanged', () => {
    const custom = async (): Promise<Response> => new Response('{}');

    createApiClient({ baseUrl: 'http://api.test', fetch: custom });

    const options = vi.mocked(createClient).mock.calls[0]?.[0];
    expect(options?.fetch).toBe(custom);
    expect(options?.baseUrl).toBe('http://api.test');
  });
});
