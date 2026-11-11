/**
 * Entry point for the popup page in index.html.
 *
 * Loads the settings, renders the popup and connects its actions to extension
 * storage and the background worker. The popup runs only while open.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { sendRequest } from '../shared/messaging';
import type { Settings } from '../shared/settings';
import { loadSettings, saveSettings } from '../shared/settings-store';
import { Popup } from './Popup';
import './popup.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Popup root element not found');
}
const root = createRoot(container);
const version = chrome.runtime.getManifest().version;

/**
 * Renders the popup with the given settings.
 *
 * @param settings - The current settings.
 */
function render(settings: Settings): void {
  root.render(
    <StrictMode>
      <Popup
        settings={settings}
        version={version}
        onChange={(next) => {
          render(next);
          void saveSettings(next).then(() =>
            sendRequest({
              type: 'track',
              event: {
                name: 'settings_changed',
                enabled: next.enabled,
                shareUsage: next.shareUsage,
              },
            }),
          );
        }}
        onClearCache={async () => {
          const response = await sendRequest({ type: 'clear-cache' });
          if (!response.ok) return null;
          void sendRequest({ type: 'track', event: { name: 'cache_cleared' } });
          return response.value.removed;
        }}
      />
    </StrictMode>,
  );
}

void loadSettings().then(render);
