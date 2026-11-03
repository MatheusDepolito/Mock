/**
 * Single source of truth of the architecture guards of `libs/ui`
 * (ADR 003 and ADR 010, D4 and D12). Imported by `eslint.config.mjs` (the
 * `no-restricted-imports` options) and by `architecture.spec.mjs` (the
 * permanent tests), so both always enforce the same lists.
 *
 * Pure module: strings in, data out. It reads nothing from disk and lives
 * outside `src/`, so it is never part of the package surface.
 */

/** The library itself: the only `@mockp/*` specifier it may import. */
export const LIB_PACKAGE = '@mockp/ui';

/** Packages forbidden as imports and as dependencies (matched with their subpaths). */
export const FORBIDDEN_PACKAGES = [
  'next',
  'next-auth',
  'graphql',
  'ioredis',
  'bullmq',
  'pg',
];

/** Scopes forbidden as imports and as dependencies (every package under them). */
export const FORBIDDEN_SCOPES = [
  '@tanstack',
  '@auth',
  '@apollo',
  '@mui',
  '@emotion',
  '@prisma',
  '@nestjs',
];

/** Workspace packages named in the messages (all of `@mockp/*` but the lib is forbidden). */
export const FORBIDDEN_WORKSPACE_PACKAGES = [
  '@mockp/api-client',
  '@mockp/config',
  '@mockp/queue',
];

/** Strings that mark the definition of design tokens (owned by `libs/ui`). */
export const TOKEN_MARKERS = [
  '@theme',
  '--color-',
  '--scale-',
  '--breakpoint-',
  '--radius-',
  '--shadow-',
  '--font-sans',
];

/** Deepest directory level (src = 1) whose relative imports ESLint checks exactly. */
export const MAX_SRC_DEPTH = 8;

const SOURCE_FILE = /\.(?:ts|tsx)$/;
const SPEC_FILE = /\.(?:spec|test)\.(?:ts|tsx)$/;

/** Package name of a bare specifier (`@a/b/c` -> `@a/b`, `a/b` -> `a`). */
export function packageName(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

export function isRelativeOrAbsolute(specifier) {
  return (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(specifier)
  );
}

/** True for a bare specifier that `libs/ui` must never import or depend on. */
export function isForbiddenPackage(specifier) {
  if (isRelativeOrAbsolute(specifier)) return false;
  const name = packageName(specifier);
  const scope = name.startsWith('@') ? name.split('/')[0] : null;
  if (scope === '@mockp') return name !== LIB_PACKAGE;
  if (scope !== null && FORBIDDEN_SCOPES.includes(scope)) return true;
  return FORBIDDEN_PACKAGES.includes(name);
}

/**
 * True when a relative or absolute specifier, imported from `filePath`
 * (relative to `libs/ui`, e.g. `src/atoms/Button.tsx`), resolves outside
 * the library folder.
 */
export function escapesLibrary(filePath, specifier) {
  if (!isRelativeOrAbsolute(specifier)) return false;
  if (!specifier.startsWith('.')) return true;
  const stack = filePath.split('/').slice(0, -1);
  for (const segment of specifier.split('/')) {
    if (segment === '..') {
      if (stack.length === 0) return true;
      stack.pop();
    } else if (segment !== '.' && segment !== '') {
      stack.push(segment);
    }
  }
  return false;
}

export function referencesAppsDirectory(specifier) {
  return specifier.includes('/apps/');
}

/** Forbidden names found among the dependency maps of a parsed package.json. */
export function forbiddenDependencies(manifest) {
  const found = [];
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      if (isForbiddenPackage(name)) found.push(`${field}:${name}`);
    }
  }
  return found;
}

/** Removes comments so that commented-out code and notes are not scanned. */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

