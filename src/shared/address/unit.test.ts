/**
 * Unit tests for normalizeUnit in unit.ts. Spellings come from HPD violation
 * records.
 */

import { describe, expect, it } from 'vitest';

import { normalizeUnit } from './unit';

const CASES: readonly (readonly [input: string, expected: string | null])[] = [
  // Plain units
  ['5A', '5A'],
  ['5a', '5A'],
  [' 12B ', '12B'],
  ['1203', '1203'],
  ['A', 'A'],

  // Punctuation and spacing
  ['#5A', '5A'],
  ['5-A', '5A'],
  ['5 A', '5A'],
  ['# 5-A', '5A'],
  ['5.A', '5A'],

  // Prefixes
  ['Apt 5A', '5A'],
  ['Apt. 5-A', '5A'],
  ['APT2A', '2A'],
  ['Apartment 12', '12'],
  ['Unit 3', '3'],
  ['Suite 400', '400'],
  ['Ste 400', '400'],
  ['Rm 2', '2'],
  ['No. 4', '4'],
  ['Apt #5-A', '5A'],

  // Penthouses
  ['PH', 'PH'],
  ['PHA', 'PHA'],
  ['PH-A', 'PHA'],
  ['PH 1', 'PH1'],
  ['Penthouse', 'PH'],
  ['Penthouse B', 'PHB'],
  ['Apt PH', 'PH'],

  // Floors
  ['2FL', 'FL2'],
  ['2NDFLO', 'FL2'],
  ['2NDFLR', 'FL2'],
  ['2ND FL', 'FL2'],
  ['2nd Floor', 'FL2'],
  ['2FLOOR', 'FL2'],
  ['FLOOR2', 'FL2'],
  ['FL2', 'FL2'],
  ['Floor 11', 'FL11'],
  ['1ST FL', 'FL1'],
  ['3RDFL', 'FL3'],

  // Named units
  ['BSMT', 'BSMT'],
  ['Basement', 'BSMT'],
  ['Garden', 'GARDEN'],
  ['GRDN', 'GARDEN'],
  ['GDN', 'GARDEN'],
  ['Ground', 'GROUND'],
  ['GRD', 'GROUND'],

  // Prefix lookalikes keep their letters
  ['North', 'NORTH'],
  ['NO1', '1'],
  ['No. 4B', '4B'],
  ['NOAPAR', 'NOAPAR'],
  ['Unit A', 'A'],

  // Building-wide placeholders
  ['BLDG', null],
  ['Building', null],
  ['ENTIRE', null],
  ['ALL', null],
  ['N/A', null],
  ['NA', null],
  ['None', null],

  // No designation
  ['', null],
  ['   ', null],
  ['#', null],
  ['Apt', null],
  ['Apt #', null],
];

describe('normalizeUnit', () => {
  it.each(CASES)('normalizes %j', (input, expected) => {
    expect(normalizeUnit(input)).toBe(expected);
  });

  it.each(CASES.filter(([, expected]) => expected !== null))(
    'is idempotent for %j',
    (input) => {
      const once = normalizeUnit(input);

      expect(once).not.toBeNull();
      expect(normalizeUnit(once ?? '')).toBe(once);
    },
  );

  it('keeps different units distinct', () => {
    const units = ['5A', '5B', '15A', 'PHA', 'FL5', 'GARDEN', 'GROUND'].map(
      normalizeUnit,
    );

    expect(new Set(units).size).toBe(units.length);
  });
});
