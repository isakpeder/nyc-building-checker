/**
 * Tests for the request handler, with the report builder replaced by a stub.
 */

import { describe, expect, it, vi } from 'vitest';

import { parseRequest, type Request } from '../shared/messages';
import { err } from '../shared/result';
import { createRequestHandler } from './handle-request';

const REQUEST = parseRequest({
  type: 'get-report',
  address: {
    street: '10-20 EXAMPLE ROAD',
    unit: '3M',
    borough: 'QUEENS',
    postalCode: '11103',
    region: 'NY',
  },
});
if (!REQUEST.ok) {
  throw new Error('fixture is invalid');
}
const request = REQUEST.value;
if (request.type !== 'get-report') {
  throw new Error('fixture is not a get-report request');
}

describe('createRequestHandler', () => {
  it('answers get-report with the built report', async () => {
    const buildReport = vi.fn().mockResolvedValue(err('building-not-found'));

    await expect(
      createRequestHandler({
        buildReport,
        clearCache: vi.fn(),
        track: vi.fn(),
      })(request),
    ).resolves.toEqual(err('building-not-found'));
    expect(buildReport).toHaveBeenCalledWith(request.address);
  });

  it('answers clear-cache with the number removed', async () => {
    const clearCache = vi.fn().mockResolvedValue(3);
    const handle = createRequestHandler({
      buildReport: vi.fn(),
      clearCache,
      track: vi.fn(),
    });

    await expect(handle({ type: 'clear-cache' })).resolves.toEqual({
      ok: true,
      value: { removed: 3 },
    });
  });

  it('reports a failed clear as unavailable', async () => {
    const clearCache = vi.fn().mockRejectedValue(new Error('storage'));
    const handle = createRequestHandler({
      buildReport: vi.fn(),
      clearCache,
      track: vi.fn(),
    });

    await expect(handle({ type: 'clear-cache' })).resolves.toEqual(
      err('unavailable'),
    );
  });

  it('answers track with whether the event was sent', async () => {
    const track = vi.fn().mockResolvedValue(true);
    const handle = createRequestHandler({
      buildReport: vi.fn(),
      clearCache: vi.fn(),
      track,
    });

    await expect(
      handle({ type: 'track', event: { name: 'details_opened' } }),
    ).resolves.toEqual({ ok: true, value: { sent: true } });
    expect(track).toHaveBeenCalledWith({ name: 'details_opened' });
  });

  it('rejects a request type with no handler', async () => {
    const handle = createRequestHandler({
      buildReport: vi.fn(),
      clearCache: vi.fn(),
      track: vi.fn(),
    });

    await expect(
      handle({ type: 'unknown' } as unknown as Request),
    ).rejects.toThrow('Unhandled case');
  });
});
