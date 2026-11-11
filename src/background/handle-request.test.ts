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

describe('createRequestHandler', () => {
  it('answers get-report with the built report', async () => {
    const buildReport = vi.fn().mockResolvedValue(err('building-not-found'));

    await expect(
      createRequestHandler({ buildReport })(request),
    ).resolves.toEqual(err('building-not-found'));
    expect(buildReport).toHaveBeenCalledWith(request.address);
  });

  it('rejects a request type with no handler', async () => {
    const handle = createRequestHandler({ buildReport: vi.fn() });

    await expect(
      handle({ type: 'unknown' } as unknown as Request),
    ).rejects.toThrow('Unhandled case');
  });
});
