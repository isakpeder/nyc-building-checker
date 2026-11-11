/**
 * Unit tests for splitStreetLine and buildListingAddress in listing-address.ts.
 * Addresses are synthetic.
 */

import { describe, expect, it } from 'vitest';

import { buildListingAddress, splitStreetLine } from './listing-address';

describe('splitStreetLine', () => {
  it.each([
    ['10-20 Example Road #3M', '10-20 Example Road', '3M'],
    ['10 Example St # 3M', '10 Example St', '3M'],
    ['10 Example St, Apt 4B', '10 Example St', '4B'],
    ['10 Example St Apt. 4B', '10 Example St', '4B'],
    ['10 Example St Unit PH', '10 Example St', 'PH'],
    ['10 Example St, Suite 400', '10 Example St', '400'],
    ['10 Example St #2nd Floor', '10 Example St', '2nd Floor'],
    ['10 Example St', '10 Example St', null],
    ['  10 Example St  ', '10 Example St', null],
    ['10 Example St #', '10 Example St #', null],
    ['#3M', '#3M', null],
    ['10 Aptos St', '10 Aptos St', null],
    ['10 Unity Pl', '10 Unity Pl', null],
  ])('splits %j', (line, street, unit) => {
    expect(splitStreetLine(line)).toEqual({ street, unit });
  });
});

describe('buildListingAddress', () => {
  it('splits and normalizes every part', () => {
    expect(
      buildListingAddress({
        streetLine: '10-20 Example Road #3M',
        locality: 'ASTORIA',
        postalCode: '11103',
      }),
    ).toEqual({
      street: '10-20 EXAMPLE ROAD',
      unit: '3M',
      borough: 'QUEENS',
      postalCode: '11103',
    });
  });

  it('leaves the unit null when the street line has none', () => {
    expect(
      buildListingAddress({ streetLine: '10 W 42nd St', locality: 'New York' }),
    ).toEqual({
      street: '10 WEST 42 STREET',
      unit: null,
      borough: 'MANHATTAN',
      postalCode: null,
    });
  });

  it('leaves the borough null when the locality is missing or unknown', () => {
    expect(
      buildListingAddress({ streetLine: '10 Main St' })?.borough,
    ).toBeNull();
    expect(
      buildListingAddress({ streetLine: '10 Main St', locality: 'Floral Park' })
        ?.borough,
    ).toBeNull();
  });

  it.each(['1103', '111031', 'ABCDE', ''])(
    'drops the malformed postal code %j',
    (postalCode) => {
      expect(
        buildListingAddress({ streetLine: '10 Main St', postalCode })
          ?.postalCode,
      ).toBeNull();
    },
  );

  it('trims a valid postal code', () => {
    expect(
      buildListingAddress({ streetLine: '10 Main St', postalCode: ' 11103 ' })
        ?.postalCode,
    ).toBe('11103');
  });

  it('returns null when the street line has no street', () => {
    expect(buildListingAddress({ streetLine: '   ' })).toBeNull();
  });
});
