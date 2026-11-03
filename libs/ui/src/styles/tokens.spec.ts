/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const tokensCss = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8');

const SEMANTIC_COLORS = [
  '--color-border',
  '--color-content',
  '--color-content-muted',
  '--color-danger',
  '--color-primary',
  '--color-primary-foreground',
  '--color-success',
  '--color-surface',
  '--color-surface-raised',
];

const WHITE = 'hsl(0 0% 100%)';
const MIN_CONTRAST = 4.5;

const css = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '');

/** Body of the first block opened by `header` (the tokens have no nested braces). */
function blockBody(header: string): string {
  const start = css.indexOf(header);
  if (start === -1) throw new Error(`block not found: ${header}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

function declarations(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of body.matchAll(/(--[\w*-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      map.set(name, value.replace(/\s+/g, ' ').trim());
    }
  }
  return map;
}

const root = declarations(blockBody(':root'));
const theme = declarations(blockBody('@theme'));

const semanticColors = [...theme.keys()].filter(
  (name) => name.startsWith('--color-') && name !== '--color-*',
);

/** Resolves a semantic color to its literal `hsl(...)` value. */
function resolve(name: string): string {
  const value = theme.get(name);
  if (value === undefined) throw new Error(`missing token ${name}`);
  const ref = /^var\((--scale-[a-z]+-\d+)\)$/.exec(value);
  if (ref?.[1] === undefined) return value;
  const scale = root.get(ref[1]);
  if (scale === undefined) throw new Error(`missing scale ${ref[1]}`);
  return scale;
}

function hslToRgb(hsl: string): [number, number, number] {
  const match =
    /^hsl\((\d+(?:\.\d+)?) (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%\)$/.exec(hsl);
  if (
    match?.[1] === undefined ||
    match[2] === undefined ||
    match[3] === undefined
  ) {
    throw new Error(`not an hsl() literal: ${hsl}`);
  }
  const h = Number(match[1]);
  const s = Number(match[2]) / 100;
  const l = Number(match[3]) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const sectors: ReadonlyArray<readonly [number, number, number]> = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r, g, b] = sectors[Math.floor(h / 60) % 6] as readonly [
    number,
    number,
    number,
  ];
  return [r + m, g + m, b + m];
}

function luminance(hsl: string): number {
  const [r, g, b] = hslToRgb(hsl).map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [
    luminance(resolve(foreground)),
    luminance(resolve(background)),
  ].sort((a, b) => b - a) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

describe('tokens.css — contract of semantic names (D2, D2b, D3, D4)', () => {
  it('defines exactly the semantic colors of the contract', () => {
    expect([...semanticColors].sort()).toEqual(SEMANTIC_COLORS);
  });

  it('does not define --color-text (the text color is --color-content)', () => {
    expect(css).not.toMatch(/--color-text\b/);
  });

  it('references a scale via var(--scale-*) or the literal white', () => {
    for (const name of semanticColors) {
      const value = theme.get(name);
      const isScaleRef = /^var\(--scale-[a-z]+-\d+\)$/.test(value ?? '');
      expect(isScaleRef || value === WHITE, name).toBe(true);
      if (isScaleRef) expect(() => resolve(name), name).not.toThrow();
    }
  });

  it('keeps the scales outside @theme (they must not generate utilities)', () => {
    expect([...theme.keys()].filter((n) => n.startsWith('--scale-'))).toEqual(
      [],
    );
    expect([...root.keys()].every((n) => n.startsWith('--scale-'))).toBe(true);
  });

  it('resets the Tailwind defaults so the theme is a closed list', () => {
    for (const reset of [
      '--color-*',
      '--radius-*',
      '--shadow-*',
      '--inset-shadow-*',
      '--drop-shadow-*',
      '--text-shadow-*',
      '--breakpoint-*',
      '--font-*',
    ]) {
      expect(theme.get(reset), reset).toBe('initial');
    }
  });

  it('defines only --font-sans as the font token (D18)', () => {
    expect(
      [...theme.keys()].filter(
        (name) => name.startsWith('--font-') && name !== '--font-*',
      ),
    ).toEqual(['--font-sans']);
  });
});

describe('tokens.css — WCAG AA contrast (>= 4.5:1) of the provisional values', () => {
  it.each([
    ['--color-content', '--color-surface'],
    ['--color-content', '--color-surface-raised'],
    ['--color-content-muted', '--color-surface'],
    ['--color-primary-foreground', '--color-primary'],
    ['--color-danger', '--color-surface'],
    ['--color-success', '--color-surface'],
    ['--color-success', '--color-surface-raised'],
  ])('%s on %s', (foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(
      MIN_CONTRAST,
    );
  });
});
