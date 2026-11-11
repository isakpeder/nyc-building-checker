/**
 * Reads a listing's address from the page's JSON-LD structured data.
 *
 * Pure function used by the content script, which parses each
 * `<script type="application/ld+json">` block and passes the results in. The
 * address comes from the `mainEntity` of the `ItemPage` node, the schema.org
 * property for what a page is about. Other nodes, such as the listing agent,
 * nearby schools and stations, carry their own addresses and are ignored.
 */

import { z } from 'zod';

import {
  buildListingAddress,
  type ListingAddress,
} from '../../shared/address/listing-address';
import { err, ok, type Result } from '../../shared/result';

/** Why no address could be read from JSON-LD. */
export type JsonLdError =
  /** No ItemPage node with a usable main entity address. */
  | 'not-found'
  /** More than one ItemPage node, with different addresses. */
  | 'ambiguous';

const PostalAddressSchema = z.object({
  '@type': z.literal('PostalAddress'),
  streetAddress: z.string(),
  addressLocality: z.string().optional(),
  postalCode: z.string().optional(),
  addressRegion: z.string().optional(),
});

const ItemPageSchema = z.object({
  '@type': z.literal('ItemPage'),
  mainEntity: z.object({ address: PostalAddressSchema }),
});

const GraphSchema = z.object({ '@graph': z.array(z.unknown()) });

/**
 * Finds the listing's address in a page's parsed JSON-LD blocks.
 *
 * @param blocks - The parsed contents of each JSON-LD script on the page.
 * @returns The listing address, or the reason none could be read.
 *
 * @example
 * addressFromJsonLd([{
 *   '@graph': [{
 *     '@type': 'ItemPage',
 *     mainEntity: { address: {
 *       '@type': 'PostalAddress',
 *       streetAddress: '10 Example St #3M',
 *       addressLocality: 'ASTORIA',
 *     } },
 *   }],
 * }]);
 * // ok({ street: '10 EXAMPLE STREET', unit: '3M', borough: 'QUEENS', ... })
 */
export function addressFromJsonLd(
  blocks: readonly unknown[],
): Result<ListingAddress, JsonLdError> {
  const addresses = blocks
    .flatMap(nodesOf)
    .map((node) => ItemPageSchema.safeParse(node))
    .flatMap((parsed) => (parsed.success ? [parsed.data] : []))
    .map(({ mainEntity: { address } }) =>
      buildListingAddress({
        streetLine: address.streetAddress,
        locality: address.addressLocality,
        postalCode: address.postalCode,
        region: address.addressRegion,
      }),
    )
    .filter((address) => address !== null);

  const [first] = addresses;
  if (first === undefined) {
    return err('not-found');
  }

  // Repeated ItemPage nodes are fine as long as they agree.
  const distinct = new Set(addresses.map((address) => JSON.stringify(address)));
  if (distinct.size > 1) {
    return err('ambiguous');
  }

  return ok(first);
}

/**
 * Lists the nodes in one JSON-LD block, which can be a single node, an array of
 * nodes, or an object holding nodes in `@graph`.
 *
 * @param block - One parsed JSON-LD block.
 * @returns The block's nodes.
 */
function nodesOf(block: unknown): unknown[] {
  if (Array.isArray(block)) {
    return block;
  }

  const graph = GraphSchema.safeParse(block);
  return graph.success ? graph.data['@graph'] : [block];
}
