/**
 * Retry timing for the HTTP client: exponential backoff with full jitter, and
 * parsing of the Retry-After response header.
 *
 * Pure functions. The client in fetch-json.ts calls them between attempts.
 */

/**
 * Picks how long to wait before a retry, using exponential backoff with full
 * jitter: a random delay between zero and a cap that doubles with each attempt.
 * Randomizing the delay spreads retries from many clients apart.
 *
 * @param attempt - The number of attempts already made, starting at 0.
 * @param baseDelayMs - The cap for the first retry.
 * @param maxDelayMs - The largest cap allowed.
 * @param random - Returns a number in [0, 1). Replaceable in tests.
 * @returns The delay in milliseconds.
 *
 * @example
 * backoffDelay(0, 500, 8000, () => 0.5); // 250
 * backoffDelay(3, 500, 8000, () => 0.5); // 2000
 */
export function backoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number = Math.random,
): number {
  const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  return Math.floor(random() * cap);
}

/**
 * Reads a Retry-After header, which holds either a number of seconds or an
 * HTTP date.
 *
 * @param value - The header value, or `null` if absent.
 * @param nowMs - The current time, in milliseconds since the epoch.
 * @returns The wait in milliseconds, or `null` if absent or unreadable.
 *
 * @example
 * parseRetryAfter('5', Date.now()); // 5000
 * parseRetryAfter('Wed, 11 Nov 2026 03:00:05 GMT', Date.parse('Wed, 11 Nov 2026 03:00:00 GMT')); // 5000
 */
export function parseRetryAfter(
  value: string | null,
  nowMs: number,
): number | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }

  const date = Date.parse(trimmed);
  return Number.isNaN(date) ? null : Math.max(0, date - nowMs);
}
