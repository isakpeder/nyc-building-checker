/**
 * Tests for the report card's rows. Reports are synthetic.
 */

import { describe, expect, it } from 'vitest';

import type { StreetAddress } from '../../shared/address/street';
import type { BuildingReport, ReportSections } from '../../shared/messages';
import { buildRows, monthYear, sourceUrl } from './rows';

const counts = (open: number, closed = 0) => ({ open, closed });

/**
 * Builds a report with every section loaded and empty.
 *
 * @param sections - Sections to replace.
 * @param bin - The building's BIN.
 * @returns The report.
 */
function report(
  sections: Partial<ReportSections> = {},
  bin: string | null = '4123456',
): BuildingReport {
  return {
    address: {
      street: '10 EXAMPLE STREET' as StreetAddress,
      unit: null,
      borough: 'QUEENS',
      postalCode: null,
      region: 'NY',
    },
    building: { bbl: '4001230001', bin },
    sections: {
      violations: {
        status: 'ok',
        data: {
          byClass: { A: counts(0), B: counts(0), C: counts(0), I: counts(0) },
          violations: [],
          truncated: false,
        },
      },
      complaints: {
        status: 'ok',
        data: {
          byCategory: {
            heat: { requests: 0, incidents: 0 },
            pests: { requests: 0, incidents: 0 },
            rodents: { requests: 0, incidents: 0 },
            plumbing: { requests: 0, incidents: 0 },
            building: { requests: 0, incidents: 0 },
            noise: { requests: 0, incidents: 0 },
            other: { requests: 0, incidents: 0 },
          },
          incidents: [],
          truncated: false,
        },
      },
      stopWork: {
        status: 'ok',
        data: { active: [], rescinded: 0, truncated: false },
      },
      bedbugs: { status: 'ok', data: { kind: 'no-filing' } },
      ...sections,
    },
    builtAt: '2026-11-11T00:00:00.000Z',
  };
}

/**
 * Finds one row by key.
 *
 * @param rows - The rows.
 * @param key - The section key.
 * @returns The row.
 */
function row(rows: ReturnType<typeof buildRows>, key: keyof ReportSections) {
  const found = rows.find((r) => r.key === key);
  if (found === undefined) throw new Error(`no ${key} row`);
  return found;
}

describe('buildRows', () => {
  it('shows one row per source in a fixed order', () => {
    expect(buildRows(report()).map((r) => r.key)).toEqual([
      'violations',
      'complaints',
      'stopWork',
      'bedbugs',
    ]);
  });

  it('describes a building with no problems plainly', () => {
    const rows = buildRows(report());

    expect(row(rows, 'violations')).toMatchObject({
      value: 'None open on record',
      warning: false,
    });
    expect(row(rows, 'complaints').value).toBe('None');
    expect(row(rows, 'stopWork')).toMatchObject({
      value: 'None in force',
      warning: false,
    });
    expect(row(rows, 'bedbugs')).toMatchObject({
      value: 'No filing on record',
      warning: false,
    });
  });

  it('flags open class C violations', () => {
    const rows = buildRows(
      report({
        violations: {
          status: 'ok',
          data: {
            byClass: {
              A: counts(1, 4),
              B: counts(1),
              C: counts(2, 1),
              I: counts(0),
            },
            violations: [],
            truncated: false,
          },
        },
      }),
    );

    expect(row(rows, 'violations')).toMatchObject({
      value: '4 open on record, 2 class C',
      detail: '5 closed in the last 5 years',
      warning: true,
    });
  });

  it('leaves out the closed count when it is zero', () => {
    expect(row(buildRows(report()), 'violations').detail).toBeUndefined();
  });

  it('marks truncated counts with a plus', () => {
    const rows = buildRows(
      report({
        violations: {
          status: 'ok',
          data: {
            byClass: {
              A: counts(5000),
              B: counts(0),
              C: counts(0),
              I: counts(0),
            },
            violations: [],
            truncated: true,
          },
        },
      }),
    );

    expect(row(rows, 'violations').value).toBe('5,000+ open on record');
  });

  it('lists the top three complaint categories, leaving out other', () => {
    const base = report().sections.complaints;
    if (base.status !== 'ok') throw new Error('fixture');
    const rows = buildRows(
      report({
        complaints: {
          status: 'ok',
          data: {
            ...base.data,
            byCategory: {
              ...base.data.byCategory,
              heat: { requests: 9, incidents: 4 },
              pests: { requests: 2, incidents: 2 },
              noise: { requests: 1, incidents: 1 },
              plumbing: { requests: 3, incidents: 3 },
              other: { requests: 8, incidents: 8 },
            },
            incidents: Array.from({ length: 18 }, () => ({}) as never),
          },
        },
      }),
    );

    expect(row(rows, 'complaints')).toMatchObject({
      value: '18 incidents',
      detail: 'heat 4 · plumbing 3 · pests 2 · 8 other',
    });
  });

  it('uses the singular for one incident', () => {
    const base = report().sections.complaints;
    if (base.status !== 'ok') throw new Error('fixture');
    const rows = buildRows(
      report({
        complaints: {
          status: 'ok',
          data: { ...base.data, incidents: [{} as never] },
        },
      }),
    );

    expect(row(rows, 'complaints').value).toBe('1 incident');
  });

  it('shows stop-work orders in force and lifted ones', () => {
    const rows = buildRows(
      report({
        stopWork: {
          status: 'ok',
          data: { active: [{} as never], rescinded: 2, truncated: false },
        },
      }),
    );

    expect(row(rows, 'stopWork')).toMatchObject({
      value: '1 in force',
      detail: '2 lifted in the last 3 years',
      warning: true,
    });
  });

  it.each([
    [0, '0 infested units reported', false],
    [1, '1 infested unit reported', true],
    [3, '3 infested units reported', true],
  ])('describes a bedbug filing of %i units', (infested, value, warning) => {
    const rows = buildRows(
      report({
        bedbugs: {
          status: 'ok',
          data: {
            kind: 'reported',
            infestedUnits: infested,
            eradicatedUnits: 0,
            reinfestedUnits: 0,
            dwellingUnits: 40,
            filedOn: '2026-02-16',
          },
        },
      }),
    );

    expect(row(rows, 'bedbugs')).toMatchObject({
      value,
      detail: 'Filed Feb 2026',
      warning,
    });
  });

  it('shows a source that did not load as unavailable', () => {
    const rows = buildRows(report({ complaints: { status: 'unavailable' } }));

    expect(row(rows, 'complaints').value).toBeNull();
    expect(row(rows, 'violations').value).toBe('None open on record');
  });

  it('links each row to its records', () => {
    const rows = buildRows(report());

    expect(row(rows, 'violations').href).toBe(
      'https://data.cityofnewyork.us/resource/wvxf-dwi5.json?bbl=4001230001',
    );
    expect(row(rows, 'stopWork').href).toBe(
      'https://data.cityofnewyork.us/resource/eabe-havv.json?bin=4123456',
    );
  });

  it('links stop-work orders to the dataset when there is no BIN', () => {
    expect(row(buildRows(report({}, null)), 'stopWork').href).toBe(
      'https://data.cityofnewyork.us/d/eabe-havv',
    );
  });
});

describe('helpers', () => {
  it('formats months', () => {
    expect(monthYear('2026-02-16')).toBe('Feb 2026');
    expect(monthYear('2025-12-01')).toBe('Dec 2025');
  });

  it('encodes source parameters', () => {
    expect(sourceUrl('abcd-1234', 'bbl', '1 2')).toBe(
      'https://data.cityofnewyork.us/resource/abcd-1234.json?bbl=1+2',
    );
  });
});
