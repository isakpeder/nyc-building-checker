/**
 * Tests for the stop-work orders fetcher and city date parsing. Rows are
 * synthetic, and HTTP is mocked with MSW.
 */

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { parseCityDate } from '../../shared/dates';
import { fetchStopWork, summarizeStopWork } from './stop-work';

const SINCE = '2023-11-11';

describe('parseCityDate', () => {
  it.each([
    ['2026-10-13T00:00:00.000', '2026-10-13'],
    ['12/22/2016', '2016-12-22'],
    ['2/5/2017', '2017-02-05'],
    ['02/05/2017 00:00:00', '2017-02-05'],
    ['02/30/2017', null],
    ['2017-13-01', null],
    ['soon', null],
    ['', null],
    [undefined, null],
  ])('reads %j', (value, expected) => {
    expect(parseCityDate(value)).toBe(expected);
  });
});

describe('summarizeStopWork', () => {
  it('keeps full and partial orders in force, newest first', () => {
    const result = summarizeStopWork(
      [
        {
          complaint_number: '1',
          disposition_code: 'A3',
          disposition_date: '01/05/2026',
        },
        {
          complaint_number: '2',
          disposition_code: 'L1',
          disposition_date: '03/05/2026',
        },
      ],
      SINCE,
    );

    expect(result.active).toEqual([
      { complaintNumber: '2', partial: true, date: '2026-03-05' },
      { complaintNumber: '1', partial: false, date: '2026-01-05' },
    ]);
  });

  it('counts lifted orders separately', () => {
    const result = summarizeStopWork(
      [
        {
          complaint_number: '3',
          disposition_code: 'L2',
          disposition_date: '04/01/2026',
        },
      ],
      SINCE,
    );

    expect(result).toEqual({ active: [], rescinded: 1, truncated: false });
  });

  it('compares text dates as dates, not alphabetically', () => {
    const result = summarizeStopWork(
      [
        {
          complaint_number: 'old',
          disposition_code: 'A3',
          disposition_date: '12/22/2016',
        },
        {
          complaint_number: 'new',
          disposition_code: 'A3',
          disposition_date: '12/20/2024',
        },
      ],
      SINCE,
    );

    expect(result.active.map((o) => o.complaintNumber)).toEqual(['new']);
  });

  it('uses the latest disposition of a complaint', () => {
    const result = summarizeStopWork(
      [
        {
          complaint_number: '6',
          disposition_code: 'L2',
          disposition_date: '05/01/2026',
        },
        {
          complaint_number: '6',
          disposition_code: 'A3',
          disposition_date: '02/01/2026',
        },
      ],
      SINCE,
    );

    expect(result).toEqual({ active: [], rescinded: 1, truncated: false });
  });

  it('falls back to the entry date when there is no disposition date', () => {
    const result = summarizeStopWork(
      [
        {
          complaint_number: '4',
          disposition_code: 'a3',
          date_entered: '06/01/2026',
        },
      ],
      SINCE,
    );

    expect(result.active[0]?.date).toBe('2026-06-01');
  });

  it('ignores other disposition codes', () => {
    const result = summarizeStopWork(
      [
        {
          complaint_number: '5',
          disposition_code: 'I2',
          disposition_date: '06/01/2026',
        },
      ],
      SINCE,
    );

    expect(result).toEqual({ active: [], rescinded: 0, truncated: false });
  });
});

describe('fetchStopWork', () => {
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

  const URL = 'https://data.cityofnewyork.us/resource/eabe-havv.json';

  it('queries stop-work codes by BIN', async () => {
    let where = '';
    server.use(
      http.get(URL, ({ request }) => {
        where =
          new globalThis.URL(request.url).searchParams.get('$where') ?? '';
        return HttpResponse.json([]);
      }),
    );

    const result = await fetchStopWork(
      '1015862',
      new Date('2026-11-11T00:00:00Z'),
      {
        retries: 0,
      },
    );

    expect(result.ok).toBe(true);
    expect(where).toBe(
      "bin = '1015862' AND disposition_code IN ('A3', 'L1', 'U4', 'U5', 'L2', 'L3')",
    );
  });

  it('returns the HTTP error when the dataset fails', async () => {
    server.use(http.get(URL, () => new HttpResponse(null, { status: 503 })));

    await expect(
      fetchStopWork('1015862', new Date(), { retries: 0 }),
    ).resolves.toEqual({
      ok: false,
      error: { kind: 'http', status: 503 },
    });
  });
});
