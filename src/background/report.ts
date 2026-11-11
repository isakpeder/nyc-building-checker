/**
 * Builds a building report for a listing address.
 *
 * Checks that the listing is in New York City, geocodes it, then queries every
 * data source at once. Sources are independent: one that fails or throws marks
 * only its own section unavailable, and the rest of the report is still returned.
 */

import type { ListingAddress } from '../shared/address/listing-address';
import type { BuildingReport, ReportError, Section } from '../shared/messages';
import { err, ok, type Result } from '../shared/result';
import type { BedbugStatus } from './datasets/bedbugs';
import type { ComplaintSummary } from './datasets/complaints-311';
import type { ConstructionSummary } from './datasets/construction';
import type { ViolationSummary } from './datasets/hpd-violations';
import type { LotInfo } from './datasets/pluto';
import type { Building, GeocodeError } from './geocode';
import type { HttpError } from './http/fetch-json';

/** A data source: returns its data or an HTTP error. */
type Source<A, T> = (input: A) => Promise<Result<T, HttpError>>;

/** The services a report is built from, passed in so tests can replace them. */
export interface ReportDeps {
  readonly geocode: (
    address: ListingAddress,
  ) => Promise<Result<Building, GeocodeError>>;
  readonly violations: Source<string, ViolationSummary>;
  readonly complaints: Source<string, ComplaintSummary>;
  readonly construction: Source<string, ConstructionSummary>;
  readonly bedbugs: Source<string, BedbugStatus>;
  readonly lot: Source<string, LotInfo | null>;
  readonly now?: () => Date;
}

const UNAVAILABLE = { status: 'unavailable' } as const;

/**
 * Decides whether an address is outside New York City from its own fields. An
 * address with a borough is inside. One with no borough and a state other than
 * NY is outside. Anything else is left to the geocoder.
 *
 * @param address - The listing address.
 * @returns `true` when the address is certainly outside the city.
 */
export function isOutsideNyc(address: ListingAddress): boolean {
  return (
    address.borough === null &&
    address.region !== null &&
    address.region !== 'NY'
  );
}

/**
 * Converts a settled source call to a report section.
 *
 * @param settled - The outcome of the source call.
 * @returns The section.
 */
function toSection<T>(
  settled: PromiseSettledResult<Result<T, HttpError>>,
): Section<T> {
  if (settled.status === 'rejected') {
    console.error('Report source threw', settled.reason);
    return UNAVAILABLE;
  }
  return settled.value.ok
    ? { status: 'ok', data: settled.value.value }
    : UNAVAILABLE;
}

/**
 * Builds the report for a listing.
 *
 * @param address - The listing address.
 * @param deps - The services to use.
 * @returns The report, or why none could be built.
 */
export async function buildReport(
  address: ListingAddress,
  deps: ReportDeps,
): Promise<Result<BuildingReport, ReportError>> {
  if (isOutsideNyc(address)) {
    return err('outside-nyc');
  }

  const building = await deps.geocode(address);
  if (!building.ok) {
    return err(
      building.error === 'unavailable' ? 'unavailable' : 'building-not-found',
    );
  }
  const { bbl, bin } = building.value;

  const [violations, complaints, construction, bedbugs, lot] =
    await Promise.allSettled([
      deps.violations(bbl),
      deps.complaints(bbl),
      // DOB data is keyed by BIN, which some lots don't have.
      bin === null
        ? Promise.resolve(err<HttpError>({ kind: 'invalid-response' }))
        : deps.construction(bin),
      deps.bedbugs(bbl),
      deps.lot(bbl),
    ]);

  return ok({
    address,
    building: { bbl, bin },
    sections: {
      violations: toSection(violations),
      complaints: toSection(complaints),
      construction: toSection(construction),
      bedbugs: toSection(bedbugs),
      lot: toSection(lot),
    },
    generatedAt: (deps.now?.() ?? new Date()).toISOString(),
  });
}
