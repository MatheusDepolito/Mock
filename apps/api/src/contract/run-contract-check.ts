import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildOpenApiDocument } from './build-openapi-document';
import { compareContract, type ContractDifference } from './compare-contract';
import { serializeOpenApi } from './serialize-openapi';

export type ContractCheckResult =
  | { status: 'equal' }
  | { status: 'missing'; path: string }
  | { status: 'different'; path: string; difference: ContractDifference };

export interface ContractCheckDependencies {
  /** Canonical text of the document generated from the code. */
  buildDocumentText?: () => Promise<string>;
  /** Reads the versioned file; must throw an `ENOENT` error if absent. */
  readFile?: (path: string) => Buffer;
}

/**
 * Read-only contract check: generates the document in memory with the same
 * code as the generator (`buildOpenApiDocument` + `serializeOpenApi`),
 * reads the versioned file and decides by BYTE equality. It never writes
 * anything — this module only imports `readFileSync` from `node:fs`.
 */
export async function runContractCheck(
  filePath: string,
  dependencies: ContractCheckDependencies = {},
): Promise<ContractCheckResult> {
  const buildDocumentText =
    dependencies.buildDocumentText ??
    (async () => serializeOpenApi(await buildOpenApiDocument()));
  const readFile = dependencies.readFile ?? ((path) => readFileSync(path));

  const path = resolve(filePath);
  const generated = Buffer.from(await buildDocumentText(), 'utf8');

  let onDisk: Buffer;
  try {
    onDisk = readFile(path);
  } catch (error) {
    if (isFileNotFound(error)) {
      return { status: 'missing', path: filePath };
    }
    throw error;
  }

  if (generated.equals(onDisk)) {
    return { status: 'equal' };
  }

  const comparison = compareContract(
    generated.toString('utf8'),
    onDisk.toString('utf8'),
  );
  if (comparison.equal) {
    // Different bytes that decode to the same text (e.g. invalid UTF-8).
    // Still drift: report it rather than passing silently.
    return {
      status: 'different',
      path: filePath,
      difference: {
        kind: 'content',
        line: 1,
        column: 1,
        expected: '(byte sequences differ; the decoded texts are equal)',
        actual: '(byte sequences differ; the decoded texts are equal)',
      },
    };
  }

  return {
    status: 'different',
    path: filePath,
    difference: comparison.difference,
  };
}

function isFileNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}
