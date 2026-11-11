/**
 * Decides what the content script shows for each URL the page visits.
 *
 * On a listing page it waits for the address, then mounts the panel. On any other
 * page it removes the panel. When the URL changes again before that finishes, the
 * earlier run is abandoned so a stale listing never replaces the current one.
 */

import type { ListingAddress } from '../shared/address/listing-address';
import type { Result } from '../shared/result';
import type { ExtractedAddress } from './extract';
import { classifyPage } from './page-type';

/** The side effects the controller needs, injected so tests can replace them. */
export interface ControllerDeps {
  /** Resolves `true` once the listing content exists, `false` on timeout or abort. */
  readonly waitForListing: (signal: AbortSignal) => Promise<boolean>;
  readonly extract: () => Result<ExtractedAddress, 'not-found'>;
  readonly mount: (key: string, address: ListingAddress) => void;
  readonly unmount: () => void;
}

/** Handles page URLs in order of arrival. */
export interface ListingController {
  /**
   * Updates the page for a URL.
   *
   * @param url - The page's current URL.
   * @returns Resolves when the update finishes or is abandoned.
   */
  readonly handle: (url: string) => Promise<void>;
}

/**
 * Builds a key that identifies one listing.
 *
 * @param address - The listing's address.
 * @returns The key.
 */
export function listingKey(address: ListingAddress): string {
  return [address.borough ?? '', address.street, address.unit ?? ''].join('|');
}

/**
 * Creates a controller that updates the page for each URL.
 *
 * @param deps - The side effects to use.
 * @returns The controller.
 */
export function createListingController(
  deps: ControllerDeps,
): ListingController {
  let current: AbortController | null = null;

  return {
    async handle(url) {
      // A newer URL cancels the work for the previous one.
      current?.abort();
      const run = new AbortController();
      current = run;

      if (classifyPage(url).kind !== 'listing') {
        deps.unmount();
        return;
      }

      const ready = await deps.waitForListing(run.signal);
      if (run.signal.aborted) {
        return;
      }

      const extracted = ready ? deps.extract() : null;
      if (extracted?.ok) {
        deps.mount(
          listingKey(extracted.value.address),
          extracted.value.address,
        );
      } else {
        deps.unmount();
      }
    },
  };
}
