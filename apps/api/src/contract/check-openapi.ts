import 'reflect-metadata';
import { runContractCheck } from './run-contract-check';

const EXIT_DRIFT_OR_MISSING = 1;
const EXIT_USAGE_OR_ERROR = 2;

/**
 * Read-only contract check CLI:
 *
 *   node dist/apps/api/src/contract/check-openapi.js <openapi-file>
 *
 * Exit 0: the versioned file is byte-identical to the document generated
 * from the code. Exit 1: drift, or the file is missing. Exit 2: missing
 * argument or an execution error. It never writes to disk — regenerating is
 * the explicit `yarn contract:generate` — and it is not wired into
 * `yarn validate` yet (a later subtask does that).
 */
async function main(): Promise<number> {
  const fileArgument = process.argv[2];

  if (fileArgument === undefined || fileArgument.trim() === '') {
    console.error(
      'Missing OpenAPI file path. Usage: node check-openapi.js <openapi-file>',
    );
    return EXIT_USAGE_OR_ERROR;
  }

  const result = await runContractCheck(fileArgument);

  if (result.status === 'equal') {
    console.log(`OpenAPI contract is up to date (${fileArgument}).`);
    return 0;
  }

  if (result.status === 'missing') {
    console.error(
      `OpenAPI contract file not found: ${result.path}\n` +
        'Run "yarn contract:generate" to create it.',
    );
    return EXIT_DRIFT_OR_MISSING;
  }

  const { difference } = result;
  console.error(
    `OpenAPI contract drift: ${result.path} differs from the document generated from the code.\n` +
      `  First difference (${difference.kind}) at line ${difference.line}, column ${difference.column}:\n` +
      `    generated: ${difference.expected}\n` +
      `    file     : ${difference.actual}\n` +
      'Run "yarn contract:generate" and review the diff.',
  );
  return EXIT_DRIFT_OR_MISSING;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error('Failed to check the OpenAPI contract:', error);
    process.exitCode = EXIT_USAGE_OR_ERROR;
  });
