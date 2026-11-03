/**
 * Local types for `jest-axe` (test-only; not exported by the package).
 *
 * `@types/jest-axe` is not used: it depends on `@types/jest`, which redeclares
 * the global `expect` and conflicts with `vitest/globals` (ADR 010, D22).
 * Only what the specs use is declared; the Vitest matcher augmentation lives
 * in `vitest.setup.ts`.
 */
declare module 'jest-axe' {
  import type { AxeResults, RunOptions } from 'axe-core';

  /** Runs axe on an element (or an HTML string) and resolves with its results. */
  export function axe(
    html: Element | string,
    options?: RunOptions,
  ): Promise<AxeResults>;

  /** Matcher object for `expect.extend`. */
  export const toHaveNoViolations: {
    toHaveNoViolations(results?: Partial<AxeResults>): {
      pass: boolean;
      message(): string;
    };
  };
}
