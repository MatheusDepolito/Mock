import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { DEFAULT_TYPES_PATH } from './types-contract.mjs';

/**
 * Permanent anti-`skipLibCheck` proof (ADR 009, D2/D7): the generated
 * `schema.d.ts` is checked on its own, with `skipLibCheck: false`, no global
 * types and only the ES2022 lib, under the strict flags of the workspace's
 * tsconfig.base.json. `openapi-typescript` declares a peer of TypeScript 5
 * while the workspace uses 6, so a clean program is the evidence that the
 * output is valid under the TypeScript the project actually runs.
 */
describe('generated schema.d.ts', () => {
  it('compiles with zero diagnostics under skipLibCheck: false and the strict workspace flags', () => {
    const options = {
      noEmit: true,
      skipLibCheck: false,
      types: [],
      lib: ['lib.es2022.d.ts'],
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: true,
      exactOptionalPropertyTypes: true,
      noUncheckedIndexedAccess: true,
      noImplicitOverride: true,
      useUnknownInCatchVariables: true,
      noFallthroughCasesInSwitch: true,
      forceConsistentCasingInFileNames: true,
      esModuleInterop: true,
      isolatedModules: true,
      resolveJsonModule: true,
    };

    const program = ts.createProgram([DEFAULT_TYPES_PATH], options);
    const diagnostics = ts.getPreEmitDiagnostics(program).map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        '\n',
      );
      const file = diagnostic.file
        ? diagnostic.file.fileName.split('/').pop()
        : '(global)';
      return `${file}: TS${diagnostic.code} ${message}`;
    });

    expect(diagnostics).toEqual([]);
  }, 60_000);

  it('is checked for real: a broken declaration is reported (negative control)', () => {
    const virtual = 'virtual-broken.d.ts';
    const host = ts.createCompilerHost({});
    const original = host.getSourceFile.bind(host);
    host.getSourceFile = (fileName, languageVersion, ...rest) =>
      fileName.endsWith(virtual)
        ? ts.createSourceFile(
            fileName,
            'export const broken: number = "x";',
            languageVersion,
          )
        : original(fileName, languageVersion, ...rest);

    const program = ts.createProgram(
      [virtual],
      {
        noEmit: true,
        skipLibCheck: false,
        types: [],
        lib: ['lib.es2022.d.ts'],
      },
      host,
    );

    expect(ts.getPreEmitDiagnostics(program).length).toBeGreaterThan(0);
  }, 60_000);
});
