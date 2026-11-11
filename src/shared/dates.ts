/**
 * Reads the date formats used by NYC Open Data.
 *
 * Most datasets store floating timestamps (2026-10-13T00:00:00.000). Some older
 * DOB datasets store dates as text (10/13/2026), which can't be compared or
 * sorted as dates in a query, so they're parsed here instead.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})/;
const US = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/;

/**
 * Converts a city date to YYYY-MM-DD.
 *
 * @param value - A floating timestamp or MM/DD/YYYY text, or `undefined`.
 * @returns The date, or `null` if missing or not a real calendar date.
 *
 * @example
 * parseCityDate('2026-10-13T00:00:00.000'); // '2026-10-13'
 * parseCityDate('2/5/2017'); // '2017-02-05'
 * parseCityDate('02/30/2017'); // null
 */
export function parseCityDate(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  const iso = ISO.exec(trimmed);
  const us = US.exec(trimmed);
  const parts = iso
    ? [iso[1], iso[2], iso[3]]
    : us
      ? [us[3], us[1]?.padStart(2, '0'), us[2]?.padStart(2, '0')]
      : null;
  if (parts === null) {
    return null;
  }

  const date = parts.join('-');
  // Rejects dates such as February 30, which Date would roll into March.
  const check = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(check.getTime()) &&
    check.toISOString().slice(0, 10) === date
    ? date
    : null;
}

/**
 * Formats a Date as YYYY-MM-DD in UTC.
 *
 * @param date - The date.
 * @returns The formatted date.
 */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
