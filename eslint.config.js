// ESLint configuration, read by the lint script. Formatting is handled by Prettier.

import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    'dist/',
    'dist-e2e/',
    'coverage/',
    'playwright-report/',
    'test-results/',
  ]),

  { files: ['**/*.{js,ts,tsx}'], extends: [js.configs.recommended] },

  // Type-aware rules need type information from tsconfig.json, so they're limited
  // to TypeScript files.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      parserOptions: { projectService: true },
    },
  },

  // Playwright fixtures pass a function named use, which isn't a React hook.
  {
    files: ['e2e/**/*.ts'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },

  // Must stay last: disables rules that conflict with Prettier.
  prettier,
]);
