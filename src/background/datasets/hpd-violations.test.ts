/**
 * Tests for the HPD violations fetcher. Rows are synthetic, in the dataset's
 * format, and HTTP is mocked with MSW.
 */

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  fetchViolations,
  summarizeViolations,
  type ViolationRow,
} from './hpd-violations';

/**
 * Builds a raw violation row.
 *
 * @param id - The violation ID.
 * @param overrides - Fields to change.
 * @returns The row.
 */
function row(id: string, overrides: Partial<ViolationRow> = {}): ViolationRow {
  return {
    violationid: id,
    class: 'B',
    inspectiondate: '2026-07-28T00:00:00.000',
    violationstatus: 'Open',
    currentstatusdate: '2026-07-30T00:00:00.000',
    novdescription: ' REPAIR THE BROKEN OUTLET ',
    apartment: '3',
    ...overrides,
  };
}

describe('summarizeViolations', () => {
  it('counts by class and status', () => {
    const summary = summarizeViolations(
      [
        row('1', { class: 'A' }),
        row('2', { class: 'B' }),
        row('3', { class: 'C' }),
        row('4', { class: 'C', violationstatus: 'Close' }),
        row('5', { class: 'I' }),
      ],
      false,
    );

    expect(summary.byClass).toEqual({
      A: { open: 1, closed: 0 },
      B: { open: 1, closed: 0 },
      C: { open: 1, closed: 1 },
      I: { open: 1, closed: 0 },
    });
  });

  it('counts a violation repeated five times once', () => {
    const summary = summarizeViolations(
      Array.from({ length: 5 }, () => row('19102346')),
      false,
    );

    expect(summary.violations).toHaveLength(1);
    expect(summary.byClass.B.open).toBe(1);
  });

  it('keeps the latest status of a repeated violation', () => {
    const summary = summarizeViolations(
      [
        row('7', {
          violationstatus: 'Open',
          currentstatusdate: '2026-07-30T00:00:00.000',
        }),
        row('7', {
          violationstatus: 'Close',
          currentstatusdate: '2026-08-17T00:00:00.000',
        }),
      ],
      false,
    );

    expect(summary.violations[0]?.open).toBe(false);
  });

  it('normalizes fields', () => {
    const [violation] = summarizeViolations(
      [row('1', { apartment: 'APT 3-A' })],
      false,
    ).violations;

    expect(violation).toEqual({
      id: '1',
      class: 'B',
      open: true,
      inspectedOn: '2026-07-28',
      description: 'REPAIR THE BROKEN OUTLET',
      unit: '3A',
    });
  });

  it('treats a missing or building-wide apartment as no unit', () => {
    const summary = summarizeViolations(
      [row('1', { apartment: undefined }), row('2', { apartment: 'BLDG' })],
      false,
    );

    expect(summary.violations.map((v) => v.unit)).toEqual([null, null]);
  });

  it.each([
    ['no ID', { violationid: undefined }],
    ['an unknown class', { class: 'Z' }],
    ['no inspection date', { inspectiondate: undefined }],
    ['a malformed inspection date', { inspectiondate: 'soon' }],
  ])('skips a row with %s', (_label, overrides) => {
    const summary = summarizeViolations([row('1', overrides), row('2')], false);

    expect(summary.violations.map((v) => v.id)).toEqual(['2']);
  });

  it('sorts newest first and passes truncation through', () => {
    const summary = summarizeViolations(
      [
        row('old', { inspectiondate: '2022-01-01T00:00:00.000' }),
        row('new', { inspectiondate: '2026-01-01T00:00:00.000' }),
      ],
      true,
    );

    expect(summary.violations.map((v) => v.id)).toEqual(['new', 'old']);
    expect(summary.truncated).toBe(true);
  });

  it('returns zero counts for no rows', () => {
    const summary = summarizeViolations([], false);

    expect(summary.violations).toEqual([]);
    expect(summary.byClass.C).toEqual({ open: 0, closed: 0 });
  });
});

describe('fetchViolations', () => {
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

  it('queries by BBL for recent or open violations', async () => {
    let where = '';
    server.use(
      http.get(
        'https://data.cityofnewyork.us/resource/wvxf-dwi5.json',
        ({ request }) => {
          where = new URL(request.url).searchParams.get('$where') ?? '';
          return HttpResponse.json([row('1')]);
        },
      ),
    );

    const result = await fetchViolations(
      '1004350014',
      new Date('2026-11-11T00:00:00Z'),
      {
        retries: 0,
      },
    );

    expect(where).toBe(
      "bbl = '1004350014' AND (inspectiondate >= '2021-11-11T00:00:00' OR violationstatus = 'Open')",
    );
    expect(result.ok && result.value.violations).toHaveLength(1);
  });

  it('returns the HTTP error when the dataset fails', async () => {
    server.use(
      http.get(
        'https://data.cityofnewyork.us/resource/wvxf-dwi5.json',
        () => new HttpResponse(null, { status: 503 }),
      ),
    );

    await expect(
      fetchViolations('1004350014', new Date(), { retries: 0 }),
    ).resolves.toEqual({
      ok: false,
      error: { kind: 'http', status: 503 },
    });
  });
});
