export type TokenGroup =
  'color' | 'spacing' | 'radius' | 'shadow' | 'breakpoint' | 'font';

export interface ThemeToken {
  /** Custom property name, e.g. `--color-primary`. */
  name: string;
  /** Value as written in `@theme`, e.g. `var(--scale-brand-600)`. */
  value: string;
  /** Value with the internal scale reference resolved. */
  resolved: string;
  group: TokenGroup;
}

export interface TokenTableRow {
  token: string;
  utilities: string;
  role: string;
}

/** Thrown for any malformed input: the page must fail loudly, never render empty. */
export class TokenParseError extends Error {
  constructor(message: string) {
    super(`tokens: ${message}`);
    this.name = 'TokenParseError';
  }
}

const GROUPS: ReadonlyArray<readonly [string, TokenGroup]> = [
  ['--color-', 'color'],
  ['--spacing', 'spacing'],
  ['--radius-', 'radius'],
  ['--shadow-', 'shadow'],
  ['--breakpoint-', 'breakpoint'],
  ['--font-', 'font'],
];

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Body of the first block opened by `header`, matching braces. */
function blockBody(css: string, header: string): string | null {
  const start = css.indexOf(header);
  if (start === -1) return null;
  const open = css.indexOf('{', start);
  if (open === -1) throw new TokenParseError(`"${header}" has no block`);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    const char = css[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, index);
    }
  }
  throw new TokenParseError(`"${header}" block is not closed`);
}

const DECLARATION = /(--[\w*-]+)\s*:\s*([^;]+);/g;

function declarations(body: string, where: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of body.matchAll(DECLARATION)) {
    const [, name, value] = match;
    if (name === undefined || value === undefined) continue;
    map.set(name, value.replace(/\s+/g, ' ').trim());
  }
  // Anything that is not a complete declaration (for example a missing `;`)
  // means the block is malformed.
  const leftover = body.replace(DECLARATION, '').trim();
  if (leftover !== '') {
    throw new TokenParseError(`unparsed text in ${where}: "${leftover}"`);
  }
  return map;
}

/**
 * Semantic tokens of the `@theme` block of `tokens.css`, with the internal
 * `--scale-*` references resolved. Resets (`--color-*: initial`) are skipped.
 */
export function parseThemeTokens(css: string): ThemeToken[] {
  const code = stripComments(css);
  const themeBody = blockBody(code, '@theme');
  if (themeBody === null) throw new TokenParseError('no @theme block found');
  const rootBody = blockBody(code, ':root');
  const scales =
    rootBody === null
      ? new Map<string, string>()
      : declarations(rootBody, ':root');
  const tokens: ThemeToken[] = [];
  for (const [name, value] of declarations(themeBody, '@theme')) {
    if (name.endsWith('*')) continue;
    const group = GROUPS.find(([prefix]) => name.startsWith(prefix))?.[1];
    if (group === undefined) {
      throw new TokenParseError(`unknown token group for ${name}`);
    }
    const reference = /^var\((--[\w-]+)\)$/.exec(value);
    let resolved = value;
    if (reference?.[1] !== undefined) {
      const scale = scales.get(reference[1]);
      if (scale === undefined) {
        throw new TokenParseError(`${name} references missing ${reference[1]}`);
      }
      resolved = scale;
    }
    if (resolved.includes('var(')) {
      throw new TokenParseError(`${name} has an unresolved reference`);
    }
    tokens.push({ name, value, resolved, group });
  }
  if (tokens.length === 0) throw new TokenParseError('@theme has no tokens');
  return tokens;
}

/**
 * Rows of the first table under the "Design tokens" heading of the library
 * README: token, Tailwind utilities, role.
 */
export function parseTokenTable(markdown: string): TokenTableRow[] {
  const lines = markdown.split('\n');
  const heading = lines.findIndex((line) =>
    /^##\s+Design tokens\s*$/.test(line),
  );
  if (heading === -1)
    throw new TokenParseError('README has no "Design tokens" section');
  const start = lines.findIndex(
    (line, index) => index > heading && line.trimStart().startsWith('|'),
  );
  if (start === -1) throw new TokenParseError('README has no token table');
  const table: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!line.trimStart().startsWith('|')) break;
    table.push(line);
  }
  // header + separator + at least one row
  if (table.length < 3)
    throw new TokenParseError('README token table is empty');
  return table.slice(2).map((line) => {
    const cells = line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());
    const [token, utilities, role] = cells;
    if (cells.length !== 3 || !token || !utilities || !role) {
      throw new TokenParseError(`malformed README table row: "${line}"`);
    }
    return { token, utilities, role };
  });
}
