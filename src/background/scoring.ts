/**
 * Scores a building report with an explainable A to F grade.
 *
 * Pure function, run by the background worker after a report is built. Every
 * problem adds penalty points by severity. Points decay with age, except for open
 * violations. The total is divided by the residential unit count, padded by a
 * fixed prior so small buildings don't swing on one incident, and mapped to a
 * grade. The formula and a worked example are in docs/SCORING.md.
 */

import type { ReportSections } from '../shared/messages';
import type { ComplaintCategory } from './datasets/complaints-311';
import type { ViolationClass } from './datasets/hpd-violations';

/** A letter grade, A best. */
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

/** One line of the score's explanation. */
export interface Contribution {
  readonly key: string;
  readonly label: string;
  /** How many records this line covers. */
  readonly count: number;
  /** Penalty points after weights and decay. */
  readonly points: number;
}

/** Why a report wasn't graded. */
export type UngradedReason =
  /** Violations, 311 or lot data didn't load. */
  | 'incomplete'
  /** The lot has no residential units. */
  | 'no-residential-units'
  /** The unit count is unknown. */
  | 'unknown-size';

/** A building's score. */
export type Score =
  | {
      readonly kind: 'graded';
      readonly grade: Grade;
      /** 0 to 100, higher is better. */
      readonly score: number;
      /** Penalty points per 10 units. */
      readonly rate: number;
      /** Largest first. Zero-point lines are left out. */
      readonly contributions: readonly Contribution[];
      /** Optional sections that didn't load and so weren't counted. */
      readonly missing: readonly ('construction' | 'bedbugs')[];
    }
  | { readonly kind: 'ungraded'; readonly reason: UngradedReason };

/** Penalty points per record. */
export const WEIGHTS = {
  violation: { C: 10, B: 4, A: 1, I: 0 } satisfies Record<
    ViolationClass,
    number
  >,
  /** Multiplier for a closed violation. */
  closedViolation: 0.25,
  incident: {
    heat: 3,
    pests: 3,
    plumbing: 2,
    building: 1.5,
    noise: 0.5,
    other: 0.25,
  } satisfies Record<ComplaintCategory, number>,
  infestedUnit: 5,
  noBedbugFiling: 5,
  activePermit: 1,
  stopWorkOrder: 15,
} as const;

/** Days for a record's weight to halve. */
export const HALF_LIFE_DAYS = 365;

/** Units added to every building's count before dividing. */
export const UNIT_PRIOR = 5;

/** Upper rate limits of each grade, per 10 units. F is anything above D. */
export const GRADE_BANDS: readonly (readonly [Grade, number])[] = [
  ['A', 1.5],
  ['B', 4],
  ['C', 8],
  ['D', 15],
];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Weight of a record of a given age: 0.5 ^ (age / half-life).
 *
 * @param date - The record's date, YYYY-MM-DD.
 * @param now - The current time.
 * @returns A multiplier from 0 to 1. Future dates count fully.
 *
 * @example
 * decay('2025-11-11', new Date('2026-11-11')); // 0.5
 */
export function decay(date: string, now: Date): number {
  const ageDays = (now.getTime() - Date.parse(`${date}T00:00:00Z`)) / DAY_MS;
  return Number.isNaN(ageDays)
    ? 1
    : 0.5 ** (Math.max(0, ageDays) / HALF_LIFE_DAYS);
}

/**
 * Maps a rate to a grade.
 *
 * @param rate - Penalty points per 10 units.
 * @returns The grade.
 */
export function gradeFor(rate: number): Grade {
  return GRADE_BANDS.find(([, limit]) => rate < limit)?.[0] ?? 'F';
}

/**
 * Scores a report's sections.
 *
 * @param sections - The report's sections.
 * @param now - The current time.
 * @returns The score, or why the report can't be graded.
 */
export function scoreReport(sections: ReportSections, now: Date): Score {
  const { violations, complaints, construction, bedbugs, lot } = sections;
  if (
    violations.status !== 'ok' ||
    complaints.status !== 'ok' ||
    lot.status !== 'ok'
  ) {
    return { kind: 'ungraded', reason: 'incomplete' };
  }
  const units = lot.data?.residentialUnits ?? null;
  if (units === null) {
    return { kind: 'ungraded', reason: 'unknown-size' };
  }
  if (units === 0) {
    return { kind: 'ungraded', reason: 'no-residential-units' };
  }

  const lines: Contribution[] = [];
  const add = (
    key: string,
    label: string,
    count: number,
    points: number,
  ): void => {
    if (count > 0 && points > 0) lines.push({ key, label, count, points });
  };

  // Violations: open ones count fully at any age, closed ones are discounted and decay.
  for (const cls of ['C', 'B', 'A'] as const) {
    const items = violations.data.violations.filter((v) => v.class === cls);
    const open = items.filter((v) => v.open);
    const closed = items.filter((v) => !v.open);
    add(
      `hpd-${cls}-open`,
      `Open class ${cls} violations`,
      open.length,
      open.length * WEIGHTS.violation[cls],
    );
    add(
      `hpd-${cls}-closed`,
      `Closed class ${cls} violations`,
      closed.length,
      closed.reduce(
        (sum, v) =>
          sum +
          WEIGHTS.violation[cls] *
            WEIGHTS.closedViolation *
            decay(v.inspectedOn, now),
        0,
      ),
    );
  }

  // 311: one weight per incident, decaying with age.
  for (const [category, weight] of Object.entries(WEIGHTS.incident) as [
    ComplaintCategory,
    number,
  ][]) {
    const incidents = complaints.data.incidents.filter(
      (i) => i.category === category,
    );
    add(
      `311-${category}`,
      `311 ${category} incidents`,
      incidents.length,
      incidents.reduce((sum, i) => sum + weight * decay(i.date, now), 0),
    );
  }

  const missing: ('construction' | 'bedbugs')[] = [];
  if (construction.status === 'ok') {
    const { activePermits, stopWorkOrders } = construction.data;
    add(
      'dob-permits',
      'Active construction permits',
      activePermits.length,
      activePermits.length * WEIGHTS.activePermit,
    );
    add(
      'dob-stop-work',
      'Stop-work orders in force',
      stopWorkOrders.length,
      stopWorkOrders.length * WEIGHTS.stopWorkOrder,
    );
  } else {
    missing.push('construction');
  }

  if (bedbugs.status === 'ok') {
    if (bedbugs.data.kind === 'no-filing') {
      add(
        'bedbugs-no-filing',
        'No bedbug filing on record',
        1,
        WEIGHTS.noBedbugFiling,
      );
    } else {
      add(
        'bedbugs-infested',
        'Units reported infested with bedbugs',
        bedbugs.data.infestedUnits,
        bedbugs.data.infestedUnits * WEIGHTS.infestedUnit,
      );
    }
  } else {
    missing.push('bedbugs');
  }

  const total = lines.reduce((sum, line) => sum + line.points, 0);
  const rate = (total / (units + UNIT_PRIOR)) * 10;

  return {
    kind: 'graded',
    grade: gradeFor(rate),
    // Halves every 6 points of rate, so a C building sits near 50.
    score: Math.round(100 * 0.5 ** (rate / 6)),
    rate,
    contributions: lines.sort((a, b) => b.points - a.points),
    missing,
  };
}
