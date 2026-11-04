// Journey 14 – error handling and fallback screens (sample data)
import { expect, test } from '@playwright/test';
import { open, sideLink } from '../helpers';

test('a page that crashes shows the fallback; the sidebar keeps working and navigating away recovers', async ({ page }) => {
  await open(page, 'home');
  await page.goto('/#__crash');                                   // a page that throws while rendering (development server only)
  const crash = page.locator('.crash');
  await expect(crash).toContainText('Something went wrong here');
  await expect(crash.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.locator('.side')).toBeVisible();
  await sideLink(page, 'Home');
  await expect(crash).toHaveCount(0);
  await expect(page.locator('.crumb').first()).toContainText('Home');
});

test('an outdated page after a deployment offers Reload instead of breaking', async ({ page }) => {
  await open(page, 'home');
  await page.route(/\/assets\/Insights-[^/]*\.js/, r => r.abort());   // that page's file is gone, as after a new deployment
  await sideLink(page, 'Insights');
  await expect(page.locator('.crash')).toContainText('A new version is available');
  await expect(page.locator('.crash').getByRole('button', { name: 'Reload' })).toBeVisible();
});

test('the browser refusing to store data does not crash the app', async ({ page }) => {
  await open(page, 'list/active');
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) { if (k === 'devdesk-mock-v1') throw new Error('Quota exceeded (E2E)'); return set.call(this, k, v) };
  });
  await page.getByRole('button', { name: 'New ticket', exact: true }).first().click();
  await page.locator('.modal').getByPlaceholder('Ticket title').fill('E2E storage refused');
  await page.locator('.modal').getByRole('button', { name: 'Create ticket' }).click();
  await expect(page.locator('.crash')).toHaveCount(0);
  await expect(page.locator('h1.tp-title')).toHaveText('E2E storage refused');
});
