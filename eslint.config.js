// ESLint configuration, read by the lint script. Formatting is handled by Prettier.

import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist/', 'coverage/']),

  { files: ['**/*.{js,ts,tsx}'], extends: [js.configs.recommended] },

  // Type-aware rules need type information from tsconfig.json, so they're limited
  // to TypeScript files.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: { projectService: true },
    },
  },

  // Must stay last: disables rules that conflict with Prettier.
  prettier,
]);
