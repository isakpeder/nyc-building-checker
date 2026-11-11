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
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ListingAddress } from '../../shared/address/listing-address';
import type { StreetAddress } from '../../shared/address/street';
import type { BuildingReport } from '../../shared/messages';
import { err, ok } from '../../shared/result';
import { DETAIL_LIMIT, splitCitation } from './Details';
import {
  FIRST_MESSAGE,
  Panel,
  ROTATE_MS,
  SLOW_LOADING_MS,
  SLOW_MESSAGES,
} from './Panel';
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

  it('rotates through friendly messages once loading is slow', () => {
    vi.useFakeTimers();
    render(<Panel view={{ status: 'loading', address: ADDRESS }} />);
    const seen = [screen.getByText(FIRST_MESSAGE).textContent];

    act(() => {
      vi.advanceTimersByTime(SLOW_LOADING_MS);
    });
    SLOW_MESSAGES.forEach(() => {
      seen.push(document.querySelector('.loading-message')?.textContent ?? '');
      act(() => {
        vi.advanceTimersByTime(ROTATE_MS);
      });
    });

    expect(seen).toEqual([FIRST_MESSAGE, ...SLOW_MESSAGES]);
    expect(document.querySelector('.loading-message')?.textContent).toBe(
      SLOW_MESSAGES[0],
    );
    vi.useRealTimers();
  });

  it('shows one labeled value per source', () => {
    render(
      <Panel
        view={{ status: 'done', address: ADDRESS, response: ok(report(2)) }}
      />,
    );

    expect(screen.getByText('Housing violations (HPD)')).toBeDefined();
    expect(screen.getByText('2 open on record')).toBeDefined();
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
  // jsdom has no modal dialogs, so open and close only toggle the attribute.
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function showModal(
      this: HTMLDialogElement,
    ) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close(
      this: HTMLDialogElement,
    ) {
      this.open = false;
    };
  });

  it('opens the records in a dialog and closes it', () => {
    render(
      <Panel
        view={{ status: 'done', address: ADDRESS, response: ok(report(1, 1)) }}
      />,
    );

    const dialog = screen.getByRole('dialog', { hidden: true });
    expect((dialog as HTMLDialogElement).open).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Show details' }));

    expect((dialog as HTMLDialogElement).open).toBe(true);
    expect(
      within(dialog).getByRole('heading', { name: 'Building records' }),
    ).toBeDefined();
    expect(within(dialog).getByText('REPAIR ITEM 0')).toBeDefined();
    expect(
      within(dialog).getByText(
        /HEAT\/HOT WATER \/ ENTIRE BUILDING \(2 reports\)/,
      ),
    ).toBeDefined();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));

    expect((dialog as HTMLDialogElement).open).toBe(false);
  });

  it('closes when the backdrop is clicked', () => {
    render(
      <Panel
        view={{ status: 'done', address: ADDRESS, response: ok(report(1)) }}
      />,
    );
    const dialog = screen.getByRole<HTMLDialogElement>('dialog', {
      hidden: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }));

    fireEvent.click(dialog);

    expect(dialog.open).toBe(false);
  });

  it('caps each list and says how many there are', () => {
    render(
      <Panel
        view={{ status: 'done', address: ADDRESS, response: ok(report(60)) }}
      />,
    );
    const dialog = screen.getByRole('dialog', { hidden: true });

    expect(
      within(dialog).getAllByRole('listitem', { hidden: true }),
    ).toHaveLength(DETAIL_LIMIT);
    expect(within(dialog).getByText(/newest 50 of 60/)).toBeDefined();
  });

  it('is left out when there are no records to list', () => {
    render(
      <Panel
        view={{ status: 'done', address: ADDRESS, response: ok(report()) }}
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('splitCitation', () => {
  it.each([
    [
      '§ 27-2005, 27-2007 HMC, §238 MDL AND 28 RCNY §25-171: REPLACE THE SELF-CLOSING DOORS',
      {
        text: 'REPLACE THE SELF-CLOSING DOORS',
        citation: '§ 27-2005, 27-2007 HMC, §238 MDL AND 28 RCNY §25-171',
      },
    ],
    [
      '§ 27-2031 ADM CODE PROVIDE HOT WATER',
      { text: '§ 27-2031 ADM CODE PROVIDE HOT WATER', citation: null },
    ],
    ['NOTE: CALL THE OWNER', { text: 'NOTE: CALL THE OWNER', citation: null }],
    ['REPAIR THE STEPS', { text: 'REPAIR THE STEPS', citation: null }],
  ])('splits %j', (description, expected) => {
    expect(splitCitation(description)).toEqual(expected);
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
