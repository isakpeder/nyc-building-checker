/**
 * Entry point for the content script, declared in manifest.config.ts.
 *
 * Runs on StreetEasy pages in an isolated world: it shares the page's DOM but not
 * its JavaScript variables. Reads from the current page only. Handles the first
 * page load and every in-page navigation after it, and follows the on/off setting
 * live.
 */

import { createListingController } from './controller';
import { DEFAULT_SETTINGS } from '../shared/settings';
import { loadSettings, watchSettings } from '../shared/settings-store';
import { extractListingAddress } from './extract';
import type { AnalyticsEvent } from '../shared/analytics-events';
import { sendRequest } from '../shared/messaging';
import { panelShownEvent } from './panel-events';
import { mountPanel, PANEL_ID, unmountPanel } from './panel-mount';
import { attachPanel, type PanelRoot } from './ui/panel-root';
import { watchUrl } from './url-watcher';
import { waitForElement } from './wait-for-element';

/** How long to wait for a listing's content after navigation, in milliseconds. */
const LISTING_TIMEOUT_MS = 10_000;

/**
 * Asks the background worker to send a usage event. The worker decides whether
 * analytics is on.
 *
 * @param event - The event.
 */
function track(event: AnalyticsEvent): void {
  void sendRequest({ type: 'track', event });
}

/** The React root rendered into each panel host. */
const roots = new WeakMap<HTMLElement, PanelRoot>();

/**
 * Unmounts the React panel on the page's panel host, unless it shows `keepKey`.
 *
 * @param keepKey - A listing key whose panel should be kept.
 */
function releasePanel(keepKey?: string): void {
  const host = document.getElementById(PANEL_ID);
  if (host !== null && host.dataset.listingKey !== keepKey) {
    roots.get(host)?.unmount();
    roots.delete(host);
  }
}

const controller = createListingController({
  waitForListing: async (signal) =>
    (await waitForElement(
      document,
      '[data-testid="address"], script[type="application/ld+json"]',
      LISTING_TIMEOUT_MS,
      signal,
    )) !== null,
  extract: () => extractListingAddress(document),
  mount: (key, address) => {
    releasePanel(key);
    const host = mountPanel(document, key);
    let panel = roots.get(host);
    if (panel === undefined) {
      panel = attachPanel(host, track);
      roots.set(host, panel);
    }
    panel.render({ status: 'loading', address });

    const rendered = panel;
    void sendRequest({ type: 'get-report', address }).then((response) => {
      // The panel may have been replaced by a newer listing while waiting.
      if (host.isConnected && host.dataset.listingKey === key) {
        rendered.render({ status: 'done', address, response });
        track(panelShownEvent(response));
      }
    });
  },
  unmount: () => {
    releasePanel();
    unmountPanel(document);
  },
});

let enabled = DEFAULT_SETTINGS.enabled;

/**
 * Updates the page for a URL, or removes the panel when the extension is off.
 *
 * @param url - The page's current URL.
 */
function update(url: string): void {
  if (enabled) {
    void controller.handle(url);
  } else {
    controller.cancel();
    releasePanel();
    unmountPanel(document);
  }
}

void loadSettings().then((settings) => {
  enabled = settings.enabled;
  update(window.location.href);
});
watchUrl(update);
watchSettings((settings) => {
  enabled = settings.enabled;
  update(window.location.href);
});
