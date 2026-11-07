/**
 * Normalizes apartment and unit designations to one canonical, idempotent form.
 *
 * Part of the shared layer: pure, with no browser APIs. Units are kept apart from
 * the street address because building records are keyed by building, not unit.
 * A canonical unit is used to match a listing's unit to unit-level city records.
 *
 * Canonical form, following the no-space style HPD uses:
 * - Uppercase letters and digits only: Apt #5-A -> 5A
 * - Floors as FL and a number: 2nd Floor, 2FLO, FLOOR2 -> FL2
 * - PH for penthouse, BSMT for basement, GARDEN and GROUND spelled out
 * - No unit for building-wide placeholders such as BLDG, ENTIRE and N/A
 */

/** A unit in canonical form. Only {@link normalizeUnit} creates one. */
export type Unit = string & { readonly __brand: 'Unit' };

/** Words that introduce a unit, removed from the start: APT 5A -> 5A. NO needs a digit after it. */
const UNIT_PREFIX = /^(?:APARTMENT|APT|UNIT|SUITE|STE|ROOM|RM|NO(?=\d))/;

/** Values HPD uses for a whole building rather than one unit. */
const BUILDING_WIDE = new Set([
  'BLDG',
  'BUILDING',
  'ENTIRE',
  'ALL',
  'NA',
  'NONE',
]);

/** Whole-unit spellings for named units, matched after punctuation is removed. */
const NAMED_UNITS: ReadonlyMap<string, string> = new Map([
  ['BASEMENT', 'BSMT'],
  ['BSMT', 'BSMT'],
  ['GARDEN', 'GARDEN'],
  ['GDN', 'GARDEN'],
  ['GRDN', 'GARDEN'],
  ['GROUND', 'GROUND'],
  ['GRD', 'GROUND'],
]);

/** Matches floor spellings: FL2, FLOOR2, 2FL, 2NDFLO, 2ND FLOOR once spaces are gone. */
const FLOOR =
  /^(?:(?:FL|FLR|FLO|FLOOR)(\d+)|(\d+)(?:ST|ND|RD|TH)?(?:FL|FLR|FLO|FLOOR))$/;

/**
 * Normalizes a unit designation to its canonical form.
 *
 * Applying this to its own output returns the same unit.
 *
 * @param unit - The unit as written, with or without a prefix such as Apt.
 * @returns The canonical unit, or `null` if `unit` names no single unit.
 *
 * @example
 * normalizeUnit('Apt #5-A'); // '5A'
 * normalizeUnit('Penthouse B'); // 'PHB'
 * normalizeUnit('2nd Floor'); // 'FL2'
 * normalizeUnit('BLDG'); // null
 */
export function normalizeUnit(unit: string): Unit | null {
  // Removes everything except letters and digits: #5-A -> 5A, PH A -> PHA.
  const compact = unit
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(UNIT_PREFIX, '');

  if (compact === '' || BUILDING_WIDE.has(compact)) {
    return null;
  }

  return canonicalForm(compact);
}

/**
 * Applies the canonical spellings for penthouses, named units and floors.
 *
 * @param compact - An uppercase unit with no punctuation, spaces or prefix.
 * @returns The canonical unit.
 */
function canonicalForm(compact: string): Unit {
  if (compact.startsWith('PENTHOUSE')) {
    return `PH${compact.slice('PENTHOUSE'.length)}` as Unit;
  }

  const named = NAMED_UNITS.get(compact);
  if (named !== undefined) {
    return named as Unit;
  }

  const floor = FLOOR.exec(compact);
  const floorNumber = floor?.[1] ?? floor?.[2];
  if (floorNumber !== undefined) {
    return `FL${floorNumber}` as Unit;
  }

  return compact as Unit;
}
