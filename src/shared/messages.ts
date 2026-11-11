/**
 * The message protocol between the content script and the background worker.
 *
 * Both sides import these types, so a request and its response always agree at
 * compile time. The worker validates every incoming message at runtime with
 * {@link parseRequest} before acting on it.
 */

import { z } from 'zod';

import { parseBorough } from './address/borough';
import type { ListingAddress } from './address/listing-address';
import { normalizeStreetAddress } from './address/street';
import { normalizeUnit } from './address/unit';
import { err, ok, type Result } from './result';

/** The building report for a listing. Fields are added as data sources arrive. */
export interface BuildingReport {
  readonly address: ListingAddress;
}

/** Why a report could not be produced. */
export type ReportError =
  /** The request failed validation. */
  | 'invalid-request'
  /** The background worker could not be reached. */
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
