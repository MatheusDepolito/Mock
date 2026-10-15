import { describe, expect, it } from 'vitest';
import { serializeOpenApi } from './serialize-openapi';

function shuffleKeys(value: unknown, seed: number): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => shuffleKeys(item, seed));
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    // Deterministic pseudo-shuffle, different for each seed.
    entries.sort(
      (a, b) =>
        ((a[0].charCodeAt(0) * 31 + seed) % 7) -
        ((b[0].charCodeAt(0) * 31 + seed) % 7),
    );
    return Object.fromEntries(
      entries.map(([key, item]) => [key, shuffleKeys(item, seed)]),
    );
  }
  return value;
}

const SAMPLE = {
  openapi: '3.0.0',
  paths: {
    '/b': { get: { responses: { '500': {}, '200': {} } } },
    '/a': { get: { tags: ['z', 'a'], required: ['y', 'x'] } },
  },
  info: { version: '1', title: 'T' },
};

describe('serializeOpenApi', () => {
  it('produces the same bytes whatever the key order of the input', () => {
    const reference = serializeOpenApi(SAMPLE);

    for (let seed = 0; seed < 25; seed += 1) {
      expect(serializeOpenApi(shuffleKeys(SAMPLE, seed))).toBe(reference);
    }
  });

  it('sorts the keys of every object, at every depth', () => {
    const text = serializeOpenApi(SAMPLE);
    const parsed = JSON.parse(text) as typeof SAMPLE;

    expect(Object.keys(parsed)).toEqual(['info', 'openapi', 'paths']);
    expect(Object.keys(parsed.paths)).toEqual(['/a', '/b']);
    expect(Object.keys(parsed.paths['/b'].get.responses)).toEqual([
      '200',
      '500',
    ]);
    expect(Object.keys(parsed.info)).toEqual(['title', 'version']);
  });

  it('orders keys by Unicode code point, not by UTF-16 code unit', () => {
    // U+1F600 is a surrogate pair (0xD83D 0xDE00) in UTF-16, which a default
    // sort would place BEFORE U+FFFF; by code point it comes AFTER.
    const text = serializeOpenApi({ '\u{1F600}': 1, '￿': 2, a: 3 });

    expect(Object.keys(JSON.parse(text) as object)).toEqual([
      'a',
      '￿',
      '\u{1F600}',
    ]);
  });

  it('preserves the order of arrays', () => {
    const parsed = JSON.parse(serializeOpenApi(SAMPLE)) as {
      paths: { '/a': { get: { tags: string[]; required: string[] } } };
    };

    expect(parsed.paths['/a'].get.tags).toEqual(['z', 'a']);
    expect(parsed.paths['/a'].get.required).toEqual(['y', 'x']);
  });

  it('ends with exactly one line feed, with no carriage return and no BOM', () => {
    const text = serializeOpenApi(SAMPLE);

    expect(text.endsWith('}\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
    expect(text).not.toContain('\r');
    expect(text.charCodeAt(0)).not.toBe(0xfeff);
    expect(Buffer.from(text, 'utf8').subarray(0, 3)).not.toEqual(
      Buffer.from([0xef, 0xbb, 0xbf]),
    );
  });

  it('indents with two spaces', () => {
    const lines = serializeOpenApi({ a: { b: 1 } }).split('\n');

    expect(lines).toEqual(['{', '  "a": {', '    "b": 1', '  }', '}', '']);
  });

  it('drops undefined values like JSON does, and is idempotent', () => {
    const once = serializeOpenApi({ a: undefined, b: 1 });

    expect(JSON.parse(once)).toEqual({ b: 1 });
    expect(serializeOpenApi(JSON.parse(once))).toBe(once);
  });
});
