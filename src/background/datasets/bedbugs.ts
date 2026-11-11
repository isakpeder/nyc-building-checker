/**
 * Fetches a building's latest bedbug filing.
 *
 * Owners file one report per building per year. A lot can hold several
 * buildings, so the latest filing of each building is combined. The result has
 * three states: no filing, a filing reporting zero infested units, and a filing
 * reporting some.
 */

import { z } from 'zod';

import { parseCityDate } from '../../shared/dates';
import { ok, type Result } from '../../shared/result';
import type { FetchJsonOptions, HttpError } from '../http/fetch-json';
import { queryDataset } from '../socrata/client';
import { soql } from '../socrata/soql';
import { DATASETS } from '../../shared/datasets';

/** The bedbug filing status of a lot. */
export type BedbugStatus =
  | { readonly kind: 'no-filing' }
  | {
      readonly kind: 'reported';
      /** Units reported infested during the filing period. Zero is a valid report. */
      readonly infestedUnits: number;
      readonly eradicatedUnits: number;
      readonly reinfestedUnits: number;
      readonly dwellingUnits: number;
      /** The latest filing date across the lot's buildings, YYYY-MM-DD. */
      readonly filedOn: string;
    };

/** A raw row. Every field is optional so one malformed row can't fail the page. */
export const BedbugRowSchema = z.object({
  building_id: z.string().optional(),
  of_dwelling_units: z.string().optional(),
  infested_dwelling_unit_count: z.string().optional(),
  eradicated_unit_count: z.string().optional(),
  re_infested_dwelling_unit: z.string().optional(),
  filing_date: z.string().optional(),
});
export type BedbugRow = z.infer<typeof BedbugRowSchema>;

/**
 * Reads a non-negative whole number sent as text.
 *
 * @param value - The text.
 * @returns The number, or `null` if it isn't a non-negative integer.
 */
function count(value: string | undefined): number | null {
  return value !== undefined && /^\d+$/.test(value.trim())
    ? Number(value.trim())
    : null;
}

/**
 * Combines the latest filing of each building on a lot.
 *
 * @param rows - Raw filings for one lot.
 * @returns The lot's bedbug status.
 *
 * @example
 * summarizeBedbugs([]); // { kind: 'no-filing' }
 */
export function summarizeBedbugs(rows: readonly BedbugRow[]): BedbugStatus {
  const latest = new Map<
    string,
    {
      filedOn: string;
      infested: number;
      eradicated: number;
      reinfested: number;
      units: number;
    }
  >();

  for (const row of rows) {
    const filedOn = parseCityDate(row.filing_date);
    const infested = count(row.infested_dwelling_unit_count);
    if (filedOn === null || infested === null) {
      continue;
    }
    const building = row.building_id ?? '';
    const kept = latest.get(building);
    if (kept !== undefined && kept.filedOn >= filedOn) {
      continue;
    }
    latest.set(building, {
      filedOn,
      infested,
      eradicated: count(row.eradicated_unit_count) ?? 0,
      reinfested: count(row.re_infested_dwelling_unit) ?? 0,
      units: count(row.of_dwelling_units) ?? 0,
    });
  }

  const filings = [...latest.values()];
  if (filings.length === 0) {
    return { kind: 'no-filing' };
  }

  const sum = (pick: (f: (typeof filings)[number]) => number): number =>
    filings.reduce((total, filing) => total + pick(filing), 0);

  return {
    kind: 'reported',
    infestedUnits: sum((f) => f.infested),
    eradicatedUnits: sum((f) => f.eradicated),
    reinfestedUnits: sum((f) => f.reinfested),
    dwellingUnits: sum((f) => f.units),
    filedOn:
      filings
        .map((f) => f.filedOn)
        .sort()
        .at(-1) ?? '',
  };
}

/**
 * Fetches a lot's bedbug filings and summarizes the latest ones.
 *
 * @param bbl - The lot's ten-digit BBL.
 * @param options - HTTP options.
 * @returns The bedbug status, or the HTTP error that stopped the fetch.
 */
export async function fetchBedbugs(
  bbl: string,
  options?: FetchJsonOptions,
): Promise<Result<BedbugStatus, HttpError>> {
  const result = await queryDataset(
    DATASETS.bedbugs,
    {
      select: [
        'building_id',
        'of_dwelling_units',
        'infested_dwelling_unit_count',
        'eradicated_unit_count',
        're_infested_dwelling_unit',
        'filing_date',
      ],
      where: soql`bbl = ${bbl}`,
    },
    BedbugRowSchema,
    options,
  );
  return result.ok ? ok(summarizeBedbugs(result.value.rows)) : result;
}
