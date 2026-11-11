/**
 * Turns a building report into the rows the report card shows.
 *
 * Pure functions with no React, so the wording of every row is unit-tested.
 * Each row links to the public records it summarizes on NYC Open Data.
 */

import type {
  BuildingReport,
  ReportSections,
  Section,
} from '../../shared/messages';
import { DATASETS } from '../../shared/datasets';
import type { ComplaintCategory } from '../../background/datasets/complaints-311';

/** One line of the report card. */
export interface RowModel {
  readonly key: keyof ReportSections;
  readonly label: string;
  /** The main fact, or `null` when the source didn't load. */
  readonly value: string | null;
  readonly detail?: string;
  /** The value describes a problem worth noticing. */
  readonly warning?: boolean;
  /** The public records behind the row. */
  readonly href: string;
}

const CATEGORY_NAMES: Readonly<Record<ComplaintCategory, string>> = {
  heat: 'heat',
  pests: 'pests',
  rodents: 'rat sightings',
  plumbing: 'plumbing',
  building: 'building condition',
  noise: 'noise',
  other: 'other',
};

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Builds a link to a dataset's rows for one building.
 *
 * @param datasetId - The dataset's ID.
 * @param column - The column to filter on.
 * @param value - The building's ID in that column.
 * @returns The URL.
 */
export function sourceUrl(
  datasetId: string,
  column: string,
  value: string,
): string {
  return `https://data.cityofnewyork.us/resource/${datasetId}.json?${new URLSearchParams({ [column]: value }).toString()}`;
}

/**
 * Formats a count, adding a plus when the row cap cut the data short.
 *
 * @param count - The count.
 * @param truncated - Whether more records exist than were read.
 * @returns The formatted count.
 */
function countText(count: number, truncated: boolean): string {
  return `${count.toLocaleString('en-US')}${truncated ? '+' : ''}`;
}

/**
 * Formats a YYYY-MM-DD date as a month and year.
 *
 * @param date - The date.
 * @returns For example, `Feb 2026`.
 */
export function monthYear(date: string): string {
  const [year, month] = date.split('-');
  return `${MONTHS[Number(month) - 1] ?? ''} ${year ?? ''}`.trim();
}

/**
 * Returns the data of a loaded section, or `null`.
 *
 * @param section - The section.
 * @returns Its data, or `null` if it didn't load.
 */
function loaded<T>(section: Section<T>): T | null {
  return section.status === 'ok' ? section.data : null;
}

/**
 * Builds the report card's rows.
 *
 * @param report - The building report.
 * @returns One row per data source, in display order.
 */
export function buildRows(report: BuildingReport): RowModel[] {
  const { bbl, bin } = report.building;
  const { violations, complaints, stopWork, bedbugs } = report.sections;
  const rows: RowModel[] = [];

  const hpd = loaded(violations);
  if (hpd === null) {
    rows.push(
      unavailable(
        'violations',
        'Housing violations (HPD)',
        sourceUrl(DATASETS.hpdViolations, 'bbl', bbl),
      ),
    );
  } else {
    const { A, B, C } = hpd.byClass;
    const open = A.open + B.open + C.open;
    const closed = A.closed + B.closed + C.closed;
    rows.push({
      key: 'violations',
      label: 'Housing violations (HPD)',
      value:
        open === 0
          ? 'None open on record'
          : `${countText(open, hpd.truncated)} open on record${C.open > 0 ? `, ${String(C.open)} class C` : ''}`,
      ...(closed > 0
        ? {
            detail: `${countText(closed, hpd.truncated)} closed in the last 5 years`,
          }
        : {}),
      warning: C.open > 0,
      href: sourceUrl(DATASETS.hpdViolations, 'bbl', bbl),
    });
  }

  const calls = loaded(complaints);
  if (calls === null) {
    rows.push(
      unavailable(
        'complaints',
        '311 complaints, last 3 years',
        sourceUrl(DATASETS.serviceRequests311, 'bbl', bbl),
      ),
    );
  } else {
    const total = calls.incidents.length;
    const top = (
      Object.entries(calls.byCategory) as [
        ComplaintCategory,
        { incidents: number },
      ][]
    )
      .filter(
        ([category, { incidents }]) => incidents > 0 && category !== 'other',
      )
      .sort(([, a], [, b]) => b.incidents - a.incidents)
      .slice(0, 3)
      .map(
        ([category, { incidents }]) =>
          `${CATEGORY_NAMES[category]} ${String(incidents)}`,
      );
    const other = calls.byCategory.other.incidents;
    if (other > 0) top.push(`${String(other)} other`);
    rows.push({
      key: 'complaints',
      label: '311 complaints, last 3 years',
      value:
        total === 0 ? 'None' : `${countText(total, calls.truncated)} incidents`,
      ...(top.length > 0 ? { detail: top.join(' · ') } : {}),
      href: sourceUrl(DATASETS.serviceRequests311, 'bbl', bbl),
    });
  }

  const dobHref =
    bin === null
      ? `https://data.cityofnewyork.us/d/${DATASETS.dobComplaints}`
      : sourceUrl(DATASETS.dobComplaints, 'bin', bin);
  const orders = loaded(stopWork);
  if (orders === null) {
    rows.push(unavailable('stopWork', 'Stop-work orders (DOB)', dobHref));
  } else {
    const active = orders.active.length;
    rows.push({
      key: 'stopWork',
      label: 'Stop-work orders (DOB)',
      value: active === 0 ? 'None in force' : `${String(active)} in force`,
      ...(orders.rescinded > 0
        ? { detail: `${String(orders.rescinded)} lifted in the last 3 years` }
        : {}),
      warning: active > 0,
      href: dobHref,
    });
  }

  const bugs = loaded(bedbugs);
  if (bugs === null) {
    rows.push(
      unavailable(
        'bedbugs',
        'Bedbugs',
        sourceUrl(DATASETS.bedbugs, 'bbl', bbl),
      ),
    );
  } else {
    rows.push({
      key: 'bedbugs',
      label: 'Bedbugs',
      value:
        bugs.kind === 'no-filing'
          ? 'No filing on record'
          : `${String(bugs.infestedUnits)} infested ${bugs.infestedUnits === 1 ? 'unit' : 'units'} reported`,
      ...(bugs.kind === 'reported'
        ? { detail: `Filed ${monthYear(bugs.filedOn)}` }
        : {}),
      warning: bugs.kind === 'reported' && bugs.infestedUnits > 0,
      href: sourceUrl(DATASETS.bedbugs, 'bbl', bbl),
    });
  }

  return rows;
}

/**
 * Builds the row for a source that didn't load.
 *
 * @param key - The section.
 * @param label - The row label.
 * @param href - The public records behind the row.
 * @returns The row.
 */
function unavailable(
  key: keyof ReportSections,
  label: string,
  href: string,
): RowModel {
  return { key, label, value: null, href };
}
