// Journeys 1 and 3 (cloud) – sign-in with the emailed code, wrong code, sign-out, the 24-hour trusted browser, and a new
// account's first-run setup creating its first project.
import { expect, test } from '@playwright/test';
import { admin, createUser, latestCode, removeUser, signIn, signOut, type TestUser } from './cloud';

let u: TestUser, fresh: TestUser;
test.beforeAll(async () => { u = await createUser('signin'); fresh = await createUser('newbie', { onboarded: false }) });
test.afterAll(async () => { await removeUser(u); await removeUser(fresh) });

test('sign in with the emailed code, sign out, sign in again without a code (trusted browser)', async ({ page }) => {
  await signIn(page, u);
  const { data: s } = await admin.from('verified_sessions').select('session_id').eq('user_id', u.id);
  expect(s!.length).toBeGreaterThan(0);                                  // the server marked the session verified
  expect(await page.evaluate(() => localStorage.getItem('slate-trust'))).toContain(u.id);
  await signOut(page);
  await signIn(page, u, { expectCode: false });                          // same browser within 24 hours
});

test('a wrong code is refused with the tries left, a right one then works', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();             // a browser that is not trusted yet
  await page.goto('/');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password').fill(u.password);
  await page.getByRole('button', { name: /^Sign in/ }).click();
  await expect(page.getByRole('heading', { name: 'Enter your sign-in code' })).toBeVisible();
  const right = await latestCode(u);
  const wrong = right === '000000' ? '111111' : '000000';
  await page.locator('.otp input').first().fill(wrong);
  await expect(page.getByRole('alert')).toContainText(/not right\. 4 tries left/);
  await page.locator('.otp input').first().fill(right);
  await expect(page.locator('.side')).toBeVisible({ timeout: 20_000 });
});

test('a wrong password is refused', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: /^Sign in/ }).click();
  await expect(page.getByRole('alert')).toContainText('Email or password is not right');
});

test('first-run setup creates the first project (journey 3)', async ({ page }) => {
  await signIn(page, fresh);
  const project = `E2E Project ${Date.now().toString(36)}`;
  await page.getByLabel(/Your name/).fill('E2E Newbie');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel(/Project name/).fill(project);
  while (await page.getByRole('button', { name: 'Next' }).isVisible()) await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.locator('.side')).toContainText(project);
  const { data } = await admin.from('projects').select('Name').eq('user_id', fresh.id).eq('Name', project);
  expect(data).toHaveLength(1);
});
