// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import {
  escapesLibrary,
  extractSpecifiers,
  findHardcodedColors,
  findTokenMarkers,
  findViolations,
  forbiddenDependencies,
  isForbiddenPackage,
  isTailwindConfigFile,
  referencesAppsDirectory,
} from './rules.mjs';

/**
 * Permanent guards of `libs/ui` (ADR 003, ADR 010 D4 and D12). Pure rules
 * are tested with positive and negative fixtures; the real scans only read
 * the repository (read, list and stat — nothing is ever changed).
 */

const LIB_ROOT = join(import.meta.dirname, '..');
const REPO_ROOT = join(LIB_ROOT, '..', '..');
const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'generated',
  'storybook-static',
  '.nx',
]);
const TEXT_FILE =
  /\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts|css|scss|sass|less|html)$/;

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        files.push(...listFiles(join(directory, entry.name)));
      }
    } else if (entry.isFile()) {
      files.push(join(directory, entry.name));
    }
  }
  return files;
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

const posix = (path) => path.split('\\').join('/');

describe('forbidden imports (pure rules)', () => {
  it.each([
    ["import api from '@mockp/api-client';", '@mockp/api-client'],
    [
      "import { loadServerConfig } from '@mockp/config/server';",
      '@mockp/config/server',
    ],
    ["import { queue } from '@mockp/queue';", '@mockp/queue'],
    ["import { other } from '@mockp/anything-else';", '@mockp/anything-else'],
    [
      "import { useQuery } from '@tanstack/react-query';",
      '@tanstack/react-query',
    ],
    ["import Link from 'next/link';", 'next/link'],
    ["import next from 'next';", 'next'],
    ["import { signIn } from 'next-auth/react';", 'next-auth/react'],
    ["import auth from 'next-auth';", 'next-auth'],
    ["import { x } from '@auth/core';", '@auth/core'],
    ["import { gql } from '@apollo/client';", '@apollo/client'],
    ["import { parse } from 'graphql';", 'graphql'],
    ["import { Button } from '@mui/material';", '@mui/material'],
    ["import styled from '@emotion/styled';", '@emotion/styled'],
    ["import { PrismaClient } from '@prisma/client';", '@prisma/client'],
    ["import { Injectable } from '@nestjs/common';", '@nestjs/common'],
    ["import Redis from 'ioredis';", 'ioredis'],
    ["import { Queue } from 'bullmq';", 'bullmq'],
    ["import { Pool } from 'pg';", 'pg'],
    ["import type { Props } from '@mockp/config';", '@mockp/config'],
    ["export * from '@tanstack/query-core';", '@tanstack/query-core'],
    ["export { thing } from 'next/navigation';", 'next/navigation'],
    ["import '@mockp/api-client';", '@mockp/api-client'],
    ["const mod = await import('@prisma/client');", '@prisma/client'],
    ["const mod = require('ioredis');", 'ioredis'],
    ['const mod = require(`bullmq`);', 'bullmq'],
    ["type T = typeof import('next/link');", 'next/link'],
    ["import {\n  a,\n  b,\n} from '@mockp/queue';", '@mockp/queue'],
  ])('flags %j', (source, specifier) => {
    expect(extractSpecifiers(source)).toContain(specifier);
    const violations = findViolations('src/atoms/Example.tsx', source);
    expect(violations).toContainEqual({
      rule: 'forbidden-import',
      detail: specifier,
    });
  });

  it.each([
    "import { useState } from 'react';",
    "import { Dialog } from '@headlessui/react';",
    "import { IconX } from '@tabler/icons-react';",
    "import clsx from 'clsx';",
    "import { readFileSync } from 'node:fs';",
    "import styles from '@mockp/ui/styles.css';",
    "import { Button } from '@mockp/ui';",
    "import { Button } from './Button';",
    "import { Button } from '../atoms/Button';",
    "import { Label } from '../../atoms/Label';",
    "import next_ from 'nextjs-like-name';",
    "import { x } from 'pg-like-name';",
  ])('does not flag %j', (source) => {
    expect(findViolations('src/molecules/Dialog/Dialog.tsx', source)).toEqual(
      [],
    );
  });

  it('ignores imports that only appear in comments', () => {
    const source = [
      "// import Link from 'next/link';",
      "/* import { x } from '@mockp/api-client'; */",
      "import { useState } from 'react';",
    ].join('\n');
    expect(findViolations('src/atoms/Example.tsx', source)).toEqual([]);
  });

  it('classifies bare specifiers and subpaths', () => {
    expect(isForbiddenPackage('@mockp/ui')).toBe(false);
    expect(isForbiddenPackage('@mockp/ui/styles.css')).toBe(false);
    expect(isForbiddenPackage('@mockp/api-client')).toBe(true);
    expect(isForbiddenPackage('next')).toBe(true);
    expect(isForbiddenPackage('next/link')).toBe(true);
    expect(isForbiddenPackage('react')).toBe(false);
    expect(isForbiddenPackage('./next')).toBe(false);
  });
});

