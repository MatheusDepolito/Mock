import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';
import {
  parseThemeTokens,
  parseTokenTable,
} from '../src/stories/tokens-parser';

const LIB_ROOT = join(import.meta.dirname, '..');

/**
 * The "Tokens" page reads `tokens.css` and the README table. A malformed file
 * must break the build instead of rendering an empty page, so both are parsed
 * here too (the same parsers the page and its tests use).
 */
function assertTokensParse(): void {
  parseThemeTokens(
    readFileSync(join(LIB_ROOT, 'src', 'styles', 'tokens.css'), 'utf8'),
  );
  parseTokenTable(readFileSync(join(LIB_ROOT, 'README.md'), 'utf8'));
}

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y'],
  framework: '@storybook/react-vite',
  viteFinal: (viteConfig) => {
    assertTokensParse();
    return mergeConfig(viteConfig, { plugins: [tailwindcss()] });
  },
};

export default config;
