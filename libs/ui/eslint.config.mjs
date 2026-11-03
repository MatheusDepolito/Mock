import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  { files: ['**/*.{ts,tsx}'], ...jsxA11y.flatConfigs.recommended },
  {
    files: ['**/*.{ts,tsx}'],
    ...reactHooks.configs.flat['recommended-latest'],
  },
];