describe('imports that leave the library (pure rules)', () => {
  it.each([
    ['src/index.ts', '../../config'],
    ['src/index.ts', '../../../apps/web/x'],
    ['src/atoms/Button.tsx', '../../../libs/config/src/x'],
    ['src/atoms/Button.tsx', '../../..'],
    ['src/atoms/Button/Button.tsx', '../../../../x'],
    ['src/atoms/Button.tsx', '/etc/anything'],
    ['src/atoms/Button.tsx', 'C:/other/place'],
  ])('flags %s importing %s', (file, specifier) => {
    expect(escapesLibrary(file, specifier)).toBe(true);
    expect(
      findViolations(file, `import x from '${specifier}';`),
    ).toContainEqual({ rule: 'import-outside-library', detail: specifier });
  });

  it.each([
    ['src/index.ts', './atoms/Button'],
    ['src/index.ts', '../package.json'],
    ['src/atoms/Button.tsx', '../index'],
    ['src/atoms/Button.tsx', '../../architecture/rules.mjs'],
    ['src/atoms/Button/Button.tsx', '../../../package.json'],
    ['src/atoms/Button.tsx', 'react'],
  ])('allows %s importing %s', (file, specifier) => {
    expect(escapesLibrary(file, specifier)).toBe(false);
  });

  it('flags any specifier that points into an apps directory', () => {
    expect(referencesAppsDirectory('../../../apps/web/src/x')).toBe(true);
    expect(referencesAppsDirectory('some/apps/thing')).toBe(true);
    expect(referencesAppsDirectory('@scope/apps-like')).toBe(false);
    expect(
      findViolations('src/index.ts', "import x from 'some/apps/thing';"),
    ).toContainEqual({ rule: 'import-from-apps', detail: 'some/apps/thing' });
  });
});

describe('forbidden dependencies (pure rules)', () => {
  it('flags forbidden packages in every dependency field', () => {
    expect(
      forbiddenDependencies({
        dependencies: { '@headlessui/react': '1.0.0', next: '1.0.0' },
        devDependencies: { '@mockp/config': 'workspace:*', vitest: '1.0.0' },
        peerDependencies: { react: '>=19', '@tanstack/react-query': '5' },
      }),
    ).toEqual([
      'dependencies:next',
      'devDependencies:@mockp/config',
      'peerDependencies:@tanstack/react-query',
    ]);
  });

  it('accepts a manifest with only allowed dependencies', () => {
    expect(
      forbiddenDependencies({
        dependencies: { '@headlessui/react': '2.2.10' },
        peerDependencies: { react: '>=19.0.0 <20' },
      }),
    ).toEqual([]);
  });
});

describe('ownership of design tokens (pure rules)', () => {
  it('detects every token-definition marker', () => {
    for (const marker of [
      '@theme { }',
      ':root { --color-primary: red; }',
      ':root { --scale-brand-600: red; }',
      ':root { --breakpoint-md: 48rem; }',
      ':root { --radius-md: 1px; }',
      ':root { --shadow-card: none; }',
      ':root { --font-sans: Inter; }',
    ]) {
      expect(findTokenMarkers(marker), marker).not.toEqual([]);
    }
  });

  it('does not flag unrelated text', () => {
    expect(findTokenMarkers("export const colorName = 'primary';")).toEqual([]);
  });

  it('recognises Tailwind config files by name', () => {
    expect(isTailwindConfigFile('tailwind.config.ts')).toBe(true);
    expect(isTailwindConfigFile('tailwind.config.mjs')).toBe(true);
    expect(isTailwindConfigFile('tailwind.css')).toBe(false);
  });
});

