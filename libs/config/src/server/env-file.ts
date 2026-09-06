/**
 * Loads a `.env` file into `process.env` using Node 24's native
 * `process.loadEnvFile()` — no `dotenv` dependency. Must run before
 * `loadServerConfig()` reads `process.env`, otherwise values set only in
 * the file are invisible to validation.
 *
 * - A missing file is not an error: local dev without a `.env` (relying on
 *   defaults, or on variables already present in the environment) is a
 *   supported configuration.
 * - Any other failure (e.g. a malformed file, or a permissions error)
 *   propagates — silently ignoring those would let a broken `.env` look
 *   like "no `.env`" and mask a real problem.
 * - `process.loadEnvFile()` does not override variables already present in
 *   `process.env`, so real process/CI environment variables still take
 *   precedence over the file — this function relies on that native
 *   behavior rather than reimplementing it.
 */
export function loadEnvFile(path?: string): void {
  try {
    if (path === undefined) {
      process.loadEnvFile();
    } else {
      process.loadEnvFile(path);
    }
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return;
    }

    throw error;
  }
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}
