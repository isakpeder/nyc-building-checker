/**
 * Formats a report response as one line of panel text.
 *
 * Temporary display used until the report card UI replaces it.
 */

import type { BuildingReport, ReportError } from '../shared/messages';
import type { Result } from '../shared/result';

const ERROR_TEXT: Readonly<Record<ReportError, string>> = {
  'outside-nyc': 'Stoop covers New York City buildings only.',
  'building-not-found': 'No NYC building matched this address.',
  'invalid-request': 'This address could not be read.',
  unavailable: 'Building data is unavailable right now.',
};

/**
 * Summarizes a report response.
 *
 * @param response - The worker's response.
 * @returns The panel text.
 *
 * @example
 * summarizeResponse(err('outside-nyc')); // 'Stoop covers New York City buildings only.'
 */
export function summarizeResponse(
  response: Result<BuildingReport, ReportError>,
): string {
  if (!response.ok) {
    return ERROR_TEXT[response.error];
  }

  const { sections } = response.value;
  const parts: string[] = [];

  if (sections.violations.status === 'ok') {
    const { A, B, C } = sections.violations.data.byClass;
    parts.push(
      `HPD open violations: ${String(A.open + B.open + C.open)} (class C ${String(C.open)})`,
    );
  } else {
    parts.push('HPD violations unavailable');
  }

  if (sections.complaints.status === 'ok') {
    const total = Object.values(sections.complaints.data.byCategory).reduce(
      (sum, category) => sum + category.incidents,
      0,
    );
    parts.push(`311 incidents (3 yrs): ${String(total)}`);
  } else {
    parts.push('311 unavailable');
  }

  if (sections.stopWork.status === 'ok') {
    parts.push(
      `Stop-work orders: ${String(sections.stopWork.data.active.length)}`,
    );
  } else {
    parts.push('DOB unavailable');
  }

  if (sections.bedbugs.status === 'ok') {
    const bedbugs = sections.bedbugs.data;
    parts.push(
      bedbugs.kind === 'no-filing'
        ? 'Bedbugs: no filing'
        : `Bedbugs: ${String(bedbugs.infestedUnits)} infested units reported`,
    );
  } else {
    parts.push('Bedbugs unavailable');
  }

  if (sections.lot.status === 'ok' && sections.lot.data !== null) {
    const { residentialUnits, yearBuilt } = sections.lot.data;
    parts.push(
      `${residentialUnits === null ? '?' : String(residentialUnits)} units, built ${yearBuilt === null ? '?' : String(yearBuilt)}`,
    );
  }

  return parts.join(' · ');
}
