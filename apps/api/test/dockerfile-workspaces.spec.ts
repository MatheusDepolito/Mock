import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findMissingWorkspaceCopies,
  parseDockerfileStages,
} from './support/dockerfile-workspaces';

const REPO_ROOT = resolve(__dirname, '../../..');
const DOCKERFILES = ['apps/api/Dockerfile', 'apps/worker/Dockerfile'];

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Workspaces from the root `workspaces` globs (`<dir>/*`) that have a package.json. */
function discoverWorkspaces(): string[] {
  const manifest = JSON.parse(
    readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'),
  ) as { workspaces: string[] };

  return manifest.workspaces
    .flatMap((glob) => {
      if (!glob.endsWith('/*')) {
        throw new Error(`Unsupported workspace glob: ${glob}`);
      }
      const directory = glob.slice(0, -2);
      return readdirSync(join(REPO_ROOT, directory), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${directory}/${entry.name}`)
        .filter((workspace) =>
          isFile(join(REPO_ROOT, workspace, 'package.json')),
        );
    })
    .sort();
}

const BUILD_COPY = (ws: string): string =>
  `COPY ${ws}/package.json ./${ws}/package.json`;
const RUNTIME_COPY = (ws: string): string =>
  `COPY --from=build --chown=node:node /app/${ws}/package.json ./${ws}/package.json`;

function syntheticDockerfile(
  workspaces: readonly string[],
  options: { skipBuild?: string; skipRuntime?: string } = {},
): string {
  return [
    '# syntax=docker/dockerfile:1',
    'FROM node:24.18.0-bookworm-slim AS build',
    'WORKDIR /app',
    'COPY package.json yarn.lock .yarnrc.yml ./',
    ...workspaces
      .filter((ws) => ws !== options.skipBuild)
      .map((ws) => BUILD_COPY(ws)),
    'RUN HUSKY=0 yarn install --immutable',
    '',
    'FROM node:24.18.0-bookworm-slim AS runtime',
    'WORKDIR /app',
    'COPY --from=build --chown=node:node /app/package.json /app/yarn.lock /app/.yarnrc.yml ./',
    ...workspaces
      .filter((ws) => ws !== options.skipRuntime)
      .map((ws) => RUNTIME_COPY(ws)),
    'USER node',
  ].join('\n');
}

describe('workspace discovery', () => {
  it('finds the current workspaces from the root package.json globs', () => {
    expect(discoverWorkspaces()).toEqual([
      'apps/api',
      'apps/worker',
      'libs/api-client',
      'libs/config',
      'libs/queue',
    ]);
  });
});

describe('the real Dockerfiles copy the package.json of every workspace', () => {
  const workspaces = discoverWorkspaces();

  it.each(DOCKERFILES)(
    '%s: no workspace missing in the build or runtime stage',
    (dockerfile) => {
      const text = readFileSync(join(REPO_ROOT, dockerfile), 'utf8');

      expect(findMissingWorkspaceCopies(text, workspaces)).toEqual({
        build: [],
        runtime: [],
      });
    },
  );
});

describe('findMissingWorkspaceCopies (synthetic Dockerfiles)', () => {
  const WORKSPACES = ['apps/api', 'libs/a', 'libs/b'];

  it('reports nothing for a complete Dockerfile', () => {
    expect(
      findMissingWorkspaceCopies(syntheticDockerfile(WORKSPACES), WORKSPACES),
    ).toEqual({ build: [], runtime: [] });
  });

  it('flags a workspace whose COPY is missing in the build stage', () => {
    const text = syntheticDockerfile(WORKSPACES, { skipBuild: 'libs/a' });

    expect(findMissingWorkspaceCopies(text, WORKSPACES)).toEqual({
      build: ['libs/a'],
      runtime: [],
    });
  });

  it('flags a workspace whose COPY is missing in the runtime stage', () => {
    const text = syntheticDockerfile(WORKSPACES, { skipRuntime: 'libs/b' });

    expect(findMissingWorkspaceCopies(text, WORKSPACES)).toEqual({
      build: [],
      runtime: ['libs/b'],
    });
  });

  it('flags a brand-new workspace in both stages', () => {
    expect(
      findMissingWorkspaceCopies(syntheticDockerfile(WORKSPACES), [
        ...WORKSPACES,
        'libs/novo',
      ]),
    ).toEqual({ build: ['libs/novo'], runtime: ['libs/novo'] });
  });

  it('does not take a COPY from the wrong stage as satisfying the other', () => {
    const text = [
      'FROM node:24 AS build',
      BUILD_COPY('libs/a'),
      'FROM node:24 AS runtime',
      BUILD_COPY('libs/a'),
    ].join('\n');

    expect(findMissingWorkspaceCopies(text, ['libs/a'])).toEqual({
      build: [],
      runtime: ['libs/a'],
    });
  });

  it('tolerates only whitespace variations, not a loosened pattern', () => {
    const spaced = [
      'FROM node:24 AS build',
      '  COPY   libs/a/package.json    ./libs/a/package.json   ',
      'FROM node:24   AS   runtime',
      '\tCOPY  --from=build   --chown=node:node   /app/libs/a/package.json  ./libs/a/package.json',
    ].join('\n');
    const loosened = [
      'FROM node:24 AS build',
      'COPY libs/a/package.json ./libs/a/', // wrong destination
      'FROM node:24 AS runtime',
      'COPY --from=build /app/libs/a/package.json ./libs/a/package.json', // no --chown
    ].join('\n');

    expect(findMissingWorkspaceCopies(spaced, ['libs/a'])).toEqual({
      build: [],
      runtime: [],
    });
    expect(findMissingWorkspaceCopies(loosened, ['libs/a'])).toEqual({
      build: ['libs/a'],
      runtime: ['libs/a'],
    });
  });

  it('does not confuse a workspace with another that shares its prefix', () => {
    const text = syntheticDockerfile(['libs/api'], {});

    expect(
      findMissingWorkspaceCopies(text, ['libs/api', 'libs/api-client']),
    ).toEqual({ build: ['libs/api-client'], runtime: ['libs/api-client'] });
  });

  it('fails explicitly when a stage is missing instead of passing in silence', () => {
    expect(() =>
      findMissingWorkspaceCopies('FROM node:24\nRUN echo hi\n', WORKSPACES),
    ).toThrow(/no "build" stage/);
    expect(() =>
      findMissingWorkspaceCopies(
        'FROM node:24 AS build\nRUN echo hi\n',
        WORKSPACES,
      ),
    ).toThrow(/no "runtime" stage/);
    expect(() => findMissingWorkspaceCopies('', WORKSPACES)).toThrow(
      /no "build" stage/,
    );
  });
});

describe('parseDockerfileStages', () => {
  it('splits on FROM ... AS <name>, case-insensitively, and handles CRLF', () => {
    const stages = parseDockerfileStages(
      'from node:24 as Build\r\nRUN a\r\nFROM node:24 AS runtime\r\nRUN b\r\n',
    );

    expect(Object.keys(stages)).toEqual(['build', 'runtime']);
    expect(stages['build']).toContain('RUN a');
    expect(stages['build']).not.toContain('RUN b');
    expect(stages['runtime']).toContain('RUN b');
  });
});

describe('this guard only reads files (static)', () => {
  const id = (...parts: string[]): string => parts.join('');
  // Identifiers are assembled from fragments so that this very file does not
  // contain the forbidden words it scans for.
  const FORBIDDEN = new RegExp(
    `\\b(${[
      id('write', 'File'),
      id('write', 'File', 'Sync'),
      id('append', 'File'),
      id('append', 'File', 'Sync'),
      id('m', 'kdir'),
      id('m', 'kdir', 'Sync'),
      id('r', 'm'),
      id('r', 'm', 'Sync'),
      id('re', 'name'),
      id('re', 'name', 'Sync'),
      id('un', 'link'),
      id('un', 'link', 'Sync'),
      id('copy', 'File'),
      id('copy', 'File', 'Sync'),
      id('trun', 'cate'),
      id('trun', 'cate', 'Sync'),
      id('create', 'Write', 'Stream'),
    ].join('|')})\\b`,
  );

  const sourceOf = (path: string): string =>
    readFileSync(join(__dirname, path), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('has no filesystem write identifier in the support module or in the spec', () => {
    for (const path of [
      'support/dockerfile-workspaces.ts',
      'dockerfile-workspaces.spec.ts',
    ]) {
      expect(FORBIDDEN.exec(sourceOf(path))?.[0], path).toBeUndefined();
    }
  });

  it('imports only read functions from node:fs in the spec, and nothing at all in the support module', () => {
    const imported = [
      ...sourceOf('dockerfile-workspaces.spec.ts').matchAll(
        /import\s+\{([^}]*)\}\s+from\s+['"]node:fs['"]/g,
      ),
    ].flatMap((match) =>
      (match[1] ?? '').split(',').map((name) => name.trim()),
    );

    expect(imported.sort()).toEqual([
      'readFileSync',
      'readdirSync',
      'statSync',
    ]);
    expect(sourceOf('support/dockerfile-workspaces.ts')).not.toMatch(
      /from\s+['"](?:node:)?fs/,
    );
  });
});
