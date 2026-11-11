// @vitest-environment jsdom
/**
 * Component tests for the popup and tests for settings validation.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS, parseSettings } from '../shared/settings';
import { clearMessage, Popup } from './Popup';

afterEach(() => {
  cleanup();
});

describe('Popup', () => {
  it('shows the setting and version', () => {
    render(
      <Popup
        settings={{ enabled: true, shareUsage: true }}
        version="0.1.0"
        onChange={vi.fn()}
        onClearCache={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('checkbox', {
        name: /Show building records on StreetEasy/,
      }),
    ).toHaveProperty('checked', true);
    expect(screen.getByText('Version 0.1.0')).toBeDefined();
  });

  it('reports a change to the setting', () => {
    const onChange = vi.fn();
    render(
      <Popup
        settings={{ enabled: true, shareUsage: true }}
        version="0.1.0"
        onChange={onChange}
        onClearCache={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole('checkbox', { name: /Show building records/ }),
    );

    expect(onChange).toHaveBeenCalledWith({ enabled: false, shareUsage: true });
  });

  it('reports a change to usage sharing', () => {
    const onChange = vi.fn();
    render(
      <Popup
        settings={{ enabled: true, shareUsage: true }}
        version="0.1.0"
        onChange={onChange}
        onClearCache={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole('checkbox', { name: /Share anonymous usage stats/ }),
    );

    expect(onChange).toHaveBeenCalledWith({ enabled: true, shareUsage: false });
  });

  it('clears saved reports and says how many', async () => {
    const onClearCache = vi.fn().mockResolvedValue(3);
    render(
      <Popup
        settings={{ enabled: true, shareUsage: true }}
        version="0.1.0"
        onChange={vi.fn()}
        onClearCache={onClearCache}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Clear saved reports' }),
    );

    expect(await screen.findByText('Cleared 3 saved reports.')).toBeDefined();
  });
});

describe('clearMessage', () => {
  it.each([
    [null, "Saved reports couldn't be cleared."],
    [0, 'There were no saved reports.'],
    [1, 'Cleared 1 saved report.'],
    [4, 'Cleared 4 saved reports.'],
  ])('describes %j', (removed, message) => {
    expect(clearMessage(removed)).toBe(message);
  });
});

describe('parseSettings', () => {
  it.each([
    [undefined, DEFAULT_SETTINGS],
    [null, DEFAULT_SETTINGS],
    ['on', DEFAULT_SETTINGS],
    [{}, DEFAULT_SETTINGS],
    [{ enabled: 'no' }, DEFAULT_SETTINGS],
    [{ enabled: false }, { enabled: false, shareUsage: true }],
    [
      { enabled: true, shareUsage: false },
      { enabled: true, shareUsage: false },
    ],
    [
      { enabled: true, extra: 1 },
      { enabled: true, shareUsage: true },
    ],
  ])('reads %j', (stored, expected) => {
    expect(parseSettings(stored)).toEqual(expected);
  });
});
