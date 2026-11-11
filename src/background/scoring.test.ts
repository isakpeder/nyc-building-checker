/**
 * Tests for scoreReport and its parts, including the worked example in
 * docs/SCORING.md.
 */

import { describe, expect, it } from 'vitest';

import type { ReportSections } from '../shared/messages';
import type { Incident } from './datasets/complaints-311';
import type { Violation } from './datasets/hpd-violations';
import { decay, gradeFor, scoreReport } from './scoring';

const NOW = new Date('2026-11-11T00:00:00Z');
const NO_FILING = { status: 'ok', data: { kind: 'no-filing' } } as const;

/**
 * Builds a violation.
 *
 * @param cls - The class.
 * @param open - Whether it's open.
 * @param inspectedOn - The inspection date.
 * @returns The violation.
 */
function violation(
  cls: Violation['class'],
  open: boolean,
  inspectedOn = '2026-10-12',
): Violation {
  return {
    id: `${cls}${inspectedOn}${String(Math.random())}`,
    class: cls,
    open,
    inspectedOn,
    description: '',
    unit: null,
  };
}

/**
 * Builds an incident.
 *
 * @param category - The category.
 * @param date - The date.
 * @returns The incident.
 */
function incident(category: Incident['category'], date: string): Incident {
  return { category, type: '', descriptor: '', date, requests: 1 };
}

/**
 * Builds report sections with every source loaded.
 *
 * @param overrides - Data to use.
 * @returns The sections.
 */
function sections(
  overrides: {
    violations?: Violation[];
    incidents?: Incident[];
    units?: number | null;
    stopWork?: number;
    bedbugs?: ReportSections['bedbugs'];
    stopWorkSection?: ReportSections['stopWork'];
  } = {},
): ReportSections {
  const empty = { open: 0, closed: 0 };
  return {
    violations: {
      status: 'ok',
      data: {
        byClass: { A: empty, B: empty, C: empty, I: empty },
        violations: overrides.violations ?? [],
        truncated: false,
      },
    },
    complaints: {
      status: 'ok',
      data: {
        byCategory: {} as never,
        incidents: overrides.incidents ?? [],
        truncated: false,
      },
    },
    stopWork: overrides.stopWorkSection ?? {
      status: 'ok',
      data: {
        active: Array.from(
          { length: overrides.stopWork ?? 0 },
          () => ({}) as never,
        ),
        rescinded: 0,
        truncated: false,
      },
    },
    bedbugs: overrides.bedbugs ?? {
      status: 'ok',
      data: {
        kind: 'reported',
        infestedUnits: 0,
        eradicatedUnits: 0,
        reinfestedUnits: 0,
        dwellingUnits: 40,
        filedOn: '2026-02-01',
      },
    },
    lot: {
      status: 'ok',
      data: {
        residentialUnits: overrides.units === undefined ? 40 : overrides.units,
        totalUnits: null,
        yearBuilt: null,
        floors: null,
      },
    },
  };
}

describe('decay', () => {
  it.each([
    ['2026-11-11', 1],
    ['2025-11-11', 0.5],
    ['2024-11-11', 0.25],
    ['2027-01-01', 1],
  ])('weights a record from %s by %d', (date, expected) => {
    expect(decay(date, NOW)).toBeCloseTo(expected, 2);
  });
});

describe('gradeFor', () => {
  it.each([
    [0, 'A'],
    [1.49, 'A'],
    [1.5, 'B'],
    [3.99, 'B'],
    [4, 'C'],
    [8, 'D'],
    [14.99, 'D'],
    [15, 'F'],
    [500, 'F'],
  ])('maps %d to %s', (rate, grade) => {
    expect(gradeFor(rate)).toBe(grade);
  });
});

