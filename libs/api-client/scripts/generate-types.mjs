import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { argv, exit } from 'node:process';
import { error, log } from 'node:console';
import {
  DEFAULT_SPEC_PATH,
  DEFAULT_TYPES_PATH,
  generateTypesText,
} from './types-contract.mjs';

/**
 * Generates the types from the versioned OpenAPI document:
 *
 *   node generate-types.mjs [spec-path] [output-path]
 *
 * Defaults to `openapi/openapi.json` -> `src/generated/schema.d.ts`. This is
 * the ONLY script of the types tooling that writes to disk. It is an
 * explicit, manual action (`yarn contract:generate`) and is never part of
 * `yarn validate`, the pre-commit hook or any pipeline (ADR 009, D16).
 */
async function main() {
  const args = argv.slice(2);

  if (
    args.length > 2 ||
    args.some((arg) => arg.trim() === '' || arg.startsWith('-'))
  ) {
    error('Usage: node generate-types.mjs [spec-path] [output-path]');
    return 2;
  }

  const specPath = args[0] ?? DEFAULT_SPEC_PATH;
  const outputPath = resolve(args[1] ?? DEFAULT_TYPES_PATH);
  const text = await generateTypesText(specPath);

  mkdirSync(dirname(outputPath), { recursive: true });
  // UTF-8 without BOM; the text already uses `\n` only.
  writeFileSync(outputPath, text, 'utf8');

  log(`Generated types written to ${outputPath}`);
  return 0;
}

main()
  .then((code) => exit(code))
  .catch((failure) => {
    error(
      'Failed to generate the types:',
      failure instanceof Error ? failure.message : failure,
    );
    exit(2);
  });
