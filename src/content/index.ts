/**
 * Entry point for the content script, declared in manifest.config.ts.
 *
 * Runs on StreetEasy pages in an isolated world: it shares the page's DOM but not
 * its JavaScript variables. Reads from the current page only. Handles the first
 * page load and every in-page navigation after it.
 */

import { EXTENSION_SHORT_NAME } from '../shared/constants';
import { createListingController } from './controller';
import { extractListingAddress } from './extract';
import { mountPanel, unmountPanel } from './panel-mount';
import { watchUrl } from './url-watcher';
import { waitForElement } from './wait-for-element';

/** How long to wait for a listing's content after navigation, in milliseconds. */
const LISTING_TIMEOUT_MS = 10_000;

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
    const unit = address.unit === null ? '' : ` #${address.unit}`;
    mountPanel(
      document,
      key,
      `${EXTENSION_SHORT_NAME}: ${address.street}${unit}`,
    );
  },
  unmount: () => {
    unmountPanel(document);
  },
});

void controller.handle(window.location.href);
watchUrl((url) => void controller.handle(url));
