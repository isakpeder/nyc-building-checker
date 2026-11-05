// Vite configuration, read by the dev and build scripts. Tests use
// vitest.config.js instead.

import { crx } from '@crxjs/vite-plugin';
import { defineConfig } from 'vite';

import manifest from './manifest.config.ts';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    sourcemap: true,
  },
  server: {
    // The unpacked dev build loads its code from this port.
    port: 5173,
    strictPort: true,
    // Allows requests from extension pages.
    cors: {
      origin: [/chrome-extension:\/\//],
    },
  },
});
