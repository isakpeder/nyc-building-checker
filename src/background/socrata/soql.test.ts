/**
 * Tests for the SoQL builder, including injection attempts, and the paging client.
 */

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { queryDataset } from './client';
import { identifier, soql, toSearchParams } from './soql';

describe('soql', () => {
  it.each([
    ['a plain string', soql`bbl = ${'1008350041'}`, "bbl = '1008350041'"],
    [
      'an apostrophe',
      soql`street = ${"SAINT MARK'S"}`,
      "street = 'SAINT MARK''S'",
    ],
    ['a number', soql`unitsres > ${12}`, 'unitsres > 12'],
    [
      'a date as a floating timestamp',
      soql`created_date >= ${new Date('2024-01-02T03:04:05.678Z')}`,
      "created_date >= '2024-01-02T03:04:05'",
    ],
    ['a list', soql`class IN ${['A', 'B']}`, "class IN ('A', 'B')"],
    [
      'a nested fragment',
      soql`${soql`bbl = ${'1'}`} AND ${soql`bin = ${'2'}`}`,
      "bbl = '1' AND bin = '2'",
    ],
  ])('inserts %s', (_label, fragment, expected) => {
    expect(fragment.text).toBe(expected);
  });

  it.each([
    "X' OR '1'='1",
    "'; DROP TABLE violations; --",
    "\\' OR 1=1 --",
    "x'' OR ''1''=''1",
  ])('keeps the injection attempt %j inside one string literal', (attempt) => {
    const { text } = soql`bbl = ${attempt}`;

    // Removing every escaped quote pair must leave exactly the two delimiters.
    const quotes = text.replaceAll("''", '').match(/'/g) ?? [];
    expect(quotes).toHaveLength(2);
    expect(text.startsWith("bbl = '")).toBe(true);
    expect(text.endsWith("'")).toBe(true);
  });

  it.each([
    ['a non-finite number', () => soql`x = ${Number.NaN}`],
    ['an invalid date', () => soql`x = ${new Date('nope')}`],
    ['an empty list', () => soql`x IN ${[]}`],
  ])('throws for %s', (_label, build) => {
    expect(build).toThrow();
  });
});

describe('identifier', () => {
  it.each(['bbl', 'created_date', 'boro2', ':id'])('accepts %j', (name) => {
    expect(identifier(name)).toBe(name);
  });

  it.each(['BBL', 'a b', 'bbl;', "bbl'", 'count(*)', '', '2bbl'])(
    'rejects %j',
    (name) => {
      expect(() => identifier(name)).toThrow('Invalid SoQL identifier');
    },
  );
});

describe('toSearchParams', () => {
  it('builds every parameter', () => {
    const params = toSearchParams({
      select: ['bbl', 'class'],
      where: soql`bbl = ${'1'}`,
      order: { column: 'inspectiondate', descending: true },
      limit: 10,
      offset: 20,
    });

    expect(Object.fromEntries(params)).toEqual({
      $select: 'bbl,class',
      $where: "bbl = '1'",
      $order: 'inspectiondate DESC',
      $limit: '10',
      $offset: '20',
    });
  });

  it('rejects an unsafe column in select or order', () => {
    expect(() => toSearchParams({ select: ['bbl; x'] })).toThrow();
    expect(() => toSearchParams({ order: { column: 'x DESC, y' } })).toThrow();
  });
});

describe('queryDataset', () => {
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

  const Row = z.object({ id: z.number() });

  /**
   * Serves a dataset of `total` rows and records each request's parameters.
   *
   * @param total - How many rows the dataset holds.
   * @returns The recorded parameters.
   */
  function dataset(total: number) {
    const requests: Record<string, string>[] = [];
    server.use(
      http.get(
        'https://data.cityofnewyork.us/resource/abcd-1234.json',
        ({ request }) => {
          const params = Object.fromEntries(new URL(request.url).searchParams);
          requests.push(params);
          const offset = Number(params.$offset);
          const limit = Number(params.$limit);
          const count = Math.max(0, Math.min(limit, total - offset));
          return HttpResponse.json(
            Array.from({ length: count }, (_, i) => ({ id: offset + i })),
          );
        },
      ),
    );
    return requests;
  }

  it('pages until a short page arrives', async () => {
    const requests = dataset(2500);

    const result = await queryDataset('abcd-1234', {}, Row, { retries: 0 });

    expect(result.ok && result.value.rows).toHaveLength(2500);
    expect(result.ok && result.value.truncated).toBe(false);
    expect(requests.map((r) => r.$offset)).toEqual(['0', '1000', '2000']);
    expect(requests.every((r) => r.$order === ':id')).toBe(true);
  });

  it('stops at the row cap and reports truncation', async () => {
    dataset(10_000);

    const result = await queryDataset('abcd-1234', {}, Row, {
      retries: 0,
      maxRows: 1500,
    });

    expect(result.ok && result.value.rows).toHaveLength(1500);
    expect(result.ok && result.value.truncated).toBe(true);
  });

  it('returns an empty result for no matches', async () => {
    dataset(0);

    const result = await queryDataset('abcd-1234', {}, Row, { retries: 0 });

    expect(result).toEqual({ ok: true, value: { rows: [], truncated: false } });
  });

  it('returns the HTTP error of a failed page', async () => {
    server.use(
      http.get(
        'https://data.cityofnewyork.us/resource/abcd-1234.json',
        () => new HttpResponse(null, { status: 403 }),
      ),
    );

    await expect(
      queryDataset('abcd-1234', {}, Row, { retries: 0 }),
    ).resolves.toEqual({
      ok: false,
      error: { kind: 'http', status: 403 },
    });
  });

  it('rejects a malformed dataset ID', async () => {
    await expect(queryDataset('../x', {}, Row)).rejects.toThrow(
      'Invalid dataset ID',
    );
  });
});
