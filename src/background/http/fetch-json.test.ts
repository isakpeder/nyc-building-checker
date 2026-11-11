/**
 * Tests for fetchJson and its retry timing. HTTP is mocked with MSW, so no real
 * requests are made. Waits between retries are recorded instead of slept.
 */

import { http, HttpResponse, delay, type JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { z } from 'zod';

import { fetchJson, type FetchJsonOptions } from './fetch-json';
import { backoffDelay, parseRetryAfter } from './retry';

const URL = 'https://api.example.test/data';
const Schema = z.object({ count: z.number() });

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

/**
 * Serves the given responses in order, one per request.
 *
 * @param responses - Builds each response.
 * @returns A counter of requests received.
 */
function serve(...responses: (() => Response | Promise<Response>)[]) {
  const calls = { count: 0 };
  server.use(
    http.get(URL, () => {
      const respond = responses[Math.min(calls.count, responses.length - 1)];
      calls.count++;
      return respond?.() ?? HttpResponse.json({});
    }),
  );
  return calls;
}

/**
 * Builds options that record waits instead of sleeping.
 *
 * @param overrides - Options to change.
 * @returns The options and the recorded waits.
 */
function options(overrides: FetchJsonOptions = {}) {
  const waits: number[] = [];
  return {
    waits,
    options: {
      sleep: (ms: number) => {
        waits.push(ms);
        return Promise.resolve();
      },
      random: () => 0.5,
      now: () => 0,
      ...overrides,
    },
  };
}

const json = (body: JsonBodyType, init?: ResponseInit) => () =>
  HttpResponse.json(body, init);
const status =
  (code: number, headers: Record<string, string> = {}) =>
  () =>
    new HttpResponse(null, { status: code, headers });

describe('fetchJson', () => {
  it('returns the validated body', async () => {
    serve(json({ count: 3, extra: true }));

    await expect(fetchJson(URL, Schema, options().options)).resolves.toEqual({
      ok: true,
      value: { count: 3 },
    });
  });

  it('retries a server error and then succeeds', async () => {
    const calls = serve(status(503), json({ count: 1 }));
    const { waits, options: opts } = options();

    const result = await fetchJson(URL, Schema, opts);

    expect(result.ok).toBe(true);
    expect(calls.count).toBe(2);
    expect(waits).toEqual([250]);
  });

  it('gives up after the last retry', async () => {
    const calls = serve(status(500));
    const { waits, options: opts } = options({ retries: 2 });

    await expect(fetchJson(URL, Schema, opts)).resolves.toEqual({
      ok: false,
      error: { kind: 'http', status: 500 },
    });
    expect(calls.count).toBe(3);
    expect(waits).toEqual([250, 500]);
  });

  it('waits as long as Retry-After asks', async () => {
    serve(status(429, { 'Retry-After': '2' }), json({ count: 1 }));
    const { waits, options: opts } = options();

    await fetchJson(URL, Schema, opts);

    expect(waits).toEqual([2000]);
  });

  it('stops when Retry-After is longer than the maximum wait', async () => {
    const calls = serve(status(429, { 'Retry-After': '120' }));

    await expect(fetchJson(URL, Schema, options().options)).resolves.toEqual({
      ok: false,
      error: { kind: 'http', status: 429 },
    });
    expect(calls.count).toBe(1);
  });

  it.each([400, 401, 403, 404])('does not retry a %i', async (code) => {
    const calls = serve(status(code));

    await expect(fetchJson(URL, Schema, options().options)).resolves.toEqual({
      ok: false,
      error: { kind: 'http', status: code },
    });
    expect(calls.count).toBe(1);
  });

  it('rejects a body that fails the schema, without retrying', async () => {
    const calls = serve(json({ count: 'three' }));

    await expect(fetchJson(URL, Schema, options().options)).resolves.toEqual({
      ok: false,
      error: { kind: 'invalid-response' },
    });
    expect(calls.count).toBe(1);
  });

  it('rejects a body that is not JSON', async () => {
    serve(() => new HttpResponse('<html>', { status: 200 }));

    await expect(fetchJson(URL, Schema, options().options)).resolves.toEqual({
      ok: false,
      error: { kind: 'invalid-response' },
    });
  });

  it('retries a network failure', async () => {
    const calls = serve(() => HttpResponse.error());

    await expect(fetchJson(URL, Schema, options().options)).resolves.toEqual({
      ok: false,
      error: { kind: 'network' },
    });
    expect(calls.count).toBe(3);
  });

  it('times out a slow response', async () => {
    serve(async () => {
      await delay(200);
      return HttpResponse.json({ count: 1 });
    });

    await expect(
      fetchJson(URL, Schema, options({ timeoutMs: 20, retries: 0 }).options),
    ).resolves.toEqual({ ok: false, error: { kind: 'timeout' } });
  });

  it('stops when the caller aborts, without retrying', async () => {
    const calls = serve(async () => {
      await delay(200);
      return HttpResponse.json({ count: 1 });
    });
    const abort = new AbortController();
    const { waits, options: opts } = options({ signal: abort.signal });

    const pending = fetchJson(URL, Schema, opts);
    abort.abort();

    await expect(pending).resolves.toEqual({
      ok: false,
      error: { kind: 'aborted' },
    });
    expect(calls.count).toBeLessThanOrEqual(1);
    expect(waits).toEqual([]);
  });

  it('sends an Accept header for JSON', async () => {
    const accept = vi.fn();
    server.use(
      http.get(URL, ({ request }) => {
        accept(request.headers.get('Accept'));
        return HttpResponse.json({ count: 1 });
      }),
    );

    await fetchJson(URL, Schema, options().options);

    expect(accept).toHaveBeenCalledWith('application/json');
  });
});

describe('backoffDelay', () => {
  it.each([
    [0, 250],
    [1, 500],
    [2, 1000],
    [3, 2000],
    [4, 4000],
    [5, 4000],
  ])('caps attempt %i at the maximum', (attempt, expected) => {
    expect(backoffDelay(attempt, 500, 8000, () => 0.5)).toBe(expected);
  });

  it('stays between zero and the cap', () => {
    expect(backoffDelay(2, 500, 8000, () => 0)).toBe(0);
    expect(backoffDelay(2, 500, 8000, () => 0.999)).toBeLessThan(2000);
  });
});

describe('parseRetryAfter', () => {
  const NOW = Date.parse('Wed, 11 Nov 2026 03:00:00 GMT');

  it.each([
    ['5', 5000],
    [' 0 ', 0],
    ['Wed, 11 Nov 2026 03:00:05 GMT', 5000],
    ['Wed, 11 Nov 2026 02:59:00 GMT', 0],
    ['soon', null],
    [null, null],
  ])('reads %j', (value, expected) => {
    expect(parseRetryAfter(value, NOW)).toBe(expected);
  });
});
