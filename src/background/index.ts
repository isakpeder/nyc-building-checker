/**
 * Entry point for the background service worker, declared in manifest.config.ts.
 *
 * Runs in its own extension context with no access to web pages. Chrome starts
 * the worker when an event it listens for fires and stops it when idle.
 */

import { EXTENSION_SHORT_NAME } from '../shared/constants';
import { parseRequest } from '../shared/messages';
import { loadSettings } from '../shared/settings-store';
import { createTracker, storedInstallId } from './analytics';
import { err } from '../shared/result';
import { fetchBedbugs } from './datasets/bedbugs';
import { fetchComplaints } from './datasets/complaints-311';
import { fetchStopWork } from './datasets/stop-work';
import { fetchViolations } from './datasets/hpd-violations';
import { geocode } from './geocode';
import { createRequestHandler } from './handle-request';
import { buildReport } from './report';
import {
  clearReportCache,
  createCachedReporter,
  type KeyValueStore,
} from './report-cache';

// Listeners are registered at the top level so they exist as soon as the worker
// starts, before Chrome delivers the event that woke it.
const store: KeyValueStore = {
  get: async (key) => (await chrome.storage.local.get(key))[key],
  set: (key, value) => chrome.storage.local.set({ [key]: value }),
  remove: (keys) => chrome.storage.local.remove([...keys]),
  keys: async () => Object.keys(await chrome.storage.local.get(null)),
};

const cachedReport = createCachedReporter(
  (address) =>
    buildReport(address, {
      geocode: (a) => geocode(a),
      violations: (bbl) => fetchViolations(bbl),
      complaints: (bbl) => fetchComplaints(bbl),
      stopWork: (bin) => fetchStopWork(bin),
      bedbugs: (bbl) => fetchBedbugs(bbl),
    }),
  { store },
);

// Analytics stays off in development and end-to-end builds, and when no key is set.
const track = createTracker({
  projectKey:
    import.meta.env.MODE === 'production'
      ? (import.meta.env.VITE_POSTHOG_KEY ?? '')
      : '',
  version: chrome.runtime.getManifest().version,
  shareUsage: async () => (await loadSettings()).shareUsage,
  installId: storedInstallId,
  send: (url, body) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }),
});

const handleRequest = createRequestHandler({
  buildReport: cachedReport,
  clearCache: () => clearReportCache(store),
  track,
});

/** Optional feedback form opened when the extension is uninstalled. */
const uninstallUrl = import.meta.env.VITE_UNINSTALL_FORM_URL ?? '';
if (uninstallUrl.startsWith('https://')) {
  void chrome.runtime.setUninstallURL(uninstallUrl);
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.log(`${EXTENSION_SHORT_NAME}: onInstalled (${reason})`);
  if (reason === 'install') void track({ name: 'extension_installed' });
  if (reason === 'update') void track({ name: 'extension_updated' });
});

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    const request = parseRequest(message);
    if (!request.ok) {
      sendResponse(err('invalid-request'));
      return false;
    }

    void handleRequest(request.value).then(sendResponse);
    // Returning true keeps the response channel open until sendResponse is called.
    return true;
  },
);
