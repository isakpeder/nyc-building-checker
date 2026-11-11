/**
 * Tests for the 311 complaints fetcher. Rows are synthetic, in the dataset's
 * format, and HTTP is mocked with MSW.
 */

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  categorize,
  fetchComplaints,
  summarizeComplaints,
  type ComplaintRow,
} from './complaints-311';

/**
 * Builds a raw 311 row.
 *
 * @param key - The request's unique key.
 * @param overrides - Fields to change.
 * @returns The row.
 */
function row(key: string, overrides: Partial<ComplaintRow> = {}): ComplaintRow {
  return {
    unique_key: key,
    created_date: '2026-01-15T08:30:00.000',
    agency: 'HPD',
    complaint_type: 'HEAT/HOT WATER',
    descriptor: 'ENTIRE BUILDING',
    ...overrides,
  };
}

describe('categorize', () => {
  it.each([
    ['HPD', 'HEAT/HOT WATER', 'APARTMENT ONLY', 'heat'],
    ['DOHMH', 'Rodent', 'Rat Sighting', 'pests'],
    ['HPD', 'UNSANITARY CONDITION', 'PESTS', 'pests'],
    ['HPD', 'UNSANITARY CONDITION', 'MICE', 'pests'],
    ['HPD', 'UNSANITARY CONDITION', 'BED BUGS', 'pests'],
    ['HPD', 'PLUMBING', 'TOILET', 'plumbing'],
    ['HPD', 'WATER LEAK', 'SLOW LEAK', 'plumbing'],
    ['NYPD', 'Noise - Residential', 'Loud Music/Party', 'noise'],
    ['NYPD', 'Noise - Street/Sidewalk', 'Loud Talking', 'noise'],
    ['HPD', 'PAINT/PLASTER', 'WALL', 'building'],
    ['DOB', 'Elevator', 'Elevator Not Inspected', 'building'],
    ['HPD', 'UNSANITARY CONDITION', 'GARBAGE/RECYCLING STORAGE', 'building'],
    ['DSNY', 'Graffiti', 'Graffiti', 'other'],
    ['DEP', 'Air Quality', 'Dust from Construction', 'other'],
    ['NYPD', 'Encampment', 'N/A', 'other'],
  ] as const)('puts %s %j / %j in %s', (agency, type, descriptor, expected) => {
    expect(categorize(agency, type, descriptor)).toBe(expected);
  });

  it('does not match pest words inside other words', () => {
    expect(categorize('HPD', 'GENERAL', 'PARATROOPER')).toBe('building');
  });
});

describe('summarizeComplaints', () => {
  it('counts one request repeated five times once', () => {
    const summary = summarizeComplaints(
      Array.from({ length: 5 }, () => row('63000001')),
      false,
    );

    expect(summary.byCategory.heat).toEqual({ requests: 1, incidents: 1 });
  });

  it('groups same-day requests of one type into one incident', () => {
    const summary = summarizeComplaints(
      [
        row('1', { created_date: '2026-01-15T07:00:00.000' }),
        row('2', { created_date: '2026-01-15T09:00:00.000' }),
        row('3', { created_date: '2026-01-15T22:00:00.000' }),
      ],
      false,
    );

    expect(summary.byCategory.heat).toEqual({ requests: 3, incidents: 1 });
    expect(summary.incidents[0]?.requests).toBe(3);
  });

  it('keeps different days and different descriptors apart', () => {
    const summary = summarizeComplaints(
      [
        row('1', { created_date: '2026-01-15T07:00:00.000' }),
        row('2', { created_date: '2026-01-16T07:00:00.000' }),
        row('3', { descriptor: 'APARTMENT ONLY' }),
      ],
      false,
    );

    expect(summary.byCategory.heat).toEqual({ requests: 3, incidents: 3 });
  });

  it('matches incidents regardless of case', () => {
    const summary = summarizeComplaints(
      [
        row('1', {
          complaint_type: 'Noise - Residential',
          descriptor: 'Loud Music/Party',
        }),
        row('2', {
          complaint_type: 'NOISE - RESIDENTIAL',
          descriptor: 'LOUD MUSIC/PARTY',
        }),
      ],
      false,
    );

    expect(summary.byCategory.noise).toEqual({ requests: 2, incidents: 1 });
  });

  it.each([
    ['no key', { unique_key: undefined }],
    ['no type', { complaint_type: undefined }],
    ['a malformed date', { created_date: 'yesterday' }],
  ])('skips a row with %s', (_label, overrides) => {
    const summary = summarizeComplaints([row('1', overrides)], false);

    expect(summary.incidents).toEqual([]);
  });

  it('sorts incidents newest first and keeps truncation', () => {
    const summary = summarizeComplaints(
      [
        row('1', { created_date: '2024-01-01T00:00:00.000' }),
        row('2', { created_date: '2026-01-01T00:00:00.000' }),
      ],
      true,
    );

    expect(summary.incidents.map((i) => i.date)).toEqual([
      '2026-01-01',
      '2024-01-01',
    ]);
    expect(summary.truncated).toBe(true);
  });
});

describe('fetchComplaints', () => {
  const server = setupServer();
  beforeAll(() => {
    server.listen({ onUnhandledFrame: 'error' });
  });
  afterEach(() => {
    server.resetHandlers();
  });
  afterAll(() => {
    server.close();
  });

  it('queries the last three years by BBL', async () => {
    let where = '';
    server.use(
      http.get(
        'https://data.cityofnewyork.us/resource/erm2-nwe9.json',
        ({ request }) => {
          where = new URL(request.url).searchParams.get('$where') ?? '';
          return HttpResponse.json([row('1')]);
        },
      ),
    );

    const result = await fetchComplaints(
      '1004350014',
      new Date('2026-11-11T00:00:00Z'),
      {
        retries: 0,
      },
    );

    expect(where).toBe(
      "bbl = '1004350014' AND created_date >= '2023-11-11T00:00:00'",
    );
    expect(result.ok && result.value.byCategory.heat.incidents).toBe(1);
  });
});
