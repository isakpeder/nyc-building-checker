/**
 * Tests for the DOB permits and stop-work orders fetcher, and for city date
 * parsing. Rows are synthetic, and HTTP is mocked with MSW.
 */

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { parseCityDate } from '../../shared/dates';
import {
  activePermits,
  fetchConstruction,
  stopWorkOrders,
  type LegacyPermitRow,
  type NowPermitRow,
} from './construction';

const TODAY = '2026-11-11';

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

describe('activePermits', () => {
  const now = (overrides: Partial<NowPermitRow> = {}): NowPermitRow => ({
    work_permit: 'M0001-I1-EW',
    permit_status: 'Permit Issued',
    work_type: 'Sprinklers',
    issued_date: '2026-10-13T00:00:00.000',
    expired_date: '2027-02-09T00:00:00.000',
    job_description: ' Sprinkler work on floor 11 ',
    ...overrides,
  });
  const legacy = (
    overrides: Partial<LegacyPermitRow> = {},
  ): LegacyPermitRow => ({
    permit_si_no: '3500001',
    permit_status: 'ISSUED',
    work_type: 'PL',
    issuance_date: '09/01/2026',
    expiration_date: '03/01/2027',
    ...overrides,
  });

  it('normalizes both systems to one shape', () => {
    expect(activePermits([legacy()], [now()], TODAY)).toEqual([
      {
        id: 'M0001-I1-EW',
        system: 'dob-now',
        workType: 'Sprinklers',
        issuedOn: '2026-10-13',
        expiresOn: '2027-02-09',
        description: 'Sprinkler work on floor 11',
      },
      {
        id: '3500001',
        system: 'bis',
        workType: 'PL',
        issuedOn: '2026-09-01',
        expiresOn: '2027-03-01',
        description: '',
      },
    ]);
  });

  it.each([
    ['expired', now({ expired_date: '2026-11-10T00:00:00.000' })],
    ['signed off', now({ permit_status: 'Signed-off' })],
    ['revoked', now({ permit_status: 'Revoked' })],
    ['never issued', now({ issued_date: undefined })],
    ['missing an ID', now({ work_permit: undefined })],
  ])('drops a permit that is %s', (_label, row) => {
    expect(activePermits([], [row], TODAY)).toEqual([]);
  });

  it('keeps a permit expiring today', () => {
    expect(
      activePermits(
        [],
        [now({ expired_date: '2026-11-11T00:00:00.000' })],
        TODAY,
      ),
    ).toHaveLength(1);
  });

  it('counts a repeated permit once', () => {
    expect(
      activePermits([legacy(), legacy()], [now(), now()], TODAY),
    ).toHaveLength(2);
  });
});

describe('stopWorkOrders', () => {
  const SINCE = '2023-11-11';

  it('keeps full and partial orders in force, newest first', () => {
    const result = stopWorkOrders(
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
    const result = stopWorkOrders(
      [
        {
          complaint_number: '3',
          disposition_code: 'L2',
          disposition_date: '04/01/2026',
        },
      ],
      SINCE,
    );

    expect(result).toEqual({ active: [], rescinded: 1 });
  });

  it('compares text dates as dates, not alphabetically', () => {
    const result = stopWorkOrders(
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

  it('falls back to the entry date when there is no disposition date', () => {
    const result = stopWorkOrders(
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

  it('uses the latest disposition of a complaint', () => {
    const result = stopWorkOrders(
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

    expect(result).toEqual({ active: [], rescinded: 1 });
  });

  it('ignores other disposition codes', () => {
    const result = stopWorkOrders(
      [
        {
          complaint_number: '5',
          disposition_code: 'I2',
          disposition_date: '06/01/2026',
        },
      ],
      SINCE,
    );

    expect(result).toEqual({ active: [], rescinded: 0 });
  });
});

describe('fetchConstruction', () => {
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

  it('queries all three datasets by BIN', async () => {
    const wheres: Record<string, string> = {};
    for (const id of ['ipu4-2q9a', 'rbx6-tga4', 'eabe-havv']) {
      server.use(
        http.get(`${base}/${id}.json`, ({ request }) => {
          wheres[id] = new URL(request.url).searchParams.get('$where') ?? '';
          return HttpResponse.json([]);
        }),
      );
    }

    const result = await fetchConstruction(
      '1015862',
      new Date('2026-11-11T00:00:00Z'),
      {
        retries: 0,
      },
    );

    expect(result.ok).toBe(true);
    expect(wheres).toEqual({
      'ipu4-2q9a': "bin__ = '1015862'",
      'rbx6-tga4': "bin = '1015862' AND expired_date >= '2026-11-11T00:00:00'",
      'eabe-havv':
        "bin = '1015862' AND disposition_code IN ('A3', 'L1', 'U4', 'U5', 'L2', 'L3')",
    });
  });

  it('fails when one dataset fails', async () => {
    server.use(
      http.get(`${base}/ipu4-2q9a.json`, () => HttpResponse.json([])),
      http.get(
        `${base}/rbx6-tga4.json`,
        () => new HttpResponse(null, { status: 503 }),
      ),
      http.get(`${base}/eabe-havv.json`, () => HttpResponse.json([])),
    );

    await expect(
      fetchConstruction('1015862', new Date(), { retries: 0 }),
    ).resolves.toEqual({ ok: false, error: { kind: 'http', status: 503 } });
  });
});
