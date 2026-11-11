/**
 * Routes validated requests to the code that answers them.
 *
 * Called by the background worker's message listener after validation. Each
 * request type must have a case: a missing one fails the typecheck.
 */

import {
  assertNever,
  type Request,
  type ResponseFor,
} from '../shared/messages';
import { ok } from '../shared/result';

/**
 * Answers a request.
 *
 * @param request - A validated request.
 * @returns The response for the request's type.
 */
export function handleRequest(
  request: Request,
): Promise<ResponseFor<Request['type']>> {
  // With one request type, the compiler sees this case as always matching. The
  // switch stays so a new type without a case fails the typecheck.
  switch (request.type) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    case 'get-report':
      return Promise.resolve(ok({ address: request.address }));
    default:
      return assertNever(request.type);
  }
}
