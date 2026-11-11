/**
 * Reports changes to the page URL, including in-page navigation that doesn't
 * reload the page.
 *
 * StreetEasy updates the URL with the History API. Content scripts run in an
 * isolated world and can't intercept the page's history calls, so the URL is
 * compared on an interval and on popstate.
 */

/** How often the URL is checked, in milliseconds. */
export const URL_POLL_INTERVAL_MS = 500;

/**
 * Calls `onChange` with the new URL whenever the page URL changes.
 *
 * @param onChange - Called with the new URL after each change.
 * @param win - The window to watch.
 * @returns A function that stops watching.
 */
export function watchUrl(
  onChange: (url: string) => void,
  win: Window = window,
): () => void {
  let lastUrl = win.location.href;

  const check = (): void => {
    const url = win.location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      onChange(url);
    }
  };

  const interval = win.setInterval(check, URL_POLL_INTERVAL_MS);
  win.addEventListener('popstate', check);

  return () => {
    win.clearInterval(interval);
    win.removeEventListener('popstate', check);
  };
}
