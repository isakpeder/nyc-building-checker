/**
 * Entry point for the content script, declared in manifest.config.ts.
 *
 * Runs on StreetEasy pages in an isolated world: it shares the page's DOM but not
 * its JavaScript variables. Reads from the current page only.
 */

import { EXTENSION_SHORT_NAME } from '../shared/constants';
import { addressFromJsonLd } from './extract/json-ld';
import { classifyPage } from './page-type';

/**
 * Parses each JSON-LD script on the page. Scripts that aren't valid JSON are
 * skipped.
 *
 * @returns The parsed contents of each script.
 */
function readJsonLdBlocks(): unknown[] {
  const scripts = document.querySelectorAll(
    'script[type="application/ld+json"]',
  );

  return Array.from(scripts).flatMap((script) => {
    try {
      return [JSON.parse(script.textContent) as unknown];
    } catch {
      return [];
    }
  });
}

const page = classifyPage(window.location.href);

if (page.kind === 'listing') {
  const address = addressFromJsonLd(readJsonLdBlocks());
  console.log(`${EXTENSION_SHORT_NAME}: address`, address);
} else {
  console.log(`${EXTENSION_SHORT_NAME}: page type is ${page.kind}`);
}
