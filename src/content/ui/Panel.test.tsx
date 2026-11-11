// @vitest-environment jsdom
/**
 * Component tests for the report panel, its details and the shadow root it renders
 * into. Elements are found by role and visible text, as a reader would find them.
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { ListingAddress } from '../../shared/address/listing-address';
import type { StreetAddress } from '../../shared/address/street';
import type { BuildingReport } from '../../shared/messages';
import { err, ok } from '../../shared/result';
import { DETAIL_LIMIT, shorten } from './Details';
import { Panel } from './Panel';
import { attachPanel } from './panel-root';

afterEach(() => {
  cleanup();
});

const ADDRESS: ListingAddress = {
  street: '10 EXAMPLE STREET' as StreetAddress,
  unit: '3M' as ListingAddress['unit'],
  borough: 'QUEENS',
  postalCode: null,
  region: 'NY',
};

const empty = { requests: 0, incidents: 0 };

/**
 * Builds a report with optional open violations and incidents.
 *
 * @param openViolations - How many open class B violations to include.
 * @param incidents - How many 311 incidents to include.
 * @returns The report.
 */
function report(openViolations = 0, incidents = 0): BuildingReport {
  return {
    address: ADDRESS,
    building: { bbl: '4001230001', bin: '4123456' },
    sections: {
      violations: {
        status: 'ok',
        data: {
          byClass: {
            A: { open: 0, closed: 0 },
            B: { open: openViolations, closed: 0 },
            C: { open: 0, closed: 0 },
            I: { open: 0, closed: 0 },
          },
          violations: Array.from({ length: openViolations }, (_, i) => ({
            id: String(i),
            class: 'B' as const,
            open: true,
            inspectedOn: '2026-07-28',
            description: `REPAIR ITEM ${String(i)}`,
            unit: null,
          })),
          truncated: false,
        },
      },
      complaints: {
        status: 'ok',
        data: {
          byCategory: {
            heat: { requests: incidents, incidents },
            pests: empty,
            rodents: empty,
            plumbing: empty,
            building: empty,
            noise: empty,
            other: empty,
          },
          incidents: Array.from({ length: incidents }, (_, i) => ({
            category: 'heat' as const,
            type: 'HEAT/HOT WATER',
            descriptor: 'ENTIRE BUILDING',
            date: `2026-01-${String(i + 10)}`,
            requests: 2,
          })),
          truncated: false,
        },
      },
      stopWork: { status: 'unavailable' },
      bedbugs: { status: 'ok', data: { kind: 'no-filing' } },
    },
    builtAt: '2026-11-11T00:00:00.000Z',
  };
}

describe('Panel', () => {
  it('shows the address and a busy skeleton while loading', () => {
    render(<Panel view={{ status: 'loading', address: ADDRESS }} />);

    expect(
      screen.getByRole('heading', { name: 'Building record' }),
    ).toBeDefined();
    expect(screen.getByText('10 EXAMPLE STREET #3M')).toBeDefined();
    expect(screen.getByLabelText('Loading city records')).toBeDefined();
  });

  it('shows one labeled value per source', () => {
    render(
      <Panel
        view={{ status: 'done', address: ADDRESS, response: ok(report(2)) }}
      />,
    );

    expect(screen.getByText('Housing violations (HPD)')).toBeDefined();
    expect(screen.getByText('2 open')).toBeDefined();
    expect(screen.getByText('No filing on record')).toBeDefined();
  });

  it('shows a source that did not load as unavailable', () => {
    render(
      <Panel
        view={{ status: 'done', address: ADDRESS, response: ok(report()) }}
      />,
    );

    const row = screen.getByText('Stop-work orders (DOB)').parentElement;
    expect(
      row === null
        ? ''
        : within(row).getByText('Unavailable right now').textContent,
    ).toBe('Unavailable right now');
  });

  it('opens source links in a new tab without giving the page access', () => {
    render(
      <Panel
        view={{ status: 'done', address: ADDRESS, response: ok(report()) }}
      />,
    );

    const link = screen.getByRole('link', {
      name: 'Source records for Housing violations (HPD)',
    });
    expect(link.getAttribute('href')).toBe(
      'https://data.cityofnewyork.us/resource/wvxf-dwi5.json?bbl=4001230001',
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it.each([
    ['outside-nyc', /outside New York City/],
    ['building-not-found', /couldn't be matched/],
    ['unavailable', /unavailable right now/],
  ] as const)('explains a %s error', (error, message) => {
    render(
      <Panel
        view={{ status: 'done', address: ADDRESS, response: err(error) }}
      />,
    );

    expect(screen.getByText(message)).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Details', () => {
  it('starts collapsed and toggles with the button', () => {
    render(
      <Panel
        view={{ status: 'done', address: ADDRESS, response: ok(report(1, 1)) }}
      />,
    );
    const button = screen.getByRole('button', { name: 'Show details' });

    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(
      screen.queryByRole('heading', { name: 'Open violations' }),
    ).toBeNull();

    fireEvent.click(button);

    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(
      screen.getByRole('heading', { name: 'Open violations' }),
    ).toBeDefined();
    expect(screen.getByText(/REPAIR ITEM 0/)).toBeDefined();
    expect(
      screen.getByText(/HEAT\/HOT WATER \/ ENTIRE BUILDING \(2 reports\)/),
    ).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Hide details' }));

    expect(
      screen.queryByRole('heading', { name: 'Open violations' }),
    ).toBeNull();
  });

  it('caps each list and says how many there are', () => {
    render(
      <Panel
        view={{ status: 'done', address: ADDRESS, response: ok(report(25)) }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }));

    expect(screen.getAllByRole('listitem')).toHaveLength(DETAIL_LIMIT);
    expect(screen.getByText(/showing 10 of 25/)).toBeDefined();
  });

  it('is left out when there are no records to list', () => {
    render(
      <Panel
        view={{ status: 'done', address: ADDRESS, response: ok(report()) }}
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shortens long descriptions at a word boundary', () => {
    expect(shorten('short')).toBe('short');
    expect(shorten('alpha beta gamma delta', 12)).toBe('alpha beta…');
  });
});

describe('attachPanel', () => {
  it('renders into a closed shadow root that page scripts cannot read', async () => {
    const host = document.createElement('div');
    document.body.append(host);

    const panel = attachPanel(host);
    panel.render({ status: 'loading', address: ADDRESS });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(host.shadowRoot).toBeNull();
    expect(host.textContent).toBe('');
    panel.unmount();
    host.remove();
  });
});