describe('hard-coded colors (pure rules)', () => {
  it.each([
    ["const a = '#fff';", 'hex'],
    ["const a = '#ffff';", 'hex'],
    ["const a = '#1a2b3c';", 'hex'],
    ["const a = '#1a2b3c4d';", 'hex'],
    ["const a = 'rgb(0 0 0)';", 'color-function'],
    ["const a = 'rgba(0, 0, 0, 0.5)';", 'color-function'],
    ["const a = 'hsl(210 80% 42%)';", 'color-function'],
    ["const a = 'hsla(210, 80%, 42%, 0.5)';", 'color-function'],
    ["const a = 'oklch(0.7 0.1 200)';", 'color-function'],
    ['const a = "bg-[#1a2b3c]";', 'arbitrary-color'],
    ['const a = "text-[rgb(1,2,3)]";', 'arbitrary-color'],
    ['const a = "border-[hsl(1,2%,3%)]";', 'arbitrary-color'],
    ['const a = "bg-[oklch(0.5_0.1_20)]";', 'arbitrary-color'],
  ])('flags %j', (source, kind) => {
    expect(findHardcodedColors(source).map((c) => c.kind)).toContain(kind);
    expect(
      findViolations('src/atoms/Badge.tsx', source).map((v) => v.rule),
    ).toContain('hardcoded-color');
  });

  it.each([
    'const a = "bg-primary text-content border-border";',
    'const a = "bg-primary/40 shadow-card";',
    'const a = "<a href=\'#main\'>skip</a>";',
    'const a = "&#039;";',
    'const a = "w-[10px] h-[2rem]";',
    '// background: #fff or rgb(0 0 0) in a comment',
    '/* hsl(210 80% 42%) */ const a = 1;',
  ])('does not flag %j', (source) => {
    expect(findHardcodedColors(source)).toEqual([]);
  });

  it('only checks non-spec .ts/.tsx files', () => {
    const source = "const a = '#fff';";
    expect(findViolations('src/atoms/Badge.tsx', source)).not.toEqual([]);
    expect(findViolations('src/atoms/Badge.stories.tsx', source)).not.toEqual(
      [],
    );
    expect(findViolations('src/atoms/Badge.spec.tsx', source)).toEqual([]);
    expect(findViolations('src/styles/tokens.spec.ts', source)).toEqual([]);
    expect(findViolations('src/styles/tokens.css', source)).toEqual([]);
  });
});

describe('negative control: a synthetic violating file is reported', () => {
  it('reports every category at once', () => {
    const source = [
      "import api from '@mockp/api-client';",
      "import Link from 'next/link';",
      "import far from '../../../libs/config/src/x';",
      "const color = '#ff0000';",
    ].join('\n');
    expect(
      findViolations('src/atoms/Bad.tsx', source).map((v) => v.rule),
    ).toEqual([
      'forbidden-import',
      'forbidden-import',
      'import-outside-library',
      'hardcoded-color',
    ]);
  });
});

