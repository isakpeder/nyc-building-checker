/**
 * Sends anonymous usage events to PostHog. The only module that sends analytics.
 *
 * An event is sent only when a PostHog project key was provided at build time,
 * the build is a production build, the user's "Share anonymous usage stats"
 * setting is on, and the event matches the allowed schema. Events carry a random
 * install ID, not tied to any account. PostHog is told not to build a person
 * profile or look up a location for them.
 */

import {
  AnalyticsEventSchema,
  type AnalyticsEvent,
} from '../shared/analytics-events';

const CAPTURE_URL = 'https://us.i.posthog.com/i/v0/e/';
const INSTALL_ID_KEY = 'install-id';

/** What sending an event needs, passed in so tests can replace it. */
export interface AnalyticsDeps {
  /** The PostHog project key, or an empty string when analytics is off. */
  readonly projectKey: string;
  readonly version: string;
  /** Whether the user allows usage stats. */
  readonly shareUsage: () => Promise<boolean>;
  /** Returns this install's random ID, creating it the first time. */
  readonly installId: () => Promise<string>;
  readonly send: (url: string, body: string) => Promise<unknown>;
}

/**
 * Creates the function that sends events.
 *
 * @param deps - Key, version, settings, install ID and network access.
 * @returns `track`, which resolves to `true` when an event was sent.
 */
export function createTracker(
  deps: AnalyticsDeps,
): (event: unknown) => Promise<boolean> {
  return async (event) => {
    const parsed = AnalyticsEventSchema.safeParse(event);
    if (
      deps.projectKey === '' ||
      !parsed.success ||
      !(await deps.shareUsage())
    ) {
      return false;
    }

    const { name, ...properties } = parsed.data;
    try {
      await deps.send(
        CAPTURE_URL,
        JSON.stringify({
          api_key: deps.projectKey,
          event: name,
          distinct_id: await deps.installId(),
          properties: {
            ...properties,
            extension_version: deps.version,
            $process_person_profile: false,
            $geoip_disable: true,
          },
        }),
      );
      return true;
    } catch {
      // Analytics failures are never shown to the user or retried.
      return false;
    }
  };
}

/**
 * Returns the install ID from extension storage, creating a random one first.
 *
 * @returns The install ID.
 */
export async function storedInstallId(): Promise<string> {
  const stored = (await chrome.storage.local.get(INSTALL_ID_KEY))[
    INSTALL_ID_KEY
  ];
  if (typeof stored === 'string' && stored !== '') {
    return stored;
  }
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [INSTALL_ID_KEY]: id });
  return id;
}

export type { AnalyticsEvent };
