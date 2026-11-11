/**
 * The report panel shown on listing pages.
 *
 * Rendered by panel-root.tsx inside the panel's shadow root. Receives everything
 * it shows as props and holds no state of its own.
 */

import type { ReactElement } from 'react';

import type { ListingAddress } from '../../shared/address/listing-address';

/** What the panel shows. */
export type PanelView =
  | { readonly status: 'loading'; readonly address: ListingAddress }
  | {
      readonly status: 'done';
      readonly address: ListingAddress;
      readonly text: string;
    };

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
 * Renders the panel.
 *
 * @param props - The panel's view.
 * @returns The panel element.
 */
export function Panel({ view }: { view: PanelView }): ReactElement {
  return (
    <section className="panel" aria-label="Building record">
      <header className="header">
        <h2 className="title">Building record</h2>
        <p className="subtitle">{addressLabel(view.address)}</p>
      </header>
      <div className="body" aria-live="polite">
        <p className="message">
          {view.status === 'loading' ? 'Loading city records…' : view.text}
        </p>
      </div>
    </section>
  );
}
