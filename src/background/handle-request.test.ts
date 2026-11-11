/**
 * Tests for the request handler, with the geocoder replaced by a stub.
 */

import { describe, expect, it, vi } from 'vitest';

import { parseRequest, type Request } from '../shared/messages';
import { err, ok } from '../shared/result';
import { createRequestHandler } from './handle-request';

const REQUEST = parseRequest({
  type: 'get-report',
  address: {
    street: '10-20 EXAMPLE ROAD',
    unit: '3M',
    borough: 'QUEENS',
    postalCode: '11103',
  },
});
if (!REQUEST.ok) {
  throw new Error('fixture is invalid');
}
const request = REQUEST.value;

describe('createRequestHandler', () => {
  it('answers get-report with the address and building', async () => {
    const geocode = vi
      .fn()
      .mockResolvedValue(
        ok({ bbl: '4001230001', bin: '4123456', borough: 'QUEENS' }),
      );

    await expect(createRequestHandler({ geocode })(request)).resolves.toEqual(
      ok({
        address: request.address,
        building: { bbl: '4001230001', bin: '4123456' },
      }),
    );
    expect(geocode).toHaveBeenCalledWith(request.address);
  });

  it.each([
    ['not-found', 'building-not-found'],
    ['ambiguous', 'building-not-found'],
    ['unavailable', 'unavailable'],
  ] as const)('maps geocode %s to %s', async (geocodeError, reportError) => {
    const geocode = vi.fn().mockResolvedValue(err(geocodeError));

    await expect(createRequestHandler({ geocode })(request)).resolves.toEqual(
      err(reportError),
    );
  });

  it('rejects a request type with no handler', async () => {
    const handle = createRequestHandler({ geocode: vi.fn() });

    await expect(
      handle({ type: 'unknown' } as unknown as Request),
    ).rejects.toThrow('Unhandled case');
  });
});
