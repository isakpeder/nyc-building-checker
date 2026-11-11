/**
 * Extracts a listing's address from the current page, trying each source in order.
 *
 * Used by the content script on listing pages. JSON-LD comes first because it
 * includes the borough and postal code. The address heading is the fallback.
 */

import type { ListingAddress } from '../../shared/address/listing-address';
import { err, ok, type Result } from '../../shared/result';
import { addressFromHeading } from './heading';
import { addressFromJsonLd } from './json-ld';

/** Where an extracted address came from. */
export type AddressSource = 'json-ld' | 'heading';

/** An address together with the source that produced it. */
export interface ExtractedAddress {
  readonly address: ListingAddress;
  readonly source: AddressSource;
}

/**
 * Parses each JSON-LD script in a document. Scripts that aren't valid JSON are
 * skipped.
 *
 * @param root - The document to read.
 * @returns The parsed contents of each script.
 */
export function readJsonLdBlocks(root: ParentNode): unknown[] {
  const scripts = root.querySelectorAll('script[type="application/ld+json"]');

  return Array.from(scripts).flatMap((script) => {
    try {
      return [JSON.parse(script.textContent) as unknown];
    } catch {
      return [];
    }
  });
}

/**
 * Extracts the listing's address, trying JSON-LD and then the address heading.
 *
 * When both exist and name a different street or unit, the heading wins. After
 * in-page navigation the JSON-LD can still describe the previous listing, while
 * the heading is always rendered for the current one.
 *
 * @param root - The listing page's document.
 * @returns The address and its source, or `not-found` if no source has one.
 */
export function extractListingAddress(
  root: ParentNode,
): Result<ExtractedAddress, 'not-found'> {
  const fromJsonLd = addressFromJsonLd(readJsonLdBlocks(root));
  const fromHeading = addressFromHeading(root);

  if (fromJsonLd.ok) {
    const agrees =
      !fromHeading.ok ||
      (fromHeading.value.street === fromJsonLd.value.street &&
        fromHeading.value.unit === fromJsonLd.value.unit);
    if (agrees) {
      return ok({ address: fromJsonLd.value, source: 'json-ld' });
    }
  }

  if (fromHeading.ok) {
    return ok({ address: fromHeading.value, source: 'heading' });
  }

  return err('not-found');
}
