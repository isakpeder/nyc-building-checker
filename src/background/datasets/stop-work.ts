/**
 * Fetches a building's recent stop-work orders from the Department of Buildings.
 *
 * Stop-work orders come from DOB complaints whose latest disposition is a
 * stop-work code. The dataset is keyed by BIN, and its dates are stored as text,
 * so they are filtered here rather than in the query.
 */

import { z } from 'zod';

import { parseCityDate, toIsoDate } from '../../shared/dates';
import { ok, type Result } from '../../shared/result';
import type { FetchJsonOptions, HttpError } from '../http/fetch-json';
import { queryDataset } from '../socrata/client';
import { soql } from '../socrata/soql';
import { DATASETS } from '../../shared/datasets';

/** A stop-work order whose latest disposition is still in force. */
export interface StopWorkOrder {
  readonly complaintNumber: string;
  readonly partial: boolean;
  /** YYYY-MM-DD. */
  readonly date: string;
}

/** A building's recent stop-work orders. */
export interface StopWorkSummary {
  /** Newest first. */
  readonly active: readonly StopWorkOrder[];
  /** Recent orders that have since been lifted. */
  readonly rescinded: number;
  readonly truncated: boolean;
}

/** DOB complaint disposition codes, from DOB's BIS complaint disposition list. */
const STOP_WORK_ISSUED: Readonly<Record<string, { partial: boolean }>> = {
  A3: { partial: false },
  L1: { partial: true },
  U4: { partial: false },
  U5: { partial: true },
};
const STOP_WORK_RESCINDED = ['L2', 'L3'];

/** How far back stop-work dispositions are considered current. */
const LOOKBACK_YEARS = 3;

export const DobComplaintRowSchema = z.object({
  complaint_number: z.string().optional(),
  disposition_code: z.string().optional(),
  disposition_date: z.string().optional(),
  date_entered: z.string().optional(),
});
export type DobComplaintRow = z.infer<typeof DobComplaintRowSchema>;

/**
 * Finds stop-work orders still in force and counts lifted ones, using the latest
 * disposition of each complaint.
 *
 * @param rows - DOB complaint rows with stop-work disposition codes.
 * @param since - The earliest disposition date considered, YYYY-MM-DD.
 * @param truncated - Whether the row cap was reached.
 * @returns The summary.
 */
export function summarizeStopWork(
  rows: readonly DobComplaintRow[],
  since: string,
  truncated = false,
): StopWorkSummary {
  const byComplaint = new Map<
    string,
    { readonly date: string; readonly order: StopWorkOrder | 'rescinded' }
  >();

  for (const row of rows) {
    const date =
      parseCityDate(row.disposition_date) ?? parseCityDate(row.date_entered);
    const code = row.disposition_code?.trim().toUpperCase() ?? '';
    const issued = STOP_WORK_ISSUED[code];
    if (
      row.complaint_number === undefined ||
      date === null ||
      date < since ||
      (issued === undefined && !STOP_WORK_RESCINDED.includes(code))
    ) {
      continue;
    }
    const existing = byComplaint.get(row.complaint_number);
    if (existing !== undefined && existing.date > date) {
      continue;
    }
    byComplaint.set(row.complaint_number, {
      date,
      order:
        issued === undefined
          ? 'rescinded'
          : {
              complaintNumber: row.complaint_number,
              partial: issued.partial,
              date,
            },
    });
  }

  const orders = [...byComplaint.values()].map((entry) => entry.order);
  return {
    active: orders
      .filter((order) => order !== 'rescinded')
      .sort((a, b) => b.date.localeCompare(a.date)),
    rescinded: orders.filter((order) => order === 'rescinded').length,
    truncated,
  };
}

/**
 * Fetches a building's stop-work orders from the last three years.
 *
 * @param bin - The building's seven-digit BIN.
 * @param now - The current time, replaceable in tests.
 * @param options - HTTP options.
 * @returns The summary, or the HTTP error that stopped the fetch.
 */
export async function fetchStopWork(
  bin: string,
  now: Date = new Date(),
  options?: FetchJsonOptions,
): Promise<Result<StopWorkSummary, HttpError>> {
  const since = new Date(now);
  since.setUTCFullYear(since.getUTCFullYear() - LOOKBACK_YEARS);

  const result = await queryDataset(
    DATASETS.dobComplaints,
    {
      select: [
        'complaint_number',
        'disposition_code',
        'disposition_date',
        'date_entered',
      ],
      where: soql`bin = ${bin} AND disposition_code IN ${[
        ...Object.keys(STOP_WORK_ISSUED),
        ...STOP_WORK_RESCINDED,
      ]}`,
    },
    DobComplaintRowSchema,
    options,
  );
  if (!result.ok) {
    return result;
  }

  return ok(
    summarizeStopWork(
      result.value.rows,
      toIsoDate(since),
      result.value.truncated,
    ),
  );
}
