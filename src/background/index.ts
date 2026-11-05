/**
 * Entry point for the background service worker, declared in manifest.config.ts.
 *
 * Runs in its own extension context with no access to web pages. Chrome starts
 * the worker when an event it listens for fires and stops it when idle.
 */

import { EXTENSION_SHORT_NAME } from '../shared/constants';

// Listeners are registered at the top level so they exist as soon as the worker
// starts, before Chrome delivers the event that woke it.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.log(`${EXTENSION_SHORT_NAME}: onInstalled (${reason})`);
});
