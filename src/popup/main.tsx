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
          void saveSettings(next);
        }}
        onClearCache={async () => {
          const response = await sendRequest({ type: 'clear-cache' });
          return response.ok ? response.value.removed : null;
        }}
      />
    </StrictMode>,
  );
}

void loadSettings().then(render);
