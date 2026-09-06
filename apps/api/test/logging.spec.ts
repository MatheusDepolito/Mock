import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp } from './support/create-test-app';

class CapturingStream extends Writable {
  readonly lines: string[] = [];

  override _write(
    chunk: Buffer | string,
    _encoding: string,
    callback: (error?: Error | null) => void,
  ): void {
    this.lines.push(chunk.toString());
    callback();
  }

  get text(): string {
    return this.lines.join('');
  }

  /** Parses every non-empty captured line as JSON — throws if any line isn't. */
  parsedLines(): Record<string, unknown>[] {
    return this.lines
      .flatMap((chunk) => chunk.split('\n'))
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }
}

describe('Log redaction and structure', () => {
  let app: INestApplication;
  let capturing: CapturingStream;

  const SECRET_TOKEN = 'Bearer super-secret-token-should-not-leak';
  const SECRET_COOKIE = 'session=must-not-leak-either';

  beforeAll(async () => {
    capturing = new CapturingStream();
    ({ app } = await createTestApp({
      loggerStream: capturing,
      // The default test log level is 'silent' (see TEST_SERVER_CONFIG) so
      // other suites stay quiet; this one needs actual output to inspect.
      configOverrides: { logLevel: 'info' },
      includeTestingSupport: true,
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('every captured line is valid, structured JSON', async () => {
    await request(app.getHttpServer()).get('/api/v1/health/live');

    expect(capturing.lines.length).toBeGreaterThan(0);
    expect(() => capturing.parsedLines()).not.toThrow();
  });

  it('never writes the authorization or cookie header value to logs', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('Authorization', SECRET_TOKEN)
      .set('Cookie', SECRET_COOKIE);

    expect(capturing.text).not.toContain(SECRET_TOKEN);
    expect(capturing.text).not.toContain('must-not-leak-either');
    expect(capturing.text).toContain('[Redacted]');
  });

  it('includes the effective X-Request-Id in the structured log', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('X-Request-Id', 'log-correlation-check');

    expect(response.headers['x-request-id']).toBe('log-correlation-check');

    const matchingLine = capturing
      .parsedLines()
      .find(
        (line) =>
          (line['req'] as Record<string, unknown> | undefined)?.['id'] ===
          'log-correlation-check',
      );
    expect(matchingLine).toBeDefined();
  });

  it('logs the simulated unhandled exception as structured Pino JSON, not via the default console logger', async () => {
    capturing.lines.length = 0;

    const response = await request(app.getHttpServer()).get(
      '/api/v1/__test__/boom',
    );
    expect(response.status).toBe(500);

    const lines = capturing.parsedLines();
    const errorLine = lines.find(
      (line) =>
        typeof line['msg'] === 'string' &&
        (line['msg'] as string).includes('Unhandled exception'),
    );

    // If app.useLogger(pinoLogger) were missing, this log would instead go
    // to Nest's default ConsoleLogger as plain text (e.g. "[Nest] 123  -
    // ... ERROR [ProblemDetailsFilter] ..."), which would never reach this
    // JSON stream at all.
    expect(errorLine).toBeDefined();
    expect(errorLine?.['level']).toBeTypeOf('number');
    expect(capturing.text).not.toContain('[Nest]');
  });
});
