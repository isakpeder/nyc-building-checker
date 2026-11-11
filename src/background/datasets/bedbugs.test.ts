/**
 * Tests for the bedbug filings fetcher. Rows are synthetic, and HTTP is
 * mocked with MSW.
 */

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { fetchBedbugs, summarizeBedbugs, type BedbugRow } from './bedbugs';

/**
 * Builds a raw bedbug filing.
 *
 * @param overrides - Fields to change.
 * @returns The row.
 */
function filing(overrides: Partial<BedbugRow> = {}): BedbugRow {
  return {
    building_id: '100',
    of_dwelling_units: '6',
    infested_dwelling_unit_count: '0',
    eradicated_unit_count: '0',
    re_infested_dwelling_unit: '0',
    filing_date: '2026-02-16T00:00:00.000',
    ...overrides,
  };
}

describe('summarizeBedbugs', () => {
  it('returns no-filing when there are no filings', () => {
    expect(summarizeBedbugs([])).toEqual({ kind: 'no-filing' });
  });

  it('keeps a report of zero distinct from no filing', () => {
    expect(summarizeBedbugs([filing()])).toEqual({
      kind: 'reported',
      infestedUnits: 0,
      eradicatedUnits: 0,
      reinfestedUnits: 0,
      dwellingUnits: 6,
      filedOn: '2026-02-16',
    });
  });

  it('uses the latest filing of a building', () => {
    const status = summarizeBedbugs([
      filing({
        filing_date: '2024-02-16T00:00:00.000',
        infested_dwelling_unit_count: '4',
      }),
      filing({
        filing_date: '2026-02-16T00:00:00.000',
        infested_dwelling_unit_count: '1',
      }),
    ]);

    expect(status.kind === 'reported' && status.infestedUnits).toBe(1);
  });

  it('adds up the latest filings of each building on the lot', () => {
    const status = summarizeBedbugs([
      filing({
        building_id: '100',
        infested_dwelling_unit_count: '2',
        of_dwelling_units: '10',
      }),
      filing({
        building_id: '200',
        infested_dwelling_unit_count: '3',
        of_dwelling_units: '20',
        filing_date: '2026-03-01T00:00:00.000',
      }),
    ]);

    expect(status).toMatchObject({
      kind: 'reported',
      infestedUnits: 5,
      dwellingUnits: 30,
      filedOn: '2026-03-01',
    });
  });

  it.each([
    ['no filing date', { filing_date: undefined }],
    ['no infested count', { infested_dwelling_unit_count: undefined }],
    ['a negative count', { infested_dwelling_unit_count: '-1' }],
    ['a non-numeric count', { infested_dwelling_unit_count: 'some' }],
  ])('skips a filing with %s', (_label, overrides) => {
    expect(summarizeBedbugs([filing(overrides)])).toEqual({
      kind: 'no-filing',
    });
  });
});

describe('fetchers', () => {
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

  const base = 'https://data.cityofnewyork.us/resource';

  it('queries bedbugs by BBL as text', async () => {
    let where = '';
    server.use(
      http.get(`${base}/wz6d-d3jb.json`, ({ request }) => {
        where = new URL(request.url).searchParams.get('$where') ?? '';
        return HttpResponse.json([
          filing({ infested_dwelling_unit_count: '2' }),
        ]);
      }),
    );

    const result = await fetchBedbugs('1014167501', { retries: 0 });

    expect(where).toBe("bbl = '1014167501'");
    expect(result.ok && result.value.kind).toBe('reported');
  });
});
