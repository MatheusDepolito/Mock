import { argv, exit } from 'node:process';
import { error, log } from 'node:console';
import {
  checkTypes,
  DEFAULT_SPEC_PATH,
  DEFAULT_TYPES_PATH,
} from './types-contract.mjs';

const EXIT_DRIFT_OR_MISSING = 1;
const EXIT_USAGE_OR_ERROR = 2;

/**
 * Read-only check of the generated types:
 *
 *   node check-types.mjs [spec-path] [types-path]
 *
 * Defaults to the versioned `openapi/openapi.json` and
 * `src/generated/schema.d.ts`. Exit 0: the versioned types are
 * byte-identical to the ones generated from the spec. Exit 1: drift, or the
 * types file is missing. Exit 2: invalid usage or an execution error. It
 * never writes — regenerating is the explicit `yarn contract:generate`.
 */
async function main() {
  const args = argv.slice(2);

  if (
    args.length > 2 ||
    args.some((arg) => arg.trim() === '' || arg.startsWith('-'))
  ) {
    error('Usage: node check-types.mjs [spec-path] [types-path]');
    return EXIT_USAGE_OR_ERROR;
  }

  const specPath = args[0] ?? DEFAULT_SPEC_PATH;
  const typesPath = args[1] ?? DEFAULT_TYPES_PATH;
  const result = await checkTypes({ specPath, typesPath });

  if (result.status === 'equal') {
    log(`Generated types are up to date (${typesPath}).`);
    return 0;
  }

  if (result.status === 'missing') {
    error(
      `Generated types file not found: ${result.path}\n` +
        'Run "yarn contract:generate" to create it.',
    );
    return EXIT_DRIFT_OR_MISSING;
  }

  const { difference } = result;
  error(
    `Generated types drift: ${result.path} differs from the types generated from ${specPath}.\n` +
      `  First difference (${difference.kind}) at line ${difference.line}, column ${difference.column}:\n` +
      `    generated: ${difference.expected}\n` +
      `    file     : ${difference.actual}\n` +
      'Run "yarn contract:generate" and review the diff.',
  );
  return EXIT_DRIFT_OR_MISSING;
}

main()
  .then((code) => exit(code))
  .catch((failure) => {
    error(
      'Failed to check the generated types:',
      failure instanceof Error ? failure.message : failure,
    );
    exit(EXIT_USAGE_OR_ERROR);
  });
