/**
 * Unit tests for normalizeStreetAddress in street.ts. Addresses are public NYC
 * streets, chosen for their spelling patterns.
 */

import { describe, expect, it } from 'vitest';

import { normalizeStreetAddress } from './street';

const CASES: readonly (readonly [input: string, expected: string | null])[] = [
  // Case, whitespace and punctuation
  ['350 main street', '350 MAIN STREET'],
  ['  350   Main\tStreet  ', '350 MAIN STREET'],
  ['350 Main St.,', '350 MAIN STREET'],

  // Street types
  ['1 Example Ave', '1 EXAMPLE AVENUE'],
  ['1 Example Av', '1 EXAMPLE AVENUE'],
  ['2300 Malcolm X Blvd', '2300 MALCOLM X BOULEVARD'],
  ['1 Example Ct', '1 EXAMPLE COURT'],
  ['1 Example Dr', '1 EXAMPLE DRIVE'],
  ['1 Example Expy', '1 EXAMPLE EXPRESSWAY'],
  ['50 Kings Hwy', '50 KINGS HIGHWAY'],
  ['1 Example Ln', '1 EXAMPLE LANE'],
  ['100 Ocean Pkwy', '100 OCEAN PARKWAY'],
  ['1 Grand Army Plz', '1 GRAND ARMY PLAZA'],
  ['1 Example Rd', '1 EXAMPLE ROAD'],
  ['1 Example Ter', '1 EXAMPLE TERRACE'],
  ['1 Example Tpke', '1 EXAMPLE TURNPIKE'],
  ['1 Example Row', '1 EXAMPLE ROW'],

  // Numeric ordinals
  ['100 W 42nd St', '100 WEST 42 STREET'],
  ['20 W 3rd St', '20 WEST 3 STREET'],
  ['100 E 161st St', '100 EAST 161 STREET'],
  ['100 Beach 116th St', '100 BEACH 116 STREET'],
  ['350 5th Ave', '350 5 AVENUE'],

  // Ordinal words
  ['350 Fifth Avenue', '350 5 AVENUE'],
  ['200 second ave', '200 2 AVENUE'],
  ['100 Twelfth Ave', '100 12 AVENUE'],
  ['100 First Lane', '100 1 LANE'],
  ['100 Second Chance Road', '100 SECOND CHANCE ROAD'],

  // House numbers
  ['31-10 37th Ave', '31-10 37 AVENUE'],
  ['31 - 10 37th Ave', '31-10 37 AVENUE'],
  ['123A Main St', '123A MAIN STREET'],

  // Prefix directionals
  ['100 N 7th St', '100 NORTH 7 STREET'],
  ['100 S 4th St', '100 SOUTH 4 STREET'],
  ['10 N Moore St', '10 NORTH MOORE STREET'],
  ['100 W. Houston St.', '100 WEST HOUSTON STREET'],
  ['100 East Broadway', '100 EAST BROADWAY'],
  ['100 E Broadway', '100 EAST BROADWAY'],
  ['W 42nd St', 'WEST 42 STREET'],

  // Suffix directionals
  ['100 Central Park W', '100 CENTRAL PARK WEST'],
  ['100 Park Ave S', '100 PARK AVENUE SOUTH'],
  ['10 Union Sq E', '10 UNION SQUARE EAST'],

  // Directional names that aren't abbreviations
  ['100 West St', '100 WEST STREET'],
  ['100 W St', '100 WEST STREET'],
  ['100 West End Ave', '100 WEST END AVENUE'],

  // Lettered avenues keep their letter
  ['100 Avenue A', '100 AVENUE A'],
  ['100 Avenue E', '100 AVENUE E'],
  ['100 Avenue N', '100 AVENUE N'],
  ['1000 Ave J', '1000 AVENUE J'],
  ['100 Ave S', '100 AVENUE S'],
  ['100 Ave. W', '100 AVENUE W'],

  // Leading abbreviations
  ['100 St Marks Pl', '100 SAINT MARKS PLACE'],
  ["100 St. Mark's Place", '100 SAINT MARKS PLACE'],
  ['100 St Mark’s Pl', '100 SAINT MARKS PLACE'],
  ['200 Saint Nicholas Ave', '200 SAINT NICHOLAS AVENUE'],
  ['100 E St Marks Pl', '100 EAST SAINT MARKS PLACE'],
  ['100 Ft Washington Ave', '100 FORT WASHINGTON AVENUE'],
  ['100 Mt Hope Pl', '100 MOUNT HOPE PLACE'],
  [
    '400 Dr Martin Luther King Jr Blvd',
    '400 DOCTOR MARTIN LUTHER KING JR BOULEVARD',
  ],

  // Streets with no type
  ['100 Broadway', '100 BROADWAY'],
  ['100 Bowery', '100 BOWERY'],

  // Names that contain a type word
  ['1000 Avenue of the Americas', '1000 AVENUE OF THE AMERICAS'],

  // No text
  ['', null],
  ['   ', null],
  [' ., ', null],
];

describe('normalizeStreetAddress', () => {
  it.each(CASES)('normalizes %j', (input, expected) => {
    expect(normalizeStreetAddress(input)).toBe(expected);
  });

  it.each(CASES.filter(([, expected]) => expected !== null))(
    'is idempotent for %j',
    (input) => {
      const once = normalizeStreetAddress(input);

      expect(once).not.toBeNull();
      expect(normalizeStreetAddress(once ?? '')).toBe(once);
    },
  );

  it.each([
    ['100 w 42nd st', '100 W. 42ND ST.'],
    ['100 West 42 Street', '100 W 42nd St'],
    ['100 St Marks Place', "100 st. mark's pl"],
    ['350 Fifth Avenue', '350 5th Ave.'],
    ['31-10 37 Avenue', '31 - 10 37th Ave'],
  ])('gives %j and %j the same result', (first, second) => {
    expect(normalizeStreetAddress(first)).toBe(normalizeStreetAddress(second));
  });

  it('keeps different streets distinct', () => {
    const streets = [
      '100 West 42 Street',
      '100 East 42 Street',
      '100 Avenue S',
      '100 Avenue South',
      '100 Park Avenue',
      '100 Park Avenue South',
    ].map(normalizeStreetAddress);

    expect(new Set(streets).size).toBe(streets.length);
  });
});