describe('scoreReport', () => {
  it('matches the worked example in docs/SCORING.md', () => {
    const score = scoreReport(
      sections({
        units: 40,
        violations: [
          violation('C', true),
          violation('B', true),
          violation('B', true),
          violation('A', false, '2025-11-11'),
          violation('A', false, '2025-11-11'),
          violation('A', false, '2025-11-11'),
        ],
        incidents: [
          incident('heat', '2026-05-13'),
          incident('heat', '2026-05-13'),
          incident('noise', '2025-11-11'),
          incident('noise', '2025-11-11'),
          incident('noise', '2025-11-11'),
          incident('noise', '2025-11-11'),
        ],
      }),
      NOW,
    );

    expect(score.kind).toBe('graded');
    if (score.kind !== 'graded') return;
    expect(score.rate).toBeCloseTo(3.8036, 3);
    expect(score.grade).toBe('B');
    expect(score.score).toBe(64);
    expect(
      score.contributions.map((c) => [c.key, Number(c.points.toFixed(4))]),
    ).toEqual([
      ['hpd-C-open', 10],
      ['hpd-B-open', 8],
      ['311-heat', 4.2467],
      ['hpd-A-closed', 0.375],
      ['311-noise', 0.2],
    ]);
  });

  it('gives a clean building an A with no contributions', () => {
    const score = scoreReport(sections(), NOW);

    expect(score).toMatchObject({
      kind: 'graded',
      grade: 'A',
      score: 100,
      contributions: [],
    });
  });

  it('does not decay open violations', () => {
    const recent = scoreReport(
      sections({ violations: [violation('C', true, '2026-11-01')] }),
      NOW,
    );
    const old = scoreReport(
      sections({ violations: [violation('C', true, '2016-11-01')] }),
      NOW,
    );

    expect(recent.kind === 'graded' && recent.rate).toBe(
      old.kind === 'graded' && old.rate,
    );
  });

  it('scores all-closed violations far below the same violations open', () => {
    const open = scoreReport(
      sections({ violations: [violation('C', true), violation('C', true)] }),
      NOW,
    );
    const closed = scoreReport(
      sections({ violations: [violation('C', false), violation('C', false)] }),
      NOW,
    );

    expect(open.kind === 'graded' && closed.kind === 'graded').toBe(true);
    if (open.kind !== 'graded' || closed.kind !== 'graded') return;
    expect(closed.rate).toBeLessThan(open.rate / 4 + 0.01);
  });

  it('scores the same problems lower in a bigger building', () => {
    const problems = {
      violations: [violation('C', true), violation('C', true)],
    };
    const small = scoreReport(sections({ ...problems, units: 4 }), NOW);
    const large = scoreReport(sections({ ...problems, units: 400 }), NOW);

    expect(small.kind === 'graded' && small.grade).toBe('D');
    expect(large.kind === 'graded' && large.grade).toBe('A');
  });

  it('pads small buildings so one problem is not an automatic F', () => {
    const score = scoreReport(
      sections({ units: 1, violations: [violation('A', true)] }),
      NOW,
    );

    expect(score.kind === 'graded' && score.grade).toBe('A');
  });

  it('does not fail a one-unit house for seven recent rat sightings', () => {
    const sightings = [
      '2026-09-08',
      '2026-08-29',
      '2026-08-27',
      '2026-08-21',
      '2026-08-14',
      '2026-08-12',
      '2026-08-11',
    ];
    const score = scoreReport(
      sections({
        units: 1,
        incidents: sightings.map((date) => incident('rodents', date)),
      }),
      NOW,
    );

    expect(score.kind === 'graded' && score.grade).toBe('B');
  });

  it('weighs indoor pests above outdoor rat sightings', () => {
    const pests = scoreReport(
      sections({ incidents: [incident('pests', '2026-11-01')] }),
      NOW,
    );
    const rats = scoreReport(
      sections({ incidents: [incident('rodents', '2026-11-01')] }),
      NOW,
    );

    expect(pests.kind === 'graded' && rats.kind === 'graded').toBe(true);
    if (pests.kind !== 'graded' || rats.kind !== 'graded') return;
    expect(pests.rate).toBeGreaterThan(rats.rate * 2);
  });

  it('uses the bedbug filing unit count when PLUTO lists 0 units', () => {
    const score = scoreReport(
      sections({
        units: 0,
        bedbugs: {
          status: 'ok',
          data: {
            kind: 'reported',
            infestedUnits: 0,
            eradicatedUnits: 0,
            reinfestedUnits: 0,
            dwellingUnits: 120,
            filedOn: '2026-02-01',
          },
        },
      }),
      NOW,
    );

    expect(score.kind).toBe('graded');
  });

  it('counts a missing bedbug filing and stop-work orders', () => {
    const score = scoreReport(
      sections({
        bedbugs: { status: 'ok', data: { kind: 'no-filing' } },
        stopWork: 1,
      }),
      NOW,
    );

    expect(
      score.kind === 'graded' && score.contributions.map((c) => c.key),
    ).toEqual(['dob-stop-work', 'bedbugs-no-filing']);
  });

  it('still grades without optional sections and lists them', () => {
    const score = scoreReport(
      sections({
        stopWorkSection: { status: 'unavailable' },
        bedbugs: { status: 'unavailable' },
      }),
      NOW,
    );

    expect(score).toMatchObject({
      kind: 'graded',
      missing: ['stopWork', 'bedbugs'],
    });
  });

  it.each([
    [
      '0 residential units',
      { units: 0, bedbugs: NO_FILING },
      'no-residential-units',
    ],
    [
      'an unknown unit count',
      { units: null, bedbugs: NO_FILING },
      'unknown-size',
    ],
  ] as const)('does not grade a lot with %s', (_label, overrides, reason) => {
    expect(scoreReport(sections(overrides), NOW)).toEqual({
      kind: 'ungraded',
      reason,
    });
  });

  it.each(['violations', 'complaints', 'lot'] as const)(
    'does not grade without %s',
    (key) => {
      const incomplete = { ...sections(), [key]: { status: 'unavailable' } };

      expect(scoreReport(incomplete, NOW)).toEqual({
        kind: 'ungraded',
        reason: 'incomplete',
      });
    },
  );
});
