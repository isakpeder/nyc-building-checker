/**
 * Tests for the analytics module: the event schema, the opt-out and the payload
 * sent to PostHog.
 */

import { describe, expect, it, vi } from 'vitest';

import { AnalyticsEventSchema } from '../shared/analytics-events';
import { createTracker, type AnalyticsDeps } from './analytics';

/**
 * Builds tracker dependencies with a recording send function.
 *
 * @param overrides - Dependencies to replace.
 * @returns The dependencies and the send spy.
 */
function deps(overrides: Partial<AnalyticsDeps> = {}) {
  const send = vi.fn().mockResolvedValue(undefined);
  return {
    send,
    deps: {
      projectKey: 'phc_test',
      version: '0.1.0',
      shareUsage: () => Promise.resolve(true),
      installId: () => Promise.resolve('install-1'),
      send,
      ...overrides,
    } satisfies AnalyticsDeps,
  };
}

describe('AnalyticsEventSchema', () => {
  it.each([
    ['an address', { name: 'details_opened', address: '10 MAIN STREET' }],
    [
      'a listing URL',
      { name: 'details_opened', url: 'https://streeteasy.com/building/x/1' },
    ],
    [
      'a BBL',
      {
        name: 'panel_shown',
        outcome: 'report',
        unavailableSections: 0,
        bbl: '1012340001',
      },
    ],
    [
      'a price',
      { name: 'source_link_clicked', source: 'violations', price: 3000 },
    ],
    ['an unknown event', { name: 'listing_viewed' }],
    [
      'an unknown source',
      { name: 'source_link_clicked', source: 'streeteasy' },
    ],
    [
      'an out-of-range count',
      { name: 'panel_shown', outcome: 'report', unavailableSections: 9 },
    ],
  ])('rejects an event with %s', (_label, event) => {
    expect(AnalyticsEventSchema.safeParse(event).success).toBe(false);
  });

  it('accepts every allowed event', () => {
    for (const event of [
      { name: 'extension_installed' },
      { name: 'extension_updated' },
      { name: 'panel_shown', outcome: 'outside-nyc', unavailableSections: 0 },
      { name: 'details_opened' },
      { name: 'source_link_clicked', source: 'bedbugs' },
      { name: 'settings_changed', enabled: true, shareUsage: false },
      { name: 'cache_cleared' },
    ]) {
      expect(AnalyticsEventSchema.safeParse(event).success).toBe(true);
    }
  });
});

describe('createTracker', () => {
  it('sends an anonymous event with no location lookup', async () => {
    const { deps: d, send } = deps();

    await expect(createTracker(d)({ name: 'details_opened' })).resolves.toBe(
      true,
    );

    const [url, body] = send.mock.calls[0] as [string, string];
    expect(url).toBe('https://us.i.posthog.com/i/v0/e/');
    expect(JSON.parse(body)).toEqual({
      api_key: 'phc_test',
      event: 'details_opened',
      distinct_id: 'install-1',
      properties: {
        extension_version: '0.1.0',
        $process_person_profile: false,
        $geoip_disable: true,
      },
    });
  });

  it('sends nothing when the user turned usage stats off', async () => {
    const { deps: d, send } = deps({
      shareUsage: () => Promise.resolve(false),
    });

    await expect(createTracker(d)({ name: 'details_opened' })).resolves.toBe(
      false,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('sends nothing without a project key', async () => {
    const { deps: d, send } = deps({ projectKey: '' });

    await createTracker(d)({ name: 'details_opened' });

    expect(send).not.toHaveBeenCalled();
  });

  it('refuses an event with a field outside the schema', async () => {
    const { deps: d, send } = deps();

    await expect(
      createTracker(d)({ name: 'details_opened', address: '10 MAIN STREET' }),
    ).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('swallows network errors', async () => {
    const { deps: d } = deps({
      send: () => Promise.reject(new Error('offline')),
    });

    await expect(createTracker(d)({ name: 'cache_cleared' })).resolves.toBe(
      false,
    );
  });
});
