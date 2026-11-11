/**
 * Resolves a listing address to the city's building identifiers with NYC
 * GeoSearch.
 *
 * Used by the background worker before any dataset is queried. GeoSearch returns
 * the same confidence for right and wrong matches, so a candidate is accepted
 * only when its normalized street equals the listing's and its borough agrees.
 * With no listing borough, the match must be unique across boroughs.
 */

import { z } from 'zod';

import {
  BOROUGH_CODES,
  parseBorough,
  type Borough,
} from '../shared/address/borough';
import type { ListingAddress } from '../shared/address/listing-address';
import { normalizeStreetAddress } from '../shared/address/street';
import { err, ok, type Result } from '../shared/result';
import { fetchJson, type FetchJsonOptions } from './http/fetch-json';

const GEOSEARCH_URL = 'https://geosearch.planninglabs.nyc/v2/search';

/** Candidates requested per search. */
const CANDIDATES = 10;

/** A building matched to a listing. */
export interface Building {
  /** Ten-digit borough-block-lot tax lot ID. */
  readonly bbl: string;
  /** Building ID, or `null` when the city uses a placeholder. */
  readonly bin: string | null;
  readonly borough: Borough;
}

/** Why no building was matched. */
export type GeocodeError =
  /** No candidate matched the listing's street and borough. */
  | 'not-found'
  /** Several different buildings matched, and the listing has no borough to choose. */
  | 'ambiguous'
  /** GeoSearch could not be reached or answered with an error. */
  | 'unavailable';

const ResponseSchema = z.object({
  features: z.array(
    z.object({
      properties: z.object({
        name: z.string(),
        borough: z.string(),
        addendum: z.object({
          pad: z.object({
            bbl: z.string().regex(/^[1-5]\d{9}$/),
            bin: z.string().regex(/^[1-5]\d{6}$/),
          }),
        }),
      }),
    }),
  ),
});

/**
 * Builds the GeoSearch query text for an address. The unit is left out.
 *
 * @param address - The listing address.
 * @returns The search text.
 */
export function searchText(address: ListingAddress): string {
  return address.borough === null
    ? `${address.street}, New York City`
    : `${address.street}, ${address.borough}`;
}

/**
 * Finds the building for a listing address.
 *
 * @param address - The listing address.
 * @param options - HTTP options, replaceable in tests.
 * @returns The matched building, or why none was accepted.
 */
export async function geocode(
  address: ListingAddress,
  options?: FetchJsonOptions,
): Promise<Result<Building, GeocodeError>> {
  const url = `${GEOSEARCH_URL}?${new URLSearchParams({
    text: searchText(address),
    size: String(CANDIDATES),
  }).toString()}`;

  const response = await fetchJson(url, ResponseSchema, options);
  if (!response.ok) {
    return err('unavailable');
  }

  const matches = response.value.features
    .map(({ properties }) => toBuilding(properties))
    .filter(
      (candidate): candidate is Building & { street: string } =>
        candidate !== null &&
        candidate.street === address.street &&
        (address.borough === null || candidate.borough === address.borough),
    );

  const distinct = new Map(matches.map((match) => [match.bbl, match]));
  const [only, ...others] = distinct.values();
  if (only === undefined) {
    return err('not-found');
  }
  if (others.length > 0) {
    return err('ambiguous');
  }

  return ok({ bbl: only.bbl, bin: only.bin, borough: only.borough });
}

/**
 * Converts a GeoSearch result to a building with its normalized street.
 *
 * @param properties - The result's properties.
 * @returns The building, or `null` if its borough is unknown or doesn't match
 * the BBL's first digit.
 */
function toBuilding(properties: {
  name: string;
  borough: string;
  addendum: { pad: { bbl: string; bin: string } };
}): (Building & { street: string }) | null {
  const borough = parseBorough(properties.borough);
  const street = normalizeStreetAddress(properties.name);
  const { bbl, bin } = properties.addendum.pad;

  if (
    borough === null ||
    street === null ||
    !bbl.startsWith(String(BOROUGH_CODES[borough]))
  ) {
    return null;
  }

  // BINs of the form N000000 are placeholders for lots without an assigned BIN.
  return { bbl, bin: /^[1-5]000000$/.test(bin) ? null : bin, borough, street };
}
