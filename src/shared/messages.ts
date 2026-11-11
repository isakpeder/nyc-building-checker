/**
 * The message protocol between the content script and the background worker.
 *
 * Both sides import these types, so a request and its response always agree at
 * compile time. The worker validates every incoming message at runtime with
 * {@link parseRequest} before acting on it.
 */

import { z } from 'zod';

import { parseBorough } from './address/borough';
import type { BedbugStatus } from '../background/datasets/bedbugs';
import type { ComplaintSummary } from '../background/datasets/complaints-311';
import type { ConstructionSummary } from '../background/datasets/construction';
import type { ViolationSummary } from '../background/datasets/hpd-violations';
import type { LotInfo } from '../background/datasets/pluto';
import type { Score } from '../background/scoring';
import type { ListingAddress } from './address/listing-address';
import { normalizeStreetAddress } from './address/street';
import { normalizeUnit } from './address/unit';
import { err, ok, type Result } from './result';

/** The city's identifiers for a listing's building. */
export interface BuildingIds {
  /** Ten-digit borough-block-lot tax lot ID. */
  readonly bbl: string;
  /** Building ID, or `null` when the city has none for the lot. */
  readonly bin: string | null;
}

/** One section of a report: its data, or a note that its source failed. */
export type Section<T> =
  | { readonly status: 'ok'; readonly data: T }
  | { readonly status: 'unavailable' };

/** The data sections of a building report. */
export interface ReportSections {
  readonly violations: Section<ViolationSummary>;
  readonly complaints: Section<ComplaintSummary>;
  readonly construction: Section<ConstructionSummary>;
  readonly bedbugs: Section<BedbugStatus>;
  readonly lot: Section<LotInfo | null>;
}

/** The building report for a listing. */
export interface BuildingReport {
  readonly address: ListingAddress;
  readonly building: BuildingIds;
  readonly sections: ReportSections;
  readonly score: Score;
  /** When the report was built, as an ISO timestamp. */
  readonly generatedAt: string;
}

/** Why a report could not be produced. */
export type ReportError =
  /** The request failed validation. */
  | 'invalid-request'
  /** The listing is outside New York City, so no city data applies. */
  | 'outside-nyc'
  /** No NYC building could be matched to the address with confidence. */
  | 'building-not-found'
  /** The background worker or a required service could not be reached. */
  | 'unavailable';

/** Asks the background worker for a listing's building report. */
export interface GetReportRequest {
  readonly type: 'get-report';
  readonly address: ListingAddress;
}

/** A message from the content script to the background worker. */
export type Request = GetReportRequest;

/** The response type for each request type. */
export interface ResponseMap {
  readonly 'get-report': Result<BuildingReport, ReportError>;
}

/** The response to a request of type `T`. */
export type ResponseFor<T extends Request['type']> = ResponseMap[T];

const ListingAddressSchema = z.object({
  street: z.string(),
  unit: z.string().nullable(),
  borough: z.string().nullable(),
  postalCode: z
    .string()
    .regex(/^\d{5}$/)
    .nullable(),
  region: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
});

const RequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('get-report'), address: ListingAddressSchema }),
]);

/**
 * Validates a message received by the background worker.
 *
 * Address fields are normalized again rather than trusted, which is safe because
 * every normalizer is idempotent.
 *
 * @param message - The message as received.
 * @returns The request, or `invalid-request` if the message doesn't match.
 */
export function parseRequest(
  message: unknown,
): Result<Request, 'invalid-request'> {
  const parsed = RequestSchema.safeParse(message);
  if (!parsed.success) {
    return err('invalid-request');
  }

  const { address } = parsed.data;
  const street = normalizeStreetAddress(address.street);
  if (street === null) {
    return err('invalid-request');
  }

  return ok({
    type: 'get-report',
    address: {
      street,
      unit: address.unit === null ? null : normalizeUnit(address.unit),
      borough: address.borough === null ? null : parseBorough(address.borough),
      postalCode: address.postalCode,
      region: address.region,
    },
  });
}

/**
 * Marks code that can't run if every case of a union is handled. Used as the
 * default branch of a switch over a discriminated union.
 *
 * @param value - The value no case matched.
 * @throws Error always, since reaching this is a programmer error.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}
