import { describe, expect, it } from 'vitest';
import { compareContract } from './compare-contract';

const BASE = '{\n  "a": 1,\n  "b": 2\n}\n';

function differenceOf(expected: string, actual: string) {
  const result = compareContract(expected, actual);
  if (result.equal) {
    throw new Error('expected a difference');
  }
  return result.difference;
}

describe('compareContract', () => {
  it('reports equal texts as equal', () => {
    expect(compareContract(BASE, BASE)).toEqual({ equal: true });
    expect(compareContract('', '')).toEqual({ equal: true });
  });

  it('reports a difference in the middle with the right line and column', () => {
    const changed = '{\n  "a": 1,\n  "b": 3\n}\n';

    expect(differenceOf(BASE, changed)).toMatchObject({
      kind: 'content',
      line: 3,
      column: 8,
    });
  });

  it('reports the first difference only, even when later lines differ too', () => {
    const changed = '{\n  "a": 9,\n  "b": 3\n}\n';

    expect(differenceOf(BASE, changed)).toMatchObject({ line: 2, column: 8 });
  });

  it('counts the line and column on the first line', () => {
    expect(differenceOf('abc', 'abd')).toMatchObject({ line: 1, column: 3 });
    expect(differenceOf('abc', 'xbc')).toMatchObject({ line: 1, column: 1 });
  });

  it('distinguishes a missing trailing newline', () => {
    const difference = differenceOf(BASE, BASE.slice(0, -1));

    expect(difference.kind).toBe('end-of-file');
    // The generated text has its final line feed right after the `}` of line 4.
    expect(difference).toMatchObject({ line: 4, column: 2 });
  });

  it('distinguishes an extra trailing newline', () => {
    expect(differenceOf(BASE, `${BASE}\n`).kind).toBe('end-of-file');
  });

  it('distinguishes CRLF from LF', () => {
    const crlf = BASE.replace(/\n/g, '\r\n');
    const difference = differenceOf(BASE, crlf);

    expect(difference.kind).toBe('line-ending');
    expect(difference).toMatchObject({ line: 1, column: 2 });
    expect(difference.actual).toContain('\\r\\n');
  });

  it('distinguishes a byte order mark', () => {
    const difference = differenceOf(BASE, `\uFEFF${BASE}`);

    expect(difference.kind).toBe('bom');
    expect(difference).toMatchObject({ line: 1, column: 1 });
    expect(difference.actual).toContain('\\uFEFF');
  });

  it('reports a shorter side that is more than whitespace as a length difference', () => {
    expect(differenceOf(BASE, '{\n  "a": 1,\n').kind).toBe('length');
    expect(differenceOf('{\n  "a": 1,\n', BASE).kind).toBe('length');
  });

  it('never dumps the documents: excerpts are short and truncated', () => {
    const long = 'x'.repeat(5000);
    const difference = differenceOf(`${long}a${long}`, `${long}b${long}`);

    expect(difference.expected.length).toBeLessThan(80);
    expect(difference.actual.length).toBeLessThan(80);
    expect(difference.expected.startsWith('…')).toBe(true);
    expect(difference.expected.endsWith('…')).toBe(true);
  });
});
