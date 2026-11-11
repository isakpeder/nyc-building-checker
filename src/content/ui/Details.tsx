/**
 * The expandable list of records behind the report card's numbers.
 *
 * Shows open violations, recent 311 incidents and stop-work orders in force,
 * newest first and capped per list. Collapsed until the reader opens it.
 */

import { useId, useState, type ReactElement } from 'react';

import type { BuildingReport } from '../../shared/messages';

/** Records shown per list. */
export const DETAIL_LIMIT = 10;

/** Longest description shown before it's shortened. */
const DESCRIPTION_LENGTH = 140;

/**
 * Shortens long text at a word boundary.
 *
 * @param text - The text.
 * @param max - The maximum length.
 * @returns The text, shortened with an ellipsis if needed.
 */
export function shorten(text: string, max = DESCRIPTION_LENGTH): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Renders the details toggle and lists.
 *
 * @param props - The report.
 * @returns The details section.
 */
export function Details({
  report,
}: {
  report: BuildingReport;
}): ReactElement | null {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const { violations, complaints, stopWork } = report.sections;

  const openViolations =
    violations.status === 'ok'
      ? violations.data.violations.filter((v) => v.open && v.class !== 'I')
      : [];
  const incidents = complaints.status === 'ok' ? complaints.data.incidents : [];
  const orders = stopWork.status === 'ok' ? stopWork.data.active : [];

  if (openViolations.length + incidents.length + orders.length === 0) {
    return null;
  }

  return (
    <div className="details">
      <button
        type="button"
        className="toggle"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        {open ? 'Hide details' : 'Show details'}
      </button>
      <div id={listId} hidden={!open}>
        {openViolations.length > 0 && (
          <DetailList
            title="Open violations"
            total={openViolations.length}
            items={openViolations.slice(0, DETAIL_LIMIT).map((v) => ({
              key: v.id,
              text: `${v.inspectedOn} · Class ${v.class}${v.unit === null ? '' : ` · Unit ${v.unit}`} · ${shorten(v.description)}`,
            }))}
          />
        )}
        {incidents.length > 0 && (
          <DetailList
            title="Recent 311 incidents"
            total={incidents.length}
            items={incidents.slice(0, DETAIL_LIMIT).map((i) => ({
              key: `${i.date}|${i.type}|${i.descriptor}`,
              text: `${i.date} · ${i.type}${i.descriptor === '' ? '' : ` / ${i.descriptor}`}${i.requests > 1 ? ` (${String(i.requests)} reports)` : ''}`,
            }))}
          />
        )}
        {orders.length > 0 && (
          <DetailList
            title="Stop-work orders in force"
            total={orders.length}
            items={orders.map((o) => ({
              key: o.complaintNumber,
              text: `${o.date} · ${o.partial ? 'Partial' : 'Full'} stop-work order · Complaint ${o.complaintNumber}`,
            }))}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Renders one titled list of records.
 *
 * @param props - The title, the total count and the items shown.
 * @returns The list.
 */
function DetailList({
  title,
  total,
  items,
}: {
  title: string;
  total: number;
  items: readonly { key: string; text: string }[];
}): ReactElement {
  return (
    <section className="detail-list">
      <h3 className="detail-title">
        {title}
        {total > items.length && (
          <span className="detail-count">
            {' '}
            (showing {items.length} of {total.toLocaleString('en-US')})
          </span>
        )}
      </h3>
      <ul>
        {items.map((item) => (
          <li key={item.key}>{item.text}</li>
        ))}
      </ul>
    </section>
  );
}
