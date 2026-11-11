/**
 * Fetches and summarizes a building's 311 service requests from the last three
 * years.
 *
 * Two kinds of duplicates are handled. Exact duplicates share a `unique_key` and
 * are counted once. Requests with the same type and descriptor created on the same
 * day are grouped into one incident, since several tenants often report the same
 * outage. Both counts are kept: requests and incidents.
 */

import { z } from 'zod';

import { ok, type Result } from '../../shared/result';
import type { FetchJsonOptions, HttpError } from '../http/fetch-json';
import { queryDataset } from '../socrata/client';
import { soql } from '../socrata/soql';
import { DATASETS } from './ids';

/** A complaint category relevant to renters. */
export type ComplaintCategory =
  'heat' | 'pests' | 'rodents' | 'plumbing' | 'noise' | 'building' | 'other';

export const COMPLAINT_CATEGORIES: readonly ComplaintCategory[] = [
  'heat',
  'pests',
  'rodents',
  'plumbing',
  'noise',
  'building',
  'other',
];

const LOOKBACK_YEARS = 3;

/** Same-day requests of one type and descriptor, counted as one incident. */
export interface Incident {
  readonly category: ComplaintCategory;
  readonly type: string;
  readonly descriptor: string;
  /** YYYY-MM-DD. */
  readonly date: string;
  /** How many distinct requests were filed for this incident. */
  readonly requests: number;
}

/** Counts by category and the incidents behind them. */
export interface ComplaintSummary {
  readonly byCategory: Readonly<
    Record<
      ComplaintCategory,
      { readonly requests: number; readonly incidents: number }
    >
  >;
  /** Newest first. */
  readonly incidents: readonly Incident[];
  readonly truncated: boolean;
}

/** A raw row. Every field is optional so one malformed row can't fail the page. */
export const ComplaintRowSchema = z.object({
  unique_key: z.string().optional(),
  created_date: z.string().optional(),
  agency: z.string().optional(),
  complaint_type: z.string().optional(),
  descriptor: z.string().optional(),
});

/** A raw 311 row. */
export type ComplaintRow = z.infer<typeof ComplaintRowSchema>;

const PEST_WORDS = /\b(PESTS?|MICE|MOUSE|RATS?|ROACH(ES)?|BED ?BUGS?|VERMIN)\b/;

/**
 * Assigns a request to a category. Rules are checked in order.
 *
 * @param agency - The agency the request was routed to.
 * @param type - The complaint type.
 * @param descriptor - The complaint descriptor.
 * @returns The category.
 *
 * @example
 * categorize('HPD', 'HEAT/HOT WATER', 'APARTMENT ONLY'); // 'heat'
 * categorize('NYPD', 'Noise - Residential', 'Loud Music/Party'); // 'noise'
 */
export function categorize(
  agency: string,
  type: string,
  descriptor: string,
): ComplaintCategory {
  const upperType = type.toUpperCase();
  if (upperType === 'HEAT/HOT WATER') return 'heat';
  // Rodent requests go to the Health Department, mostly for sightings outside.
  if (upperType === 'RODENT') return 'rodents';
  if (PEST_WORDS.test(descriptor.toUpperCase())) return 'pests';
  if (upperType === 'PLUMBING' || upperType === 'WATER LEAK') return 'plumbing';
  if (upperType.startsWith('NOISE')) return 'noise';
  if (agency === 'HPD' || agency === 'DOB') return 'building';
  return 'other';
}

/**
 * Deduplicates requests, groups them into incidents and counts by category.
 *
 * @param rows - Raw rows for one building.
 * @param truncated - Whether the row cap was reached.
 * @returns The summary.
 */
export function summarizeComplaints(
  rows: readonly ComplaintRow[],
  truncated: boolean,
): ComplaintSummary {
  // Exact duplicates: one row per unique_key.
  const unique = new Map<string, ComplaintRow>();
  for (const row of rows) {
    if (row.unique_key !== undefined) unique.set(row.unique_key, row);
  }

  // Semantic duplicates: one incident per type, descriptor and day.
  const incidents = new Map<string, Incident>();
  for (const row of unique.values()) {
    const date = row.created_date?.slice(0, 10) ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || row.complaint_type === undefined) {
      continue;
    }
    const type = row.complaint_type.trim();
    const descriptor = row.descriptor?.trim() ?? '';
    const key = [type.toUpperCase(), descriptor.toUpperCase(), date].join('|');
    const existing = incidents.get(key);
    incidents.set(key, {
      category: categorize(row.agency ?? '', type, descriptor),
      type,
      descriptor,
      date,
      requests: (existing?.requests ?? 0) + 1,
    });
  }

  const byCategory = Object.fromEntries(
    COMPLAINT_CATEGORIES.map((category) => [
      category,
      { requests: 0, incidents: 0 },
    ]),
  ) as Record<ComplaintCategory, { requests: number; incidents: number }>;
  for (const incident of incidents.values()) {
    byCategory[incident.category].incidents++;
    byCategory[incident.category].requests += incident.requests;
  }

  return {
    byCategory,
    incidents: [...incidents.values()].sort((a, b) =>
      b.date.localeCompare(a.date),
    ),
    truncated,
  };
}

/**
 * Fetches a building's 311 requests from the last three years and summarizes them.
 *
 * @param bbl - The building's ten-digit BBL.
 * @param now - The current time, replaceable in tests.
 * @param options - HTTP options.
 * @returns The summary, or the HTTP error that stopped the fetch.
 */
export async function fetchComplaints(
  bbl: string,
  now: Date = new Date(),
  options?: FetchJsonOptions,
): Promise<Result<ComplaintSummary, HttpError>> {
  const since = new Date(now);
  since.setUTCFullYear(since.getUTCFullYear() - LOOKBACK_YEARS);

  const result = await queryDataset(
    DATASETS.serviceRequests311,
    {
      select: [
        'unique_key',
        'created_date',
        'agency',
        'complaint_type',
        'descriptor',
      ],
      where: soql`bbl = ${bbl} AND created_date >= ${since}`,
    },
    ComplaintRowSchema,
    options,
  );
  if (!result.ok) {
    return result;
  }

  return ok(summarizeComplaints(result.value.rows, result.value.truncated));
}
