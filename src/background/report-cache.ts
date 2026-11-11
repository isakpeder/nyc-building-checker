/**
 * Caches building reports in extension storage and shares in-flight requests.
 *
 * Complete reports are stored for a day under a versioned key, so a format change
 * ignores old entries instead of misreading them. Reports with an unavailable
 * section aren't stored, so a temporary outage isn't remembered. The least
 * recently used entries are evicted beyond a fixed count. Concurrent requests for
 * the same building share one build.
 */

import type { ListingAddress } from '../shared/address/listing-address';
import type { BuildingReport, ReportError } from '../shared/messages';
import { ok, type Result } from '../shared/result';

/** Bump when the stored report format changes. */
export const CACHE_VERSION = 5;

const PREFIX = `report:v${String(CACHE_VERSION)}:`;
const INDEX_KEY = `report-index:v${String(CACHE_VERSION)}`;

/** The storage operations the cache needs, matching chrome.storage.local. */
export interface KeyValueStore {
  readonly get: (key: string) => Promise<unknown>;
  readonly set: (key: string, value: unknown) => Promise<void>;
  readonly remove: (keys: readonly string[]) => Promise<void>;
}

/** Options for {@link createCachedReporter}. */
export interface CacheOptions {
  readonly store: KeyValueStore;
  readonly ttlMs?: number;
  readonly maxEntries?: number;
  readonly now?: () => number;
}

type Build = (
  address: ListingAddress,
) => Promise<Result<BuildingReport, ReportError>>;

interface Entry {
  readonly storedAt: number;
  readonly report: BuildingReport;
}

/**
 * Builds the cache key for an address. The unit is excluded because every unit
 * in a building shares one report.
 *
 * @param address - The listing address.
 * @returns The storage key.
 */
export function cacheKey(address: ListingAddress): string {
  return `${PREFIX}${address.borough ?? ''}|${address.street}`;
}

/**
 * Checks whether every section of a report loaded.
 *
 * @param report - The report.
 * @returns `true` when no section is unavailable.
 */
function isComplete(report: BuildingReport): boolean {
  const { violations, complaints, stopWork, bedbugs, lot } = report.sections;
  return [violations, complaints, stopWork, bedbugs, lot].every(
    (section) => section.status === 'ok',
  );
}

/**
 * Wraps a report builder with caching and request sharing.
 *
 * @param build - Builds a report from scratch.
 * @param options - Storage and limits.
 * @returns A builder that answers from the cache when it can.
 */
export function createCachedReporter(
  build: Build,
  options: CacheOptions,
): Build {
  const {
    store,
    ttlMs = 24 * 60 * 60 * 1000,
    maxEntries = 50,
    now = Date.now,
  } = options;
  const inFlight = new Map<string, ReturnType<Build>>();

  const readIndex = async (): Promise<Record<string, number>> => {
    const index = await store.get(INDEX_KEY);
    return typeof index === 'object' && index !== null
      ? (index as Record<string, number>)
      : {};
  };

  const touch = async (key: string): Promise<void> => {
    const byRecency = Object.entries({
      ...(await readIndex()),
      [key]: now(),
    }).sort(([, a], [, b]) => b - a);
    const evicted = byRecency.slice(maxEntries).map(([k]) => k);
    if (evicted.length > 0) await store.remove(evicted);
    await store.set(
      INDEX_KEY,
      Object.fromEntries(byRecency.slice(0, maxEntries)),
    );
  };

  const lookup = async (
    address: ListingAddress,
  ): Promise<Result<BuildingReport, ReportError>> => {
    const key = cacheKey(address);
    const entry = (await store.get(key)) as Entry | undefined;
    if (entry !== undefined && now() - entry.storedAt < ttlMs) {
      await touch(key);
      // The stored report may belong to another unit in the same building.
      return ok({ ...entry.report, address });
    }

    const result = await build(address);
    if (result.ok && isComplete(result.value)) {
      try {
        await store.set(key, { storedAt: now(), report: result.value });
        await touch(key);
      } catch (error) {
        // A full store must not fail the report itself.
        console.error('Report cache write failed', error);
      }
    }
    return result;
  };

  return (address) => {
    const key = cacheKey(address);
    const pending = inFlight.get(key);
    if (pending !== undefined) {
      return pending.then((result) =>
        result.ok ? ok({ ...result.value, address }) : result,
      );
    }

    const request = lookup(address).finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, request);
    return request;
  };
}
