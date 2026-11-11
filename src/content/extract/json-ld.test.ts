/**
 * Unit tests for addressFromJsonLd in json-ld.ts. The fixtures are synthetic and
 * reproduce only the node types and nesting of StreetEasy listing pages.
 */

import { describe, expect, it } from 'vitest';

import { err } from '../../shared/result';
import { addressFromJsonLd } from './json-ld';

/** A PostalAddress node. */
function postalAddress(streetAddress: string, addressLocality = 'ASTORIA') {
  return {
    '@type': 'PostalAddress',
    streetAddress,
    addressLocality,
    addressRegion: 'NY',
    postalCode: '11103',
    addressCountry: 'US',
  };
}

/** An ItemPage node whose main entity has the given address. */
function itemPage(streetAddress: string) {
  return {
    '@type': 'ItemPage',
    mainEntity: {
      '@type': 'Apartment',
      address: postalAddress(streetAddress),
    },
  };
}

/** A block shaped like a StreetEasy listing page's JSON-LD. */
function listingPage(streetAddress: string) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', name: 'Example Listings' },
      // The agent's office comes before the listing.
      {
        '@type': 'Person',
        address: postalAddress('99 Agent Office Ave', 'New York'),
      },
      itemPage(streetAddress),
      { '@type': 'Apartment', address: postalAddress(streetAddress) },
      {
        '@type': 'ApartmentComplex',
        address: postalAddress('10-20 Example Road'),
      },
      { '@type': 'SubwayStation', address: { '@type': 'PostalAddress' } },
      { '@type': 'BreadcrumbList', itemListElement: [] },
    ],
  };
}

const EXPECTED = {
  street: '10-20 EXAMPLE ROAD',
  unit: '3M',
  borough: 'QUEENS',
  postalCode: '11103',
};

describe('addressFromJsonLd', () => {
  it('reads the main entity address from a listing page', () => {
    expect(addressFromJsonLd([listingPage('10-20 Example Road #3M')])).toEqual({
      ok: true,
      value: EXPECTED,
    });
  });

  it('ignores addresses on other nodes', () => {
    const block = {
      '@graph': [
        { '@type': 'Person', address: postalAddress('99 Agent Office Ave') },
        { '@type': 'Apartment', address: postalAddress('1 Other St') },
      ],
    };

    expect(addressFromJsonLd([block])).toEqual(err('not-found'));
  });

  it('reads a block that is a single node', () => {
    expect(addressFromJsonLd([itemPage('10-20 Example Road #3M')])).toEqual({
      ok: true,
      value: EXPECTED,
    });
  });

  it('reads a block that is an array of nodes', () => {
    expect(addressFromJsonLd([[itemPage('10-20 Example Road #3M')]])).toEqual({
      ok: true,
      value: EXPECTED,
    });
  });

  it('searches every block', () => {
    expect(
      addressFromJsonLd([
        { '@type': 'Organization' },
        listingPage('10-20 Example Road #3M'),
      ]),
    ).toEqual({ ok: true, value: EXPECTED });
  });

  it('accepts repeated ItemPage nodes that agree', () => {
    expect(
      addressFromJsonLd([
        itemPage('10-20 Example Road #3M'),
        itemPage('10-20 Example Rd. # 3M'),
      ]),
    ).toEqual({ ok: true, value: EXPECTED });
  });

  it('rejects ItemPage nodes that disagree', () => {
    expect(
      addressFromJsonLd([
        itemPage('10-20 Example Road #3M'),
        itemPage('1 Other St'),
      ]),
    ).toEqual(err('ambiguous'));
  });

  it.each([
    ['no blocks', []],
    ['an empty graph', [{ '@graph': [] }]],
    ['an ItemPage with no main entity', [{ '@type': 'ItemPage' }]],
    [
      'a main entity with no address',
      [{ '@type': 'ItemPage', mainEntity: { '@type': 'Apartment' } }],
    ],
    [
      'an address that is not a PostalAddress',
      [{ '@type': 'ItemPage', mainEntity: { address: '10 Example St' } }],
    ],
    [
      'a street address that is not a string',
      [
        {
          '@type': 'ItemPage',
          mainEntity: {
            address: { '@type': 'PostalAddress', streetAddress: 10 },
          },
        },
      ],
    ],
    ['a blank street address', [itemPage('   ')]],
    ['non-object blocks', [null, 42, 'text']],
  ])('returns not-found for %s', (_label, blocks) => {
    expect(addressFromJsonLd(blocks)).toEqual(err('not-found'));
  });
});
