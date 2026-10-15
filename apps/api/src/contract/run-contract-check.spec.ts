import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runContractCheck } from './run-contract-check';

const DOCUMENT = '{\n  "openapi": "3.0.0"\n}\n';
const buildDocumentText = async (): Promise<string> => DOCUMENT;

function enoent(): Error {
  return Object.assign(new Error('no such file'), { code: 'ENOENT' });
}

describe('runContractCheck (injected dependencies)', () => {
  it('returns "equal" when the file bytes match the generated document', async () => {
    const result = await runContractCheck('contract.json', {
      buildDocumentText,
      readFile: () => Buffer.from(DOCUMENT, 'utf8'),
    });

    expect(result).toEqual({ status: 'equal' });
  });

  it('returns "different" with the first difference when the file differs', async () => {
    const result = await runContractCheck('contract.json', {
      buildDocumentText,
      readFile: () => Buffer.from(DOCUMENT.replace('3.0.0', '3.1.0'), 'utf8'),
    });

    expect(result).toMatchObject({
      status: 'different',
      path: 'contract.json',
      difference: { kind: 'content', line: 2 },
    });
  });

  it('returns "missing" — a result distinct from "different" — when the file does not exist', async () => {
    const result = await runContractCheck('absent.json', {
      buildDocumentText,
      readFile: () => {
        throw enoent();
      },
    });

    expect(result).toEqual({ status: 'missing', path: 'absent.json' });
  });

  it('treats CRLF, a missing final newline and a BOM as drift', async () => {
    const variants = [
      DOCUMENT.replace(/\n/g, '\r\n'),
      DOCUMENT.slice(0, -1),
      `\uFEFF${DOCUMENT}`,
    ];

    for (const variant of variants) {
      const result = await runContractCheck('contract.json', {
        buildDocumentText,
        readFile: () => Buffer.from(variant, 'utf8'),
      });
      expect(result.status).toBe('different');
    }
  });

  it('rethrows read errors other than "file not found"', async () => {
    await expect(
      runContractCheck('contract.json', {
        buildDocumentText,
        readFile: () => {
          throw Object.assign(new Error('denied'), { code: 'EACCES' });
        },
      }),
    ).rejects.toThrow('denied');
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
] as const;

describe('runContractCheck does not write', () => {
  let directory: string;
  let file: string;
  let digestBefore: string;
  let mtimeBefore: number;

  const digest = (path: string): string =>
    createHash('sha256').update(readFileSync(path)).digest('hex');

  beforeAll(() => {
    // Prepared BEFORE the spies are armed, outside the repository.
    directory = mkdtempSync(join(tmpdir(), 'mockp-contract-check-'));
    file = join(directory, 'openapi.json');
    writeFileSync(file, DOCUMENT.replace('3.0.0', '3.1.0'), 'utf8');
    digestBefore = digest(file);
    mtimeBefore = statSync(file).mtimeMs;
  });

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('calls no write API of node:fs or node:fs/promises, and leaves hash and mtime untouched', async () => {
    const spyOn = vi.spyOn as unknown as (
      owner: object,
      name: string,
    ) => { mock: { calls: unknown[] } };
    const spies = [
      ...WRITE_FUNCTIONS.map((name) => ({
        owner: 'fs',
        name,
        spy: spyOn(fs, name),
      })),
      ...WRITE_FUNCTIONS.filter((name) => name in fsPromises).map((name) => ({
        owner: 'fs/promises',
        name,
        spy: spyOn(fsPromises, name),
      })),
    ];

    try {
      const result = await runContractCheck(file, { buildDocumentText });

      expect(result.status).toBe('different');
      const calls = spies
        .filter(({ spy }) => spy.mock.calls.length > 0)
        .map(({ owner, name }) => `${owner}.${name}`);
      expect(calls).toEqual([]);
    } finally {
      vi.restoreAllMocks();
    }

    expect(digest(file)).toBe(digestBefore);
    expect(statSync(file).mtimeMs).toBe(mtimeBefore);
  });
});

describe('contract check modules (static)', () => {
  const READ_ONLY_MODULES = [
    'compare-contract.ts',
    'run-contract-check.ts',
    'check-openapi.ts',
    'build-openapi-document.ts',
    'serialize-openapi.ts',
  ];
  const FORBIDDEN =
    /\b(writeFile|writeFileSync|appendFile|appendFileSync|mkdir|mkdirSync|rm|rmSync|rmdir|rmdirSync|rename|renameSync|unlink|unlinkSync|copyFile|copyFileSync|truncate|truncateSync|createWriteStream)\b/;

  const sourceOf = (name: string): string =>
    readFileSync(join(__dirname, name), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('mention no filesystem write, creation, removal, rename or write-stream identifier', () => {
    for (const name of READ_ONLY_MODULES) {
      expect(FORBIDDEN.exec(sourceOf(name))?.[0], name).toBeUndefined();
    }
  });

  it('import from node:fs only readFileSync, and never node:fs/promises', () => {
    for (const name of READ_ONLY_MODULES) {
      const source = sourceOf(name);
      const imports = [
        ...source.matchAll(
          /import\s+(?:type\s+)?([^;]*?)\s+from\s+['"](?:node:)?fs(?:\/promises)?['"]/g,
        ),
      ].map((match) => (match[1] ?? '').replace(/[{}\s]/g, ''));

      expect(source, name).not.toMatch(/['"](?:node:)?fs\/promises['"]/);
      expect(
        imports.every((imported) => imported === 'readFileSync'),
        name,
      ).toBe(true);
    }
  });
});
