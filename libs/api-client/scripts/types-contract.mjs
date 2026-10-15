import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

/**
 * Shared, read-only core of the generated-types tooling (ADR 009, D2/D7).
 * It never writes to disk: `generate-types.mjs` is the only script that does.
 * Used by the generator, by the read-only check and by the tests.
 */

export const DEFAULT_SPEC_PATH = fileURLToPath(
  new URL('../openapi/openapi.json', import.meta.url),
);
export const DEFAULT_TYPES_PATH = fileURLToPath(
  new URL('../src/generated/schema.d.ts', import.meta.url),
);

const BOM = '\uFEFF';
const EXCERPT_BEFORE = 20;
const EXCERPT_AFTER = 40;

/**
 * Generates the `schema.d.ts` text from an already parsed OpenAPI document.
 * Normalized to LF, exactly one trailing `\n`, no BOM, so the bytes depend
 * only on the document and on the pinned `openapi-typescript` version.
 */
export async function generateTypesTextFromSpec(spec) {
  const text = astToString(await openapiTS(spec));
  const normalized = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+$/, '');

  return `${normalized}\n`;
}

/** Reads the versioned `openapi.json` and generates the types text. */
export async function generateTypesText(specPath = DEFAULT_SPEC_PATH) {
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  return generateTypesTextFromSpec(spec);
}

/**
 * Pure comparison. `expected` is the text generated from the spec and
 * `actual` the text read from the versioned file. Reports only the FIRST
 * difference (line, column, short excerpts), never the whole file.
 */
export function compareTexts(expected, actual) {
  if (expected === actual) {
    return { equal: true };
  }

  let index = 0;
  const limit = Math.min(expected.length, actual.length);
  while (index < limit && expected[index] === actual[index]) {
    index += 1;
  }

  const before = expected.slice(0, index);
  return {
    equal: false,
    difference: {
      kind: classify(expected, actual),
      line: before.split('\n').length,
      column: index - (before.lastIndexOf('\n') + 1) + 1,
      expected: excerpt(expected, index),
      actual: excerpt(actual, index),
    },
  };
}

function classify(expected, actual) {
  if (expected.startsWith(BOM) !== actual.startsWith(BOM)) {
    return 'bom';
  }
  if (expected.replace(/\r\n/g, '\n') === actual.replace(/\r\n/g, '\n')) {
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

function excerpt(text, index) {
  const start = Math.max(0, index - EXCERPT_BEFORE);
  const end = Math.min(text.length, index + EXCERPT_AFTER);
  const body = text
    .slice(start, end)
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\uFEFF/g, '\\uFEFF');

  return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`;
}

/**
 * Read-only check: generates the types in memory from the spec and compares
 * the BYTES with the versioned `schema.d.ts`.
 * Result: `equal`, `missing` (types file absent — distinct from drift) or
 * `different` (with the first difference).
 */
export async function checkTypes({
  specPath = DEFAULT_SPEC_PATH,
  typesPath = DEFAULT_TYPES_PATH,
  readFile = (path) => readFileSync(path),
} = {}) {
  const generated = await generateTypesText(specPath);

  let onDisk;
  try {
    onDisk = readFile(typesPath);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return { status: 'missing', path: typesPath };
    }
    throw error;
  }

  if (Buffer.from(generated, 'utf8').equals(onDisk)) {
    return { status: 'equal' };
  }

  const comparison = compareTexts(generated, onDisk.toString('utf8'));
  return {
    status: 'different',
    path: typesPath,
    difference: comparison.equal
      ? {
          kind: 'content',
          line: 1,
          column: 1,
          expected: '(byte sequences differ; the decoded texts are equal)',
          actual: '(byte sequences differ; the decoded texts are equal)',
        }
      : comparison.difference,
  };
}
