/**
 * Fetches a building's active construction permits and recent stop-work orders
 * from the Department of Buildings.
 *
 * Permits come from two systems with different columns, BIS (legacy) and DOB NOW,
 * and are normalized to one shape. A permit is active when it has been issued,
 * hasn't expired and isn't signed off or revoked. Stop-work orders come from DOB
 * complaints whose latest disposition is a stop-work code. All three datasets are
 * keyed by BIN. DOB complaint dates are stored as text, so they are filtered here
 * rather than in the query.
 */

import { z } from 'zod';

import { parseCityDate, toIsoDate } from '../../shared/dates';
import { err, ok, type Result } from '../../shared/result';
import type { FetchJsonOptions, HttpError } from '../http/fetch-json';
import { queryDataset } from '../socrata/client';
import { soql } from '../socrata/soql';
import { DATASETS } from './ids';

/** An active construction permit. */
export interface Permit {
  readonly id: string;
  readonly system: 'bis' | 'dob-now';
  readonly workType: string;
  /** YYYY-MM-DD. */
  readonly issuedOn: string;
  /** YYYY-MM-DD. */
  readonly expiresOn: string;
  readonly description: string;
}

/** A stop-work order whose latest disposition is still in force. */
export interface StopWorkOrder {
  readonly complaintNumber: string;
  readonly partial: boolean;
  /** YYYY-MM-DD. */
  readonly date: string;
}

/** Construction activity at a building. */
export interface ConstructionSummary {
  /** Soonest expiry first. */
  readonly activePermits: readonly Permit[];
  /** Newest first. */
  readonly stopWorkOrders: readonly StopWorkOrder[];
  /** Recent stop-work orders that have since been lifted. */
  readonly rescindedStopWorkOrders: number;
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
const STOP_WORK_LOOKBACK_YEARS = 3;

const INACTIVE_STATUS = /SIGNED.?OFF|REVOKED|EXPIRED|CANCEL/i;

export const LegacyPermitRowSchema = z.object({
  permit_si_no: z.string().optional(),
  permit_status: z.string().optional(),
  work_type: z.string().optional(),
  permit_type: z.string().optional(),
  issuance_date: z.string().optional(),
  expiration_date: z.string().optional(),
});
export type LegacyPermitRow = z.infer<typeof LegacyPermitRowSchema>;

export const NowPermitRowSchema = z.object({
  work_permit: z.string().optional(),
  permit_status: z.string().optional(),
  work_type: z.string().optional(),
  issued_date: z.string().optional(),
  expired_date: z.string().optional(),
  job_description: z.string().optional(),
});
export type NowPermitRow = z.infer<typeof NowPermitRowSchema>;

export const DobComplaintRowSchema = z.object({
  complaint_number: z.string().optional(),
  disposition_code: z.string().optional(),
  disposition_date: z.string().optional(),
  date_entered: z.string().optional(),
});
export type DobComplaintRow = z.infer<typeof DobComplaintRowSchema>;

/**
 * Normalizes permits from both systems and keeps the active ones.
 *
 * @param legacy - BIS permit rows.
 * @param current - DOB NOW permit rows.
 * @param today - Today, YYYY-MM-DD.
 * @returns Active permits, one per permit ID, soonest expiry first.
 */
export function activePermits(
  legacy: readonly LegacyPermitRow[],
  current: readonly NowPermitRow[],
  today: string,
): Permit[] {
  const permits = new Map<string, Permit>();

  const add = (
    permit: Omit<Permit, 'issuedOn' | 'expiresOn'>,
    status: string | undefined,
    issued: string | undefined,
    expires: string | undefined,
  ): void => {
    const issuedOn = parseCityDate(issued);
    const expiresOn = parseCityDate(expires);
    if (
      permit.id === '' ||
      issuedOn === null ||
      expiresOn === null ||
      expiresOn < today ||
      INACTIVE_STATUS.test(status ?? '')
    ) {
      return;
    }
    permits.set(`${permit.system}:${permit.id}`, {
      ...permit,
      issuedOn,
      expiresOn,
    });
  };

  for (const row of legacy) {
    add(
      {
        id: row.permit_si_no ?? '',
        system: 'bis',
        workType: (row.work_type ?? row.permit_type ?? '').trim(),
        description: '',
      },
      row.permit_status,
      row.issuance_date,
      row.expiration_date,
    );
  }
  for (const row of current) {
    add(
      {
        id: row.work_permit ?? '',
        system: 'dob-now',
        workType: (row.work_type ?? '').trim(),
        description: (row.job_description ?? '').trim(),
      },
      row.permit_status,
      row.issued_date,
      row.expired_date,
    );
  }

  return [...permits.values()].sort((a, b) =>
    a.expiresOn.localeCompare(b.expiresOn),
  );
}

/**
 * Finds stop-work orders still in force and counts lifted ones.
 *
 * @param rows - DOB complaint rows with stop-work disposition codes.
 * @param since - The earliest disposition date considered, YYYY-MM-DD.
 * @returns Orders in force, newest first, and the number lifted.
 */
export function stopWorkOrders(
  rows: readonly DobComplaintRow[],
  since: string,
): { active: StopWorkOrder[]; rescinded: number } {
  // One entry per complaint: its latest stop-work disposition.
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

  const values = [...byComplaint.values()].map((entry) => entry.order);
  return {
    active: values
      .filter((value) => value !== 'rescinded')
      .sort((a, b) => b.date.localeCompare(a.date)),
    rescinded: values.filter((value) => value === 'rescinded').length,
  };
}

/**
 * Fetches a building's permits and stop-work orders.
 *
 * @param bin - The building's seven-digit BIN.
 * @param now - The current time, replaceable in tests.
 * @param options - HTTP options.
 * @returns The summary, or the first HTTP error.
 */
export async function fetchConstruction(
  bin: string,
  now: Date = new Date(),
  options?: FetchJsonOptions,
): Promise<Result<ConstructionSummary, HttpError>> {
  const today = toIsoDate(now);
  const since = new Date(now);
  since.setUTCFullYear(since.getUTCFullYear() - STOP_WORK_LOOKBACK_YEARS);

  const [legacy, current, complaints] = await Promise.all([
    queryDataset(
      DATASETS.dobPermitsLegacy,
      {
        select: [
          'permit_si_no',
          'permit_status',
          'work_type',
          'permit_type',
          'issuance_date',
          'expiration_date',
        ],
        where: soql`bin__ = ${bin}`,
      },
      LegacyPermitRowSchema,
      options,
    ),
    queryDataset(
      DATASETS.dobPermitsNow,
      {
        select: [
          'work_permit',
          'permit_status',
          'work_type',
          'issued_date',
          'expired_date',
          'job_description',
        ],
        where: soql`bin = ${bin} AND expired_date >= ${now}`,
      },
      NowPermitRowSchema,
      options,
    ),
    queryDataset(
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
    ),
  ]);

  if (!legacy.ok) return err(legacy.error);
  if (!current.ok) return err(current.error);
  if (!complaints.ok) return err(complaints.error);

  const orders = stopWorkOrders(complaints.value.rows, toIsoDate(since));
  return ok({
    activePermits: activePermits(legacy.value.rows, current.value.rows, today),
    stopWorkOrders: orders.active,
    rescindedStopWorkOrders: orders.rescinded,
    truncated:
      legacy.value.truncated ||
      current.value.truncated ||
      complaints.value.truncated,
  });
}
