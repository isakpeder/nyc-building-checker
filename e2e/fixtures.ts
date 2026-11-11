/**
 * Playwright fixtures that load the built extension into Chromium and mock every
 * network request it makes.
 *
 * The extension is loaded from dist-e2e, built with `vite build --mode e2e`.
 * Requests not mocked by a test are aborted, so no test reaches a real server.
 */

import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  chromium,
  test as base,
  type BrowserContext,
  type Route,
} from '@playwright/test';

const EXTENSION_PATH = path.resolve(import.meta.dirname, '..', 'dist-e2e');
const LISTING_HTML = readFileSync(
  path.join(import.meta.dirname, 'fixtures', 'listing.html'),
  'utf8',
);

/** The URL of the synthetic listing page. */
export const LISTING_URL = 'https://streeteasy.com/building/example-tower/3m';

/** BBLs the mocked geocoder assigns to each synthetic street. */
const BBLS: Readonly<Record<string, string>> = {
  '10-20 EXAMPLE ROAD': '4001230001',
  '5 2 AVENUE': '4004560002',
};

/**
 * Answers a request with JSON.
 *
 * @param route - The intercepted request.
 * @param body - The response body.
 * @param status - The HTTP status.
 * @returns Resolves when answered.
 */
export function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  });
}

/** Mocked rows for each city dataset. */
export const DATASET_ROWS: Readonly<Record<string, unknown[]>> = {
  'wvxf-dwi5': [
    {
      violationid: '1',
      class: 'C',
      inspectiondate: '2026-08-12T00:00:00.000',
      violationstatus: 'Open',
      novdescription: '§ 27-2005 HMC: REPAIR THE SELF-CLOSING DOOR',
    },
    {
      violationid: '2',
      class: 'B',
      inspectiondate: '2026-07-01T00:00:00.000',
      violationstatus: 'Open',
      novdescription: 'REPAIR THE BROKEN OUTLET',
      apartment: '3M',
    },
  ],
  'erm2-nwe9': [
    {
      unique_key: '100',
      created_date: '2026-01-15T08:00:00.000',
      agency: 'HPD',
      complaint_type: 'HEAT/HOT WATER',
      descriptor: 'ENTIRE BUILDING',
    },
  ],
  'eabe-havv': [],
  'wz6d-d3jb': [
    {
      building_id: '1',
      of_dwelling_units: '40',
      infested_dwelling_unit_count: '0',
      filing_date: '2026-02-16T00:00:00.000',
    },
  ],
};

/**
 * Mocks the listing page, the geocoder and every dataset, and blocks anything
 * else.
 *
 * @param context - The browser context.
 * @returns Resolves when the routes are registered.
 */
async function mockNetwork(context: BrowserContext): Promise<void> {
  // Registered first, so it only answers web requests no later route matches.
  // Extension files load from chrome-extension:// and pass through.
  await context.route(
    (url) => url.protocol === 'http:' || url.protocol === 'https:',
    (route) => route.abort(),
  );

  await context.route('https://streeteasy.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: LISTING_HTML }),
  );

  await context.route('https://geosearch.planninglabs.nyc/**', (route) => {
    const text = new URL(route.request().url()).searchParams.get('text') ?? '';
    const street = text.split(',')[0]?.trim() ?? '';
    const bbl = BBLS[street];
    return json(route, {
      features:
        bbl === undefined
          ? []
          : [
              {
                properties: {
                  name: street,
                  borough: 'Queens',
                  addendum: { pad: { bbl, bin: `4${bbl.slice(4, 10)}` } },
                },
              },
            ],
    });
  });

  await context.route('https://data.cityofnewyork.us/resource/**', (route) => {
    const id =
      /resource\/([a-z0-9-]+)\.json/.exec(route.request().url())?.[1] ?? '';
    return json(route, DATASET_ROWS[id] ?? []);
  });
}

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  // The fixture signature is fixed by Playwright, so the unused first argument stays.
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const userDataDir = mkdtempSync(path.join(tmpdir(), 'stoop-e2e-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });
    await mockNetwork(context);
    context.on('console', (message) => {
      if (message.type() === 'error') console.log(`[page] ${message.text()}`);
    });
    await use(context);
    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
  },
  extensionId: async ({ context }, use) => {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker'));
    await use(worker.url().split('/')[2] ?? '');
  },
});

export { expect } from '@playwright/test';
