/**
 * The dialog listing the records behind the report card's numbers.
 *
 * Opens over the page in a modal dialog, so expanding it never changes the
 * listing page's layout. Shows open violations with their full text, recent 311
 * incidents and stop-work orders in force, newest first.
 */

import { useId, useRef, type ReactElement } from 'react';

import type { BuildingReport } from '../../shared/messages';

/** Records shown per list. Longer lists point to the source records. */
export const DETAIL_LIMIT = 50;

/** Legal citation codes that open an HPD violation description. */
const CITATION_CODES = /§|\b(HMC|ADM CODE|MDL|RCNY)\b/;

/**
 * Splits an HPD violation description into its legal citation and its text.
 *
 * @param description - The description, such as `§ 27-2005 HMC: REPAIR THE DOOR`.
 * @returns The plain text, and the citation when the description starts with one.
 *
 * @example
 * splitCitation('§ 27-2005 HMC: REPAIR THE DOOR');
 * // { text: 'REPAIR THE DOOR', citation: '§ 27-2005 HMC' }
 */
export function splitCitation(description: string): {
  text: string;
  citation: string | null;
} {
  const colon = description.indexOf(':');
  const prefix = description.slice(0, colon);
  if (colon <= 0 || !CITATION_CODES.test(prefix)) {
    return { text: description, citation: null };
  }
  return {
    text: description.slice(colon + 1).trim(),
    citation: prefix.trim(),
  };
}

/**
 * Renders the details button and dialog.
 *
 * @param props - The report.
 * @returns The details control, or `null` when there's nothing to list.
 */
export function Details({
  report,
}: {
  report: BuildingReport;
}): ReactElement | null {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
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

  const close = (): void => {
    dialog.current?.close();
  };

  return (
    <div className="details">
      <button
        type="button"
        className="toggle"
        aria-haspopup="dialog"
        onClick={() => {
          dialog.current?.showModal();
        }}
      >
        Show details
      </button>
      <dialog
        ref={dialog}
        className="dialog"
        aria-labelledby={titleId}
        onClick={(event) => {
          // A click on the backdrop lands on the dialog element itself.
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="dialog-header">
          <h2 className="title" id={titleId}>
            Building records
          </h2>
          <button type="button" className="toggle" onClick={close}>
            Close
          </button>
        </div>
        <div className="dialog-body">
          {openViolations.length > 0 && (
            <section className="detail-list">
              <h3 className="detail-title">
                Open violations on record
                <Count shown={openViolations.length} />
              </h3>
              <p className="key">
                HPD classes: A is non-hazardous (about 90 days to correct), B is
                hazardous (30 days), C is immediately hazardous (24 hours, or up
                to 21 days for some conditions). A violation stays open on
                record until the owner certifies the repair or HPD reinspects,
                so an open violation may already be fixed.
              </p>
              <ul>
                {openViolations.slice(0, DETAIL_LIMIT).map((v) => {
                  const { text, citation } = splitCitation(v.description);
                  return (
                    <li key={v.id}>
                      <span className="item-meta">
                        {v.inspectedOn} · Class {v.class}
                        {v.unit === null ? '' : ` · Unit ${v.unit}`}
                      </span>
                      <span className="item-text">{text}</span>
                      {citation !== null && (
                        <span className="item-citation">{citation}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {incidents.length > 0 && (
            <section className="detail-list">
              <h3 className="detail-title">
                311 incidents, last 3 years
                <Count shown={incidents.length} />
              </h3>
              <ul>
                {incidents.slice(0, DETAIL_LIMIT).map((i) => (
                  <li key={`${i.date}|${i.type}|${i.descriptor}`}>
                    <span className="item-meta">{i.date}</span>
                    <span className="item-text">
                      {i.type}
                      {i.descriptor === '' ? '' : ` / ${i.descriptor}`}
                      {i.requests > 1 ? ` (${String(i.requests)} reports)` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {orders.length > 0 && (
            <section className="detail-list">
              <h3 className="detail-title">Stop-work orders in force</h3>
              <ul>
                {orders.map((o) => (
                  <li key={o.complaintNumber}>
                    <span className="item-meta">{o.date}</span>
                    <span className="item-text">
                      {o.partial ? 'Partial' : 'Full'} stop-work order, DOB
                      complaint {o.complaintNumber}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </dialog>
    </div>
  );
}

/**
 * Renders a list's count when the list is longer than what's shown.
 *
 * @param props - How many records the list has.
 * @returns The count, or nothing.
 */
function Count({ shown }: { shown: number }): ReactElement | null {
  return shown > DETAIL_LIMIT ? (
    <span className="detail-count">
      {' '}
      (newest {DETAIL_LIMIT} of {shown.toLocaleString('en-US')})
    </span>
  ) : null;
}
