import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildOpenApiDocument } from './build-openapi-document';
import { serializeOpenApi } from './serialize-openapi';

/**
 * Contract generator CLI. Writes the canonical OpenAPI document to the path
 * given as the (mandatory) first argument:
 *
 *   node dist/apps/api/src/contract/generate-openapi.js <output-path>
 *
 * This is the ONLY module of the contract tooling that writes to disk. It is
 * an explicit, manual action (`yarn contract:generate`) and is never part of
 * `yarn validate`, the pre-commit hook or any pipeline — see ADR 009 (D16).
 */
async function main(): Promise<void> {
  const outputArgument = process.argv[2];

  if (outputArgument === undefined || outputArgument.trim() === '') {
    throw new UsageError(
      'Missing output path. Usage: node generate-openapi.js <output-path>',
    );
  }

  const outputPath = resolve(outputArgument);
  const text = serializeOpenApi(await buildOpenApiDocument());

  mkdirSync(dirname(outputPath), { recursive: true });
  // UTF-8 without BOM; the text already uses `\n` only.
  writeFileSync(outputPath, text, 'utf8');

  console.log(`OpenAPI document written to ${outputArgument}`);
}

class UsageError extends Error {}

main().catch((error: unknown) => {
  if (error instanceof UsageError) {
    console.error(error.message);
  } else {
    console.error('Failed to generate the OpenAPI document:', error);
  }
  process.exitCode = 1;
});
