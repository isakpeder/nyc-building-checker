/**
 * Waits for an element to appear in the document.
 *
 * Used after in-page navigation, when the URL changes before the new listing's
 * content is rendered.
 */

/**
 * Resolves with the first element matching `selector`, as soon as it exists.
 *
 * @param root - The document to watch.
 * @param selector - The CSS selector to wait for.
 * @param timeoutMs - How long to wait before giving up.
 * @param signal - Aborts the wait early.
 * @returns The element, or `null` on timeout or abort.
 */
export function waitForElement(
  root: Document,
  selector: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Element | null> {
  const existing = root.querySelector(selector);
  if (existing !== null) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve) => {
    const finish = (element: Element | null): void => {
      observer.disconnect();
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve(element);
    };
    const onAbort = (): void => {
      finish(null);
    };

    const observer = new MutationObserver(() => {
      const element = root.querySelector(selector);
      if (element !== null) {
        finish(element);
      }
    });
    const timer = setTimeout(() => {
      finish(null);
    }, timeoutMs);

    signal?.addEventListener('abort', onAbort);
    observer.observe(root, { childList: true, subtree: true });
  });
}
