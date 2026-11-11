/**
 * Unit tests for parseRequest in messages.ts and handleRequest in the background
 * worker.
 */

import { describe, expect, it } from 'vitest';

import { assertNever, parseRequest } from './messages';
import { err } from './result';

const VALID = {
  type: 'get-report',
  address: {
    street: '10-20 EXAMPLE ROAD',
    unit: '3M',
    borough: 'QUEENS',
    postalCode: '11103',
  },
};

describe('parseRequest', () => {
  it('accepts a valid get-report request', () => {
    expect(parseRequest(VALID)).toEqual({ ok: true, value: VALID });
  });

  it('normalizes the address again instead of trusting it', () => {
    const result = parseRequest({
      ...VALID,
      address: {
        ...VALID.address,
        street: '10-20 Example Rd',
        unit: 'Apt 3-M',
      },
    });

    expect(result.ok && result.value.address).toEqual(VALID.address);
  });

  it('drops fields the protocol does not define', () => {
    const result = parseRequest({ ...VALID, price: 3000 });

    expect(result).toEqual({ ok: true, value: VALID });
  });

  it.each([
    ['an unknown type', { ...VALID, type: 'delete-everything' }],
    ['a missing address', { type: 'get-report' }],
    [
      'a blank street',
      { ...VALID, address: { ...VALID.address, street: ' ' } },
    ],
    [
      'a malformed postal code',
      { ...VALID, address: { ...VALID.address, postalCode: '123' } },
    ],
    ['a non-object', 'get-report'],
    ['null', null],
  ])('rejects %s', (_label, message) => {
    expect(parseRequest(message)).toEqual(err('invalid-request'));
  });
});

describe('assertNever', () => {
  it('throws for a value no case handled', () => {
    expect(() => assertNever('unknown' as never)).toThrow('Unhandled case');
  });
});
