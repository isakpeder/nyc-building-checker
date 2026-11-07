/**
 * Unit tests for classifyPage in page-type.ts. All URLs are synthetic and only
 * reproduce StreetEasy's URL shapes.
 */

import { describe, expect, it } from 'vitest';

import { classifyPage, type PageType } from './page-type';

const BASE = 'https://streeteasy.com';

describe('classifyPage', () => {
  const cases: readonly {
    readonly label: string;
    readonly url: string;
    readonly expected: PageType;
  }[] = [
    // Listings
    {
      label: 'a listing with an alphanumeric unit',
      url: `${BASE}/building/example-tower/5a`,
      expected: { kind: 'listing', building: 'example-tower', unit: '5a' },
    },
    {
      label: 'a listing with a numeric unit',
      url: `${BASE}/building/10-example-street-queens/1234`,
      expected: {
        kind: 'listing',
        building: '10-example-street-queens',
        unit: '1234',
      },
    },
    {
      label: 'a rental share link',
      url: `${BASE}/building/example-tower/5a?utm_campaign=rental_listing&utm_medium=share&lstt=abc`,
      expected: { kind: 'listing', building: 'example-tower', unit: '5a' },
    },
    {
      label: 'a sale share link',
      url: `${BASE}/building/example-tower/5a?infeed=1&utm_campaign=sale_listing`,
      expected: { kind: 'listing', building: 'example-tower', unit: '5a' },
    },
    {
      label: 'a listing with a trailing slash',
      url: `${BASE}/building/example-tower/5a/`,
      expected: { kind: 'listing', building: 'example-tower', unit: '5a' },
    },
    {
      label: 'a listing with a fragment',
      url: `${BASE}/building/example-tower/5a#photos`,
      expected: { kind: 'listing', building: 'example-tower', unit: '5a' },
    },

    // Building pages
    {
      label: 'a building page',
      url: `${BASE}/building/example-tower-1-example-street-new_york`,
      expected: {
        kind: 'building',
        building: 'example-tower-1-example-street-new_york',
      },
    },
    {
      label: 'a building page with a trailing slash',
      url: `${BASE}/building/example-tower/`,
      expected: { kind: 'building', building: 'example-tower' },
    },

    // Search pages
    {
      label: 'a search page',
      url: `${BASE}/search?utf8=%E2%9C%93&search=Example`,
      expected: { kind: 'search' },
    },

    // Other StreetEasy paths
    { label: 'the home page', url: `${BASE}/`, expected: { kind: 'other' } },
    {
      label: 'the building section with no name',
      url: `${BASE}/building`,
      expected: { kind: 'other' },
    },
    {
      label: 'a path deeper than a listing',
      url: `${BASE}/building/example-tower/5a/photos`,
      expected: { kind: 'other' },
    },
    {
      label: 'a path that starts with a known section name',
      url: `${BASE}/buildings/example-tower`,
      expected: { kind: 'other' },
    },
    {
      label: 'a path under the search section',
      url: `${BASE}/search/saved`,
      expected: { kind: 'other' },
    },
    {
      label: 'a differently cased section name',
      url: `${BASE}/Building/example-tower`,
      expected: { kind: 'other' },
    },

    // Other hosts and invalid input
    {
      label: 'a different site',
      url: 'https://example.com/building/example-tower/5a',
      expected: { kind: 'other' },
    },
    {
      label: 'a subdomain',
      url: 'https://www.streeteasy.com/building/example-tower/5a',
      expected: { kind: 'other' },
    },
    {
      label: 'a lookalike host',
      url: 'https://streeteasy.com.example.org/building/example-tower/5a',
      expected: { kind: 'other' },
    },
    { label: 'an empty string', url: '', expected: { kind: 'other' } },
    {
      label: 'a relative path',
      url: '/building/example-tower/5a',
      expected: { kind: 'other' },
    },
  ];

  it.each(cases)('classifies $label', ({ url, expected }) => {
    expect(classifyPage(url)).toEqual(expected);
  });

  it('accepts an uppercase hostname', () => {
    expect(classifyPage('https://StreetEasy.com/search')).toEqual({
      kind: 'search',
    });
  });
});
