/**
 * Adds and removes the extension's panel on the listing page.
 *
 * Mounting is idempotent: the page holds at most one panel, keyed by listing.
 * Mounting the same listing again keeps the existing panel, and mounting a
 * different listing replaces it.
 */

/** The panel host element's id. */
export const PANEL_ID = 'stoop-panel';

/** The element the panel is placed after, when the page has it. */
const ANCHOR = '[data-testid="homeAddress"]';

/**
 * Shows the panel for a listing, replacing a panel for any other listing.
 *
 * @param root - The listing page's document.
 * @param key - Identifies the listing. A panel with the same key is kept.
 * @returns The panel host element.
 */
export function mountPanel(root: Document, key: string): HTMLElement {
  const existing = root.getElementById(PANEL_ID);
  if (existing?.dataset.listingKey === key) {
    return existing;
  }
  existing?.remove();

  const host = root.createElement('div');
  host.id = PANEL_ID;
  host.dataset.listingKey = key;

  const anchor = root.querySelector(ANCHOR);
  if (anchor === null) {
    root.body.prepend(host);
  } else {
    anchor.after(host);
  }

  return host;
}

/**
 * Removes the panel, if the page has one.
 *
 * @param root - The page's document.
 */
export function unmountPanel(root: Document): void {
  root.getElementById(PANEL_ID)?.remove();
}
