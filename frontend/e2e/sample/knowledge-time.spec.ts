// Journeys 12 and 13 – Knowledge base article creation and search; timesheet entries (sample data)
import { expect, test } from '@playwright/test';
import { createTicket, nav, open, stored, ticketByTitle, unique } from '../helpers';

test('create a knowledge article, rename it and find it by search', async ({ page }) => {
  await open(page, 'kb');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('menuitem', { name: /Error & fix/ }).click();
  await expect(page).toHaveURL(/#kb\/.+/);

  const title = unique('IDoc posting dump');
  const heading = page.locator('h1.tp-title');
  await heading.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(title);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await stored(page)).articles.some(a => a.Title === title && a.ArticleType === 'FIX')).toBe(true);

  await nav(page, 'Knowledge');
  await page.getByLabel('Search knowledge').fill(title.split(' ').slice(-1)[0]);
  await expect(page.locator('h3', { hasText: title })).toBeVisible();
  await expect(page.locator('.kbbar .cnt')).toContainText('1 found');
  await page.getByLabel('Search knowledge').fill('no-such-article-' + Date.now());
  await expect(page.locator('h3', { hasText: title })).toHaveCount(0);
});

test('log time on a ticket: stored, shown in the timesheet and on the ticket', async ({ page }) => {
  await open(page, 'list/active');
  const title = await createTicket(page);
  await page.getByRole('button', { name: /^Log/ }).click();
  const dialog = page.locator('.modal');
  await dialog.locator('input[type=number]').fill('2.5');
  await dialog.getByPlaceholder('Optional').fill('E2E analysis');
  await dialog.getByRole('button', { name: 'Log time' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await ticketByTitle(page, title))?._Worklog?.map(w => [w.Hours, w.CommentText])).toEqual([[2.5, 'E2E analysis']]);

  await nav(page, 'Timesheet');
  await expect(page.getByText(title).first()).toBeVisible();
});

test('the Log time dialog refuses zero hours', async ({ page }) => {
  await open(page, 'timesheet');
  const before = JSON.stringify((await stored(page)).tickets.map(t => t._Worklog?.length ?? 0));
  await page.getByRole('button', { name: 'Log time' }).first().click();
  const dialog = page.locator('.modal');
  await dialog.locator('input[type=number]').fill('0');
  await dialog.getByRole('button', { name: 'Log time' }).click();
  await expect(dialog).toBeVisible();                                         // stays open, nothing logged
  expect(JSON.stringify((await stored(page)).tickets.map(t => t._Worklog?.length ?? 0))).toBe(before);
});
