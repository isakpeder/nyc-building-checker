/**
 * Tests for report orchestration, with every service replaced by a stub.
 */

import { describe, expect, it, vi } from 'vitest';

import type { ListingAddress } from '../shared/address/listing-address';
import type { StreetAddress } from '../shared/address/street';
import { err, ok } from '../shared/result';
import type { ViolationSummary } from './datasets/hpd-violations';
import { buildReport, isOutsideNyc, type ReportDeps } from './report';

const ADDRESS: ListingAddress = {
  street: '10-20 EXAMPLE ROAD' as StreetAddress,
  unit: null,
  borough: 'QUEENS',
  postalCode: '11103',
  region: 'NY',
};

const VIOLATIONS: ViolationSummary = {
  byClass: {
    A: { open: 0, closed: 0 },
    B: { open: 1, closed: 0 },
    C: { open: 0, closed: 0 },
    I: { open: 0, closed: 0 },
  },
  violations: [],
  truncated: false,
};

/**
 * Builds stub services that all succeed.
 *
 * @param overrides - Services to replace.
 * @returns The services.
 */
function deps(overrides: Partial<ReportDeps> = {}) {
  return {
    geocode: vi
      .fn()
      .mockResolvedValue(
        ok({ bbl: '4001230001', bin: '4123456', borough: 'QUEENS' }),
      ),
    violations: vi.fn().mockResolvedValue(ok(VIOLATIONS)),
    complaints: vi
      .fn()
      .mockResolvedValue(
        ok({ byCategory: {}, incidents: [], truncated: false }),
      ),
    stopWork: vi
      .fn()
      .mockResolvedValue(ok({ active: [], rescinded: 0, truncated: false })),
    bedbugs: vi.fn().mockResolvedValue(ok({ kind: 'no-filing' })),
    lot: vi.fn().mockResolvedValue(ok(null)),
    now: () => new Date('2026-11-11T06:00:00Z'),
    ...overrides,
  } satisfies ReportDeps;
}

describe('buildReport', () => {
  it('combines every section', async () => {
    const d = deps();

    const result = await buildReport(ADDRESS, d);

    expect(result.ok && result.value.building).toEqual({
      bbl: '4001230001',
      bin: '4123456',
    });
    expect(result.ok && result.value.sections.violations).toEqual({
      status: 'ok',
      data: VIOLATIONS,
    });
    expect(result.ok && result.value.builtAt).toBe('2026-11-11T06:00:00.000Z');
    expect(d.violations).toHaveBeenCalledWith('4001230001');
    expect(d.stopWork).toHaveBeenCalledWith('4123456');
  });

  it('marks only the failed section unavailable', async () => {
    const d = deps({
      complaints: vi.fn().mockResolvedValue(err({ kind: 'http', status: 503 })),
    });

    const result = await buildReport(ADDRESS, d);

    expect(result.ok && result.value.sections.complaints).toEqual({
      status: 'unavailable',
    });
    expect(result.ok && result.value.sections.violations.status).toBe('ok');
    expect(result.ok && result.value.sections.bedbugs.status).toBe('ok');
  });

  it('marks a section that throws unavailable', async () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const d = deps({ bedbugs: vi.fn().mockRejectedValue(new Error('bug')) });

    const result = await buildReport(ADDRESS, d);

    expect(result.ok && result.value.sections.bedbugs).toEqual({
      status: 'unavailable',
    });
    expect(result.ok && result.value.sections.lot.status).toBe('ok');
    error.mockRestore();
  });

  it('skips DOB data when the lot has no BIN', async () => {
    const d = deps({
      geocode: vi
        .fn()
        .mockResolvedValue(
          ok({ bbl: '4001230001', bin: null, borough: 'QUEENS' }),
        ),
    });

    const result = await buildReport(ADDRESS, d);

    expect(d.stopWork).not.toHaveBeenCalled();
    expect(result.ok && result.value.sections.stopWork).toEqual({
      status: 'unavailable',
    });
  });

  it('stops before any request for a listing outside the city', async () => {
    const d = deps();

    const result = await buildReport(
      { ...ADDRESS, borough: null, region: 'NJ', postalCode: '07302' },
      d,
    );

    expect(result).toEqual(err('outside-nyc'));
    expect(d.geocode).not.toHaveBeenCalled();
  });

  it.each([
    ['not-found', 'building-not-found'],
    ['ambiguous', 'building-not-found'],
    ['unavailable', 'unavailable'],
  ] as const)('maps geocode %s to %s', async (geocodeError, reportError) => {
    const d = deps({ geocode: vi.fn().mockResolvedValue(err(geocodeError)) });

    await expect(buildReport(ADDRESS, d)).resolves.toEqual(err(reportError));
    expect(d.violations).not.toHaveBeenCalled();
  });
});

describe('isOutsideNyc', () => {
  it.each([
    ['a borough', { borough: 'QUEENS', region: 'NY' }, false],
    ['no borough in New York State', { borough: null, region: 'NY' }, false],
    ['no borough and no state', { borough: null, region: null }, false],
    ['no borough in New Jersey', { borough: null, region: 'NJ' }, true],
    [
      'a borough despite a stray state',
      { borough: 'QUEENS', region: 'NJ' },
      false,
    ],
  ] as const)('handles %s', (_label, fields, expected) => {
    expect(isOutsideNyc({ ...ADDRESS, ...fields })).toBe(expected);
  });
});
