// @vitest-environment jsdom
/**
 * Tests for in-page navigation handling: the URL watcher, waiting for elements,
 * idempotent panel mounting and the listing controller. Page markup is synthetic.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ListingAddress } from '../shared/address/listing-address';
import type { StreetAddress } from '../shared/address/street';
import { err, ok, type Result } from '../shared/result';
import { createListingController, listingKey } from './controller';
import { extractListingAddress, type ExtractedAddress } from './extract';
import { mountPanel, PANEL_ID, unmountPanel } from './panel-mount';
import { URL_POLL_INTERVAL_MS, watchUrl } from './url-watcher';
import { waitForElement } from './wait-for-element';

const LISTING_URL = 'https://streeteasy.com/building/example-tower/5a';

/**
 * Builds a listing address for tests.
 *
 * @param street - The canonical street.
 * @param unit - The canonical unit.
 * @returns The address.
 */
function address(street: string, unit: string | null = null): ListingAddress {
  return {
    street: street as StreetAddress,
    unit: unit as ListingAddress['unit'],
    borough: 'QUEENS',
    postalCode: null,
    region: null,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('watchUrl', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports pushState navigation once per change', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const stop = watchUrl(onChange);

    history.pushState({}, '', '/building/a/1');
    vi.advanceTimersByTime(URL_POLL_INTERVAL_MS * 3);
    history.pushState({}, '', '/building/b/2');
    vi.advanceTimersByTime(URL_POLL_INTERVAL_MS);
    stop();
    history.pushState({}, '', '/building/c/3');
    vi.advanceTimersByTime(URL_POLL_INTERVAL_MS);

    expect(
      onChange.mock.calls.map(([url]) => new URL(url as string).pathname),
    ).toEqual(['/building/a/1', '/building/b/2']);
  });
});

describe('waitForElement', () => {
  it('resolves immediately when the element exists', async () => {
    document.body.innerHTML = '<h1 data-testid="address">x</h1>';

    await expect(
      waitForElement(document, '[data-testid="address"]', 1000),
    ).resolves.not.toBeNull();
  });

  it('resolves when the element is added later', async () => {
    const waiting = waitForElement(document, '[data-testid="address"]', 1000);
    document.body.innerHTML = '<h1 data-testid="address">x</h1>';

    await expect(waiting).resolves.not.toBeNull();
  });

  it('resolves null on timeout', async () => {
    await expect(waitForElement(document, '#missing', 10)).resolves.toBeNull();
  });

  it('resolves null when aborted', async () => {
    const abort = new AbortController();
    const waiting = waitForElement(document, '#missing', 1000, abort.signal);
    abort.abort();

    await expect(waiting).resolves.toBeNull();
  });
});

describe('mountPanel', () => {
  it('keeps one panel when the same listing is mounted twice', () => {
    const first = mountPanel(document, 'a');
    const second = mountPanel(document, 'a');

    expect(second).toBe(first);
    expect(document.querySelectorAll(`#${PANEL_ID}`)).toHaveLength(1);
  });

  it('replaces the panel for a different listing', () => {
    mountPanel(document, 'a');
    mountPanel(document, 'b');

    const panels = document.querySelectorAll(`#${PANEL_ID}`);
    expect(panels).toHaveLength(1);
    expect((panels[0] as HTMLElement | undefined)?.dataset.listingKey).toBe(
      'b',
    );
  });

  it('places the panel after the address block', () => {
    document.body.innerHTML =
      '<div data-testid="homeAddress"></div><div id="next"></div>';

    mountPanel(document, 'a');

    expect(
      document.querySelector('[data-testid="homeAddress"]')?.nextElementSibling
        ?.id,
    ).toBe(PANEL_ID);
  });

  it('removes the panel on unmount', () => {
    mountPanel(document, 'a');
    unmountPanel(document);
    unmountPanel(document);

    expect(document.getElementById(PANEL_ID)).toBeNull();
  });
});

describe('extractListingAddress with stale JSON-LD', () => {
  it('trusts the heading when it disagrees with JSON-LD', () => {
    const jsonLd = JSON.stringify({
      '@type': 'ItemPage',
      mainEntity: {
        address: {
          '@type': 'PostalAddress',
          streetAddress: '1 Previous St #2B',
          addressLocality: 'ASTORIA',
        },
      },
    });
    document.body.innerHTML = `<script type="application/ld+json">${jsonLd}</script><h1 data-testid="address">9 Current Ave #7C</h1>`;

    const result = extractListingAddress(document);

    expect(result.ok && result.value.source).toBe('heading');
    expect(result.ok && result.value.address.street).toBe('9 CURRENT AVENUE');
  });
});

describe('createListingController', () => {
  /**
   * Builds controller dependencies with spies.
   *
   * @param waitForListing - Replaces the wait.
   * @returns The dependencies.
   */
  function deps(
    waitForListing: (signal: AbortSignal) => Promise<boolean> = () =>
      Promise.resolve(true),
  ) {
    return {
      waitForListing,
      extract: vi.fn((): Result<ExtractedAddress, 'not-found'> =>
        ok({
          address: address('1 EXAMPLE STREET', '5A'),
          source: 'json-ld' as const,
        }),
      ),
      mount: vi.fn(),
      unmount: vi.fn(),
    };
  }

  it('mounts the panel on a listing page', async () => {
    const d = deps();

    await createListingController(d).handle(LISTING_URL);

    expect(d.mount).toHaveBeenCalledWith(
      'QUEENS|1 EXAMPLE STREET|5A',
      address('1 EXAMPLE STREET', '5A'),
    );
  });

  it('unmounts the panel on other pages', async () => {
    const d = deps();

    await createListingController(d).handle('https://streeteasy.com/search');

    expect(d.unmount).toHaveBeenCalled();
    expect(d.mount).not.toHaveBeenCalled();
  });

  it('unmounts when no address is found', async () => {
    const d = deps();
    d.extract.mockReturnValue(err('not-found'));

    await createListingController(d).handle(LISTING_URL);

    expect(d.unmount).toHaveBeenCalled();
  });

  it('drops a slower earlier navigation', async () => {
    const resolvers: ((value: boolean) => void)[] = [];
    const d = deps(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const controller = createListingController(d);

    const first = controller.handle(LISTING_URL);
    const second = controller.handle(LISTING_URL.replace('5a', '6b'));
    resolvers[1]?.(true);
    await second;
    resolvers[0]?.(true);
    await first;

    expect(d.mount).toHaveBeenCalledTimes(1);
  });
});

describe('listingKey', () => {
  it('tells units in the same building apart', () => {
    expect(listingKey(address('1 MAIN STREET', '5A'))).not.toBe(
      listingKey(address('1 MAIN STREET', '5B')),
    );
  });
});
