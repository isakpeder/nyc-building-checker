/**
 * The popup shown from the toolbar icon: the on/off setting, clearing saved
 * reports and the version number.
 *
 * Presentational component: main.tsx supplies the settings and the actions that
 * talk to the extension, so tests can render it with stand-ins.
 */

import { useState, type ReactElement } from 'react';

import { EXTENSION_SHORT_NAME } from '../shared/constants';
import type { Settings } from '../shared/settings';

/** What the popup needs from the extension. */
export interface PopupProps {
  readonly settings: Settings;
  readonly version: string;
  readonly onChange: (settings: Settings) => void;
  /** Deletes saved reports and returns how many, or `null` if that failed. */
  readonly onClearCache: () => Promise<number | null>;
}

/**
 * Describes the result of clearing saved reports.
 *
 * @param removed - How many were deleted, or `null` on failure.
 * @returns The status message.
 */
export function clearMessage(removed: number | null): string {
  if (removed === null) return "Saved reports couldn't be cleared.";
  if (removed === 0) return 'There were no saved reports.';
  return `Cleared ${String(removed)} saved ${removed === 1 ? 'report' : 'reports'}.`;
}

/**
 * Renders the popup.
 *
 * @param props - Settings, version and actions.
 * @returns The popup element.
 */
export function Popup({
  settings,
  version,
  onChange,
  onClearCache,
}: PopupProps): ReactElement {
  const [status, setStatus] = useState<string | null>(null);

  return (
    <main className="popup">
      <h1 className="title">{EXTENSION_SHORT_NAME}</h1>
      <label className="setting">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(event) => {
            onChange({ ...settings, enabled: event.target.checked });
          }}
        />
        <span>
          Show building records on StreetEasy
          <span className="hint">Applies to open tabs right away.</span>
        </span>
      </label>
      <label className="setting">
        <input
          type="checkbox"
          checked={settings.shareUsage}
          onChange={(event) => {
            onChange({ ...settings, shareUsage: event.target.checked });
          }}
        />
        <span>
          Share anonymous usage stats
          <span className="hint">
            Counts like which features are used. Never addresses or listings.
          </span>
        </span>
      </label>
      <div className="actions">
        <button
          type="button"
          className="button"
          onClick={() => {
            void onClearCache().then((removed) => {
              setStatus(clearMessage(removed));
            });
          }}
        >
          Clear saved reports
        </button>
        <p className="status" role="status">
          {status ?? 'Reports are saved for a day to load faster.'}
        </p>
      </div>
      <p className="version">Version {version}</p>
    </main>
  );
}
