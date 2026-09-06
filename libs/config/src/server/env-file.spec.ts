import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadEnvFile } from './env-file';
import { loadServerConfig } from './index';

const MANAGED_KEYS = [
  'NODE_ENV',
  'PORT',
  'HOST',
  'LOG_LEVEL',
  'CORS_ALLOWED_ORIGINS',
  'RATE_LIMIT_TTL_MS',
  'RATE_LIMIT_LIMIT',
] as const;

describe('loadEnvFile', () => {
  let dir: string;
  let originalValues: Record<string, string | undefined>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mockp-config-env-'));
    // process.env is a single global object shared by the whole test
    // process — save and restore it so this suite never leaks state into
    // any other test file.
    originalValues = Object.fromEntries(
      MANAGED_KEYS.map((key) => [key, process.env[key]]),
    );
    for (const key of MANAGED_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const key of MANAGED_KEYS) {
      if (originalValues[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValues[key];
      }
    }
  });

  it('does not throw when the file is absent', () => {
    const missingPath = join(dir, 'does-not-exist.env');

    expect(() => loadEnvFile(missingPath)).not.toThrow();
  });

  it('actually changes PORT, CORS_ALLOWED_ORIGINS and the rate limit before validation', () => {
    const envPath = join(dir, '.env');
    writeFileSync(
      envPath,
      [
        'PORT=4321',
        'CORS_ALLOWED_ORIGINS=https://from-dotenv.example.com',
        'RATE_LIMIT_LIMIT=7',
        'RATE_LIMIT_TTL_MS=9000',
      ].join('\n'),
    );

    // Before loading: none of these are set, so loadServerConfig would
    // fall back to its own defaults.
    expect(process.env['PORT']).toBeUndefined();

    loadEnvFile(envPath);

    expect(process.env['PORT']).toBe('4321');
    expect(process.env['CORS_ALLOWED_ORIGINS']).toBe(
      'https://from-dotenv.example.com',
    );

    const config = loadServerConfig(process.env);

    expect(config.port).toBe(4321);
    expect(config.corsAllowedOrigins).toEqual([
      'https://from-dotenv.example.com',
    ]);
    expect(config.rateLimit).toEqual({ ttlMs: 9000, limit: 7 });
  });

  it('preserves the precedence of variables already set on the process', () => {
    const envPath = join(dir, '.env');
    writeFileSync(envPath, 'PORT=5555\n');

    process.env['PORT'] = '6000';

    loadEnvFile(envPath);

    // The file must not override a value the process already had.
    expect(process.env['PORT']).toBe('6000');
    expect(loadServerConfig(process.env).port).toBe(6000);
  });

  it('propagates errors other than a missing file', () => {
    // A directory can never be opened as a file — loadEnvFile must not
    // swallow this the way it swallows ENOENT.
    expect(() => loadEnvFile(dir)).toThrow();
  });
});
