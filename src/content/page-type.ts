/**
 * Classifies a StreetEasy URL by the kind of page it points to.
 *
 * Pure function used by the content script, which passes in the current page's
 * URL. Classification uses the hostname and path only. Rental and sale listings
 * share one path shape, so both are classified as `listing`.
 */

const STREETEASY_HOSTNAME = 'streeteasy.com';

/**
 * The kind of page a URL points to.
 *
 * `building` and `unit` hold the URL's path segments as written. A building slug
 * can contain a street address, so these values stay in the browser.
 */
export type PageType =
  | {
      readonly kind: 'listing';
      readonly building: string;
      readonly unit: string;
    }
  | { readonly kind: 'building'; readonly building: string }
  | { readonly kind: 'search' }
  | { readonly kind: 'other' };

/**
 * Classifies a URL by the StreetEasy page it points to.
 *
 * @param url - The absolute URL to classify.
 * @returns The page type. Malformed URLs, other hosts and unrecognized paths are
 * `other`.
 *
 * @example
 * classifyPage('https://streeteasy.com/building/example-tower/5a');
 * // { kind: 'listing', building: 'example-tower', unit: '5a' }
 *
 * classifyPage('https://streeteasy.com/building/example-tower');
 * // { kind: 'building', building: 'example-tower' }
 */
export function classifyPage(url: string): PageType {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: 'other' };
  }

  if (parsed.hostname !== STREETEASY_HOSTNAME) {
    return { kind: 'other' };
  }

  // Empty segments are dropped so a trailing slash doesn't change the result.
  const segments = parsed.pathname.split('/').filter(Boolean);
  const [section, building, unit] = segments;

  if (section === 'search' && segments.length === 1) {
    return { kind: 'search' };
  }

  if (section === 'building' && building !== undefined) {
    if (segments.length === 2) {
      return { kind: 'building', building };
    }
    if (segments.length === 3 && unit !== undefined) {
      return { kind: 'listing', building, unit };
    }
  }

  return { kind: 'other' };
}
