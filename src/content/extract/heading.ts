/**
 * Reads a listing's address from the address heading on the page.
 *
 * Fallback for pages without usable JSON-LD. The heading holds the street line
 * and unit only, so the address it produces has no borough or postal code.
 */

import {
  buildListingAddress,
  type ListingAddress,
} from '../../shared/address/listing-address';
import { err, ok, type Result } from '../../shared/result';

/** Selects the listing's address heading by its test id. */
const ADDRESS_HEADING = '[data-testid="address"]';

/**
 * Finds the listing's address in the page's address heading.
 *
 * @param root - The document, or an element containing the heading.
 * @returns The listing address, or `not-found` if the heading is missing or empty.
 *
 * @example
 * // <h1 data-testid="address">10 Example St #3M</h1>
 * addressFromHeading(document);
 * // ok({ street: '10 EXAMPLE STREET', unit: '3M', borough: null, postalCode: null })
 */
export function addressFromHeading(
  root: ParentNode,
): Result<ListingAddress, 'not-found'> {
  const text = root.querySelector(ADDRESS_HEADING)?.textContent ?? '';
  const address = buildListingAddress({ streetLine: text });

  return address === null ? err('not-found') : ok(address);
}
