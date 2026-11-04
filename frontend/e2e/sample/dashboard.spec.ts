// Journey 2 – dashboard loading and navigation (sample data)
import { expect, test } from '@playwright/test';
import { open, sideLink } from '../helpers';

test('the dashboard shows real figures that match the ticket list', async ({ page }) => {
  await open(page, 'home');
  const openTile = page.getByRole('link', { name: /^Open tickets/ });
  await expect(openTile).toBeVisible();
  const shown = Number((await openTile.innerText()).match(/\n(\d+)\s*$/)?.[1] ?? (await openTile.innerText()).match(/(\d+)\s*$/)?.[1]);
  expect(shown).toBeGreaterThan(0);
  await openTile.click();
  await expect(page).toHaveURL(/#list\/active$/);
  await expect(page.getByRole('link', { name: new RegExp(`^Active\\s*${shown}$`) })).toBeVisible();   // same number on the list tab
});

test('every main page opens from the sidebar without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, 'home');
  for (const [link, crumb] of [['Inbox', 'Inbox'], ['My tickets', 'My tickets'], ['Timesheet', 'Timesheet'], ['Calendar', 'Calendar'],
    ['Timeline', 'Timeline'], ['Insights', 'Insights'], ['Knowledge', 'Knowledge'], ['Home', 'Home']] as const) {
    await sideLink(page, link);
    await expect(page.locator('.crumb').first()).toContainText(crumb);
    await expect(page.locator('.crash')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('an unknown address shows a page instead of crashing', async ({ page }) => {
  await open(page, 'home');
  await page.goto('/#does-not-exist');
  await expect(page.locator('.crash')).toHaveCount(0);
  await expect(page.locator('.side')).toBeVisible();
});
