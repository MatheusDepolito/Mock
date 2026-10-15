import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  checkTypes,
  compareTexts,
  DEFAULT_SPEC_PATH,
  DEFAULT_TYPES_PATH,
  generateTypesText,
  generateTypesTextFromSpec,
} from './types-contract.mjs';

describe('generated types: determinism', () => {
  it('gives identical bytes for two generations from the versioned openapi.json', async () => {
    const first = await generateTypesText(DEFAULT_SPEC_PATH);
    const second = await generateTypesText(DEFAULT_SPEC_PATH);

    expect(Buffer.from(first, 'utf8').equals(Buffer.from(second, 'utf8'))).toBe(
      true,
    );
  });

  it('uses only LF, ends with exactly one line feed and has no BOM', async () => {
    const text = await generateTypesText(DEFAULT_SPEC_PATH);

    expect(text).not.toContain('\r');
    expect(text.endsWith('}\n') || text.endsWith(';\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
    expect(text.charCodeAt(0)).not.toBe(0xfeff);
  });
});

describe('generated types: content', () => {
  let text;

  beforeAll(async () => {
    text = await generateTypesText(DEFAULT_SPEC_PATH);
  });

  it('exposes paths for the two health endpoints', () => {
    expect(text).toContain('export interface paths');
    expect(text).toContain('"/api/v1/health/live"');
    expect(text).toContain('"/api/v1/health/ready"');
  });

  it('exposes the Problem Details schema, the operations and the X-Request-Id header', () => {
    expect(text).toContain('ProblemDetailsDto');
    expect(text).toContain('health_live');
    expect(text).toContain('health_ready');
    expect(text).toContain('"X-Request-Id"');
    expect(text).toContain('"application/problem+json"');
  });
});

describe('generated types: drift', () => {
  it('differs from the versioned schema.d.ts when the spec gains a property (in memory)', async () => {
    const spec = JSON.parse(readFileSync(DEFAULT_SPEC_PATH, 'utf8'));
    spec.components.schemas.HealthLiveResponseDto.properties.extra = {
      type: 'string',
    };

    const changed = await generateTypesTextFromSpec(spec);
    const versioned = readFileSync(DEFAULT_TYPES_PATH, 'utf8');

    expect(changed).not.toBe(versioned);
    expect(changed).toContain('extra');
    const comparison = compareTexts(changed, versioned);
    expect(comparison.equal).toBe(false);
    expect(comparison.difference.line).toBeGreaterThan(1);
  });
});

describe('compareTexts', () => {
  const BASE = 'export interface a {\n  b: 1;\n}\n';

  it('reports equal texts and the first difference with line and column', () => {
    expect(compareTexts(BASE, BASE)).toEqual({ equal: true });
    expect(compareTexts(BASE, BASE.replace('1', '2')).difference).toMatchObject(
      { kind: 'content', line: 2, column: 6 },
    );
  });

  it('distinguishes CRLF, a missing final newline and a BOM', () => {
    const kind = (actual) => compareTexts(BASE, actual).difference.kind;

    expect(kind(BASE.replace(/\n/g, '\r\n'))).toBe('line-ending');
    expect(kind(BASE.slice(0, -1))).toBe('end-of-file');
    expect(kind(`\uFEFF${BASE}`)).toBe('bom');
  });

  it('keeps the excerpts short', () => {
    const long = 'x'.repeat(5000);
    const { difference } = compareTexts(`${long}a${long}`, `${long}b${long}`);

    expect(difference.expected.length).toBeLessThan(80);
    expect(difference.actual.length).toBeLessThan(80);
  });
});

const WRITE_FUNCTIONS = [
  'writeFile',
  'writeFileSync',
  'appendFile',
  'appendFileSync',
  'mkdir',
  'mkdirSync',
  'rm',
  'rmSync',
  'rmdir',
  'rmdirSync',
  'rename',
  'renameSync',
  'unlink',
  'unlinkSync',
  'copyFile',
  'copyFileSync',
  'truncate',
  'truncateSync',
  'createWriteStream',
];

describe('types check does not write', () => {
  let directory;
  let specCopy;
  let typesCopy;
  let digestBefore;
  let mtimeBefore;

  const digest = (path) =>
    createHash('sha256').update(readFileSync(path)).digest('hex');

  beforeAll(() => {
    // Prepared BEFORE the spies are armed, in an OS temp directory (never
    // inside the repository). The copied types are deliberately stale.
    directory = mkdtempSync(join(tmpdir(), 'mockp-types-check-'));
    specCopy = join(directory, 'openapi.json');
    typesCopy = join(directory, 'schema.d.ts');
    copyFileSync(DEFAULT_SPEC_PATH, specCopy);
    writeFileSync(typesCopy, 'export interface stale {}\n', 'utf8');
    digestBefore = digest(typesCopy);
    mtimeBefore = statSync(typesCopy).mtimeMs;
  });

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('calls no write API of node:fs or node:fs/promises, and leaves hash and mtime untouched', async () => {
    const spies = [
      ...WRITE_FUNCTIONS.map((name) => ({
        owner: 'fs',
        name,
        spy: vi.spyOn(fs, name),
      })),
      ...WRITE_FUNCTIONS.filter((name) => name in fsPromises).map((name) => ({
        owner: 'fs/promises',
        name,
        spy: vi.spyOn(fsPromises, name),
      })),
    ];

    try {
      const result = await checkTypes({
        specPath: specCopy,
        typesPath: typesCopy,
      });

      expect(result.status).toBe('different');
      expect(
        spies
          .filter(({ spy }) => spy.mock.calls.length > 0)
          .map(({ owner, name }) => `${owner}.${name}`),
      ).toEqual([]);
    } finally {
      vi.restoreAllMocks();
    }

    expect(digest(typesCopy)).toBe(digestBefore);
    expect(statSync(typesCopy).mtimeMs).toBe(mtimeBefore);
  });

  it('reports a missing types file as "missing", distinct from "different"', async () => {
    const result = await checkTypes({
      specPath: specCopy,
      typesPath: join(directory, 'absent.d.ts'),
    });

    expect(result.status).toBe('missing');
  });
});

describe('check modules (static)', () => {
  const CHECK_MODULES = ['types-contract.mjs', 'check-types.mjs'];
  const FORBIDDEN =
    /\b(writeFile|writeFileSync|appendFile|appendFileSync|mkdir|mkdirSync|rm|rmSync|rmdir|rmdirSync|rename|renameSync|unlink|unlinkSync|copyFile|copyFileSync|truncate|truncateSync|createWriteStream)\b/;

  const sourceOf = (name) =>
    readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('mention no filesystem write, creation, removal, rename or write-stream identifier', () => {
    for (const name of CHECK_MODULES) {
      expect(FORBIDDEN.exec(sourceOf(name))?.[0], name).toBeUndefined();
    }
  });

  it('import from node:fs only readFileSync, and never node:fs/promises', () => {
    for (const name of CHECK_MODULES) {
      const source = sourceOf(name);
      const imports = [
        ...source.matchAll(
          /import\s+([^;]*?)\s+from\s+['"](?:node:)?fs(?:\/promises)?['"]/g,
        ),
      ].map((match) => match[1].replace(/[{}\s]/g, ''));

      expect(source, name).not.toMatch(/['"](?:node:)?fs\/promises['"]/);
      expect(
        imports.every((imported) => imported === 'readFileSync'),
        name,
      ).toBe(true);
    }
  });
});
