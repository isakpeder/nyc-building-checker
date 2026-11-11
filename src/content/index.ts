/**
 * Entry point for the content script, declared in manifest.config.ts.
 *
 * Runs on StreetEasy pages in an isolated world: it shares the page's DOM but not
 * its JavaScript variables. Reads from the current page only.
 */

import { EXTENSION_SHORT_NAME } from '../shared/constants';
import { extractListingAddress } from './extract';
import { classifyPage } from './page-type';

const page = classifyPage(window.location.href);

if (page.kind === 'listing') {
  console.log(
    `${EXTENSION_SHORT_NAME}: address`,
    extractListingAddress(document),
  );
} else {
  console.log(`${EXTENSION_SHORT_NAME}: page type is ${page.kind}`);
}
