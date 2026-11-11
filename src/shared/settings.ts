/**
 * User settings: their shape, defaults and validation.
 *
 * Pure module used by the popup, which edits settings, and the content script,
 * which follows them. Stored values are validated on read, and any missing or
 * malformed field falls back to its default.
 */

import { z } from 'zod';

/** User settings. */
export interface Settings {
  /** Show the building record panel on StreetEasy listings. */
  readonly enabled: boolean;
  /** Send anonymous usage events. */
  readonly shareUsage: boolean;
}

/** Settings used before the user changes anything. */
export const DEFAULT_SETTINGS: Settings = { enabled: true, shareUsage: true };

/** The key settings are stored under in chrome.storage.sync. */
export const SETTINGS_KEY = 'settings';

const SettingsSchema = z.object({
  enabled: z.boolean().catch(DEFAULT_SETTINGS.enabled),
  shareUsage: z.boolean().catch(DEFAULT_SETTINGS.shareUsage),
});

/**
 * Reads stored settings, filling in defaults for anything missing or invalid.
 *
 * @param stored - The stored value, which may be anything.
 * @returns Valid settings.
 *
 * @example
 * parseSettings(undefined); // { enabled: true, shareUsage: true }
 * parseSettings({ enabled: 'no' }); // { enabled: true, shareUsage: true }
 */
export function parseSettings(stored: unknown): Settings {
  const parsed = SettingsSchema.safeParse(stored);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}
