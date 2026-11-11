/**
 * Builds a normalized listing address from the parts a page provides.
 *
 * Part of the shared layer: pure, with no browser APIs. Used by each address
 * extractor in the content script, so every source produces the same shape.
 */

import { parseBorough, type Borough } from './borough';
import { normalizeStreetAddress, type StreetAddress } from './street';
import { normalizeUnit, type Unit } from './unit';

/** A listing's address, split and normalized. */
export interface ListingAddress {
  readonly street: StreetAddress;
  readonly unit: Unit | null;
  /** `null` when the locality doesn't identify exactly one borough. */
  readonly borough: Borough | null;
  /** Five-digit ZIP code, or `null` when absent or malformed. */
  readonly postalCode: string | null;
  /** Two-letter state code, or `null` when absent or malformed. */
  readonly region: string | null;
}

/** The address parts as a page provides them. */
export interface RawAddressParts {
  /** A street line that may include a unit, such as `10 Main St #3M`. */
  readonly streetLine: string;
  readonly locality?: string | undefined;
  readonly postalCode?: string | undefined;
  readonly region?: string | undefined;
}

/**
 * Matches a unit at the end of a street line, after # or a word such as Apt.
 * Group 1 is the street and group 2 is the unit.
 */
const TRAILING_UNIT =
  /^(.*?)[\s,]*(?:#|\b(?:APT|APARTMENT|UNIT|STE|SUITE)\b\.?)\s*([^\s,#][^,#]*)$/i;

const ZIP_CODE = /^\d{5}$/;

/**
 * Splits a street line into its street and unit.
 *
 * @param streetLine - A street line that may end with a unit.
 * @returns The street, and the unit as written or `null` if there is none.
 *
 * @example
 * splitStreetLine('10 Main St #3M'); // { street: '10 Main St', unit: '3M' }
 * splitStreetLine('10 Main St, Apt 4B'); // { street: '10 Main St', unit: '4B' }
 * splitStreetLine('10 Main St'); // { street: '10 Main St', unit: null }
 */
export function splitStreetLine(streetLine: string): {
  street: string;
  unit: string | null;
} {
  const match = TRAILING_UNIT.exec(streetLine.trim());
  const street = match?.[1];
  const unit = match?.[2];

  if (street === undefined || street === '' || unit === undefined) {
    return { street: streetLine.trim(), unit: null };
  }

  return { street, unit: unit.trim() };
}

/**
 * Splits and normalizes the address parts a page provides.
 *
 * @param parts - The raw street line, locality and postal code.
 * @returns The listing address, or `null` if the street line has no street.
 *
 * @example
 * buildListingAddress({
 *   streetLine: '10 Example St #3M',
 *   locality: 'ASTORIA',
 *   postalCode: '11103',
 * });
 * // { street: '10 EXAMPLE STREET', unit: '3M', borough: 'QUEENS', postalCode: '11103' }
 */
export function buildListingAddress(
  parts: RawAddressParts,
): ListingAddress | null {
  const { street, unit } = splitStreetLine(parts.streetLine);
  const normalizedStreet = normalizeStreetAddress(street);

  if (normalizedStreet === null) {
    return null;
  }

  const postalCode = parts.postalCode?.trim() ?? '';
  const region = parts.region?.trim().toUpperCase() ?? '';

  return {
    street: normalizedStreet,
    unit: unit === null ? null : normalizeUnit(unit),
    borough: parts.locality === undefined ? null : parseBorough(parts.locality),
    postalCode: ZIP_CODE.test(postalCode) ? postalCode : null,
    region: /^[A-Z]{2}$/.test(region) ? region : null,
  };
}
