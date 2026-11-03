/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TokenParseError,
  parseThemeTokens,
  parseTokenTable,
} from './tokens-parser';

const read = (...path: string[]) =>
  readFileSync(join(import.meta.dirname, '..', '..', ...path), 'utf8');

describe('parseThemeTokens (real tokens.css)', () => {
  const tokens = parseThemeTokens(read('src', 'styles', 'tokens.css'));
  const names = (group: string) =>
    tokens.filter((t) => t.group === group).map((t) => t.name);

  it('lists the semantic tokens of every group', () => {
    expect(names('color')).toEqual([
      '--color-primary',
      '--color-primary-foreground',
      '--color-surface',
      '--color-surface-raised',
      '--color-content',
      '--color-content-muted',
      '--color-border',
      '--color-danger',
      '--color-success',
    ]);
    expect(names('radius')).toEqual([
      '--radius-none',
      '--radius-sm',
      '--radius-md',
    ]);
    expect(names('shadow')).toEqual(['--shadow-card']);
    expect(names('breakpoint')).toEqual([
      '--breakpoint-sm',
      '--breakpoint-md',
      '--breakpoint-lg',
    ]);
    expect(names('font')).toEqual(['--font-sans']);
    expect(names('spacing')).toEqual(['--spacing']);
  });

  it('resolves the internal scale references to literal values', () => {
    const primary = tokens.find((t) => t.name === '--color-primary');
    expect(primary?.value).toBe('var(--scale-brand-600)');
    expect(primary?.resolved).toBe('hsl(210 80% 42%)');
    expect(
      tokens.find((t) => t.name === '--color-surface-raised')?.resolved,
    ).toBe('hsl(0 0% 100%)');
  });

  it('never lists the internal scales or the resets', () => {
    expect(tokens.some((t) => t.name.startsWith('--scale-'))).toBe(false);
    expect(tokens.some((t) => t.name.endsWith('*'))).toBe(false);
    expect(tokens.every((t) => !t.resolved.includes('var('))).toBe(true);
  });
});

describe('parseThemeTokens (malformed input fails loudly)', () => {
  it('fails without an @theme block', () => {
    expect(() => parseThemeTokens(':root { --a: 1; }')).toThrow(
      TokenParseError,
    );
  });

  it('fails on a block that is not closed', () => {
    expect(() => parseThemeTokens('@theme { --color-a: red;')).toThrow(
      /not closed/,
    );
  });

  it('fails on a declaration without the final semicolon', () => {
    expect(() => parseThemeTokens('@theme { --color-a: red }')).toThrow(
      /unparsed text/,
    );
  });

  it('fails on an empty @theme block', () => {
    expect(() => parseThemeTokens('@theme { --color-*: initial; }')).toThrow(
      /no tokens/,
    );
  });

  it('fails on a reference to a missing scale', () => {
    expect(() =>
      parseThemeTokens(':root { } @theme { --color-a: var(--scale-x-1); }'),
    ).toThrow(/missing/);
  });

  it('fails on an unknown token group, so the page gets updated', () => {
    expect(() => parseThemeTokens('@theme { --text-big: 2rem; }')).toThrow(
      /unknown token group/,
    );
  });
});

describe('parseTokenTable', () => {
  it('reads the token contract table of the real README', () => {
    const rows = parseTokenTable(read('README.md'));
    expect(rows.length).toBeGreaterThanOrEqual(9);
    const primary = rows.find((r) => r.token === '`--color-primary`');
    expect(primary?.utilities).toContain('`bg-primary`');
    expect(primary?.role).not.toBe('');
  });

  it('fails without the section, the table or with a malformed row', () => {
    expect(() => parseTokenTable('# nothing')).toThrow(TokenParseError);
    expect(() => parseTokenTable('## Design tokens\n\ntext only')).toThrow(
      /no token table/,
    );
    expect(() =>
      parseTokenTable('## Design tokens\n\n| a | b | c |\n| - | - | - |'),
    ).toThrow(/empty/);
    expect(() =>
      parseTokenTable(
        '## Design tokens\n\n| a | b | c |\n| - | - | - |\n| x | y |',
      ),
    ).toThrow(/malformed/);
  });
});
