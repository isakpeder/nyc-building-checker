// ESLint settings for the whole repo. The lint script reads this file, and CI
// will run that script on every push. ESLint finds likely bugs. Prettier handles
// formatting, so formatting rules are turned off here.

import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  // Build and test output isn't written by hand, so there's nothing to lint.
  globalIgnores(['dist/', 'coverage/']),

  // Basic bug-finding rules for every file ESLint looks at, including this one.
  { files: ['**/*.{js,ts,tsx}'], extends: [js.configs.recommended] },

  // The strict TypeScript rules. Many of them ask the compiler for type
  // information, so they only run on files tsconfig.json includes. That's why
  // they're limited to TypeScript and skip plain .js config files like this one.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      // Lets each file get its types from the tsconfig.json that covers it.
      parserOptions: { projectService: true },
    },
  },

  // Keep this last. It turns off any rule above that would fight with Prettier,
  // and later entries override earlier ones.
  prettier,
]);
