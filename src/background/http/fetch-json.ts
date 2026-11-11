/**
 * Fetches JSON from an API with a timeout, retries and response validation.
 *
 * Used by the background worker's data fetchers. Expected failures are returned
 * as typed errors rather than thrown. Timeouts, network failures, 429 and 5xx
 * responses are retried with backoff. Other errors are returned at once.
 */

import type { z } from 'zod';

import { err, ok, type Result } from '../../shared/result';
import { backoffDelay, parseRetryAfter } from './retry';

/** Why a request failed. */
export type HttpError =
  | { readonly kind: 'timeout' }
  | { readonly kind: 'network' }
  | { readonly kind: 'http'; readonly status: number }
  | { readonly kind: 'invalid-response' }
  | { readonly kind: 'aborted' };

/** Options for {@link fetchJson}. Every field has a default. */
export interface FetchJsonOptions {
  /** Time limit for each attempt. Default 10 seconds. */
  readonly timeoutMs?: number;
  /** Retries after the first attempt. Default 2. */
  readonly retries?: number;
  /** Backoff cap for the first retry. Default 500 ms. */
  readonly baseDelayMs?: number;
  /** Longest wait between attempts. A longer Retry-After ends the retries. Default 8 seconds. */
  readonly maxDelayMs?: number;
  /** Cancels the request, including any wait between attempts. */
  readonly signal?: AbortSignal;
  /** Replaceable in tests. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
  readonly now?: () => number;
}

/** HTTP statuses worth retrying: rate limiting and temporary server errors. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

interface AttemptFailure {
  readonly error: HttpError;
  /** The server's requested wait, from Retry-After. */
  readonly retryAfterMs: number | null;
}

/**
 * Fetches a URL and validates its JSON body against a schema.
 *
 * @param url - The URL to request.
 * @param schema - Validates and types the response body.
 * @param options - Timeout, retry and test settings.
 * @returns The validated body, or why the request failed.
 *
 * @example
 * const result = await fetchJson(url, z.object({ count: z.number() }));
 * if (result.ok) console.log(result.value.count);
 */
export async function fetchJson<T>(
  url: string,
  schema: z.ZodType<T>,
  options: FetchJsonOptions = {},
): Promise<Result<T, HttpError>> {
  const {
    retries = 2,
    baseDelayMs = 500,
    maxDelayMs = 8000,
    signal,
    sleep = defaultSleep,
    random = Math.random,
  } = options;

  for (let attempt = 0; ; attempt++) {
    const result = await attemptOnce(url, schema, options);
    if (result.ok) {
      return result;
    }

    const { error, retryAfterMs } = result.error;
    if (!isRetryable(error) || attempt >= retries) {
      return err(error);
    }

    const delay =
      retryAfterMs ?? backoffDelay(attempt, baseDelayMs, maxDelayMs, random);
    if (delay > maxDelayMs) {
      return err(error);
    }

    await sleep(delay);
    if (signal?.aborted === true) {
      return err({ kind: 'aborted' });
    }
  }
}

/**
 * Makes one request and validates the response.
 *
 * @param url - The URL to request.
 * @param schema - Validates the response body.
 * @param options - The caller's options.
 * @returns The validated body, or the failure and any Retry-After wait.
 */
async function attemptOnce<T>(
  url: string,
  schema: z.ZodType<T>,
  options: FetchJsonOptions,
): Promise<Result<T, AttemptFailure>> {
  const { timeoutMs = 10_000, signal, now = Date.now } = options;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined =
    signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
  const fail = (error: HttpError, retryAfterMs: number | null = null) =>
    err({ error, retryAfterMs });

  let response: Response;
  try {
    response = await fetch(url, {
      signal: combined,
      headers: { Accept: 'application/json' },
    });
  } catch {
    if (signal?.aborted === true) return fail({ kind: 'aborted' });
    if (timeout.aborted) return fail({ kind: 'timeout' });
    return fail({ kind: 'network' });
  }

  if (!response.ok) {
    return fail(
      { kind: 'http', status: response.status },
      parseRetryAfter(response.headers.get('Retry-After'), now()),
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (timeout.aborted) return fail({ kind: 'timeout' });
    return fail({ kind: 'invalid-response' });
  }

  const parsed = schema.safeParse(body);
  return parsed.success ? ok(parsed.data) : fail({ kind: 'invalid-response' });
}

/**
 * Decides whether a failure is likely temporary.
 *
 * @param error - The failure.
 * @returns `true` for timeouts, network failures, 429 and 5xx responses.
 */
function isRetryable(error: HttpError): boolean {
  switch (error.kind) {
    case 'timeout':
    case 'network':
      return true;
    case 'http':
      return RETRYABLE_STATUSES.has(error.status);
    case 'invalid-response':
    case 'aborted':
      return false;
  }
}

/**
 * Waits for a number of milliseconds.
 *
 * @param ms - How long to wait.
 * @returns Resolves after the wait.
 */
function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
