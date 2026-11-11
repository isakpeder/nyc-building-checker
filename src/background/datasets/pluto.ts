/**
 * Fetches a tax lot's size and age from PLUTO.
 *
 * PLUTO stores the BBL as a number with decimals (1014167501.00000000), so it is
 * matched as a number rather than as text. The residential unit count is the
 * denominator for per-unit scoring.
 */

import { z } from 'zod';

import { ok, type Result } from '../../shared/result';
import type { FetchJsonOptions, HttpError } from '../http/fetch-json';
import { queryDataset } from '../socrata/client';
import { soql } from '../socrata/soql';
import { DATASETS } from './ids';

/** A tax lot's size and age. Unknown values are `null`. */
export interface LotInfo {
  readonly residentialUnits: number | null;
  readonly totalUnits: number | null;
  readonly yearBuilt: number | null;
  readonly floors: number | null;
}

/** A raw row. PLUTO sends numbers as text, sometimes with decimals. */
export const PlutoRowSchema = z.object({
  unitsres: z.string().optional(),
  unitstotal: z.string().optional(),
  yearbuilt: z.string().optional(),
  numfloors: z.string().optional(),
});
export type PlutoRow = z.infer<typeof PlutoRowSchema>;

/**
 * Reads a non-negative number sent as text.
 *
 * @param value - The text, such as `113` or `6.00000000`.
 * @returns The number, or `null` if missing or not a non-negative number.
 */
function numberOrNull(value: string | undefined): number | null {
  if (value === undefined || !/^\d+(\.\d+)?$/.test(value.trim())) {
    return null;
  }
  return Number(value.trim());
}

/**
 * Converts a PLUTO row to lot information.
 *
 * @param row - The raw row.
 * @returns The lot information.
 *
 * @example
 * toLotInfo({ unitsres: '113', yearbuilt: '1967' });
 * // { residentialUnits: 113, totalUnits: null, yearBuilt: 1967, floors: null }
 */
export function toLotInfo(row: PlutoRow): LotInfo {
  const yearBuilt = numberOrNull(row.yearbuilt);
  return {
    residentialUnits: numberOrNull(row.unitsres),
    totalUnits: numberOrNull(row.unitstotal),
    // PLUTO uses 0 when the year built is unknown.
    yearBuilt: yearBuilt === null || yearBuilt === 0 ? null : yearBuilt,
    floors: numberOrNull(row.numfloors),
  };
}

/**
 * Fetches a lot's information.
 *
 * @param bbl - The lot's ten-digit BBL.
 * @param options - HTTP options.
 * @returns The lot information, `null` if PLUTO has no row for the lot, or the
 * HTTP error that stopped the fetch.
 */
export async function fetchLotInfo(
  bbl: string,
  options?: FetchJsonOptions,
): Promise<Result<LotInfo | null, HttpError>> {
  if (!/^\d{10}$/.test(bbl)) {
    throw new Error(`Invalid BBL: ${bbl}`);
  }

  const result = await queryDataset(
    DATASETS.pluto,
    {
      select: ['unitsres', 'unitstotal', 'yearbuilt', 'numfloors'],
      where: soql`bbl = ${Number(bbl)}`,
    },
    PlutoRowSchema,
    { ...options, maxRows: 1 },
  );
  if (!result.ok) {
    return result;
  }

  const [row] = result.value.rows;
  return ok(row === undefined ? null : toLotInfo(row));
}