const SPECIFIER_PATTERNS = [
  // import x from 'a' / import type { x } from 'a' / export * from 'a' / export { x } from 'a'
  /\b(?:import|export)\b[^'"`;]*?\bfrom\s*(['"])([^'"]+)\1/g,
  // import 'a'
  /\bimport\s*(['"])([^'"]+)\1/g,
  // import('a') and typeof import('a')
  /\bimport\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g,
  // require('a') and import x = require('a')
  /\brequire\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g,
];

/** Every module specifier a source file imports (static, dynamic, require, re-export). */
export function extractSpecifiers(source) {
  const code = stripComments(source);
  const found = [];
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of code.matchAll(pattern)) found.push(match[2]);
  }
  return found;
}

const COLOR_PATTERNS = [
  [
    'hex',
    /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_])/g,
  ],
  ['color-function', /\b(?:rgba?|hsla?|oklch)\(/g],
  ['arbitrary-color', /-\[\s*(?:#|rgba?\(|hsla?\(|oklch\()/g],
];

/** Hard-coded colors in a source text. */
export function findHardcodedColors(source) {
  const code = stripComments(source);
  const found = [];
  for (const [kind, pattern] of COLOR_PATTERNS) {
    for (const match of code.matchAll(pattern)) {
      found.push({ kind, match: match[0] });
    }
  }
  return found;
}

/** Token-definition markers present in a text. */
export function findTokenMarkers(source) {
  return TOKEN_MARKERS.filter((marker) => source.includes(marker));
}

export function isTailwindConfigFile(fileName) {
  return /^tailwind\.config\./.test(fileName);
}

export function isSourceFile(filePath) {
  return SOURCE_FILE.test(filePath);
}

export function isSpecFile(filePath) {
  return SPEC_FILE.test(filePath);
}

/**
 * Violations of one file of `libs/ui/src`. `filePath` is relative to
 * `libs/ui` (e.g. `src/atoms/Button.tsx`). Hard-coded colors are only
 * checked in non-spec `.ts`/`.tsx` files.
 */
export function findViolations(filePath, source) {
  const violations = [];
  for (const specifier of extractSpecifiers(source)) {
    if (isForbiddenPackage(specifier)) {
      violations.push({ rule: 'forbidden-import', detail: specifier });
    }
    if (escapesLibrary(filePath, specifier)) {
      violations.push({ rule: 'import-outside-library', detail: specifier });
    }
    if (referencesAppsDirectory(specifier)) {
      violations.push({ rule: 'import-from-apps', detail: specifier });
    }
  }
  if (isSourceFile(filePath) && !isSpecFile(filePath)) {
    for (const { kind, match } of findHardcodedColors(source)) {
      violations.push({ rule: 'hardcoded-color', detail: `${kind}: ${match}` });
    }
  }
  return violations;
}

const MESSAGE =
  'libs/ui is isolated from the API, auth, data fetching, server-only code and domain (ADR 003, ADR 010 D12).';

/**
 * Options of ESLint's `no-restricted-imports` for a file at directory depth
 * `depth` (`src` = 1): bare specifiers are the same for every file, relative
 * ones are forbidden once they climb past the library root.
 */
export function restrictedImportsOptions(depth) {
  const hops = Array.from({ length: depth + 1 }, () => '..');
  return {
    paths: [
      ...[...FORBIDDEN_PACKAGES, ...FORBIDDEN_WORKSPACE_PACKAGES].map(
        (name) => ({ name, message: MESSAGE }),
      ),
      { name: hops.join('/'), message: MESSAGE },
    ],
    patterns: [
      {
        group: [
          ...FORBIDDEN_PACKAGES.map((name) => `${name}/*`),
          ...FORBIDDEN_SCOPES.map((scope) => `${scope}/*`),
          '@mockp/*',
          `!${LIB_PACKAGE}`,
          `!${LIB_PACKAGE}/*`,
        ],
        message: MESSAGE,
      },
      { group: [`${hops.join('/')}/*`], message: MESSAGE },
      { group: ['**/apps/**'], message: MESSAGE },
    ],
  };
}

/** `files` glob of the sources at directory depth `depth` (`src` = 1). */
export function srcGlobForDepth(depth) {
  return `src/${'*/'.repeat(depth - 1)}*.{ts,tsx}`;
}
