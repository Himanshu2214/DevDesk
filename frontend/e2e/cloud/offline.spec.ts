// Offline mode (cloud): after signing in with "Remember me", the last data stays on the device – the app opens without
// a connection, shows it with an "Offline" badge, refuses changes with a clear message, and signing out deletes the copy.
import { expect, test } from '@playwright/test';
import { createUser, removeUsers, seedTicket, signIn, signOut, type TestUser } from './cloud';

let u: TestUser;
test.beforeAll(async () => { u = await createUser('offline') });
test.afterAll(async () => { await removeUsers(u) });

test('the last data opens without a connection; changes are refused clearly; sign-out deletes the copy', async ({ page, context }) => {
  const title = `E2E offline ${Date.now().toString(36)}`;
  await seedTicket(u, title);
  await signIn(page, u);
  await page.goto('/#list/all');
  await expect(page.getByText(title)).toBeVisible();
  await page.getByText(title).click();                                  // opened once online: its details are saved too
  await expect(page.locator('.props [data-f="Priority"]')).toBeVisible();
  await page.goto('/#list/all');
  await page.waitForTimeout(2500);                                      // the copy is written at most every 2 s
  // the website opens offline through its service worker: wait until it controls the page (the Android app needs none)
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 15_000 });
  await expect(page.getByText(title)).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Offline – saved copy')).toBeVisible();
  await page.getByText(title).click();
  await page.locator('.props [data-f="Priority"]').click();
  await page.getByRole('menuitem', { name: /Urgent/ }).click();
  await expect(page.getByText(/You are offline – this change was not saved/)).toBeVisible();

  await context.setOffline(false);
  await page.reload();
  await expect(page.getByText(title).first()).toBeVisible();          // back online (the ticket page shows the title twice)
  await signOut(page);
  expect(await page.evaluate(() => localStorage.getItem('slate-offline'))).toBeNull();
});
