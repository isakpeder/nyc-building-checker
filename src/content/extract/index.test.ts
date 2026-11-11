// @vitest-environment jsdom
/**
 * Tests for the extraction chain in index.ts and the heading reader in
 * heading.ts, run against synthetic page markup.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { err } from '../../shared/result';
import { addressFromHeading } from './heading';
import { extractListingAddress, readJsonLdBlocks } from './index';

const JSON_LD = JSON.stringify({
  '@graph': [
    {
      '@type': 'ItemPage',
      mainEntity: {
        address: {
          '@type': 'PostalAddress',
          streetAddress: '10-20 Example Road #3M',
          addressLocality: 'ASTORIA',
          postalCode: '11103',
        },
      },
    },
  ],
});

const HEADING =
  '<div data-testid="homeAddress"><a href="/building/example"><h1 data-testid="address">10-20 Example Road #3M</h1></a></div>';

/**
 * Replaces the document body with the given markup.
 *
 * @param html - The body markup.
 */
function setBody(html: string): void {
  document.body.innerHTML = html;
}

describe('readJsonLdBlocks', () => {
  beforeEach(() => {
    setBody('');
  });

  it('parses each JSON-LD script and skips invalid ones', () => {
    setBody(
      `<script type="application/ld+json">{"a":1}</script>` +
        `<script type="application/ld+json">{not json</script>` +
        `<script type="text/javascript">{"b":2}</script>`,
    );

    expect(readJsonLdBlocks(document)).toEqual([{ a: 1 }]);
  });
});

describe('addressFromHeading', () => {
  it('reads the street and unit from the heading', () => {
    setBody(HEADING);

    expect(addressFromHeading(document)).toEqual({
      ok: true,
      value: {
        street: '10-20 EXAMPLE ROAD',
        unit: '3M',
        borough: null,
        postalCode: null,
      },
    });
  });

  it.each([
    ['no heading', '<h1>10 Example St</h1>'],
    ['an empty heading', '<h1 data-testid="address">  </h1>'],
  ])('returns not-found for %s', (_label, html) => {
    setBody(html);

    expect(addressFromHeading(document)).toEqual(err('not-found'));
  });
});

describe('extractListingAddress', () => {
  it('prefers JSON-LD, which includes the borough', () => {
    setBody(`<script type="application/ld+json">${JSON_LD}</script>${HEADING}`);

    const result = extractListingAddress(document);

    expect(result.ok && result.value.source).toBe('json-ld');
    expect(result.ok && result.value.address.borough).toBe('QUEENS');
  });

  it('falls back to the heading when JSON-LD has no address', () => {
    setBody(
      `<script type="application/ld+json">{"@type":"Organization"}</script>${HEADING}`,
    );

    const result = extractListingAddress(document);

    expect(result.ok && result.value.source).toBe('heading');
    expect(result.ok && result.value.address.street).toBe('10-20 EXAMPLE ROAD');
  });

  it('returns not-found when no source has an address', () => {
    setBody('<main><p>Nothing here</p></main>');

    expect(extractListingAddress(document)).toEqual(err('not-found'));
  });
});
