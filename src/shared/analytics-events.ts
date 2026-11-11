/**
 * The complete list of anonymous usage events the extension may send.
 *
 * Every event is a strict schema: unknown fields are rejected, so an address,
 * URL, BBL or listing detail can't be added to an event by mistake. The
 * background worker validates each event against these schemas before sending.
 */

import { z } from 'zod';

/** Data sources a report row can link to. */
const SourceKey = z.enum(['violations', 'complaints', 'stopWork', 'bedbugs']);

/** Every allowed event, with exactly the fields it may carry. */
export const AnalyticsEventSchema = z.discriminatedUnion('name', [
  z.strictObject({ name: z.literal('extension_installed') }),
  z.strictObject({ name: z.literal('extension_updated') }),
  z.strictObject({
    name: z.literal('panel_shown'),
    outcome: z.enum([
      'report',
      'outside-nyc',
      'building-not-found',
      'unavailable',
      'invalid-request',
    ]),
    /** How many report sections failed to load. */
    unavailableSections: z.number().int().min(0).max(4),
  }),
  z.strictObject({ name: z.literal('details_opened') }),
  z.strictObject({ name: z.literal('source_link_clicked'), source: SourceKey }),
  z.strictObject({
    name: z.literal('settings_changed'),
    enabled: z.boolean(),
    shareUsage: z.boolean(),
  }),
  z.strictObject({ name: z.literal('cache_cleared') }),
]);

/** An anonymous usage event. */
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;
