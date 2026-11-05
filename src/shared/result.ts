/**
 * Result type for operations with expected failures, such as an address that
 * can't be geocoded or an API that is unavailable.
 *
 * Part of the shared layer: no browser APIs, importable from any extension
 * context. Unexpected failures caused by programmer error are thrown instead.
 */

/** A successful outcome. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** A failed outcome. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * The outcome of an operation that can fail. Check `ok` to access `value` or
 * `error`.
 *
 * @example
 * const result: Result<number, string> = ok(2);
 * const message = result.ok ? `Count: ${result.value}` : result.error;
 */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Creates a successful Result.
 *
 * @param value - The value to wrap.
 * @returns A successful Result holding `value`.
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Creates a failed Result.
 *
 * @param error - The failure to wrap.
 * @returns A failed Result holding `error`.
 */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/**
 * Transforms the value of a successful Result. A failure is returned unchanged.
 *
 * @param result - The Result to transform.
 * @param transform - Applied to the value of a successful Result.
 * @returns A Result holding the transformed value, or the original failure.
 *
 * @example
 * map(ok(2), (n) => n * 2); // { ok: true, value: 4 }
 * map(err('down'), (n: number) => n * 2); // { ok: false, error: 'down' }
 */
export function map<T, U, E>(
  result: Result<T, E>,
  transform: (value: T) => U,
): Result<U, E> {
  return result.ok ? ok(transform(result.value)) : result;
}

/**
 * Returns the value of a successful Result, or a fallback for a failure.
 *
 * @param result - The Result to read.
 * @param fallback - The value to return for a failure.
 * @returns The wrapped value, or `fallback`.
 *
 * @example
 * unwrapOr(ok(0), 10); // 0
 * unwrapOr(err('down'), 10); // 10
 */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  // Branches on `ok` so falsy values such as 0 are preserved.
  return result.ok ? result.value : fallback;
}
