import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import baseConfig from '../../eslint.config.mjs';
import {
  MAX_SRC_DEPTH,
  restrictedImportsOptions,
  srcGlobForDepth,
} from './architecture/rules.mjs';

const restrictImports = (depth) => ({
  'no-restricted-imports': ['error', restrictedImportsOptions(depth)],
});

export default [
  ...baseConfig,
  { files: ['**/*.{ts,tsx}'], ...jsxA11y.flatConfigs.recommended },
  {
    files: ['**/*.{ts,tsx}'],
    ...reactHooks.configs.flat['recommended-latest'],
  },
  // Isolation of libs/ui (ADR 003, ADR 010 D12). Lists live in
  // architecture/rules.mjs. Relative imports are checked per directory
  // depth, because "outside the library" depends on how deep the file is.
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: restrictImports(MAX_SRC_DEPTH),
  },
  ...Array.from({ length: MAX_SRC_DEPTH }, (_, index) => ({
    files: [srcGlobForDepth(index + 1)],
    rules: restrictImports(index + 1),
  })),
];
