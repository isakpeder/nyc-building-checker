/**
 * Unit tests for the Result type and its helpers in result.ts.
 */

import { describe, expect, it, vi } from 'vitest';

import { err, map, ok, unwrapOr, type Result } from './result';

describe('ok', () => {
  it('wraps a value as a success', () => {
    expect(ok(5)).toEqual({ ok: true, value: 5 });
  });
});

describe('err', () => {
  it('wraps an error as a failure', () => {
    expect(err('not found')).toEqual({ ok: false, error: 'not found' });
  });
});

describe('Result narrowing', () => {
  it('exposes value on a success and error on a failure', () => {
    const describeResult = (result: Result<number, string>): string =>
      result.ok ? `value ${String(result.value)}` : `error ${result.error}`;

    expect(describeResult(ok(1))).toBe('value 1');
    expect(describeResult(err('down'))).toBe('error down');
  });
});

describe('map', () => {
  it('transforms the value of a success', () => {
    const result = map(ok(2), (n) => n * 2);

    expect(result).toEqual(ok(4));
  });

  it('passes a failure through without calling the transform', () => {
    const transform = vi.fn((n: number) => n * 2);

    const result = map(err('down'), transform);

    expect(result).toEqual(err('down'));
    expect(transform).not.toHaveBeenCalled();
  });
});

describe('unwrapOr', () => {
  it.each([
    { label: 'zero', value: 0 },
    { label: 'an empty string', value: '' },
    { label: 'false', value: false },
    { label: 'a normal number', value: 7 },
  ])('keeps $label from a success', ({ value }) => {
    expect(unwrapOr(ok(value), 'fallback')).toBe(value);
  });

  it('returns the fallback for a failure', () => {
    expect(unwrapOr(err('down'), 10)).toBe(10);
  });
});