describe('real scan of libs/ui', () => {
  const sourceFiles = listFiles(join(LIB_ROOT, 'src')).filter((file) =>
    /\.(?:ts|tsx)$/.test(file),
  );

  it('scans a non-empty set of source files', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it('has no forbidden import and no import outside the library in src', () => {
    const found = [];
    for (const file of sourceFiles) {
      const path = posix(relative(LIB_ROOT, file));
      for (const violation of findViolations(
        path,
        readFileSync(file, 'utf8'),
      )) {
        if (violation.rule !== 'hardcoded-color')
          found.push({ path, ...violation });
      }
    }
    expect(found).toEqual([]);
  });

  it('has no hard-coded color outside tokens.css and the specs', () => {
    const found = [];
    for (const file of sourceFiles) {
      const path = posix(relative(LIB_ROOT, file));
      for (const violation of findViolations(
        path,
        readFileSync(file, 'utf8'),
      )) {
        if (violation.rule === 'hardcoded-color')
          found.push({ path, ...violation });
      }
    }
    expect(found).toEqual([]);
  });

  it('has no forbidden dependency in package.json', () => {
    const manifest = JSON.parse(
      readFileSync(join(LIB_ROOT, 'package.json'), 'utf8'),
    );
    expect(forbiddenDependencies(manifest)).toEqual([]);
  });
});

describe('real scan: design tokens are owned by libs/ui only', () => {
  const directories = [
    join(REPO_ROOT, 'libs', 'config', 'src'),
    join(REPO_ROOT, 'libs', 'api-client', 'src'),
    join(REPO_ROOT, 'libs', 'queue', 'src'),
    ...readdirSync(join(REPO_ROOT, 'apps'))
      .map((name) => join(REPO_ROOT, 'apps', name, 'src'))
      .filter(isDirectory),
  ];

  it('scans libs/config, libs/api-client, libs/queue and every apps/*/src', () => {
    expect(directories.length).toBeGreaterThanOrEqual(5);
    for (const directory of directories) {
      expect(isDirectory(directory), directory).toBe(true);
      expect(listFiles(directory).length, directory).toBeGreaterThan(0);
    }
  });

  it('has no token marker and no tailwind.config.* outside libs/ui', () => {
    const found = [];
    for (const directory of directories) {
      for (const file of listFiles(directory)) {
        const path = posix(relative(REPO_ROOT, file));
        const name = path.split('/').pop();
        if (isTailwindConfigFile(name))
          found.push({ path, rule: 'tailwind-config' });
        if (TEXT_FILE.test(name)) {
          const markers = findTokenMarkers(readFileSync(file, 'utf8'));
          if (markers.length > 0) found.push({ path, markers });
        }
      }
    }
    expect(found).toEqual([]);
  });
});

describe('ESLint is wired to the shared rules', () => {
  const eslint = new ESLint({
    cwd: LIB_ROOT,
    overrideConfigFile: join(LIB_ROOT, 'eslint.config.mjs'),
  });

  async function restricted(code, file = 'src/example.tsx') {
    const [result] = await eslint.lintText(code, {
      filePath: join(LIB_ROOT, file),
    });
    return result.messages.filter((m) => m.ruleId === 'no-restricted-imports');
  }

  it.each([
    "import a from '@mockp/api-client';",
    "import a from '@mockp/config/server';",
    "import a from '@tanstack/react-query';",
    "import a from 'next/link';",
    "import a from 'next-auth/react';",
    "import a from '@apollo/client';",
    "import a from '@mui/material';",
    "import a from '@prisma/client';",
    "import type { A } from '@mockp/queue';",
    "export * from 'next/link';",
    "import a from '../../../libs/config';",
  ])('reports %s', async (code) => {
    expect((await restricted(`${code}\n`)).length).toBeGreaterThan(0);
  });

  it.each([
    "import { useState } from 'react';",
    "import { Dialog } from '@headlessui/react';",
    "import { IconX } from '@tabler/icons-react';",
    "import styles from '@mockp/ui/styles.css';",
    "import { Button } from '../atoms/Button';",
  ])('accepts %s', async (code) => {
    expect(await restricted(`${code}\n`, 'src/molecules/Dialog.tsx')).toEqual(
      [],
    );
  });

  it('checks relative imports by directory depth', async () => {
    expect(
      (await restricted("import a from '../../x';\n", 'src/index.ts')).length,
    ).toBeGreaterThan(0);
    expect(await restricted("import a from '../x';\n", 'src/index.ts')).toEqual(
      [],
    );
    expect(
      (
        await restricted(
          "import a from '../../../x';\n",
          'src/atoms/Button.tsx',
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      await restricted(
        "import a from '../../atoms/x';\n",
        'src/atoms/Button.tsx',
      ),
    ).toEqual([]);
  }, 30000);
});

describe('the guards themselves only read', () => {
  // Names are assembled from fragments, so this file never contains them.
  const WRITE_IDENTIFIERS = [
    ['write', 'File'],
    ['append', 'File'],
    ['mk', 'dir'],
    ['r', 'm'],
    ['re', 'name'],
    ['un', 'link'],
    ['copy', 'File'],
    ['trun', 'cate'],
    ['create', 'Write', 'Stream'],
  ].map((fragments) => fragments.join(''));

  it.each(['rules.mjs', 'architecture.spec.mjs'])(
    '%s has no filesystem write identifier',
    (name) => {
      const source = readFileSync(join(import.meta.dirname, name), 'utf8');
      for (const identifier of WRITE_IDENTIFIERS) {
        expect(
          new RegExp(`\\b${identifier}(?:Sync)?\\b`).test(source),
          identifier,
        ).toBe(false);
      }
    },
  );
});
