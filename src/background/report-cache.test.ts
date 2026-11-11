/**
 * Tests for the report cache and the concurrency limiter, with an in-memory store
 * in place of extension storage.
 */

import { describe, expect, it, vi } from 'vitest';

import type { ListingAddress } from '../shared/address/listing-address';
import type { StreetAddress } from '../shared/address/street';
import type { BuildingReport, ReportError } from '../shared/messages';
import { err, ok, type Result } from '../shared/result';
import { createLimiter } from './http/limiter';
import {
  cacheKey,
  createCachedReporter,
  type KeyValueStore,
} from './report-cache';

/**
 * Builds a listing address.
 *
 * @param street - The canonical street.
 * @param unit - The unit.
 * @returns The address.
 */
function address(
  street = '1 MAIN STREET',
  unit: string | null = '5A',
): ListingAddress {
  return {
    street: street as StreetAddress,
    unit: unit as ListingAddress['unit'],
    borough: 'QUEENS',
    postalCode: null,
    region: null,
  };
}

/**
 * Builds a report for an address.
 *
 * @param for_ - The address.
 * @param complete - Whether every section loaded.
 * @returns The report.
 */
function report(for_: ListingAddress, complete = true): BuildingReport {
  const okSection = { status: 'ok', data: null } as const;
  return {
    address: for_,
    building: { bbl: '4001230001', bin: '4123456' },
    sections: {
      violations: okSection as never,
      complaints: complete ? (okSection as never) : { status: 'unavailable' },
      stopWork: okSection as never,
      bedbugs: okSection as never,
    },
    builtAt: '2026-11-11T00:00:00.000Z',
  };
}

/**
 * Creates an in-memory store.
 *
 * @returns The store and its contents.
 */
function memoryStore() {
  const data = new Map<string, unknown>();
  const store: KeyValueStore = {
    get: (key) => Promise.resolve(data.get(key)),
    set: (key, value) => {
      data.set(key, structuredClone(value));
      return Promise.resolve();
    },
    remove: (keys) => {
      for (const key of keys) data.delete(key);
      return Promise.resolve();
    },
  };
  return { store, data };
}

describe('createCachedReporter', () => {
  it('serves a repeat request from the cache', async () => {
    const { store } = memoryStore();
    const build = vi.fn((a: ListingAddress) => Promise.resolve(ok(report(a))));
    const cached = createCachedReporter(build, { store });

    await cached(address());
    const second = await cached(address());

    expect(build).toHaveBeenCalledTimes(1);
    expect(second.ok).toBe(true);
  });

  it('shares the cache across units and returns the requested unit', async () => {
    const { store } = memoryStore();
    const build = vi.fn((a: ListingAddress) => Promise.resolve(ok(report(a))));
    const cached = createCachedReporter(build, { store });

    await cached(address('1 MAIN STREET', '5A'));
    const other = await cached(address('1 MAIN STREET', '9C'));

    expect(build).toHaveBeenCalledTimes(1);
    expect(other.ok && other.value.address.unit).toBe('9C');
  });

  it('rebuilds after the entry expires', async () => {
    const { store } = memoryStore();
    let time = 0;
    const build = vi.fn((a: ListingAddress) => Promise.resolve(ok(report(a))));
    const cached = createCachedReporter(build, {
      store,
      ttlMs: 1000,
      now: () => time,
    });

    await cached(address());
    time = 1000;
    await cached(address());

    expect(build).toHaveBeenCalledTimes(2);
  });

  it('does not store a report with an unavailable section', async () => {
    const { store, data } = memoryStore();
    const build = vi.fn((a: ListingAddress) =>
      Promise.resolve(ok(report(a, false))),
    );
    const cached = createCachedReporter(build, { store });

    await cached(address());
    await cached(address());

    expect(build).toHaveBeenCalledTimes(2);
    expect(data.has(cacheKey(address()))).toBe(false);
  });

  it('does not store errors', async () => {
    const { store } = memoryStore();
    const build = vi.fn(() =>
      Promise.resolve(err('building-not-found' as const)),
    );
    const cached = createCachedReporter(build, { store });

    await cached(address());
    await cached(address());

    expect(build).toHaveBeenCalledTimes(2);
  });

  it('shares one build between concurrent requests', async () => {
    const { store } = memoryStore();
    let finish: (() => void) | undefined;
    const build = vi.fn(
      (a: ListingAddress) =>
        new Promise<Result<BuildingReport, ReportError>>((resolve) => {
          finish = () => {
            resolve(ok(report(a)));
          };
        }),
    );
    const cached = createCachedReporter(build, { store });

    const first = cached(address('1 MAIN STREET', '5A'));
    const second = cached(address('1 MAIN STREET', '9C'));
    await vi.waitFor(() => {
      expect(build).toHaveBeenCalled();
    });
    finish?.();
    const results = await Promise.all([first, second]);

    expect(build).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.ok && r.value.address.unit)).toEqual([
      '5A',
      '9C',
    ]);
  });

  it('evicts the least recently used entries beyond the limit', async () => {
    const { store, data } = memoryStore();
    let time = 0;
    const build = vi.fn((a: ListingAddress) => Promise.resolve(ok(report(a))));
    const cached = createCachedReporter(build, {
      store,
      maxEntries: 2,
      now: () => ++time,
    });

    await cached(address('1 A STREET'));
    await cached(address('2 B STREET'));
    await cached(address('1 A STREET'));
    await cached(address('3 C STREET'));

    expect(data.has(cacheKey(address('1 A STREET')))).toBe(true);
    expect(data.has(cacheKey(address('2 B STREET')))).toBe(false);
    expect(data.has(cacheKey(address('3 C STREET')))).toBe(true);
  });

  it('still returns the report when the store is full', async () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { store } = memoryStore();
    const full: KeyValueStore = {
      ...store,
      set: () => Promise.reject(new Error('QUOTA_BYTES quota exceeded')),
    };
    const cached = createCachedReporter((a) => Promise.resolve(ok(report(a))), {
      store: full,
    });

    await expect(cached(address())).resolves.toMatchObject({ ok: true });
    error.mockRestore();
  });

  it('uses a versioned key without the unit', () => {
    expect(cacheKey(address('1 MAIN STREET', '5A'))).toBe(
      'report:v6:QUEENS|1 MAIN STREET',
    );
  });
});

describe('createLimiter', () => {
  it('runs at most the limit at once, in arrival order', async () => {
    const limit = createLimiter(2);
    let running = 0;
    let peak = 0;
    const order: number[] = [];

    await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        limit(async () => {
          running++;
          peak = Math.max(peak, running);
          order.push(n);
          await new Promise((resolve) => setTimeout(resolve, 5));
          running--;
        }),
      ),
    );

    expect(peak).toBe(2);
    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it('frees a slot when a task fails', async () => {
    const limit = createLimiter(1);

    await expect(
      limit(() => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    await expect(limit(() => Promise.resolve('next'))).resolves.toBe('next');
  });
});
