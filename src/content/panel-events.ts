/**
 * Builds the usage event sent when the panel finishes loading.
 *
 * Pure function used by the content script. The event records only the outcome
 * and how many sections failed, never anything about the listing.
 */

import type { AnalyticsEvent } from '../shared/analytics-events';
import type { BuildingReport, ReportError } from '../shared/messages';
import type { Result } from '../shared/result';

/**
 * Describes a finished report as a usage event.
 *
 * @param response - The worker's response.
 * @returns The panel_shown event.
 *
 * @example
 * panelShownEvent(err('outside-nyc'));
 * // { name: 'panel_shown', outcome: 'outside-nyc', unavailableSections: 0 }
 */
export function panelShownEvent(
  response: Result<BuildingReport, ReportError>,
): AnalyticsEvent {
  if (!response.ok) {
    return {
      name: 'panel_shown',
      outcome: response.error,
      unavailableSections: 0,
    };
  }
  const { violations, complaints, stopWork, bedbugs } = response.value.sections;
  return {
    name: 'panel_shown',
    outcome: 'report',
    unavailableSections: [violations, complaints, stopWork, bedbugs].filter(
      (section) => section.status === 'unavailable',
    ).length,
  };
}
