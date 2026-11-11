/**
 * End-to-end tests: the built extension in Chromium on a synthetic listing page,
 * with every city API mocked.
 */

import { expect, json, LISTING_URL, test } from './fixtures';

test('shows the building record on a listing', async ({
  context,
  extensionId,
}) => {
  expect(extensionId).not.toBe('');
  const page = await context.newPage();
  await page.goto(LISTING_URL);
  const panel = page.locator('#stoop-panel');

  await expect(panel.getByText('10-20 EXAMPLE ROAD #3M')).toBeVisible();
  await expect(panel.getByText('2 open on record, 1 class C')).toBeVisible();
  await expect(panel.getByText('1 incident', { exact: true })).toBeVisible();
  await expect(panel.getByText('None in force')).toBeVisible();
  await expect(panel.getByText('0 infested units reported')).toBeVisible();

  await panel.getByRole('button', { name: 'Show details' }).click();
  await expect(panel.getByText('REPAIR THE SELF-CLOSING DOOR')).toBeVisible();
  await expect(panel.getByText('§ 27-2005 HMC')).toBeVisible();
});

test('follows in-page navigation without duplicating the panel', async ({
  context,
}) => {
  const page = await context.newPage();
  await page.goto(LISTING_URL);
  const panel = page.locator('#stoop-panel');
  await expect(panel.getByText('10-20 EXAMPLE ROAD #3M')).toBeVisible();

  await page.click('#next');

  await expect(panel.getByText('5 2 AVENUE #7C')).toBeVisible();
  await expect(page.locator('#stoop-panel')).toHaveCount(1);

  await page.click('#search');

  await expect(page.locator('#stoop-panel')).toHaveCount(0);
});

test('marks only the failed source unavailable', async ({ context }) => {
  await context.route(
    'https://data.cityofnewyork.us/resource/erm2-nwe9.json**',
    (route) => json(route, { message: 'Service unavailable' }, 503),
  );
  const page = await context.newPage();
  await page.goto(LISTING_URL);
  const panel = page.locator('#stoop-panel');

  await expect(panel.getByText('Unavailable right now')).toBeVisible({
    timeout: 15_000,
  });
  await expect(panel.getByText('2 open on record, 1 class C')).toBeVisible();
});
