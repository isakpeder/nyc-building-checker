/**
 * Script for the popup page in index.html. Shows the extension's name and version.
 *
 * The popup is its own extension page. It runs only while open, and the version
 * comes from the installed manifest.
 */

import { EXTENSION_SHORT_NAME } from '../shared/constants';

/**
 * Sets the text of an element on the popup page.
 *
 * @param id - The element's id.
 * @param text - The text to display.
 * @throws Error if index.html has no element with this id.
 */
function setText(id: string, text: string): void {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Popup element not found: #${id}`);
  }
  element.textContent = text;
}

setText('name', EXTENSION_SHORT_NAME);
setText('version', `Version ${chrome.runtime.getManifest().version}`);
