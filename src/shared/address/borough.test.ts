/**
 * Unit tests for parseBorough and BOROUGH_CODES in borough.ts.
 */

import { describe, expect, it } from 'vitest';

import { BOROUGH_CODES, parseBorough, type Borough } from './borough';

const CASES: readonly (readonly [input: string, expected: Borough | null])[] = [
  // Canonical names, in any case
  ['Manhattan', 'MANHATTAN'],
  ['BRONX', 'BRONX'],
  ['brooklyn', 'BROOKLYN'],
  ['Queens', 'QUEENS'],
  ['Staten Island', 'STATEN ISLAND'],

  // Spacing and punctuation
  ['  Staten   Island ', 'STATEN ISLAND'],
  ['S.I.', 'STATEN ISLAND'],

  // Codes
  ['MN', 'MANHATTAN'],
  ['BX', 'BRONX'],
  ['BK', 'BROOKLYN'],
  ['QN', 'QUEENS'],
  ['SI', 'STATEN ISLAND'],
  ['1', 'MANHATTAN'],
  ['5', 'STATEN ISLAND'],

  // Counties and other names
  ['New York', 'MANHATTAN'],
  ['New York County', 'MANHATTAN'],
  ['The Bronx', 'BRONX'],
  ['Kings', 'BROOKLYN'],
  ['Kings County', 'BROOKLYN'],
  ['Richmond', 'STATEN ISLAND'],

  // Queens postal cities
  ['Astoria', 'QUEENS'],
  ['Long Island City', 'QUEENS'],
  ['Jamaica', 'QUEENS'],
  ['Saint Albans', 'QUEENS'],
  ['St. Albans', 'QUEENS'],
  ['East Elmhurst', 'QUEENS'],

  // Not one borough
  ['Floral Park', null],
  ['New Hyde Park', null],
  ['Bellerose', null],
  ['New York City', null],
  ['NYC', null],
  ['Jersey City', null],
  ['Richmond Hill Road', null],
  ['6', null],
  ['', null],
];

describe('parseBorough', () => {
  it.each(CASES)('parses %j', (input, expected) => {
    expect(parseBorough(input)).toBe(expected);
  });

  it('accepts its own output', () => {
    for (const borough of Object.keys(BOROUGH_CODES) as Borough[]) {
      expect(parseBorough(borough)).toBe(borough);
    }
  });
});

describe('BOROUGH_CODES', () => {
  it('matches each borough code alias', () => {
    for (const [borough, code] of Object.entries(BOROUGH_CODES)) {
      expect(parseBorough(String(code))).toBe(borough);
    }
  });
});
