// Chrome extension manifest, read by the CRXJS plugin in vite.config.ts and
// written to dist/manifest.json at build time.

import { defineManifest } from '@crxjs/vite-plugin';

import pkg from './package.json' with { type: 'json' };
import {
  EXTENSION_NAME,
  EXTENSION_SHORT_NAME,
} from './src/shared/constants.ts';

export default defineManifest({
  manifest_version: 3,
  name: EXTENSION_NAME,
  short_name: EXTENSION_SHORT_NAME,
  description: pkg.description,
  version: pkg.version,
  // AbortSignal.any, used for request timeouts, arrived in Chrome 116.
  minimum_chrome_version: '116',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['https://streeteasy.com/*'],
      js: ['src/content/index.ts'],
    },
  ],
  action: {
    default_title: EXTENSION_SHORT_NAME,
    default_popup: 'src/popup/index.html',
  },
});
