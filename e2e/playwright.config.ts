// Playwright configuration for the end-to-end tests in this folder, run by the
// e2e script after an e2e-mode build.

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  outputDir: '../test-results',
  timeout: 30_000,
  // Each test launches its own browser with the extension, so they run one at a time.
  workers: 1,
  retries: process.env.CI === undefined ? 0 : 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: '../playwright-report' }],
  ],
});
