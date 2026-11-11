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
  type Request,
  type ResponseFor,
} from '../shared/messages';
import { err, ok, type Result } from '../shared/result';
import type { Building, GeocodeError } from './geocode';

/** The services the request handler uses. */
export interface HandlerDeps {
  readonly geocode: (
    address: ListingAddress,
  ) => Promise<Result<Building, GeocodeError>>;
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
      // With one request type, the compiler sees this case as always matching. The
      // switch stays so a new type without a case fails the typecheck.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      case 'get-report': {
        const building = await deps.geocode(request.address);
        if (!building.ok) {
          return err(
            building.error === 'unavailable'
              ? 'unavailable'
              : 'building-not-found',
          );
        }
        const { bbl, bin } = building.value;
        return ok({ address: request.address, building: { bbl, bin } });
      }
      default:
        return assertNever(request.type);
    }
  };
}
