/**
 * Fetches and summarizes a building's HPD housing code violations.
 *
 * Covers violations inspected in the last five years plus any still open. Each
 * violation is identified by its `violationid`. When the same ID appears more
 * than once, the row with the latest status date is kept. Rows missing an ID, a
 * known class or an inspection date are skipped.
 *
 * Classes: A is non-hazardous, B hazardous, C immediately hazardous. Class I is
 * not one of the hazard classes and is counted separately.
 */

import { z } from 'zod';

import { normalizeUnit, type Unit } from '../../shared/address/unit';
import { ok, type Result } from '../../shared/result';
import type { FetchJsonOptions, HttpError } from '../http/fetch-json';
import { queryDataset } from '../socrata/client';
import { soql } from '../socrata/soql';
import { DATASETS } from './ids';

/** An HPD violation class. */
export type ViolationClass = 'A' | 'B' | 'C' | 'I';

const CLASSES: readonly ViolationClass[] = ['A', 'B', 'C', 'I'];

/** How far back closed violations are included. */
const LOOKBACK_YEARS = 5;

/** One violation, deduplicated. */
export interface Violation {
  readonly id: string;
  readonly class: ViolationClass;
  readonly open: boolean;
  /** Inspection date, YYYY-MM-DD. */
  readonly inspectedOn: string;
  readonly description: string;
  readonly unit: Unit | null;
}

/** Violation counts by class and status, with the violations behind them. */
export interface ViolationSummary {
  readonly byClass: Readonly<
    Record<ViolationClass, { readonly open: number; readonly closed: number }>
  >;
  /** Newest inspection first. */
  readonly violations: readonly Violation[];
  /** The row cap was reached, so counts may be low. */
  readonly truncated: boolean;
}

/** A raw row. Every field is optional so one malformed row can't fail the page. */
export const ViolationRowSchema = z.object({
  violationid: z.string().optional(),
  class: z.string().optional(),
  inspectiondate: z.string().optional(),
  violationstatus: z.string().optional(),
  currentstatusdate: z.string().optional(),
  novdescription: z.string().optional(),
  apartment: z.string().optional(),
});

/** A raw violation row as returned by the dataset. */
export type ViolationRow = z.infer<typeof ViolationRowSchema>;

/**
 * Deduplicates and counts violation rows.
 *
 * @param rows - Raw rows for one building.
 * @param truncated - Whether the rows were cut short by the row cap.
 * @returns The summary.
 *
 * @example
 * summarizeViolations([{ violationid: '1', class: 'C', inspectiondate: '2026-01-02T00:00:00.000', violationstatus: 'Open' }], false);
 * // byClass.C = { open: 1, closed: 0 }
 */
export function summarizeViolations(
  rows: readonly ViolationRow[],
  truncated: boolean,
): ViolationSummary {
  const latest = new Map<string, ViolationRow>();
  for (const row of rows) {
    if (row.violationid === undefined) continue;
    const kept = latest.get(row.violationid);
    if (
      kept === undefined ||
      (row.currentstatusdate ?? '') > (kept.currentstatusdate ?? '')
    ) {
      latest.set(row.violationid, row);
    }
  }

  const violations = [...latest.values()]
    .map(toViolation)
    .filter((violation) => violation !== null)
    .sort((a, b) => b.inspectedOn.localeCompare(a.inspectedOn));

  const byClass = Object.fromEntries(
    CLASSES.map((cls) => [cls, { open: 0, closed: 0 }]),
  ) as Record<ViolationClass, { open: number; closed: number }>;
  for (const violation of violations) {
    byClass[violation.class][violation.open ? 'open' : 'closed']++;
  }

  return { byClass, violations, truncated };
}

/**
 * Converts a raw row to a violation.
 *
 * @param row - The raw row.
 * @returns The violation, or `null` if a required field is missing or unknown.
 */
function toViolation(row: ViolationRow): Violation | null {
  const cls = CLASSES.find((known) => known === row.class);
  const inspectedOn = row.inspectiondate?.slice(0, 10) ?? '';
  if (
    row.violationid === undefined ||
    cls === undefined ||
    !/^\d{4}-\d{2}-\d{2}$/.test(inspectedOn)
  ) {
    return null;
  }

  return {
    id: row.violationid,
    class: cls,
    open: row.violationstatus === 'Open',
    inspectedOn,
    description: row.novdescription?.trim() ?? '',
    unit: row.apartment === undefined ? null : normalizeUnit(row.apartment),
  };
}

/**
 * Fetches a building's violations and summarizes them.
 *
 * @param bbl - The building's ten-digit BBL.
 * @param now - The current time, replaceable in tests.
 * @param options - HTTP options.
 * @returns The summary, or the HTTP error that stopped the fetch.
 */
export async function fetchViolations(
  bbl: string,
  now: Date = new Date(),
  options?: FetchJsonOptions,
): Promise<Result<ViolationSummary, HttpError>> {
  const since = new Date(now);
  since.setUTCFullYear(since.getUTCFullYear() - LOOKBACK_YEARS);

  const result = await queryDataset(
    DATASETS.hpdViolations,
    {
      select: [
        'violationid',
        'class',
        'inspectiondate',
        'violationstatus',
        'currentstatusdate',
        'novdescription',
        'apartment',
      ],
      where: soql`bbl = ${bbl} AND (inspectiondate >= ${since} OR violationstatus = ${'Open'})`,
    },
    ViolationRowSchema,
    options,
  );
  if (!result.ok) {
    return result;
  }

  return ok(summarizeViolations(result.value.rows, result.value.truncated));
}
