/**
 * Reads, writes and watches settings in chrome.storage.sync.
 *
 * Thin adapter over the extension storage API, used by the popup and the content
 * script. Validation and defaults live in settings.ts.
 */

import { parseSettings, SETTINGS_KEY, type Settings } from './settings';

/**
 * Loads the user's settings.
 *
 * @returns The stored settings, with defaults for anything missing.
 */
export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(SETTINGS_KEY);
  return parseSettings(stored[SETTINGS_KEY]);
}

/**
 * Saves the user's settings. Every open listing tab is notified.
 *
 * @param settings - The settings to save.
 * @returns Resolves once saved.
 */
export function saveSettings(settings: Settings): Promise<void> {
  return chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
}

/**
 * Calls `listener` whenever the settings change, from any tab or the popup.
 *
 * @param listener - Receives the new settings.
 * @returns A function that stops listening.
 */
export function watchSettings(
  listener: (settings: Settings) => void,
): () => void {
  const onChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ): void => {
    const change = changes[SETTINGS_KEY];
    if (area === 'sync' && change !== undefined) {
      listener(parseSettings(change.newValue));
    }
  };
  chrome.storage.onChanged.addListener(onChanged);
  return () => {
    chrome.storage.onChanged.removeListener(onChanged);
  };
}
