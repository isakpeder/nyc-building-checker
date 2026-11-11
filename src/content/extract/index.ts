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
 * @param root - The listing page's document.
 * @returns The address and its source, or `not-found` if no source has one.
 */
export function extractListingAddress(
  root: ParentNode,
): Result<ExtractedAddress, 'not-found'> {
  const fromJsonLd = addressFromJsonLd(readJsonLdBlocks(root));
  if (fromJsonLd.ok) {
    return ok({ address: fromJsonLd.value, source: 'json-ld' });
  }

  const fromHeading = addressFromHeading(root);
  if (fromHeading.ok) {
    return ok({ address: fromHeading.value, source: 'heading' });
  }

  return err('not-found');
}
