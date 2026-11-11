/**
 * Sends requests to the background worker, from the content script or the popup.
 *
 * Thin adapter over chrome.runtime.sendMessage. Responses come from the worker,
 * which shares these types, so they are trusted without a second validation.
 */

import type { Request, ResponseFor } from './messages';
import { err } from './result';

/**
 * Sends a request to the background worker.
 *
 * @param request - The request to send.
 * @returns The worker's response, or `unavailable` if the worker can't be
 * reached, for example after the extension is reloaded while the page stays open.
 */
export async function sendRequest<T extends Request>(
  request: T,
): Promise<ResponseFor<T['type']>> {
  try {
    return await chrome.runtime.sendMessage<T, ResponseFor<T['type']>>(request);
  } catch {
    return err('unavailable');
  }
}
