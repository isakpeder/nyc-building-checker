/**
 * Tests for geocode. GeoSearch is mocked with MSW using synthetic results in its
 * response shape.
 */

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ListingAddress } from '../shared/address/listing-address';
import type { StreetAddress } from '../shared/address/street';
import { err } from '../shared/result';
import { geocode, searchText } from './geocode';

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

const FAST = { retries: 0 };

/**
 * Builds one GeoSearch result.
 *
 * @param name - The address line GeoSearch returns.
 * @param borough - The borough name.
 * @param bbl - The tax lot ID.
 * @param bin - The building ID.
 * @returns The result object.
 */
function feature(
  name: string,
  borough: string,
  bbl: string,
  bin = `${bbl[0] ?? '1'}123456`,
) {
  return { properties: { name, borough, addendum: { pad: { bbl, bin } } } };
}

/**
 * Serves the given results and records the search text.
 *
 * @param features - The results to return.
 * @returns The captured search text.
 */
function respond(...features: ReturnType<typeof feature>[]) {
  const seen = { text: '' };
  server.use(
    http.get('https://geosearch.planninglabs.nyc/v2/search', ({ request }) => {
      seen.text = new URL(request.url).searchParams.get('text') ?? '';
      return HttpResponse.json({ type: 'FeatureCollection', features });
    }),
  );
  return seen;
}

/**
 * Builds a listing address.
 *
 * @param street - The canonical street.
 * @param borough - The borough, or `null`.
 * @returns The address.
 */
function address(
  street: string,
  borough: ListingAddress['borough'] = 'MANHATTAN',
): ListingAddress {
  return {
    street: street as StreetAddress,
    unit: '5A' as ListingAddress['unit'],
    borough,
    postalCode: null,
  };
}

describe('geocode', () => {
  it('accepts a result with the same street and borough', async () => {
    respond(
      feature('100 WEST 42 STREET', 'Manhattan', '1012340001', '1012345'),
    );

    await expect(geocode(address('100 WEST 42 STREET'), FAST)).resolves.toEqual(
      {
        ok: true,
        value: { bbl: '1012340001', bin: '1012345', borough: 'MANHATTAN' },
      },
    );
  });

  it('accepts the city spelling of an equivalent address', async () => {
    respond(feature("100 SAINT MARK'S PLACE", 'Manhattan', '1004560001'));

    const result = await geocode(address('100 SAINT MARKS PLACE'), FAST);

    expect(result.ok && result.value.bbl).toBe('1004560001');
  });

  it('skips a wrong house number and keeps the right one', async () => {
    respond(
      feature('15 AVENUE J', 'Brooklyn', '3065000001'),
      feature('1000 AVENUE J', 'Brooklyn', '3066000002'),
    );

    const result = await geocode(address('1000 AVENUE J', 'BROOKLYN'), FAST);

    expect(result.ok && result.value.bbl).toBe('3066000002');
  });

  it.each([
    [
      'a different street',
      feature('100 MANHATTAN AVENUE', 'Manhattan', '1018400001'),
    ],
    [
      'a different house number',
      feature('3 WEST END AVENUE', 'Manhattan', '1011710001'),
    ],
    [
      'a different borough',
      feature('100 WEST END AVENUE', 'Brooklyn', '3087260001'),
    ],
    [
      'a BBL from another borough',
      feature('100 WEST END AVENUE', 'Manhattan', '3087260001'),
    ],
    [
      'an unknown borough',
      feature('100 WEST END AVENUE', 'Nassau', '1011710001'),
    ],
  ])('rejects %s', async (_label, result) => {
    respond(result);

    await expect(
      geocode(address('100 WEST END AVENUE'), FAST),
    ).resolves.toEqual(err('not-found'));
  });

  it('returns not-found when there are no results', async () => {
    respond();

    await expect(geocode(address('1 NOWHERE STREET'), FAST)).resolves.toEqual(
      err('not-found'),
    );
  });

  describe('without a listing borough', () => {
    it('accepts a match that is unique across boroughs', async () => {
      respond(
        feature('10-20 EXAMPLE ROAD', 'Queens', '4001230001'),
        feature('12 EXAMPLE ROAD', 'Queens', '4001230002'),
      );

      const result = await geocode(address('10-20 EXAMPLE ROAD', null), FAST);

      expect(result.ok && result.value.borough).toBe('QUEENS');
    });

    it('rejects the same street in two boroughs', async () => {
      respond(
        feature('100 MAIN STREET', 'Queens', '4001230001'),
        feature('100 MAIN STREET', 'Staten Island', '5001230001'),
      );

      await expect(
        geocode(address('100 MAIN STREET', null), FAST),
      ).resolves.toEqual(err('ambiguous'));
    });
  });

  it('treats repeated results for one lot as one building', async () => {
    respond(
      feature('100 WEST 42 STREET', 'Manhattan', '1012340001'),
      feature('100 WEST 42 STREET', 'Manhattan', '1012340001'),
    );

    const result = await geocode(address('100 WEST 42 STREET'), FAST);

    expect(result.ok).toBe(true);
  });

  it('turns a placeholder BIN into null', async () => {
    respond(
      feature('100 WEST 42 STREET', 'Manhattan', '1012340001', '1000000'),
    );

    const result = await geocode(address('100 WEST 42 STREET'), FAST);

    expect(result.ok && result.value.bin).toBeNull();
  });

  it('returns unavailable when GeoSearch fails', async () => {
    server.use(
      http.get(
        'https://geosearch.planninglabs.nyc/v2/search',
        () => new HttpResponse(null, { status: 503 }),
      ),
    );

    await expect(geocode(address('100 WEST 42 STREET'), FAST)).resolves.toEqual(
      err('unavailable'),
    );
  });

  it('searches with the borough and without the unit', async () => {
    const seen = respond();

    await geocode(address('100 WEST 42 STREET'), FAST);

    expect(seen.text).toBe('100 WEST 42 STREET, MANHATTAN');
  });
});

describe('searchText', () => {
  it('names the city when the borough is unknown', () => {
    expect(searchText(address('1 MAIN STREET', null))).toBe(
      '1 MAIN STREET, New York City',
    );
  });
});
