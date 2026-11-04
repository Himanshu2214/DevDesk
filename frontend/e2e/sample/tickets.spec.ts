// Journeys 4 and 5 – ticket creation, status updates, editing, filtering and search (sample data). Every change is also
// checked in the stored data, not only on the screen.
import { expect, test } from '@playwright/test';
import { createTicket, nav, open, ticketByTitle, unique } from '../helpers';

test('create a ticket: it opens, is stored, and shows in the list', async ({ page }) => {
  await open(page, 'list/active');
  const title = await createTicket(page);
  const t = await ticketByTitle(page, title);
  expect(t).toMatchObject({ Title: title, Status: 'TODO' });
  expect(t!.TicketId).toMatch(/^TK-\d+$/);
  await nav(page, 'My tickets');
  await expect(page.locator('a', { hasText: title }).first()).toBeVisible();
});

test('change the status and the title on the ticket page', async ({ page }) => {
  await open(page, 'list/active');
  const title = await createTicket(page);

  await page.locator('.props [data-f="status"]').click();
  await page.getByRole('menuitem', { name: /In progress/ }).click();
  await expect(page.locator('.props [data-f="status"]')).toContainText('In progress');
  await expect.poll(async () => (await ticketByTitle(page, title))?.Status).toBe('PROG');

  await page.locator('h1.tp-title').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' (renamed)');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await ticketByTitle(page, title + ' (renamed)'))?.Status).toBe('PROG');
});

test('the status persists after a reload', async ({ page }) => {
  await open(page, 'list/active');
  const title = await createTicket(page);
  await page.locator('.props [data-f="status"]').click();
  await page.getByRole('menuitem', { name: /Testing/ }).click();
  await expect.poll(async () => (await ticketByTitle(page, title))?.Status).toBe('TEST');
  await page.reload();
  await expect(page.locator('.props [data-f="status"]')).toContainText('Testing');
});

test('filter by priority shows only matching tickets', async ({ page }) => {
  await open(page, 'list/active');
  const urgent = unique('urgent');
  await page.getByRole('button', { name: 'New ticket', exact: true }).first().click();
  const dialog = page.locator('.modal');
  await dialog.getByPlaceholder('Ticket title').fill(urgent);
  await dialog.getByRole('button', { name: 'Medium' }).click();
  await page.getByRole('menuitem', { name: /Urgent/ }).click();
  await dialog.getByRole('button', { name: 'Create ticket' }).click();
  await expect(dialog).toBeHidden();
  const normal = await createTicket(page);
  await nav(page, 'My tickets');

  await page.getByRole('button', { name: 'Priority', exact: true }).click();
  await page.getByRole('menuitem', { name: /Urgent/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('a', { hasText: urgent }).first()).toBeVisible();
  await expect(page.locator('a', { hasText: normal })).toHaveCount(0);
});

test('search finds a ticket and opens it', async ({ page }) => {
  await open(page, 'list/active');
  const title = await createTicket(page, unique('searchable'));
  await nav(page, 'Home');
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Search tickets/).fill(title.split(' ').slice(-1)[0]);
  await page.getByRole('option', { name: new RegExp(title) }).first().click();
  await expect(page.locator('h1.tp-title')).toHaveText(title);
});
