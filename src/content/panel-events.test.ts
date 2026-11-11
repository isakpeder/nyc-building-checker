/**
 * Tests for panelShownEvent in panel-events.ts.
 */

import { describe, expect, it } from 'vitest';

import type { BuildingReport } from '../shared/messages';
import { err, ok } from '../shared/result';
import { panelShownEvent } from './panel-events';

describe('panelShownEvent', () => {
  it('records an error outcome', () => {
    expect(panelShownEvent(err('outside-nyc'))).toEqual({
      name: 'panel_shown',
      outcome: 'outside-nyc',
      unavailableSections: 0,
    });
  });

  it('counts unavailable sections and nothing about the listing', () => {
    const okSection = { status: 'ok', data: null } as never;
    const report = {
      address: { street: '10 MAIN STREET' },
      building: { bbl: '1012340001', bin: '1012345' },
      sections: {
        violations: okSection,
        complaints: { status: 'unavailable' },
        stopWork: { status: 'unavailable' },
        bedbugs: okSection,
      },
      builtAt: '2026-11-11T00:00:00.000Z',
    } as unknown as BuildingReport;

    expect(panelShownEvent(ok(report))).toEqual({
      name: 'panel_shown',
      outcome: 'report',
      unavailableSections: 2,
    });
  });
});
