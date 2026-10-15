const BOM = '\uFEFF';
const EXCERPT_BEFORE = 20;
const EXCERPT_AFTER = 40;

export type ContractDifferenceKind =
  /** Only one side starts with a UTF-8 byte order mark. */
  | 'bom'
  /** Same text, but one side uses CRLF where the other uses LF. */
  | 'line-ending'
  /** One side is the other plus only trailing whitespace/line breaks. */
  | 'end-of-file'
  /** One side ends early (the rest is more than whitespace). */
  | 'length'
  /** Different characters. */
  | 'content';

export interface ContractDifference {
  kind: ContractDifferenceKind;
  /** 1-based line of the first difference, counted on the `expected` side. */
  line: number;
  /** 1-based column (UTF-16 code units) of the first difference. */
  column: number;
  /** Short, escaped excerpt around the difference, `expected` side. */
  expected: string;
  /** Short, escaped excerpt around the difference, `actual` side. */
  actual: string;
}

export type ContractComparison =
  { equal: true } | { equal: false; difference: ContractDifference };

/**
 * Pure comparison of two contract texts: reports whether they are equal
 * and, if not, the FIRST difference — never the documents themselves.
 * `expected` is the text generated from the code and `actual` the text
 * read from the versioned file. Line endings, a trailing newline and a BOM
 * are distinguished from ordinary content differences.
 */
export function compareContract(
  expected: string,
  actual: string,
): ContractComparison {
  if (expected === actual) {
    return { equal: true };
  }

  const index = firstDifferenceIndex(expected, actual);

  return {
    equal: false,
    difference: {
      kind: classify(expected, actual),
      ...positionOf(expected, index),
      expected: excerpt(expected, index),
      actual: excerpt(actual, index),
    },
  };
}

function firstDifferenceIndex(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a[index] === b[index]) {
    index += 1;
  }
  return index;
}

function classify(expected: string, actual: string): ContractDifferenceKind {
  if (expected.startsWith(BOM) !== actual.startsWith(BOM)) {
    return 'bom';
  }

  if (normalizeLineEndings(expected) === normalizeLineEndings(actual)) {
    return 'line-ending';
  }

  const shorter = expected.length <= actual.length ? expected : actual;
  const longer = shorter === expected ? actual : expected;
  if (longer.startsWith(shorter)) {
    return longer.slice(shorter.length).trim() === ''
      ? 'end-of-file'
      : 'length';
  }

  return 'content';
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function positionOf(
  text: string,
  index: number,
): { line: number; column: number } {
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  const column = index - (before.lastIndexOf('\n') + 1) + 1;
  return { line, column };
}

function excerpt(text: string, index: number): string {
  const start = Math.max(0, index - EXCERPT_BEFORE);
  const end = Math.min(text.length, index + EXCERPT_AFTER);
  const body = text
    .slice(start, end)
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\uFEFF/g, '\\uFEFF');

  return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`;
}
