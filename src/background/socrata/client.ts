/**
 * Queries NYC Open Data datasets through the Socrata SODA API.
 *
 * Used by the dataset fetchers in the background worker. Pages through results
 * in a stable order and stops at a row cap. Rate limiting (HTTP 429) and
 * Retry-After are handled by the HTTP client.
 */

import { z } from 'zod';

import { ok, type Result } from '../../shared/result';
import {
  fetchJson,
  type FetchJsonOptions,
  type HttpError,
} from '../http/fetch-json';
import { toSearchParams, type SoqlQuery } from './soql';

const BASE_URL = 'https://data.cityofnewyork.us/resource';

/** Rows requested per page. */
export const PAGE_SIZE = 1000;

/** Rows returned per query at most. */
export const DEFAULT_MAX_ROWS = 5000;

/** Rows from a query, and whether the row cap cut them short. */
export interface QueryRows<T> {
  readonly rows: readonly T[];
  readonly truncated: boolean;
}

/** Options for {@link queryDataset}. */
export interface QueryOptions extends FetchJsonOptions {
  readonly maxRows?: number;
}

/**
 * Fetches every row a query matches, up to a cap.
 *
 * @param datasetId - The dataset's four-by-four ID, such as `wvxf-dwi5`.
 * @param query - The query. Its limit and offset are set by this function.
 * @param rowSchema - Validates and types each row.
 * @param options - Row cap and HTTP options.
 * @returns The rows, or the first HTTP error.
 */
export async function queryDataset<T>(
  datasetId: string,
  query: Omit<SoqlQuery, 'limit' | 'offset'>,
  rowSchema: z.ZodType<T>,
  options: QueryOptions = {},
): Promise<Result<QueryRows<T>, HttpError>> {
  if (!/^[a-z0-9]{4}-[a-z0-9]{4}$/.test(datasetId)) {
    throw new Error(`Invalid dataset ID: ${datasetId}`);
  }

  const { maxRows = DEFAULT_MAX_ROWS, ...httpOptions } = options;
  const rows: T[] = [];

  // Paging needs a stable order. :id is Socrata's row identifier.
  const ordered = { ...query, order: query.order ?? { column: ':id' } };

  while (rows.length < maxRows) {
    const limit = Math.min(PAGE_SIZE, maxRows - rows.length);
    const params = toSearchParams({ ...ordered, limit, offset: rows.length });
    const page = await fetchJson(
      `${BASE_URL}/${datasetId}.json?${params.toString()}`,
      z.array(rowSchema),
      httpOptions,
    );
    if (!page.ok) {
      return page;
    }

    rows.push(...page.value);
    if (page.value.length < limit) {
      return ok({ rows, truncated: false });
    }
  }

  return ok({ rows, truncated: true });
}
