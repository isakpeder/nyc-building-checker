/**
 * Routes validated requests to the code that answers them.
 *
 * Called by the background worker's message listener after validation. Each
 * request type must have a case: a missing one fails the typecheck. Services are
 * passed in so tests can replace them.
 */

import type { ListingAddress } from '../shared/address/listing-address';
import {
  assertNever,
  type BuildingReport,
  type ReportError,
  type Request,
  type ResponseFor,
} from '../shared/messages';
import { err, ok, type Result } from '../shared/result';

/** The services the request handler uses. */
export interface HandlerDeps {
  readonly buildReport: (
    address: ListingAddress,
  ) => Promise<Result<BuildingReport, ReportError>>;
  /** Deletes every saved report and returns how many there were. */
  readonly clearCache: () => Promise<number>;
}

/**
 * Creates the function that answers requests.
 *
 * @param deps - The services to use.
 * @returns A function that answers a validated request.
 */
export function createRequestHandler(
  deps: HandlerDeps,
): (request: Request) => Promise<ResponseFor<Request['type']>> {
  return async (request) => {
    switch (request.type) {
      case 'get-report':
        return deps.buildReport(request.address);
      case 'clear-cache':
        try {
          return ok({ removed: await deps.clearCache() });
        } catch {
          return err('unavailable');
        }
      default:
        return assertNever(request);
    }
  };
}
