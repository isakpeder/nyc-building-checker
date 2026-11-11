/**
 * The report panel shown on listing pages.
 *
 * Rendered by panel-root.tsx inside the panel's shadow root. Receives everything
 * it shows as props and holds no state of its own.
 */

import { useEffect, useState, type ReactElement } from 'react';

import type { ListingAddress } from '../../shared/address/listing-address';
import { EXTENSION_SHORT_NAME } from '../../shared/constants';
import type { BuildingReport, ReportError } from '../../shared/messages';
import type { Result } from '../../shared/result';
import { Details } from './Details';
import { buildRows, type RowModel } from './rows';

/** What the panel shows. */
export type PanelView =
  | { readonly status: 'loading'; readonly address: ListingAddress }
  | {
      readonly status: 'done';
      readonly address: ListingAddress;
      readonly response: Result<BuildingReport, ReportError>;
    };

/** Messages for reports that couldn't be built. */
export const ERROR_MESSAGES: Readonly<Record<ReportError, string>> = {
  'outside-nyc':
    'This listing is outside New York City, so no city records apply.',
  'building-not-found':
    "This address couldn't be matched to a single NYC building, so no records are shown.",
  'invalid-request': "This listing's address couldn't be read.",
  unavailable:
    'City records are unavailable right now. Try reloading the page later.',
};

/** Number of placeholder rows while loading. */
const SKELETON_ROWS = 4;

/** How long loading runs before the message starts changing. */
export const SLOW_LOADING_MS = 5000;

/** How long each message shows once loading is slow. */
export const ROTATE_MS = 4000;

/** The first loading message. */
export const FIRST_MESSAGE = 'Looking up city records for this building…';

/** Messages shown in turn once loading takes a while. */
export const SLOW_MESSAGES = [
  'Hang tight, still gathering records…',
  'Still checking city records…',
  'This can take a few more seconds…',
  'Some city data is taking a moment…',
];

/**
 * Renders the loading message. After a while it rotates through messages that
 * stay accurate however long loading takes.
 *
 * @returns The message.
 */
function LoadingMessage(): ReactElement {
  // -1 shows the first message; 0 and up index into SLOW_MESSAGES.
  const [step, setStep] = useState(-1);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const timer = setTimeout(() => {
      setStep(0);
      interval = setInterval(() => {
        setStep((current) => (current + 1) % SLOW_MESSAGES.length);
      }, ROTATE_MS);
    }, SLOW_LOADING_MS);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  return (
    <p className="loading-message">
      {step < 0 ? FIRST_MESSAGE : SLOW_MESSAGES[step]}
    </p>
  );
}

/**
 * Formats a listing address for the panel header.
 *
 * @param address - The listing address.
 * @returns The street, with the unit when there is one.
 */
export function addressLabel(address: ListingAddress): string {
  return address.unit === null
    ? address.street
    : `${address.street} #${address.unit}`;
}

/**
 * Renders one report row.
 *
 * @param props - The row.
 * @returns The row's term and description.
 */
function Row({ row }: { row: RowModel }): ReactElement {
  return (
    <div className="row">
      <dt className="label">{row.label}</dt>
      <dd className="value">
        {row.value === null ? (
          <span className="muted">Unavailable right now</span>
        ) : (
          <span className={row.warning === true ? 'warning' : undefined}>
            {row.value}
          </span>
        )}
        {row.detail !== undefined && (
          <span className="detail">{row.detail}</span>
        )}
      </dd>
      <dd className="source">
        <a
          href={row.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Source records for ${row.label}`}
        >
          Source
        </a>
      </dd>
    </div>
  );
}

/**
 * Renders the panel.
 *
 * @param props - The panel's view.
 * @returns The panel element.
 */
export function Panel({ view }: { view: PanelView }): ReactElement {
  const loading = view.status === 'loading';

  return (
    <section
      className="panel"
      aria-label={`${EXTENSION_SHORT_NAME} building record`}
    >
      <header className="header">
        <h2 className="title">Building record</h2>
        <p className="subtitle">{addressLabel(view.address)}</p>
      </header>
      <div className="body" aria-live="polite" aria-busy={loading}>
        {loading ? (
          <>
            <LoadingMessage />
            <dl className="rows" aria-label="Loading city records">
              {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <div className="row" key={index}>
                  <dt className="skeleton skeleton-label" />
                  <dd className="skeleton skeleton-value" />
                </div>
              ))}
            </dl>
          </>
        ) : view.response.ok ? (
          <>
            <dl className="rows">
              {buildRows(view.response.value).map((row) => (
                <Row key={row.key} row={row} />
              ))}
            </dl>
            <Details report={view.response.value} />
          </>
        ) : (
          <p className="message">{ERROR_MESSAGES[view.response.error]}</p>
        )}
      </div>
      <footer className="footer">
        {EXTENSION_SHORT_NAME} · Public records from NYC Open Data
      </footer>
    </section>
  );
}
