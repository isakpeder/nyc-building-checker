/**
 * Entry point for the content script, declared in manifest.config.ts.
 *
 * Runs on StreetEasy pages in an isolated world: it shares the page's DOM but not
 * its JavaScript variables. Reads from the current page only.
 */

import { EXTENSION_SHORT_NAME } from '../shared/constants';
import { classifyPage } from './page-type';

const page = classifyPage(window.location.href);

console.log(`${EXTENSION_SHORT_NAME}: page type is ${page.kind}`);
